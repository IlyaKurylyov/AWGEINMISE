// Личный кабинет артиста: авторизация + CRUD профиля и битов через Supabase
(function() {
  const hasSupabaseConfig = typeof window.SUPABASE_URL === 'string' && window.SUPABASE_URL && typeof window.SUPABASE_ANON_KEY === 'string' && window.SUPABASE_ANON_KEY;
  if (!window.supabase || !hasSupabaseConfig) {
    console.warn('[admin] Supabase не настроен. Заполните scripts/config.js');
    return;
  }
  const supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  const els = {
    status: () => document.getElementById('admin-status'),
    loginBtn: () => document.getElementById('auth-login-btn'),
    logoutBtn: () => document.getElementById('auth-logout-btn'),
    userBox: () => document.getElementById('auth-user'),
    pName: () => document.getElementById('p-name'),
    pDesc: () => document.getElementById('p-desc'),
    pImage: () => document.getElementById('p-image'),
    pVK: () => document.getElementById('p-vk'),
    pTG: () => document.getElementById('p-tg'),
    pSave: () => document.getElementById('p-save'),
    beatsList: () => document.getElementById('beats-list'),
    bTitle: () => document.getElementById('b-title'),
    bPrice: () => document.getElementById('b-price'),
    bSellerLink: () => document.getElementById('b-seller-link'),
    bSeller: () => document.getElementById('b-seller'),
    bAudio: () => document.getElementById('b-audio'),
    bAdd: () => document.getElementById('b-add'),
  };

  function setStatus(msg) {
    const s = els.status(); if (s) s.textContent = msg || '';
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
      setStatus('');
    };
    const setLoggedIn = (email) => {
      loginBtn.style.display = 'none';
      logoutBtn.style.display = '';
      userBox.style.display = '';
      userBox.textContent = email;
      setStatus('Вход выполнен');
    };

    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setLoggedIn(session.user.email || '');
        hydrate();
      } else {
        setLoggedOut();
        clearForms();
      }
    });

    // Переходим на вход по паролю. Откроем модалку логина
    loginBtn.addEventListener('click', () => {
      const overlay = document.getElementById('auth-modal');
      if (!overlay) return;
      overlay.style.display = 'flex';
      const emailInput = document.getElementById('auth-email');
      const passInput = document.getElementById('auth-password');
      const submitBtn = document.getElementById('auth-submit');
      const cancelBtn = document.getElementById('auth-cancel');

      const close = () => { overlay.style.display = 'none'; };
      cancelBtn.onclick = close;
      submitBtn.onclick = async () => {
        const email = emailInput.value.trim();
        const password = passInput.value;
        if (!email || !password) { alert('Укажи e-mail и пароль'); return; }
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { alert('Ошибка входа: ' + error.message); return; }
        close();
      };
    });

    logoutBtn.addEventListener('click', async () => {
      await supabase.auth.signOut();
    });
  }

  function clearForms() {
    els.pName().value = '';
    els.pDesc().value = '';
    els.pImage().value = '';
    const nameInput = els.pName();
    if (nameInput) nameInput.disabled = false;
    els.beatsList().innerHTML = '';
  }

  async function loadProfile(uid) {
    const { data, error } = await supabase
      .from('artists')
      .select('id,name,description,image_url,vk_url,tg_url')
      .eq('owner_user_id', uid)
      .single();
    if (error && error.code !== 'PGRST116') throw error; // not found is ok
    return data || null;
  }

  async function upsertProfile(uid, profile) {
    // Если запись есть — update, иначе insert
    const existing = await loadProfile(uid);
    if (existing) {
      const { error } = await supabase
        .from('artists')
        .update({
          name: profile.name,
          description: profile.description,
          image_url: profile.image_url,
          vk_url: profile.vk_url,
          tg_url: profile.tg_url,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .eq('owner_user_id', uid);
      if (error) throw error;
      return existing.id;
    } else {
      const { data, error } = await supabase
        .from('artists')
        .insert({
          name: profile.name,
          description: profile.description,
          image_url: profile.image_url,
          vk_url: profile.vk_url,
          tg_url: profile.tg_url,
          owner_user_id: uid
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id;
    }
  }

  async function loadBeats(uid) {
    const { data, error } = await supabase
      .from('beats')
      .select('id,title,price,seller_link,seller,audio_url')
      .eq('owner_user_id', uid)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function insertBeat(uid, beat) {
    const { error } = await supabase
      .from('beats')
      .insert({
        title: beat.title,
        price: beat.price,
        seller_link: beat.seller_link,
        seller: beat.seller,
        audio_url: beat.audio_url,
        owner_user_id: uid
      });
    if (error) throw error;
  }

  async function deleteBeat(uid, beatId) {
    const { error } = await supabase
      .from('beats')
      .delete()
      .eq('id', beatId)
      .eq('owner_user_id', uid);
    if (error) throw error;
  }

  function renderBeatsList(beats, uid) {
    const list = els.beatsList();
    list.innerHTML = '';
    for (const b of beats) {
      const row = document.createElement('div');
      row.className = 'admin-card';
      row.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div>
            <div style="font-weight:600;">${b.title}</div>
            <div style="opacity:0.8;">${b.price || ''} · ${b.seller || ''}</div>
            <div style="opacity:0.7; font-size:12px;">${b.audio_url || ''}</div>
          </div>
          <div style="display:flex; gap:8px;">
            <a class="admin-btn" href="${b.seller_link || '#'}" target="_blank">Открыть</a>
            <button class="admin-btn" data-id="${b.id}">Удалить</button>
          </div>
        </div>
      `;
      row.querySelector('button.admin-btn[data-id]')?.addEventListener('click', async () => {
        if (!confirm('Удалить бит?')) return;
        try {
          await deleteBeat(uid, b.id);
          await hydrateBeats(uid);
        } catch (e) {
          alert('Ошибка удаления: ' + (e.message || e));
        }
      });
      list.appendChild(row);
    }
  }

  async function hydrateProfile(uid) {
    try {
      const profile = await loadProfile(uid);
      if (profile) {
        els.pName().value = profile.name || '';
        // Имя делает привязку статической карточки → запрещаем менять в UI,
        // чтобы не рождать дубликаты до полной миграции на динамический грид
        els.pName().disabled = true;
        window.__ARTIST_CANONICAL_NAME__ = profile.name || '';
        els.pDesc().value = profile.description || '';
        els.pImage().value = profile.image_url || '';
        els.pVK().value = profile.vk_url || '';
        els.pTG().value = profile.tg_url || '';
      }
    } catch (e) {
      console.warn('[admin] hydrateProfile:', e.message || e);
    }
  }

  async function hydrateBeats(uid) {
    try {
      const beats = await loadBeats(uid);
      renderBeatsList(beats, uid);
    } catch (e) {
      console.warn('[admin] hydrateBeats:', e.message || e);
    }
  }

  async function hydrate() {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess?.session?.user?.id;
    if (!uid) return;
    await Promise.all([hydrateProfile(uid), hydrateBeats(uid)]);
  }

  function bindProfileSave() {
    els.pSave().addEventListener('click', async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) return alert('Нет сессии');
      try {
        const canonicalName = typeof window.__ARTIST_CANONICAL_NAME__ === 'string' && window.__ARTIST_CANONICAL_NAME__
          ? window.__ARTIST_CANONICAL_NAME__
          : (els.pName().value || '').trim();
        const profile = {
          name: canonicalName,
          description: els.pDesc().value.trim(),
          image_url: els.pImage().value.trim(),
          vk_url: els.pVK().value.trim(),
          tg_url: els.pTG().value.trim()
        };
        await upsertProfile(uid, profile);
        setStatus('Профиль сохранен');
      } catch (e) {
        alert('Ошибка сохранения: ' + (e.message || e));
      }
    });
  }

  function bindBeatAdd() {
    els.bAdd().addEventListener('click', async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) return alert('Нет сессии');
      try {
        const beat = {
          title: els.bTitle().value.trim(),
          price: els.bPrice().value.trim(),
          seller_link: els.bSellerLink().value.trim(),
          seller: els.bSeller().value.trim(),
          audio_url: els.bAudio().value.trim()
        };
        if (!beat.title || !beat.audio_url) return alert('Нужно минимум название и URL аудио');
        await insertBeat(uid, beat);
        els.bTitle().value = '';
        els.bPrice().value = '';
        els.bSellerLink().value = '';
        els.bSeller().value = '';
        els.bAudio().value = '';
        await hydrateBeats(uid);
        setStatus('Бит добавлен');
      } catch (e) {
        alert('Ошибка добавления: ' + (e.message || e));
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindAuthUI();
    bindProfileSave();
    bindBeatAdd();
  });
})();

