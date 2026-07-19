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

const normalizeEmail = (value: unknown) => String(value || "").trim().toLowerCase();
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
};

const createToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToHex(bytes);
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: "server_not_configured" }, 500);
  }

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
  const token = String(payload.token || "").trim();

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

    if (action === "create") {
      if (caller.app_metadata?.role !== "owner") return json({ error: "owner_access_required" }, 403);

      const artistId = String(payload.artist_id || "").trim();
      const intendedEmail = normalizeEmail(payload.email);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(artistId)) {
        return json({ error: "invalid_artist" }, 400);
      }
      if (!isEmail(intendedEmail)) return json({ error: "invalid_email" }, 400);

      const { data: artist, error: artistError } = await admin
        .from("artists")
        .select("id,name,owner_user_id")
        .eq("id", artistId)
        .maybeSingle();
      if (artistError) throw artistError;
      if (!artist) return json({ error: "artist_not_found" }, 404);

      await admin
        .from("artist_invites")
        .update({ revoked_at: new Date().toISOString() })
        .eq("artist_id", artistId)
        .is("consumed_at", null)
        .is("revoked_at", null);

      const rawToken = createToken();
      const tokenHash = await sha256(rawToken);
      const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
      const { error: insertError } = await admin.from("artist_invites").insert({
        artist_id: artist.id,
        target_user_id: null,
        previous_owner_user_id: artist.owner_user_id,
        token_hash: tokenHash,
        intended_email: intendedEmail,
        expires_at: expiresAt,
        created_by: caller.id,
      });
      if (insertError) throw insertError;

      return json({
        token: rawToken,
        expires_at: expiresAt,
        artist: { id: artist.id, name: artist.name },
      }, 201);
    }

    if (action === "claim") {
      if (token.length !== 64) return json({ error: "invalid_invite" }, 404);
      const callerEmail = normalizeEmail(caller.email);
      if (!callerEmail) return json({ error: "verified_email_required" }, 400);
      const tokenHash = await sha256(token);
      const { data, error } = await admin.rpc("claim_artist_invite", {
        p_token_hash: tokenHash,
        p_new_owner_user_id: caller.id,
        p_claimed_email: callerEmail,
      });
      if (error) throw error;
      const artist = Array.isArray(data) ? data[0] : data;
      const previousOwnerId = String(artist?.previous_owner_user_id || "");

      // The real account inherits the access level of the legacy account.
      // This makes the Hahahap -> Ilya handoff transfer the owner/admin panel,
      // while ordinary artist invitations stay ordinary artist accounts.
      let inheritedRole = caller.app_metadata?.role === "owner" ? "owner" : "artist";
      if (previousOwnerId && previousOwnerId !== caller.id) {
        const { data: previousUserData, error: previousUserError } = await admin.auth.admin
          .getUserById(previousOwnerId);
        if (previousUserError) throw previousUserError;
        if (previousUserData.user?.app_metadata?.role === "owner") inheritedRole = "owner";
      }

      const { error: roleError } = await admin.auth.admin.updateUserById(caller.id, {
        app_metadata: { ...(caller.app_metadata || {}), role: inheritedRole },
      });
      if (roleError) throw roleError;

      let legacyUserRemoved = false;
      if (previousOwnerId && previousOwnerId !== caller.id) {
        const { error: deleteError } = await admin.auth.admin.deleteUser(previousOwnerId);
        if (deleteError) {
          // Ownership is already transferred. Do not report a failed claim and
          // tempt the user to repeat a consumed invite; surface cleanup status.
          console.error("legacy user cleanup failed", deleteError);
        } else {
          legacyUserRemoved = true;
        }
      }

      return json({
        artist,
        role: inheritedRole,
        legacy_user_removed: legacyUserRemoved,
      });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    console.error("artist-invites", error);
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("invalid or expired")) return json({ error: "invalid_invite" }, 404);
    if (message.includes("email does not match")) return json({ error: "email_mismatch" }, 403);
    if (message.includes("already owns")) return json({ error: "account_already_linked" }, 409);
    return json({ error: "request_failed" }, 500);
  }
});
