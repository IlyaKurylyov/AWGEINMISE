// Runtime Supabase configuration.
// Define window.SUPABASE_CONFIG in scripts/config.local.js (not committed).
// Only a publishable/anon key belongs in the browser. Never put a service-role key here.
(() => {
  const config = window.SUPABASE_CONFIG;
  if (!config?.url || !config?.publishableKey) {
    console.info('[supabase] Local configuration is not set; static fallbacks remain available.');
    return;
  }

  window.SUPABASE_URL = config.url;
  window.SUPABASE_ANON_KEY = config.publishableKey;
})();
