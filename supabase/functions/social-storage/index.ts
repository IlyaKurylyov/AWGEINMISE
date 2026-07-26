import { createClient } from "npm:@supabase/supabase-js@2";
import { AwsClient } from "npm:aws4fetch@1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
});

// Shared R2 (S3-compatible) helpers. Credentials live only in Edge secrets.
export function r2Config() {
  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const bucket = Deno.env.get("R2_BUCKET");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) throw new Error("r2_not_configured");
  return { accountId, accessKeyId, secretAccessKey, bucket, endpoint: `https://${accountId}.r2.cloudflarestorage.com` };
}

export async function r2PresignUrl(method: string, key: string, expiresSec: number) {
  const { accessKeyId, secretAccessKey, bucket, endpoint } = r2Config();
  const aws = new AwsClient({ accessKeyId, secretAccessKey, region: "auto", service: "s3" });
  const url = new URL(`${endpoint}/${bucket}/${encodeURIComponent(key).replace(/%2F/g, "/")}`);
  url.searchParams.set("X-Amz-Expires", String(expiresSec));
  const signed = await aws.sign(url.toString(), { method, aws: { signQuery: true } });
  return signed.url;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "server_not_configured" }, 500);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const action = String(payload.action || "");

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

    if (action === "upload_url") {
      const contentType = String(payload.content_type || "video/mp4");
      const ext = (contentType.split("/")[1] || "mp4").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "mp4";
      const key = `${artist.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const uploadUrl = await r2PresignUrl("PUT", key, 900); // 15 min to upload
      return json({ upload_url: uploadUrl, key });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    console.error("social-storage", error);
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: "request_failed", detail: message }, 500);
  }
});
