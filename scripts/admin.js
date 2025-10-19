// Личный кабинет артиста: авторизация + CRUD профиля и битов через Supabase
(function() {
  const hasSupabaseConfig = typeof window.SUPABASE_URL === 'string' && window.SUPABASE_URL && typeof window.SUPABASE_ANON_KEY === 'string' && window.SUPABASE_ANON_KEY;
  if (!window.supabase || !hasSupabaseConfig) {
    console.warn('[admin] Supabase не настроен. Заполните scripts/config.js');
    return;
  }
  const supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  // Track audios that user started to play, to safely resume after tab visibility restore
  // (removed) Do not manage visibility/page lifecycle to avoid interrupting audio autoplay on return.

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
    const unauth = document.getElementById('unauth-screen');
    const overlay = document.getElementById('auth-modal');
    if (!loginBtn || !logoutBtn || !userBox) return;

    function attachLoginHandlers() {
      if (!overlay || window.__authHandlersBound) return;
      const emailInput = document.getElementById('auth-email');
      const passInput = document.getElementById('auth-password');
      const submitBtn = document.getElementById('auth-submit');
      const cancelBtn = document.getElementById('auth-cancel');
      if (!emailInput || !passInput || !submitBtn || !cancelBtn) return;
      const doLogin = async () => {
        const email = emailInput.value.trim();
        const password = passInput.value;
        if (!email || !password) { alert('Укажи e-mail и пароль'); return; }
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { alert('Ошибка входа: ' + error.message); return; }
        overlay.style.display = 'none';
      };
      submitBtn.addEventListener('click', (e) => { e.preventDefault(); doLogin(); });
      cancelBtn.addEventListener('click', (e) => { e.preventDefault(); overlay.style.display = 'none'; });
      passInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doLogin(); } });
      emailInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doLogin(); } });
      window.__authHandlersBound = true;
    }

    function openLogin() {
      if (!overlay) return;
      attachLoginHandlers();
      overlay.style.display = 'flex';
      const emailInput = document.getElementById('auth-email');
      if (emailInput) setTimeout(() => emailInput.focus(), 0);
    }

    const setLoggedOut = () => {
      loginBtn.style.display = '';
      logoutBtn.style.display = 'none';
      userBox.style.display = 'none';
      userBox.textContent = '';
      setStatus('');
      if (unauth) unauth.style.display = 'flex';
      openLogin();
    };
    const setLoggedIn = (email) => {
      loginBtn.style.display = 'none';
      logoutBtn.style.display = '';
      userBox.style.display = '';
      userBox.textContent = email;
      setStatus('Вход выполнен');
      if (unauth) unauth.style.display = 'none';
      if (overlay) overlay.style.display = 'none';
    };

    supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        setLoggedIn(session.user.email || '');
        // hydrate только при входе/первичной инициализации, не на TOKEN_REFRESHED
        hydrate();
      } else if (event === 'SIGNED_OUT') {
        setLoggedOut();
        clearForms();
      } else {
        // игнорируем TOKEN_REFRESHED/USER_UPDATED чтобы не дёргать hydrate и не сбрасывать плеер
      }
    });

    loginBtn.addEventListener('click', openLogin);

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
      .select('id,title,audio_url,storage_path,seller')
      .eq('owner_user_id', uid)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function insertBeat(uid, beat) {
    // try insert with storage_path; fallback to legacy if column absent
    let { error } = await supabase
      .from('beats')
      .insert({
        title: beat.title,
        audio_url: beat.audio_url,
        storage_path: beat.storage_path,
        seller: beat.seller,
        owner_user_id: uid
      });
    if (error) {
      // fallback legacy
      const legacy = await supabase
        .from('beats')
        .insert({
          title: beat.title,
          audio_url: beat.audio_url,
          seller: beat.seller,
          owner_user_id: uid
        });
      if (legacy.error) throw legacy.error;
    }
  }

  function extractStoragePathFromPublicUrl(publicUrl, bucket) {
    try {
      const marker = `/object/public/${bucket}/`;
      const idx = publicUrl.indexOf(marker);
      if (idx === -1) return '';
      return publicUrl.substring(idx + marker.length);
    } catch(_) { return ''; }
  }

  async function deleteBeat(uid, beatId, audioUrl, storagePath) {
    const { error } = await supabase
      .from('beats')
      .delete()
      .eq('id', beatId)
      .eq('owner_user_id', uid);
    if (error) throw error;
    // Пытаемся удалить файл из стораджа (best-effort)
    const path = storagePath || (audioUrl ? extractStoragePathFromPublicUrl(audioUrl, 'beats') : '');
    if (path) {
      if (path) {
        try { await supabase.storage.from('beats').remove([path]); } catch(_) {}
      }
    }
  }

  function formatTime(sec) {
    if (!isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' + s : s);
  }

  function renderBeatsList(beats, uid) {
    const list = els.beatsList();
    // Skip rerender if nothing changed to prevent audio DOM reset on tab return
    try {
      const sig = JSON.stringify((beats||[]).map(b => [b.id, b.title, b.audio_url, b.storage_path]));
      if (window.__beatsSig === sig) return;
      window.__beatsSig = sig;
    } catch(_) {}
    // capture previous audio states by beat id (dataset.id)
    const prevState = new Map();
    list.querySelectorAll('.tape-panel').forEach((row) => {
      const id = row?.dataset?.id;
      const a = row.querySelector('audio');
      if (!id || !a) return;
      prevState.set(id, { t: a.currentTime || 0, playing: !a.paused });
    });
    list.innerHTML = '';

    function confirmDelete() {
      return new Promise((resolve) => {
        // build lightweight confirm panel
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.background = 'rgba(0,0,0,0.5)';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = '4000';

        const panel = document.createElement('div');
        panel.style.background = '#1C1B19';
        panel.style.color = '#D6D3C5';
        panel.style.border = '1px solid #3A3A36';
        panel.style.borderRadius = '10px';
        panel.style.boxShadow = '0 10px 30px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,.06)';
        panel.style.padding = '16px';
        panel.style.width = 'min(360px, 90vw)';
        panel.innerHTML = '<div style="font-family:VT323,monospace; font-size:24px; margin-bottom:10px;">Удалить бит?</div>';
        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.justifyContent = 'flex-end';
        actions.style.gap = '10px';
        const btnNo = document.createElement('button');
        btnNo.className = 'auth-btn'; btnNo.textContent = 'Отмена';
        const btnYes = document.createElement('button');
        btnYes.className = 'auth-btn'; btnYes.textContent = 'Удалить';
        btnYes.style.background = 'linear-gradient(180deg,#f0a7a0,#b2544c)';
        btnYes.style.borderColor = '#8a3a33';
        actions.append(btnNo, btnYes);
        panel.append(actions);
        overlay.append(panel);
        document.body.append(overlay);
        const done = (v) => { document.body.removeChild(overlay); resolve(v); };
        btnNo.addEventListener('click', () => done(false));
        btnYes.addEventListener('click', () => done(true));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) done(false); });
      });
    }

    for (const b of beats) {
      const row = document.createElement('div');
      row.className = 'admin-card tape-panel';
      row.dataset.id = String(b.id || '');
      row.innerHTML = `
        <div class="tape-head">
          <div class="tape-title">${b.title || ''}</div>
          <div class="tape-controls">
            <button class="btn-icon eject" data-action="delete" title="Удалить"></button>
            <button class="btn-icon volume" data-action="play" title="Play"><span class="wave"></span><span class="wave2"></span></button>
          </div>
        </div>
        <div class="tape-meter">
          <div class="time time-left">0:00</div>
          <div class="track"><div class="fill"></div></div>
          <div class="time time-right">0:00</div>
        </div>
        <audio preload="metadata" src="${b.audio_url || ''}" style="display:none"></audio>
      `;
      const audio = row.querySelector('audio');
      const playBtn = row.querySelector('button.btn-icon[data-action="play"]');
      const delBtn = row.querySelector('button.btn-icon[data-action="delete"]');
      const fill = row.querySelector('.track .fill');
      const tLeft = row.querySelector('.time-left');
      const tRight = row.querySelector('.time-right');

      playBtn?.addEventListener('click', () => {
        if (!audio) return;
        if (audio.paused) { audio.play().catch(()=>{}); playBtn.classList.add('on'); } else { audio.pause(); playBtn.classList.remove('on'); }
      });
      delBtn?.addEventListener('click', async () => {
        const ok = await confirmDelete();
        if (!ok) return;
        let rowBusy = document.createElement('div');
        rowBusy.className = 'row-busy';
        rowBusy.innerHTML = '<div class="busy-box"><div class="spinner"></div>Удаление…</div>';
        row.appendChild(rowBusy);
        try {
          await deleteBeat(uid, b.id, b.audio_url, b.storage_path);
          await hydrateBeats(uid);
        } catch(e){
          alert('Ошибка удаления: ' + (e.message || e));
        } finally {
          if (rowBusy && rowBusy.parentNode) rowBusy.parentNode.removeChild(rowBusy);
        }
      });

      const applyState = (st) => {
        if (!audio || !st) return;
        const setTime = () => {
          try { audio.currentTime = st.t || 0; } catch(_){}
          if (st.playing) {
            audio.play().then(() => {
              const btn = row.querySelector('button.btn-icon[data-action="play"]');
              btn?.classList.add('on');
            }).catch(()=>{});
          }
        };
        if (audio.readyState >= 1) setTime(); else audio.addEventListener('loadedmetadata', setTime, { once: true });
      };

      audio?.addEventListener('loadedmetadata', () => {
        tRight.textContent = formatTime(audio.duration || 0);
      });
      audio?.addEventListener('timeupdate', () => {
        if (!audio?.duration) return;
        const p = Math.max(0, Math.min(1, audio.currentTime / audio.duration));
        fill.style.width = (p * 100).toFixed(2) + '%';
        tLeft.textContent = formatTime(audio.currentTime);
        tRight.textContent = formatTime(audio.duration);
      });

      // restore previous state, if any
      applyState(prevState.get(String(b.id || '')));

      list.appendChild(row);
    }
  }

  function updateSideBlur() {
    const avatar = document.querySelector('.admin-avatar');
    const img = els.pImagePreview();
    if (!avatar || !img || !img.complete || !img.naturalWidth || !img.naturalHeight) return;
    const containerW = avatar.clientWidth;
    const containerH = avatar.clientHeight;
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const boxAspect = containerW / containerH;
    // object-fit: contain => если картинка уже вписывается по высоте (портрет), боковые поля = (containerW - fittedW)/2
    let fittedW;
    if (imgAspect > boxAspect) {
      // ограничение по ширине, вертикальные поля нет
      fittedW = containerW;
    } else {
      // ограничение по высоте
      fittedW = containerH * imgAspect;
    }
    const side = Math.max(0, Math.round((containerW - fittedW) / 2));
    const left = avatar.querySelector('.side-blur.left');
    const right = avatar.querySelector('.side-blur.right');
    if (left && right) {
      left.style.width = side + 'px';
      right.style.width = side + 'px';
      // синхронизируем фоновую картинку
      const bg = getComputedStyle(avatar).getPropertyValue('--avatar-bg');
      if (bg && bg.trim()) { left.style.backgroundImage = bg; right.style.backgroundImage = bg; }
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
          try {
            const avatar = document.querySelector('.admin-avatar');
            if (avatar) avatar.style.setProperty('--avatar-bg', `url('${window.__PROFILE_IMAGE_URL__}')`);
          } catch(_){ }
          prev.onload = () => updateSideBlur();
          setTimeout(updateSideBlur, 0);
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
    return { publicUrl: data.publicUrl || '', storagePath: path };
  }

  function bindBeatAdd() {
    els.bAdd().addEventListener('click', async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) return alert('Нет сессии');
      try {
        const title = els.bTitle().value.trim();
        if (!title) return alert('Нужно название бита');
        // show busy overlay for upload
        let busy = document.createElement('div');
        busy.className = 'busy-overlay';
        busy.innerHTML = '<div class="busy-box"><div class="spinner"></div>Загрузка…</div>';
        const beatsCard = document.getElementById('beats-card');
        if (beatsCard) beatsCard.appendChild(busy);
        const uploaded = await uploadBeatFile(uid, title);
        const seller = (window.__ARTIST_CANONICAL_NAME__ || els.pName().value || '').trim();
        await insertBeat(uid, { title, audio_url: uploaded.publicUrl, storage_path: uploaded.storagePath, seller });
        els.bTitle().value = '';
        const bf = els.bFile(); if (bf) bf.value = '';
        await hydrateBeats(uid);
        setStatus('Бит добавлен');
        if (busy && busy.parentNode) busy.parentNode.removeChild(busy);
      } catch (e) {
        const beatsCard = document.getElementById('beats-card');
        const found = beatsCard?.querySelector('.busy-overlay');
        if (found) found.parentNode.removeChild(found);
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
          try {
            const avatar = document.querySelector('.admin-avatar');
            if (avatar) avatar.style.setProperty('--avatar-bg', `url('${url}')`);
          } catch(_){ }
          preview.onload = () => updateSideBlur();
          setTimeout(updateSideBlur, 0);
        }
      });
    }
    // пересчёт при ресайзе
    window.addEventListener('resize', () => updateSideBlur());
  });
})();

