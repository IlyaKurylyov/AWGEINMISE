// Динамическая подгрузка битов из БД (Supabase) с фолбэком на статический список
(function() {
  const hasSupabaseConfig = typeof window.SUPABASE_URL === 'string' && window.SUPABASE_URL && typeof window.SUPABASE_ANON_KEY === 'string' && window.SUPABASE_ANON_KEY;
  if (!window.supabase || !hasSupabaseConfig) {
    console.info('[work-dynamic] Supabase не настроен — используем статические beats.js');
    return;
  }
  const supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  async function loadBeats() {
    try {
      const { data, error } = await supabase
        .from('beats')
        .select('id,title,bpm,key,price,seller, audio_url, seller_link')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn('[work-dynamic] Ошибка загрузки из БД:', e.message || e);
      return [];
    }
  }

  function renderBeatsDynamic(records) {
    const grid = document.querySelector('.beats-grid');
    if (!grid) return;
    if (!records.length) return;
    grid.innerHTML = '';

    for (const r of records) {
      const card = document.createElement('div');
      card.className = 'beat-card';
      const sellerLink = r.seller_link || '#';
      const title = r.title || '';
      const seller = r.seller || '';
      const price = r.price || '';
      const audio = r.audio_url || '';

      card.innerHTML = `
        <div class="beat-info">
          <div class="beat-title">${title}</div>
          <div class="beat-seller">Продавец: ${seller}</div>
          <div class="beat-price">${price}</div>
        </div>
        <audio class="beat-audio" controls controlslist="nodownload" src="${audio}"></audio>
        <a class="beat-buy" href="${sellerLink}" target="_blank">Купить</a>
      `;
      grid.appendChild(card);
    }
  }

  async function maybeHydrateFromDb() {
    const beats = await loadBeats();
    if (beats.length) {
      renderBeatsDynamic(beats);
    }
  }

  // auth панель повторно используем из artists-admin.js: просто реакция на смену статуса
  document.addEventListener('DOMContentLoaded', () => {
    maybeHydrateFromDb();
  });
})();

