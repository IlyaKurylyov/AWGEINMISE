import { createClient } from "npm:@supabase/supabase-js@2";
import { AwsClient } from "npm:aws4fetch@1";

// R2 (S3-compatible) helpers. Videos larger than Supabase's 50MB cap are staged
// in Cloudflare R2 instead of Supabase Storage; such posts have bucket_id = "r2".
function r2Config() {
  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const bucket = Deno.env.get("R2_BUCKET");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) throw new Error("r2_not_configured");
  return { accessKeyId, secretAccessKey, objectUrl: (key: string) => `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${encodeURIComponent(key).replace(/%2F/g, "/")}` };
}
function r2Client() {
  const { accessKeyId, secretAccessKey } = r2Config();
  return new AwsClient({ accessKeyId, secretAccessKey, region: "auto", service: "s3" });
}
async function r2PresignGet(key: string, expiresSec: number) {
  const url = new URL(r2Config().objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(expiresSec));
  const signed = await r2Client().sign(url.toString(), { method: "GET", aws: { signQuery: true } });
  return signed.url;
}
async function r2Delete(key: string) {
  const signed = await r2Client().sign(r2Config().objectUrl(key), { method: "DELETE" });
  await fetch(signed);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
});

const PLATFORMS = ["youtube", "instagram", "telegram", "vk"] as const;
type Platform = typeof PLATFORMS[number];

const GRAPH_API = "https://graph.facebook.com/v19.0";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Connection = {
  id: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  external_account_id: string;
};

async function refreshIfNeeded(admin: ReturnType<typeof createClient>, connection: Connection, platform: Platform) {
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  const marginMs = platform === "youtube" ? 5 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  if (expiresAt - Date.now() > marginMs) return connection;

  if (platform === "youtube") {
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!clientId || !clientSecret || !connection.refresh_token) throw new Error("youtube_reconnect_required");
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: connection.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error("youtube_reconnect_required");
    const tokenExpiresAt = new Date(Date.now() + Number(data.expires_in || 3600) * 1000).toISOString();
    await admin.from("social_connections").update({ access_token: data.access_token, token_expires_at: tokenExpiresAt }).eq("id", connection.id);
    return { ...connection, access_token: data.access_token, token_expires_at: tokenExpiresAt };
  }

  const appId = Deno.env.get("META_APP_ID");
  const appSecret = Deno.env.get("META_APP_SECRET");
  if (!appId || !appSecret) throw new Error("instagram_reconnect_required");
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: connection.access_token,
  });
  const response = await fetch(`${GRAPH_API}/oauth/access_token?${params}`);
  const data = await response.json();
  if (!response.ok) throw new Error("instagram_reconnect_required");
  const tokenExpiresAt = new Date(Date.now() + Number(data.expires_in || 5184000) * 1000).toISOString();
  await admin.from("social_connections").update({ access_token: data.access_token, token_expires_at: tokenExpiresAt }).eq("id", connection.id);
  return { ...connection, access_token: data.access_token, token_expires_at: tokenExpiresAt };
}

// Streams the video body straight through to YouTube's resumable endpoint so a
// large file never has to be buffered in the (memory-limited) edge function.
async function uploadToYouTube(connection: Connection, body: ReadableStream<Uint8Array>, size: number, contentType: string, title: string, caption: string) {
  const initResponse = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.access_token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": contentType || "video/mp4",
        "X-Upload-Content-Length": String(size),
      },
      body: JSON.stringify({
        snippet: { title: title || "Untitled", description: caption || "", categoryId: "10" },
        status: { privacyStatus: "public" },
      }),
    },
  );
  if (!initResponse.ok) throw new Error(`youtube_init_failed: ${await initResponse.text()}`);
  const uploadUrl = initResponse.headers.get("Location");
  if (!uploadUrl) throw new Error("youtube_init_failed: missing upload url");

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType || "video/mp4", "Content-Length": String(size) },
    body,
    // Deno requires this for a streaming request body.
    duplex: "half",
  } as RequestInit);
  const uploadData = await uploadResponse.json();
  if (!uploadResponse.ok) throw new Error(`youtube_upload_failed: ${uploadData.error?.message}`);

  return {
    external_post_id: String(uploadData.id),
    external_post_url: `https://www.youtube.com/watch?v=${uploadData.id}`,
  };
}

