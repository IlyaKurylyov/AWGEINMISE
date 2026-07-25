import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
});

const PLATFORMS = ["youtube", "instagram"] as const;
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

async function uploadToYouTube(connection: Connection, video: Blob, title: string, caption: string) {
  const initResponse = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.access_token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": video.type || "video/mp4",
        "X-Upload-Content-Length": String(video.size),
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
    headers: { "Content-Type": video.type || "video/mp4" },
    body: video,
  });
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
  for (let attempt = 0; attempt < 20 && statusCode === "IN_PROGRESS"; attempt += 1) {
    await sleep(3000);
    const statusResponse = await fetch(
      `${GRAPH_API}/${containerId}?fields=status_code&access_token=${encodeURIComponent(connection.access_token)}`,
    );
    const statusData = await statusResponse.json();
    statusCode = statusData.status_code;
  }
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
    if (!post.storage_path) return json({ error: "post_already_published" }, 409);

    await admin.from("social_posts").update({ status: "processing" }).eq("id", post.id);
    for (const platform of requestedPlatforms) {
      await admin.from("social_post_targets").upsert({
        post_id: post.id, artist_id: artist.id, platform, status: "processing",
        error_message: null,
      }, { onConflict: "post_id,platform" });
    }

    const { data: videoBlob, error: downloadError } = await admin.storage
      .from(post.bucket_id).download(post.storage_path);
    if (downloadError) throw downloadError;
    const publicUrl = admin.storage.from(post.bucket_id).getPublicUrl(post.storage_path).data.publicUrl;

    for (const platform of requestedPlatforms) {
      try {
        const { data: rawConnection, error: connectionError } = await admin
          .from("social_connections").select("*").eq("artist_id", artist.id).eq("platform", platform).maybeSingle();
        if (connectionError) throw connectionError;
        if (!rawConnection) throw new Error(`${platform}_not_connected`);

        const connection = await refreshIfNeeded(admin, rawConnection as Connection, platform);
        const result = platform === "youtube"
          ? await uploadToYouTube(connection, videoBlob, post.title, post.caption)
          : await publishToInstagram(connection, publicUrl, post.caption);

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
      await admin.storage.from(post.bucket_id).remove([post.storage_path]);
      await admin.from("social_posts").update({ status: "done", storage_path: null }).eq("id", post.id);
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
