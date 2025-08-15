// Мини-админка для артистов: вход, рендер карточек из БД, редактирование
// Требуется scripts/config.js с window.SUPABASE_URL и window.SUPABASE_ANON_KEY

(function() {
  const hasSupabaseConfig = typeof window.SUPABASE_URL === 'string' && typeof window.SUPABASE_ANON_KEY === 'string';
  if (!window.supabase) {
    console.warn('[artists-admin] Supabase SDK не найден. Страница работает в статичном режиме.');
    return;
  }

  const supabaseClient = hasSupabaseConfig
    ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
    : null;

  const els = {
    grid: () => document.querySelector('.artists-grid'),
    loginBtn: () => document.getElementById('auth-login-btn'),
    logoutBtn: () => document.getElementById('auth-logout-btn'),
    userBox: () => document.getElementById('auth-user')
  };

  function ensureModalRoot() {
    let overlay = document.querySelector('.modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = '<div class="modal" role="dialog" aria-modal="true"></div>';
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function openEditModal(artist) {
    const overlay = ensureModalRoot();
    const modal = overlay.querySelector('.modal');
    modal.innerHTML = `
      <h3>Редактирование: ${artist.name}</h3>
      <label>Имя артиста</label>
      <input id="ed-name" type="text" value="${artist.name || ''}" />
      <label>Описание</label>
      <textarea id="ed-desc">${artist.description || ''}</textarea>
      <div class="row">
        <div>
          <label>URL изображения</label>
          <input id="ed-image" type="text" value="${artist.image_url || ''}" placeholder="https://..." />
        </div>
      </div>
      <div class="actions">
        <button id="ed-cancel">Отмена</button>
        <button id="ed-save" class="primary">Сохранить</button>
      </div>
    `;
    overlay.style.display = 'flex';

    modal.querySelector('#ed-cancel').onclick = () => {
      overlay.style.display = 'none';
    };
    modal.querySelector('#ed-save').onclick = async () => {
      const name = modal.querySelector('#ed-name').value.trim();
      const description = modal.querySelector('#ed-desc').value.trim();
      const image_url = modal.querySelector('#ed-image').value.trim();

      try {
        await updateArtist({ id: artist.id, name, description, image_url });
        overlay.style.display = 'none';
        await loadAndRenderArtists();
      } catch (e) {
        alert('Ошибка сохранения: ' + (e.message || e));
      }
    };
  }

  function openViewModal(artist) {
    const overlay = ensureModalRoot();
    const modal = overlay.querySelector('.modal');
    modal.innerHTML = `
      <h3>${artist.name}</h3>
      <div style="display:flex; gap:16px; align-items:flex-start;">
        <img src="${artist.image_url || ''}" alt="${artist.name}" style="width:160px;height:200px;object-fit:cover;border:1px solid rgba(255,255,255,0.1);border-radius:8px;"/>
        <div>
          <div style="white-space:pre-wrap;opacity:0.9;">${artist.description || ''}</div>
        </div>
      </div>
      <div class="actions" style="margin-top:16px;">
        <button id="vw-close" class="primary">Закрыть</button>
      </div>
    `;
    overlay.style.display = 'flex';
    modal.querySelector('#vw-close').onclick = () => { overlay.style.display = 'none'; };
  }

  function renderCards(artists, session) {
    const grid = els.grid();
    if (!grid) return;
    if (!Array.isArray(artists) || artists.length === 0) return;

    // Очищаем и заново рендерим сетку (сохраняем placeholder, если есть)
    const allCards = Array.from(grid.children);
    const placeholderCard = allCards.find(card => card.classList.contains('artist-card-placeholder')) || null;
    grid.innerHTML = '';

    for (const a of artists) {
      const card = document.createElement('div');
      card.className = 'artist-card';
      card.dataset.artistId = a.id;
      card.innerHTML = `
        <div class="artist-image-container">
          <img src="${a.image_url || 'assets/images/artists/artist1.jpg'}" alt="${a.name}" class="artist-image">
        </div>
        <div class="artist-info">
          <div class="artist-name">${a.name}</div>
          <div class="artist-description">${a.description || ''}</div>
        </div>
      `;

      if (session && session.user && a.owner_user_id === session.user.id) {
        const editBtn = document.createElement('button');
        editBtn.className = 'edit-badge';
        editBtn.textContent = 'Редактировать';
        editBtn.addEventListener('click', (e) => { e.stopPropagation(); openEditModal(a); });
        card.appendChild(editBtn);
      }

      // Клик по карточке — просмотр подробностей
      card.addEventListener('click', () => openViewModal(a));

      grid.appendChild(card);
    }

    if (placeholderCard) grid.appendChild(placeholderCard);

    // Перемешать, если функция доступна
    if (typeof window.shuffleArtistCards === 'function') {
      try { window.shuffleArtistCards(); } catch(_) {}
    }
  }

  async function loadAndRenderArtists() {
    if (!supabaseClient) return; // нет конфигурации — оставляем статическую разметку
    const { data: session } = await supabaseClient.auth.getSession();

    const { data, error } = await supabaseClient
      .from('artists')
      .select('id,name,description,image_url,owner_user_id')
      .order('name', { ascending: true });
    if (error) {
      console.warn('[artists-admin] Не удалось загрузить список артистов:', error.message);
      return;
    }
    renderCards(data || [], session?.session || null);
  }

  async function updateArtist(payload) {
    const { id, name, description, image_url } = payload;
    const { data: sessionRes } = await supabaseClient.auth.getSession();
    const session = sessionRes?.session;
    if (!session) throw new Error('Нет сессии');

    // Обновляем только свою запись (RLS обеспечит безопасность на бэке)
    const { error } = await supabaseClient
      .from('artists')
      .update({ name, description, image_url, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_user_id', session.user.id);
    if (error) throw error;
  }

  function bindAuthUI() {
    const loginBtn = els.loginBtn();
    const logoutBtn = els.logoutBtn();
    const userBox = els.userBox();
    if (!loginBtn || !logoutBtn || !userBox) return;

    const setLoggedOut = () => {
      loginBtn.style.display = '';
      logoutBtn.style.display = 'none';
      userBox.style.display = 'none';
      userBox.textContent = '';
    };
    const setLoggedIn = (email) => {
      loginBtn.style.display = 'none';
      logoutBtn.style.display = '';
      userBox.style.display = '';
      userBox.textContent = email;
    };

    if (!supabaseClient) {
      // Нет конфигурации — показываем disabled
      loginBtn.disabled = true;
      loginBtn.textContent = 'Вход недоступен';
      return;
    }

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (session?.user) setLoggedIn(session.user.email || ''); else setLoggedOut();
      // Обновляем список карточек с учетом прав на редактирование
      loadAndRenderArtists();
    });

    loginBtn.addEventListener('click', async () => {
      const email = prompt('Введите e-mail для входа (отправим magic link):');
      if (!email) return;
      const { error } = await supabaseClient.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
      if (error) {
        alert('Ошибка входа: ' + error.message);
      } else {
        alert('Письмо отправлено. Проверьте почту.');
      }
    });

    logoutBtn.addEventListener('click', async () => {
      await supabaseClient.auth.signOut();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindAuthUI();
    // Если есть конфигурация — пробуем загрузить динамические карточки
    if (supabaseClient) loadAndRenderArtists();
  });
})();

