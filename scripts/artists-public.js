// Публичный рендер артистов: без логина, только загрузка и просмотр деталей
(function() {
  const hasSupabaseConfig = typeof window.SUPABASE_URL === 'string' && window.SUPABASE_URL && typeof window.SUPABASE_ANON_KEY === 'string' && window.SUPABASE_ANON_KEY;
  if (!window.supabase || !hasSupabaseConfig) {
    // Фолбэк на статическую верстку
    return;
  }
  const supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  // Вспомогательное: построение блока деталей (с матричным дождём)
  function extractTgHandle(tgUrlOrHandle, fallbackName) {
    if (!tgUrlOrHandle) return `@${(fallbackName || 'inmise').replace(/\s+/g,'')}`;
    const t = String(tgUrlOrHandle).trim();
    if (t.startsWith('@')) return t;
    const m = t.match(/t(?:elegram)?\.(?:me|dog)\/(?!joinchat)([A-Za-z0-9_]+)/i);
    if (m && m[1]) return `@${m[1]}`;
    try { const u = new URL(t); return `@${u.pathname.replace(/^\//,'')}`; } catch(_) { return t; }
  }

  function buildDetailsHTML(a) {
    const vk = a.vk_url ? `<a class="artist-link-chip" href="${a.vk_url}" target="_blank" rel="noopener"><img src="assets/icons/vk.svg" alt="VK"/>VK</a>` : '';
    const tg = a.tg_url ? `<a class="artist-link-chip" href="${a.tg_url}" target="_blank" rel="noopener"><img src="assets/icons/telegram.svg" alt="TG"/>TG</a>` : '';
    const inst = a.inst_url ? `<a class="artist-link-chip" href="${a.inst_url}" target="_blank" rel="noopener"><img src="assets/icons/instagram.svg" alt="INST"/>INST</a>` : '';
    const links = (vk || tg || inst) ? `<div class="artist-links">${vk}${tg}${inst}</div>` : '';
    // matrix_text имеет приоритет, иначе формируем по TG
    const phrase = (a.matrix_text && String(a.matrix_text).trim())
      ? String(a.matrix_text).trim()
      : `Группа TG - ${extractTgHandle(a.tg_url, a.name)}`;
    const safePhrase = phrase.replace(/"/g, '&quot;');
    return `
      <div class="artist-details">
        <div class="artist-details__desc" aria-hidden="true"><span class="matrix-typing" data-full="${safePhrase}"></span></div>
        <canvas class="matrix-canvas"></canvas>
        ${links}
      </div>
    `;
  }

  function renderCards(artists) {
    const grid = document.querySelector('.artists-grid');
    if (!grid) return;

    const placeholderCard = grid.querySelector('.artist-card-placeholder');

    const findCardByName = (name) => {
      const cards = Array.from(grid.querySelectorAll('.artist-card'))
        .filter(c => !c.classList.contains('artist-card-placeholder'));
      return cards.find(c => (c.querySelector('.artist-name')?.textContent || '').trim().toLowerCase() === (name || '').trim().toLowerCase()) || null;
    };

    const findCard = (a) => {
      const byId = grid.querySelector(`.artist-card[data-artist-id="${a.id}"]`);
      if (byId) return byId;
      const byName = findCardByName(a.name);
      if (byName) {
        byName.setAttribute('data-artist-id', a.id);
        return byName;
      }
      return null;
    };

    const bindCard = (card) => {
      if (card.dataset.bound === '1') return;
      card.dataset.bound = '1';
      card.addEventListener('click', (ev) => {
        if (ev.target.closest('a')) return; // не мешаем переходу по ссылкам
        // запретим множественные открытия
        const isOpen = card.classList.contains('open');
        // Закрыть остальные
        document.querySelectorAll('.artist-card.open').forEach(el => {
          if (el !== card) el.classList.remove('open');
          el.classList.remove('image-hidden');
          const imgel = el.querySelector('.artist-image');
          if (imgel) imgel.classList.remove('image-ripple');
          const cont = el.querySelector('.artist-image-container');
          if (cont) cont.classList.remove('ripple-run');
        });
        if (!isOpen) {
          // подготовить: показать img
          card.classList.remove('image-hidden');
          const img = card.querySelector('.artist-image');
          if (img) img.style.display = '';
          // обнулим текст прошлой печати
          const typing = card.querySelector('.matrix-typing');
          if (typing) typing.textContent = '';
          if (card._typeTimer) { clearInterval(card._typeTimer); card._typeTimer = null; }
          // форс‑рестарт ряби
          const imgCont = card.querySelector('.artist-image-container');
          if (imgCont) {
            imgCont.classList.remove('ripple-run');
            imgCont.classList.add('ripple-reset');
            void imgCont.offsetWidth;
            imgCont.classList.remove('ripple-reset');
            imgCont.classList.add('ripple-run');
          }
          if (img) {
            img.classList.remove('image-ripple');
            void img.offsetWidth;
            img.classList.add('image-ripple');
          }
          // Очистка/скрытие канваса дождя до старта + гарантируем наличие узлов матрицы
          let detailsEl = card.querySelector('.artist-details');
          if (!detailsEl) {
            const nmSeed = (card.querySelector('.artist-name')?.textContent || '').trim();
            const tmp = document.createElement('div');
            tmp.innerHTML = buildDetailsHTML({ name: nmSeed, tg_url: undefined, vk_url: undefined });
            detailsEl = tmp.firstElementChild;
            (imgCont || card).appendChild(detailsEl);
          }
          let typingEl = detailsEl.querySelector('.matrix-typing');
          if (!typingEl) {
            const wrap = document.createElement('div');
            wrap.className = 'artist-details__desc';
            typingEl = document.createElement('span');
            typingEl.className = 'matrix-typing';
            const nm = (card.querySelector('.artist-name')?.textContent || 'inmise').replace(/\s+/g,'');
            typingEl.setAttribute('data-full', `Группа TG - @${nm}`);
            wrap.appendChild(typingEl);
            detailsEl.appendChild(wrap);
          }
          let canvas = detailsEl.querySelector('.matrix-canvas');
          if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.className = 'matrix-canvas';
            detailsEl.appendChild(canvas);
          }
          try { const c = canvas.getContext('2d'); if (c) c.clearRect(0,0,canvas.width,canvas.height); } catch(_){ }
          canvas.style.opacity = '0';
          card.classList.add('open');
          // строго дождёмся конца ряби, затем скрываем фото и запускаем дождь
          const onRippleEnd = (ev) => {
            if (ev && ev.animationName && ev.animationName !== 'artistImageRippleOut') return;
            if (!card.classList.contains('open')) return;
            card.classList.add('image-hidden');
            if (canvas) canvas.style.opacity = '0.95';
            const img2 = card.querySelector('.artist-image');
            if (img2) img2.classList.remove('image-ripple');
            const cont = card.querySelector('.artist-image-container');
            if (cont) cont.classList.remove('ripple-run');
            img && img.removeEventListener('animationend', onRippleEnd);
            if (card._rippleTimer) { clearTimeout(card._rippleTimer); card._rippleTimer = null; }
            try { if (typeof window.startMatrixTypingAndRain === 'function') { window.startMatrixTypingAndRain(card); } } catch(_) {}
          };
          img && img.addEventListener('animationend', onRippleEnd, { once: false });
          if (card._rippleTimer) clearTimeout(card._rippleTimer);
          card._rippleTimer = setTimeout(onRippleEnd, 1100);
        } else {
          card.classList.remove('open');
          card.classList.remove('image-hidden');
          const img = card.querySelector('.artist-image');
          if (img) img.style.display = '';
          if (card._rippleTimer) { clearTimeout(card._rippleTimer); card._rippleTimer = null; }
          const canvas = card.querySelector('.matrix-canvas');
          if (canvas) {
            canvas.style.opacity = '0';
            try { const c = canvas.getContext('2d'); if (c) c.clearRect(0,0,canvas.width,canvas.height); } catch(_){}
          }
          const typing = card.querySelector('.matrix-typing');
          if (typing) typing.textContent = '';
          if (card._typeTimer) { clearInterval(card._typeTimer); card._typeTimer = null; }
          if (img) img.classList.remove('image-ripple');
          const cont = card.querySelector('.artist-image-container');
          if (cont) cont.classList.remove('ripple-run');
        }
      });
    };

    for (const a of artists) {
      let card = findCard(a);
      if (card) {
        // обновим существующую статическую карточку
        const img = card.querySelector('.artist-image');
        if (img && a.image_url) { img.src = a.image_url; img.alt = a.name; }
        const desc = card.querySelector('.artist-description');
        if (desc) desc.textContent = a.description || '';
        // добавить/обновить блок details в контейнер изображения
        const imgContainer = card.querySelector('.artist-image-container') || card;
        let details = card.querySelector('.artist-details');
        if (!details || details.parentElement !== imgContainer) {
          if (details) details.remove();
          const wrapper = document.createElement('div');
          wrapper.innerHTML = buildDetailsHTML(a);
          details = wrapper.firstElementChild;
          if (details) imgContainer.appendChild(details);
        } else {
          // обновление содержимого links/desc
          // пере-вставляем блок целиком, сохранив привязку обработчиков на card
          const fresh = document.createElement('div');
          fresh.innerHTML = buildDetailsHTML(a);
          const newDetails = fresh.firstElementChild;
          if (newDetails) {
            details.replaceWith(newDetails);
            details = newDetails;
          }
        }
        card.setAttribute('data-artist-id', a.id);
        bindCard(card);
      } else {
        // создадим отдельную карточку для артиста из БД (не трогаем статический список)
        // защита: если уже есть статическая карточка с похожим именем, используем её вместо создания новой
        const fallbackStatic = findCardByName(a.name);
        if (fallbackStatic) {
          fallbackStatic.setAttribute('data-artist-id', a.id);
          const img = fallbackStatic.querySelector('.artist-image');
          if (img && a.image_url) { img.src = a.image_url; img.alt = a.name; }
          const desc = fallbackStatic.querySelector('.artist-description');
          if (desc) desc.textContent = a.description || '';
          const imgContainer = fallbackStatic.querySelector('.artist-image-container') || fallbackStatic;
          let details = fallbackStatic.querySelector('.artist-details');
          if (!details || details.parentElement !== imgContainer) {
            if (details) details.remove();
            const wrapper = document.createElement('div');
            wrapper.innerHTML = buildDetailsHTML(a);
            details = wrapper.firstElementChild;
            if (details) imgContainer.appendChild(details);
          }
          bindCard(fallbackStatic);
          continue;
        }
        
        card = document.createElement('div');
        card.className = 'artist-card';
        card.setAttribute('data-artist-id', a.id);
        card.innerHTML = `
          <div class="artist-image-container">
            <img src="${a.image_url || 'assets/images/artists/artist1.jpg'}" alt="${a.name}" class="artist-image">
          </div>
          ${buildDetailsHTML(a)}
          <div class="artist-info">
            <div class="artist-name">${a.name}</div>
            <div class="artist-description">${a.description || ''}</div>
          </div>
        `;
        bindCard(card);
        if (placeholderCard) grid.insertBefore(card, placeholderCard);
        else grid.appendChild(card);
      }
    }

    if (typeof window.shuffleArtistCards === 'function') {
      try { window.shuffleArtistCards(); } catch(_) {}
    }
  }

  async function loadArtists() {
    try {
      const { data, error } = await supabase
        .from('artists')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn('[artists-public] загрузка:', e.message || e);
      return [];
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const artists = await loadArtists();
    if (artists.length) {
      window.__ARTISTS_DYNAMIC = true;
      renderCards(artists);
    }
  });
})();

