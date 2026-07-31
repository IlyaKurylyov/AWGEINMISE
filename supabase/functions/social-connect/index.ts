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

const PLATFORMS = ["youtube", "instagram", "telegram", "vk"] as const;
type Platform = typeof PLATFORMS[number];

async function connectTelegram(token: string, target: string) {
  const resp = await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(target)}`);
  const data = await resp.json();
  if (!data.ok) throw new Error(`telegram_connect_failed: ${data.description || resp.status}`);
  return {
    external_account_id: String(data.result.id),
    external_account_name: String(data.result.title || data.result.username || target),
    access_token: token,
    refresh_token: null as string | null,
    token_expires_at: null as string | null,
    scope: "bot",
  };
}

async function connectVk(token: string, target: string) {
  const groupId = target.replace(/^-|club/gi, "");
  const resp = await fetch(`https://api.vk.com/method/groups.getById?group_id=${encodeURIComponent(groupId)}&access_token=${encodeURIComponent(token)}&v=5.199`);
  const data = await resp.json();
  if (data.error) throw new Error(`vk_connect_failed: ${data.error.error_msg}`);
  const group = Array.isArray(data.response) ? data.response[0] : data.response?.groups?.[0];
  if (!group) throw new Error("vk_group_not_found");
  return {
    external_account_id: String(group.id),
    external_account_name: String(group.name || `club${group.id}`),
    access_token: token,
    refresh_token: null as string | null,
    token_expires_at: null as string | null,
    scope: "wall,docs",
  };
}

const GRAPH_API = "https://graph.facebook.com/v19.0";

async function exchangeGoogleCode(code: string, redirectUri: string) {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("google_not_configured");

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok) throw new Error(`google_token_exchange_failed: ${tokenData.error_description || tokenData.error}`);
  if (!tokenData.refresh_token) {
    throw new Error("google_no_refresh_token: reconnect with prompt=consent&access_type=offline");
  }

  const channelResponse = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
  );
  const channelData = await channelResponse.json();
  if (!channelResponse.ok) throw new Error(`google_channel_lookup_failed: ${channelData.error?.message}`);
  const channel = channelData.items?.[0];
  if (!channel) throw new Error("google_no_channel_found");

  return {
    external_account_id: String(channel.id),
    external_account_name: String(channel.snippet?.title || ""),
    access_token: String(tokenData.access_token),
    refresh_token: String(tokenData.refresh_token),
    token_expires_at: new Date(Date.now() + Number(tokenData.expires_in || 3600) * 1000).toISOString(),
    scope: String(tokenData.scope || ""),
  };
}

async function exchangeMetaCode(code: string, redirectUri: string) {
  const appId = Deno.env.get("META_APP_ID");
  const appSecret = Deno.env.get("META_APP_SECRET");
  if (!appId || !appSecret) throw new Error("meta_not_configured");

  const shortLivedParams = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });
  const shortLivedResponse = await fetch(`${GRAPH_API}/oauth/access_token?${shortLivedParams}`);
  const shortLivedData = await shortLivedResponse.json();
  if (!shortLivedResponse.ok) throw new Error(`meta_code_exchange_failed: ${shortLivedData.error?.message}`);

  const longLivedParams = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: String(shortLivedData.access_token),
  });
  const longLivedResponse = await fetch(`${GRAPH_API}/oauth/access_token?${longLivedParams}`);
  const longLivedData = await longLivedResponse.json();
  if (!longLivedResponse.ok) throw new Error(`meta_long_lived_exchange_failed: ${longLivedData.error?.message}`);
  const userAccessToken = String(longLivedData.access_token);

  const pagesResponse = await fetch(
    `${GRAPH_API}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username},connected_instagram_account{id,username}&access_token=${encodeURIComponent(userAccessToken)}`,
  );
  const pagesData = await pagesResponse.json();
  if (!pagesResponse.ok) throw new Error(`meta_pages_lookup_failed: ${pagesData.error?.message}`);

  const pages = pagesData.data || [];
  for (const page of pages) {
    const igAccount = page.instagram_business_account;
    const igAccountId = igAccount?.id;
    if (!igAccountId) continue;

    return {
      external_account_id: String(igAccountId),
      external_account_name: String(igAccount.username || page.name || ""),
      access_token: String(page.access_token),
      refresh_token: null as string | null,
      token_expires_at: new Date(Date.now() + Number(longLivedData.expires_in || 5184000) * 1000).toISOString(),
      scope: "instagram_content_publish",
    };
  }

  // Диагностика: покажем, что реально вернул Graph, чтобы понять причину.
  const diag = pages.length
    ? pages
        .map((p: Record<string, any>) =>
          `${p.name || p.id}(business=${p.instagram_business_account?.id ? "yes" : "no"},connected=${p.connected_instagram_account?.id ? "yes" : "no"})`,
        )
        .join("; ")
    : "/me/accounts вернул 0 страниц (приложению не выдали доступ к Странице)";
  throw new Error(`meta_no_instagram_business_account: ${diag}`);
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

  const action = String(payload.action || "");
  const platform = String(payload.platform || "") as Platform;

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
      .from("artists")
      .select("id")
      .eq("owner_user_id", caller.id)
      .maybeSingle();
    if (artistError) throw artistError;
    if (!artist) return json({ error: "artist_not_found" }, 404);

    if (action === "status") {
      const { data: connections, error } = await admin
        .from("social_connections")
        .select("platform, external_account_name, token_expires_at")
        .eq("artist_id", artist.id);
      if (error) throw error;
      const byPlatform: Record<string, unknown> = {};
      for (const platformName of PLATFORMS) {
        const connection = connections?.find((row) => row.platform === platformName);
        byPlatform[platformName] = connection
          ? { connected: true, account_name: connection.external_account_name, expires_at: connection.token_expires_at }
          : { connected: false };
      }
      return json({ connections: byPlatform });
    }

    if (!PLATFORMS.includes(platform)) return json({ error: "invalid_platform" }, 400);

    if (action === "exchange") {
      const code = String(payload.code || "").trim();
      const redirectUri = String(payload.redirect_uri || "").trim();
      if (!code || !redirectUri) return json({ error: "missing_code_or_redirect" }, 400);

      const connection = platform === "youtube"
        ? await exchangeGoogleCode(code, redirectUri)
        : await exchangeMetaCode(code, redirectUri);

      const { error: upsertError } = await admin.from("social_connections").upsert({
        artist_id: artist.id,
        platform,
        ...connection,
      }, { onConflict: "artist_id,platform" });
      if (upsertError) throw upsertError;

      return json({ connected: true, account_name: connection.external_account_name });
    }

    if (action === "connect_token") {
      const token = String(payload.token || "").trim();
      const target = String(payload.target || "").trim();
      if (!token || !target) return json({ error: "missing_token_or_target" }, 400);
      if (platform !== "telegram" && platform !== "vk") return json({ error: "invalid_platform" }, 400);

      const connection = platform === "telegram"
        ? await connectTelegram(token, target)
        : await connectVk(token, target);

      const { error: upsertError } = await admin.from("social_connections").upsert({
        artist_id: artist.id,
        platform,
        ...connection,
      }, { onConflict: "artist_id,platform" });
      if (upsertError) throw upsertError;

      return json({ connected: true, account_name: connection.external_account_name });
    }

    if (action === "disconnect") {
      const { error } = await admin
        .from("social_connections")
        .delete()
        .eq("artist_id", artist.id)
        .eq("platform", platform);
      if (error) throw error;
      return json({ disconnected: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    console.error("social-connect", error);
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: "request_failed", detail: message }, 500);
  }
});
