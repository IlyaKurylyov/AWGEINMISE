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
})();