async function publishToInstagram(connection: Connection, videoUrl: string, caption: string) {
  const createParams = new URLSearchParams({
    video_url: videoUrl,
    caption: caption || "",
    media_type: "REELS",
    access_token: connection.access_token,
  });
  const createResponse = await fetch(`${GRAPH_API}/${connection.external_account_id}/media`, {
    method: "POST",
    body: createParams,
  });
  const createData = await createResponse.json();
  if (!createResponse.ok) throw new Error(`instagram_container_failed: ${createData.error?.message}`);
  const containerId = createData.id;

  let statusCode = "IN_PROGRESS";
  // Instagram обрабатывает видео асинхронно; опрашиваем до ~110с (лимит Edge-функции ~150с).
  for (let attempt = 0; attempt < 36 && statusCode === "IN_PROGRESS"; attempt += 1) {
    await sleep(3000);
    const statusResponse = await fetch(
      `${GRAPH_API}/${containerId}?fields=status_code&access_token=${encodeURIComponent(connection.access_token)}`,
    );
    const statusData = await statusResponse.json();
    statusCode = statusData.status_code;
  }
  if (statusCode === "IN_PROGRESS") throw new Error("instagram_still_processing: видео слишком тяжёлое/длинное — сделайте Shorts (вертикальный, ≤60 сек) и повторите");
  if (statusCode !== "FINISHED") throw new Error(`instagram_processing_failed: status=${statusCode}`);

  const publishResponse = await fetch(`${GRAPH_API}/${connection.external_account_id}/media_publish`, {
    method: "POST",
    body: new URLSearchParams({ creation_id: containerId, access_token: connection.access_token }),
  });
  const publishData = await publishResponse.json();
  if (!publishResponse.ok) throw new Error(`instagram_publish_failed: ${publishData.error?.message}`);
  const mediaId = publishData.id;

  const permalinkResponse = await fetch(
    `${GRAPH_API}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(connection.access_token)}`,
  );
  const permalinkData = await permalinkResponse.json();

  return {
    external_post_id: String(mediaId),
    external_post_url: String(permalinkData.permalink || ""),
  };
}

type Attachment = { type: string; key: string; name?: string };

async function publishToTelegram(connection: Connection, body: string, attachments: Attachment[]) {
  const token = connection.access_token;
  const chatId = connection.external_account_id;
  const api = async (method: string, params: Record<string, unknown>) => {
    const resp = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(`telegram_${method}_failed: ${data.description || resp.status}`);
    return data.result;
  };
  const imgUrls = await Promise.all(attachments.filter((a) => a.type === "image").map((a) => r2PresignGet(a.key, 3600)));
  const audUrls = await Promise.all(attachments.filter((a) => a.type === "audio").map((a) => r2PresignGet(a.key, 3600)));

  // deno-lint-ignore no-explicit-any
  let head: any = null;
  let lastId: number | null = null;
  if (imgUrls.length > 1) {
    const media = imgUrls.map((url, i) => ({ type: "photo", media: url, ...(i === 0 && body ? { caption: body } : {}) }));
    const res = await api("sendMediaGroup", { chat_id: chatId, media });
    head = res[0]; lastId = res[0]?.message_id;
  } else if (imgUrls.length === 1) {
    const res = await api("sendPhoto", { chat_id: chatId, photo: imgUrls[0], caption: body || undefined });
    head = res; lastId = res?.message_id;
  } else if (body) {
    const res = await api("sendMessage", { chat_id: chatId, text: body });
    head = res; lastId = res?.message_id;
  }
  for (const url of audUrls) {
    const res = await api("sendAudio", { chat_id: chatId, audio: url });
    if (lastId === null) { head = res; lastId = res?.message_id; }
  }
  const username = head?.chat?.username;
  return {
    external_post_id: String(lastId ?? ""),
    external_post_url: username && lastId ? `https://t.me/${username}/${lastId}` : "",
  };
}

