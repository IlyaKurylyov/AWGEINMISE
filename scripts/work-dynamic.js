// Динамическая подгрузка битов из БД (Supabase) с фолбэком на статический список
(function() {
  const hasSupabaseConfig = typeof window.SUPABASE_URL === 'string' && window.SUPABASE_URL && typeof window.SUPABASE_ANON_KEY === 'string' && window.SUPABASE_ANON_KEY;
  if (!window.supabase || !hasSupabaseConfig) {
    console.info('[work-dynamic] Supabase не настроен — используем статические beats.js');
    return;
  }
  const supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  let __beatsAll = [];
  let __filterTimer = null;
  const DEFAULT_SELLER_LINKS = {
    '@DopeTheProduce': 'https://band.link/uUu9g',
    '@SHIBVRI': 'https://t.me/prod_shibvri',
    '@Namusorill': 'https://t.me/namusorill'
  };

  async function loadBeats() {
    try {
      const { data, error } = await supabase
        .from('beats')
        .select('id,title,price,seller,audio_url,seller_link')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn('[work-dynamic] Ошибка загрузки из БД:', e.message || e);
      return [];
    }
  }

  function normalizeSeller(label) {
    if (!label) return label;
    let v = String(label).trim();
    if (!v) return v;
    // привести к @handle без пробелов
    v = v.replace(/\s+/g, '');
    if (!v.startsWith('@')) v = '@' + v;
    const lower = v.toLowerCase();
    if (lower === '@prod.shibvri' || lower === '@prod_shibvri' || lower === '@shibvri') return '@SHIBVRI';
    if (lower === '@dopetheproducer' || lower === '@dopetheproduce') return '@DopeTheProduce';
    if (lower === '@namusorill') return '@Namusorill';
    return v;
  }

  function renderBeatsDynamic(records) {
    const grid = document.querySelector('.beats-grid');
    if (!grid) return;
    const fragment = document.createDocumentFragment();

    for (const r of records) {
      const card = document.createElement('div');
      card.className = 'beat-card';
      const title = r.title || '';
      const seller = r.seller_norm || normalizeSeller(r.seller || '');
      const sellerLink = (r.seller_link && String(r.seller_link).trim()) || DEFAULT_SELLER_LINKS[seller] || '#';
      const price = r.price || '';
      const audio = r.audio_url || '';

      card.innerHTML = `
        <div class="beat-info">
          <div class="beat-title">${title}</div>
          <div class="beat-seller">Продавец: ${seller}</div>
          <div class="beat-price">${price}</div>
        </div>
        <audio class="beat-audio" controls controlslist="nodownload" preload="none" crossorigin="anonymous" src="${audio}"></audio>
        <a class="beat-buy" href="${sellerLink}" target="_blank">Купить</a>
      `;
      fragment.appendChild(card);
    }

    // очищаем и одним батчем вставляем
    grid.innerHTML = '';
    grid.appendChild(fragment);
  }

  function applyFilter() {
    if (!Array.isArray(__beatsAll) || !__beatsAll.length) {
      // нечего фильтровать/рендерить
      return;
    }
    const checkboxes = document.querySelectorAll('.filter-checkbox');
    const selected = Array.from(checkboxes)
      .filter(cb => cb.checked)
      .map(cb => String(cb.value).trim());
    const recordsToShow = selected.length === 0
      ? __beatsAll
      : __beatsAll.filter(b => selected.includes(b.seller_norm));
    renderBeatsDynamic(recordsToShow);
  }

  function applyFilterDebounced() {
    if (__filterTimer) clearTimeout(__filterTimer);
    __filterTimer = setTimeout(() => {
      __filterTimer = null;
      // Перерисуем на следующем кадре для плавности
      requestAnimationFrame(applyFilter);
    }, 120);
  }

  function forceStaticFallback() {
    try {
      window.BEATS_FORCE_STATIC = true;
      // переиспользуем подключённый beats.js: просто выполним его ещё раз
      if (typeof window.renderBeats === 'function') {
        // если библиотека экспортировала рендер — вызовем дефолт отрисовку
        window.renderBeats([]);
      } else {
        // иначе динамически подгрузим тот же файл ещё раз
        var s = document.createElement('script');
        s.src = 'scripts/beats.js?_=' + Date.now();
        document.head.appendChild(s);
      }
    } catch (e) {
      console.warn('[work-dynamic] Не удалось активировать статический фолбэк:', e);
    }
  }

  async function maybeHydrateFromDb() {
    const beats = await loadBeats();
    if (!beats || beats.length === 0) {
      console.info('[work-dynamic] Пусто из БД — включаю статический фолбэк');
      forceStaticFallback();
      return;
    }
    __beatsAll = (beats || []).map(b => ({ ...b, seller_norm: normalizeSeller(b.seller) }));
    applyFilter();
  }

  // auth панель повторно используем из artists-admin.js: просто реакция на смену статуса
  document.addEventListener('DOMContentLoaded', () => {
    // подписка на чекбоксы фильтра (с дебаунсом)
    const checkboxes = document.querySelectorAll('.filter-checkbox');
    checkboxes.forEach(cb => cb.addEventListener('change', applyFilterDebounced));
    maybeHydrateFromDb();
  });
})();

