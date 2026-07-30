// Runtime Supabase configuration.
// scripts/config.local.js may override these public browser values during local work.
// Only a publishable/anon key belongs here. Never put a service-role key in browser code.
(() => {
  const publicConfig = {
    url: 'https://cibzssnqbctwydobpahm.supabase.co',
    publishableKey: 'sb_publishable_VfyMowcTUVJ-ImGlSwLlIQ_J9K3gJCM'
  };
  const config = window.SUPABASE_CONFIG || publicConfig;

  window.SUPABASE_URL = config.url;
  window.SUPABASE_ANON_KEY = config.publishableKey;

  // OAuth Client IDs are not secret (unlike the Client Secret, which lives only
  // in Edge Function env vars) and are safe to ship in browser code.
  window.GOOGLE_CLIENT_ID = window.GOOGLE_CLIENT_ID || '1082370400689-12laij30j7g5mn7v6jtghf2dlhhop8gq.apps.googleusercontent.com';
  window.META_APP_ID = window.META_APP_ID || '1926627048031256';
})();