async function publishVideoToTelegram(connection: Connection, videoUrl: string, caption: string) {
  const token = connection.access_token;
  const chatId = connection.external_account_id;
  const resp = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, video: videoUrl, caption: caption || undefined, supports_streaming: true }),
  });
  const data = await resp.json();
  if (!data.ok) throw new Error(`telegram_sendVideo_failed: ${data.description || resp.status}`);
  const msg = data.result;
  const username = msg?.chat?.username;
  const id = msg?.message_id;
  return {
    external_post_id: String(id ?? ""),
    external_post_url: username && id ? `https://t.me/${username}/${id}` : "",
  };
}

async function publishToVk(connection: Connection, body: string, attachments: Attachment[]) {
  const token = connection.access_token;
  const groupId = connection.external_account_id;
  const V = "5.199";
  const vk = async (method: string, params: Record<string, string>) => {
    const url = `https://api.vk.com/method/${method}?${new URLSearchParams({ ...params, access_token: token, v: V })}`;
    const data = await (await fetch(url)).json();
    if (data.error) throw new Error(`vk_${method}_failed: ${data.error.error_msg}`);
    return data.response;
  };
  const attachStrings: string[] = [];
  for (const item of attachments) {
    const blob = await (await fetch(await r2PresignGet(item.key, 3600))).blob();
    if (item.type === "image") {
      const server = await vk("photos.getWallUploadServer", { group_id: groupId });
      const fd = new FormData();
      fd.append("photo", blob, item.name || "photo.jpg");
      const up = await (await fetch(server.upload_url, { method: "POST", body: fd })).json();
      const saved = await vk("photos.saveWallPhoto", { group_id: groupId, photo: up.photo, server: String(up.server), hash: up.hash });
      attachStrings.push(`photo${saved[0].owner_id}_${saved[0].id}`);
    } else {
      const server = await vk("docs.getWallUploadServer", { group_id: groupId });
      const fd = new FormData();
      fd.append("file", blob, item.name || "audio.mp3");
      const up = await (await fetch(server.upload_url, { method: "POST", body: fd })).json();
      const saved = await vk("docs.save", { file: up.file });
      const doc = saved.doc || saved.audio_message || saved.graffiti;
      if (doc) attachStrings.push(`doc${doc.owner_id}_${doc.id}`);
    }
  }
  const response = await vk("wall.post", {
    owner_id: `-${groupId}`,
    from_group: "1",
    message: body,
    attachments: attachStrings.join(","),
  });
  return {
    external_post_id: String(response.post_id),
    external_post_url: `https://vk.com/wall-${groupId}_${response.post_id}`,
  };
}

