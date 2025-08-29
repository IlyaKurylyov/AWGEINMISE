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
    pImageFile: () => document.getElementById('p-image-file'),
    pImagePreview: () => document.getElementById('p-image-preview'),
    pSave: () => document.getElementById('p-save'),
    beatsList: () => document.getElementById('beats-list'),
    bTitle: () => document.getElementById('b-title'),
    bFile: () => document.getElementById('b-file'),
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
    const prev = els.pImagePreview(); if (prev) { prev.src = ''; prev.style.display = 'none'; }
    const nameInput = els.pName();
    if (nameInput) nameInput.disabled = false;
    els.beatsList().innerHTML = '';
  }

  async function loadProfile(uid) {
    const { data, error } = await supabase
      .from('artists')
      .select('id,name,description,image_url')
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
      .select('id,title,audio_url,seller')
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
        audio_url: beat.audio_url,
        seller: beat.seller,
        owner_user_id: uid
      });
    if (error) throw error;
  }

  function extractStoragePathFromPublicUrl(publicUrl, bucket) {
    try {
      const marker = `/object/public/${bucket}/`;
      const idx = publicUrl.indexOf(marker);
      if (idx === -1) return '';
      return publicUrl.substring(idx + marker.length);
    } catch(_) { return ''; }
  }

  async function deleteBeat(uid, beatId, audioUrl) {
    const { error } = await supabase
      .from('beats')
      .delete()
      .eq('id', beatId)
      .eq('owner_user_id', uid);
    if (error) throw error;
    // Пытаемся удалить файл из стораджа (best-effort)
    if (audioUrl) {
      const path = extractStoragePathFromPublicUrl(audioUrl, 'beats');
      if (path) {
        try { await supabase.storage.from('beats').remove([path]); } catch(_) {}
      }
    }
  }

  function renderBeatsList(beats, uid) {
    const list = els.beatsList();
    list.innerHTML = '';
    for (const b of beats) {
      const row = document.createElement('div');
      row.className = 'admin-card';
      row.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <div>
              <div style="font-weight:600;">${b.title}</div>
              <div style="opacity:0.7; font-size:12px; word-break:break-all;">${b.audio_url || ''}</div>
            </div>
            <div style="display:flex; gap:8px;">
              <a class="admin-btn" href="${b.audio_url || '#'}" target="_blank">Открыть</a>
              <button class="admin-btn" data-id="${b.id}">Удалить</button>
            </div>
          </div>
          <audio controls controlslist="nodownload" preload="metadata" src="${b.audio_url || ''}" style="width:100%"></audio>
        </div>
      `;
      row.querySelector('button.admin-btn[data-id]')?.addEventListener('click', async () => {
        if (!confirm('Удалить бит?')) return;
        try {
          await deleteBeat(uid, b.id, b.audio_url);
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
        els.pDesc().value = profile.description || '';
        window.__PROFILE_IMAGE_URL__ = profile.image_url || '';
        const prev = els.pImagePreview();
        if (prev && window.__PROFILE_IMAGE_URL__) {
          prev.src = window.__PROFILE_IMAGE_URL__;
          prev.style.display = '';
        }
        window.__ARTIST_CANONICAL_NAME__ = profile.name || els.pName().value || '';
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

  async function uploadArtistImageIfAny(uid) {
    const fileInput = els.pImageFile();
    const file = fileInput?.files && fileInput.files[0];
    if (!file) return window.__PROFILE_IMAGE_URL__ || '';
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${uid}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('artists').upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) throw upErr;
    const { data } = supabase.storage.from('artists').getPublicUrl(path);
    return data.publicUrl || '';
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
        const imageUrl = await uploadArtistImageIfAny(uid);
        const profile = {
          name: canonicalName,
          description: els.pDesc().value.trim(),
          image_url: imageUrl
        };
        await upsertProfile(uid, profile);
        setStatus('Профиль сохранен');
      } catch (e) {
        alert('Ошибка сохранения: ' + (e.message || e));
      }
    });
  }

  async function uploadBeatFile(uid, title) {
    const f = els.bFile()?.files?.[0];
    if (!f) throw new Error('Не выбран файл');
    const safeTitle = (title || 'beat').replace(/[^a-z0-9-_]+/gi, '_');
    const ext = (f.name.split('.').pop() || 'mp3').toLowerCase();
    const path = `${uid}/${Date.now()}_${safeTitle}.${ext}`;
    const { error: upErr } = await supabase.storage.from('beats').upload(path, f, { upsert: true, contentType: f.type });
    if (upErr) throw upErr;
    const { data } = supabase.storage.from('beats').getPublicUrl(path);
    return data.publicUrl || '';
  }

  function bindBeatAdd() {
    els.bAdd().addEventListener('click', async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) return alert('Нет сессии');
      try {
        const title = els.bTitle().value.trim();
        if (!title) return alert('Нужно название бита');
        const audioUrl = await uploadBeatFile(uid, title);
        const seller = (window.__ARTIST_CANONICAL_NAME__ || els.pName().value || '').trim();
        await insertBeat(uid, { title, audio_url: audioUrl, seller });
        els.bTitle().value = '';
        const bf = els.bFile(); if (bf) bf.value = '';
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

    // Превью аватарки при выборе файла
    const fileInput = els.pImageFile();
    const preview = els.pImagePreview();
    if (fileInput && preview) {
      fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        if (file) {
          const url = URL.createObjectURL(file);
          preview.src = url; preview.style.display = '';
        }
      });
    }
  });
})();