// Note: buffers the video in memory (edge limit ~256MB), so very large clips may
// fail here — fine for typical uploads; can be streamed later if needed.
async function publishVideoToVk(connection: Connection, videoUrl: string, title: string, caption: string) {
  const token = connection.access_token;
  const groupId = connection.external_account_id;
  const V = "5.199";
  const vk = async (method: string, params: Record<string, string>) => {
    const data = await (await fetch(`https://api.vk.com/method/${method}?${new URLSearchParams({ ...params, access_token: token, v: V })}`)).json();
    if (data.error) throw new Error(`vk_${method}_failed: ${data.error.error_msg}`);
    return data.response;
  };
  const saved = await vk("video.save", { group_id: groupId, name: title || "video", description: caption || "" });
  const blob = await (await fetch(videoUrl)).blob();
  const fd = new FormData();
  fd.append("video_file", blob, "video.mp4");
  await (await fetch(saved.upload_url, { method: "POST", body: fd })).json();
  const response = await vk("wall.post", {
    owner_id: `-${groupId}`,
    from_group: "1",
    message: caption || title || "",
    attachments: `video${saved.owner_id}_${saved.video_id}`,
  });
  return {
    external_post_id: String(response.post_id),
    external_post_url: `https://vk.com/wall-${groupId}_${response.post_id}`,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "server_not_configured" }, 500);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const postId = String(payload.post_id || "").trim();
  const requestedPlatforms = Array.isArray(payload.platforms)
    ? (payload.platforms as unknown[]).map(String).filter((value): value is Platform => PLATFORMS.includes(value as Platform))
    : [];
  if (!postId || !requestedPlatforms.length) return json({ error: "missing_post_or_platforms" }, 400);

  try {
    const authorization = request.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "authentication_required" }, 401);
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: callerData, error: callerError } = await callerClient.auth.getUser();
    const caller = callerData.user;
    if (callerError || !caller) return json({ error: "authentication_required" }, 401);

    const { data: artist, error: artistError } = await admin
      .from("artists").select("id").eq("owner_user_id", caller.id).maybeSingle();
    if (artistError) throw artistError;
    if (!artist) return json({ error: "artist_not_found" }, 404);

    const { data: post, error: postError } = await admin
      .from("social_posts").select("*").eq("id", postId).eq("artist_id", artist.id).maybeSingle();
    if (postError) throw postError;
    if (!post) return json({ error: "post_not_found" }, 404);
    if (post.status === "done") return json({ error: "post_already_published" }, 409);

    await admin.from("social_posts").update({ status: "processing" }).eq("id", post.id);
    for (const platform of requestedPlatforms) {
      await admin.from("social_post_targets").upsert({
        post_id: post.id, artist_id: artist.id, platform, status: "processing",
        error_message: null,
      }, { onConflict: "post_id,platform" });
    }

    const isText = post.post_type === "text";
    const isR2 = post.bucket_id === "r2";
    const attachments: Array<{ type: string; key: string; name?: string }> = Array.isArray(post.attachments) ? post.attachments : [];
    // Video only: Instagram fetches publicUrl itself; YouTube streams from it.
    const publicUrl = !isText
      ? (isR2 ? await r2PresignGet(post.storage_path, 3600) : admin.storage.from(post.bucket_id).getPublicUrl(post.storage_path).data.publicUrl)
      : "";

    for (const platform of requestedPlatforms) {
      try {
        const { data: rawConnection, error: connectionError } = await admin
          .from("social_connections").select("*").eq("artist_id", artist.id).eq("platform", platform).maybeSingle();
        if (connectionError) throw connectionError;
        if (!rawConnection) throw new Error(`${platform}_not_connected`);

        const connection = (platform === "youtube" || platform === "instagram")
          ? await refreshIfNeeded(admin, rawConnection as Connection, platform as "youtube" | "instagram")
          : (rawConnection as Connection);
        let result;
        if (isText) {
          result = platform === "telegram"
            ? await publishToTelegram(connection, post.body || "", attachments)
            : await publishToVk(connection, post.body || "", attachments);
        } else if (platform === "youtube") {
          const videoResp = await fetch(publicUrl);
          if (!videoResp.ok || !videoResp.body) throw new Error(`video_fetch_failed: ${videoResp.status}`);
          const size = post.size_bytes || Number(videoResp.headers.get("content-length")) || 0;
          result = await uploadToYouTube(connection, videoResp.body, size, post.mime_type || "video/mp4", post.title, post.caption);
        } else if (platform === "vk") {
          result = await publishVideoToVk(connection, publicUrl, post.title, post.caption);
        } else if (platform === "telegram") {
          result = await publishVideoToTelegram(connection, publicUrl, post.caption);
        } else {
          result = await publishToInstagram(connection, publicUrl, post.caption);
        }

        await admin.from("social_post_targets").update({
          status: "success",
          external_post_id: result.external_post_id,
          external_post_url: result.external_post_url,
          posted_at: new Date().toISOString(),
        }).eq("post_id", post.id).eq("platform", platform);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("social-publish", platform, message);
        await admin.from("social_post_targets").update({
          status: "failed",
          error_message: message,
        }).eq("post_id", post.id).eq("platform", platform);
      }
    }

    const { data: targets, error: targetsError } = await admin
      .from("social_post_targets").select("platform, status, external_post_url, error_message").eq("post_id", post.id);
    if (targetsError) throw targetsError;

    const allSucceeded = (targets || []).length > 0 && targets!.every((target) => target.status === "success");
    if (allSucceeded) {
      if (isText) {
        for (const item of attachments) { try { await r2Delete(item.key); } catch (_) { /* best effort */ } }
      } else if (isR2) {
        await r2Delete(post.storage_path);
      } else {
        await admin.storage.from(post.bucket_id).remove([post.storage_path]);
      }
      await admin.from("social_posts").update({ status: "done", storage_path: null, attachments: [] }).eq("id", post.id);
    } else {
      await admin.from("social_posts").update({ status: "failed" }).eq("id", post.id);
    }

    return json({ targets });
  } catch (error) {
    console.error("social-publish", error);
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: "request_failed", detail: message }, 500);
  }
});
