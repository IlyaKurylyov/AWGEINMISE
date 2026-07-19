// Личный кабинет артиста: авторизация + CRUD профиля и битов через Supabase
(function() {
  const hasSupabaseConfig = typeof window.SUPABASE_URL === 'string' && window.SUPABASE_URL && typeof window.SUPABASE_ANON_KEY === 'string' && window.SUPABASE_ANON_KEY;
  if (!window.supabase || !hasSupabaseConfig) {
    console.warn('[admin] Supabase не настроен. Заполните scripts/config.js');
    return;
  }
  const recoveryHash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const recoverySearch = new URLSearchParams(window.location.search.replace(/^\?/, ''));
  const incomingRecovery = recoveryHash.get('type') === 'recovery'
    || recoverySearch.get('type') === 'recovery'
    || recoverySearch.get('mode') === 'recovery';
  if (incomingRecovery) sessionStorage.setItem('inmise-password-recovery', '1');
  let recoveryMode = incomingRecovery || sessionStorage.getItem('inmise-password-recovery') === '1';

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
    pDescCounter: () => document.getElementById('p-desc-counter'),
    pMatrix: () => document.getElementById('p-matrix'),
    pMatrixCounter: () => document.getElementById('p-matrix-counter'),
    pImageFile: () => document.getElementById('p-image-file'),
    pImagePreview: () => document.getElementById('p-image-preview'),
    pSave: () => document.getElementById('p-save'),
    btnTg: () => document.getElementById('btn-tg'),
    btnVk: () => document.getElementById('btn-vk'),
    btnInst: () => document.getElementById('btn-inst'),
    linkModal: () => document.getElementById('link-modal'),
    linkInput: () => document.getElementById('link-input'),
    linkSave: () => document.getElementById('link-save'),
    linkCancel: () => document.getElementById('link-cancel'),
    linkTitle: () => document.getElementById('link-modal-title'),
    beatsList: () => document.getElementById('beats-list'),
    bTitle: () => document.getElementById('b-title'),
    bFile: () => document.getElementById('b-file'),
    bAdd: () => document.getElementById('b-add'),
    ownerInvitesTab: () => document.getElementById('owner-invites-tab'),
    ownerInvitesPanel: () => document.getElementById('owner-invites-panel'),
    ownerInvitesClose: () => document.getElementById('owner-invites-close'),
    ownerInviteArtist: () => document.getElementById('owner-invite-artist'),
    ownerInviteEmail: () => document.getElementById('owner-invite-email'),
    ownerInviteCreate: () => document.getElementById('owner-invite-create'),
    ownerInviteStatus: () => document.getElementById('owner-invite-status'),
    ownerInviteResult: () => document.getElementById('owner-invite-result'),
    ownerInviteLink: () => document.getElementById('owner-invite-link'),
    ownerInviteCopy: () => document.getElementById('owner-invite-copy'),
  };

  // Максимальная длина подробного описания и обновление счетчика
  const MAX_MATRIX = 515;
  function updateMatrixCounter() {
    try {
      const mtx = els.pMatrix && els.pMatrix();
      const mtxCounter = els.pMatrixCounter && els.pMatrixCounter();
      if (!mtx || !mtxCounter) return;
      const val = mtx.value || '';
      if (val.length > MAX_MATRIX) mtx.value = val.slice(0, MAX_MATRIX);
      mtxCounter.textContent = `${mtx.value.length}/${MAX_MATRIX}`;
    } catch(_) {}
  }

  const MAX_DESC = 60;
  function updateDescCounter() {
    try {
      const d = els.pDesc && els.pDesc();
      const c = els.pDescCounter && els.pDescCounter();
      if (!d || !c) return;
      const val = d.value || '';
      if (val.length > MAX_DESC) d.value = val.slice(0, MAX_DESC);
      c.textContent = `${d.value.length}/${MAX_DESC}`;
    } catch(_) {}
  }

  function setStatus(msg) {
    const s = els.status(); if (s) s.textContent = msg || '';
  }

  function syncOwnerUI(user) {
    const isOwner = user?.app_metadata?.role === 'owner';
    const tab = els.ownerInvitesTab();
    const panel = els.ownerInvitesPanel();
    if (tab) tab.hidden = !isOwner;
    if (!isOwner && panel) panel.hidden = true;
    window.__INMISE_IS_OWNER__ = Boolean(isOwner);
  }

  function getCanonicalName() {
    return (typeof window.__ARTIST_CANONICAL_NAME__ === 'string' && window.__ARTIST_CANONICAL_NAME__)
      ? window.__ARTIST_CANONICAL_NAME__
      : (els.pName().value || '').trim();
  }

  function buildProfileDraft(overrides) {
    const draft = {
      name: getCanonicalName(),
      description: (els.pDesc()?.value || '').trim(),
      image_url: window.__PROFILE_IMAGE_URL__ || '',
      matrix_text: (els.pMatrix && els.pMatrix() ? els.pMatrix().value : '').trim(),
      tg_url: (els.btnTg() && els.btnTg().dataset.url) || null,
      vk_url: (els.btnVk() && els.btnVk().dataset.url) || null,
      inst_url: (els.btnInst() && els.btnInst().dataset.url) || null,
    };
    return Object.assign(draft, overrides || {});
  }

  async function saveProfileWithFallback(uid, profileDraft) {
    try {
      await upsertProfile(uid, profileDraft);
    } catch (e) {
      const msg = String(e.message || '');
      if (msg.includes('column "matrix_text"') || msg.includes('column "tg_url"') || msg.includes('column "vk_url"') || msg.includes('column "inst_url"') || String(e.code || '').toUpperCase() === 'PGRST204') {
        const fallback = { ...profileDraft };
        delete fallback.matrix_text;
        delete fallback.tg_url;
        delete fallback.vk_url;
        delete fallback.inst_url;
        await upsertProfile(uid, fallback);
      } else {
        throw e;
      }
    }
  }

  function bindAuthUI() {
    const loginBtn = els.loginBtn();
    const logoutBtn = els.logoutBtn();
    const userBox = els.userBox();
    const unauth = document.getElementById('unauth-screen');
    const adminWrap = document.querySelector('.admin-wrap');
    const overlay = document.getElementById('auth-modal');
    if (!loginBtn || !logoutBtn || !userBox) return;

    let showRecoveryForm = () => {};

    function attachLoginHandlers() {
      if (window.__authHandlersBound) return;
      const emailInput = document.getElementById('auth-email');
      const passInput = document.getElementById('auth-password');
      const submitBtn = document.getElementById('auth-submit');
      const cancelBtn = document.getElementById('auth-cancel');
      const forgotBtn = document.getElementById('auth-forgot');
      const forgotRow = document.getElementById('auth-forgot-row');
      const panelTitle = document.getElementById('auth-panel-title');
      const resetForm = document.getElementById('password-reset-form');
      const resetMessage = document.getElementById('password-reset-message');
      const resetPassword = document.getElementById('reset-password');
      const resetPasswordConfirm = document.getElementById('reset-password-confirm');
      const resetSubmit = document.getElementById('reset-password-submit');
      const resetCancel = document.getElementById('reset-password-cancel');
      if (!emailInput || !passInput || !submitBtn) return;

      const loginRows = [emailInput.closest('.row'), passInput.closest('.row')];
      const loginActions = submitBtn.closest('.actions');
      const showLoginForm = () => {
        if (panelTitle) panelTitle.textContent = 'Вход';
        loginRows.forEach((row) => { if (row) row.style.display = ''; });
        if (loginActions) loginActions.style.display = '';
        if (forgotRow) forgotRow.style.display = '';
        if (resetForm) resetForm.style.display = 'none';
      };
      showRecoveryForm = () => {
        recoveryMode = true;
        sessionStorage.setItem('inmise-password-recovery', '1');
        if (panelTitle) panelTitle.textContent = 'Смена пароля';
        if (unauth) unauth.style.display = 'flex';
        if (adminWrap) adminWrap.style.display = 'none';
        loginRows.forEach((row) => { if (row) row.style.display = 'none'; });
        if (loginActions) loginActions.style.display = 'none';
        if (forgotRow) forgotRow.style.display = 'none';
        if (resetForm) resetForm.style.display = '';
        if (resetMessage) resetMessage.textContent = 'Придумайте новый пароль для кабинета.';
        setTimeout(() => resetPassword?.focus(), 0);
      };
      const doLogin = async () => {
        const email = emailInput.value.trim();
        const password = passInput.value;
        if (!email || !password) { alert('Укажи e-mail и пароль'); return; }
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { alert('Ошибка входа: ' + error.message); return; }
        if (overlay) overlay.style.display = 'none';
      };
      submitBtn.addEventListener('click', (e) => { e.preventDefault(); doLogin(); });
      if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); if (overlay) overlay.style.display = 'none'; });
      passInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doLogin(); } });
      emailInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doLogin(); } });
      forgotBtn?.addEventListener('click', async () => {
        const email = emailInput.value.trim();
        if (!email) { alert('Сначала укажите e-mail, на который зарегистрирован кабинет.'); emailInput.focus(); return; }
        forgotBtn.disabled = true;
        try {
          const recoveryUrl = new URL('/admin/', window.location.origin);
          const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: recoveryUrl.toString()
          });
          if (error) throw error;
          alert('Если такой e-mail зарегистрирован, письмо для восстановления уже отправлено.');
        } catch (error) {
          alert('Не удалось отправить письмо: ' + (error.message || error));
        } finally {
          forgotBtn.disabled = false;
        }
      });
      resetSubmit?.addEventListener('click', async () => {
        const password = resetPassword?.value || '';
        const confirmation = resetPasswordConfirm?.value || '';
        if (password.length < 8) { alert('Пароль должен содержать не меньше 8 символов.'); return; }
        if (password !== confirmation) { alert('Пароли не совпадают.'); return; }
        resetSubmit.disabled = true;
        try {
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) throw sessionError;
          if (!sessionData.session?.user) {
            throw new Error('Ссылка восстановления недействительна или уже использована. Запросите новое письмо.');
          }
          const { data, error } = await supabase.auth.updateUser({ password });
          if (error) throw error;
          resetPassword.value = '';
          resetPasswordConfirm.value = '';
          recoveryMode = false;
          sessionStorage.removeItem('inmise-password-recovery');
          window.history.replaceState({}, document.title, '/admin/');
          showLoginForm();
          setLoggedIn(data.user || null);
          alert('Пароль обновлён.');
        } catch (error) {
          alert('Не удалось обновить пароль: ' + (error.message || error));
        } finally {
          resetSubmit.disabled = false;
        }
      });
      resetCancel?.addEventListener('click', () => {
        recoveryMode = false;
        sessionStorage.removeItem('inmise-password-recovery');
        window.history.replaceState({}, document.title, '/admin/');
        showLoginForm();
      });
      window.__authHandlersBound = true;
    }

    function openLogin() {
      attachLoginHandlers();
      if (overlay) overlay.style.display = 'flex';
      const emailInput = document.getElementById('auth-email');
      if (emailInput) setTimeout(() => emailInput.focus(), 0);
    }

    const setLoggedOut = () => {
      loginBtn.style.display = '';
      logoutBtn.style.display = 'none';
      userBox.style.display = 'none';
      userBox.textContent = '';
      setStatus('');
      syncOwnerUI(null);
      if (unauth) unauth.style.display = 'flex';
      if (adminWrap) adminWrap.style.display = 'none';
      openLogin();
    };
    const setLoggedIn = (user) => {
      loginBtn.style.display = 'none';
      logoutBtn.style.display = '';
      userBox.style.display = '';
      userBox.textContent = user?.email || '';
      setStatus('Вход выполнен');
      syncOwnerUI(user);
      if (unauth) unauth.style.display = 'none';
      if (adminWrap) adminWrap.style.display = '';
      if (overlay) overlay.style.display = 'none';
    };

    // Формы и обработчики должны быть готовы до подписки, иначе recovery
    // может открыться раньше первого показа обычной формы входа.
    attachLoginHandlers();
    if (recoveryMode) showRecoveryForm();

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session?.user) {
        recoveryMode = true;
        showRecoveryForm();
      } else if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        if (recoveryMode) {
          showRecoveryForm();
        } else {
          setLoggedIn(session.user);
          // hydrate только при входе/первичной инициализации, не на TOKEN_REFRESHED
          hydrate();
        }
      } else if (event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !session?.user)) {
        if (recoveryMode) {
          showRecoveryForm();
        } else {
          setLoggedOut();
          clearForms();
        }
      } else {
        // игнорируем TOKEN_REFRESHED/USER_UPDATED чтобы не дёргать hydrate и не сбрасывать плеер
      }
    });

    loginBtn.addEventListener('click', openLogin);

    logoutBtn.addEventListener('click', async () => {
      await supabase.auth.signOut();
    });
  }

  // Скрипт подключён в конце body, поэтому элементы авторизации уже созданы.
  // Подписываемся сразу после createClient, чтобы не пропустить одноразовое
  // событие PASSWORD_RECOVERY из URL.
  bindAuthUI();

  function clearForms() {
    els.pName().value = '';
    els.pDesc().value = '';
    const prev = els.pImagePreview(); if (prev) { prev.src = ''; prev.style.display = 'none'; }
    const nameInput = els.pName();
    if (nameInput) nameInput.disabled = false;
    els.beatsList().innerHTML = '';
    try { delete window.__beatsSig; } catch(_) { window.__beatsSig = undefined; }
    try { window.__PROFILE_IMAGE_URL__ = ''; } catch(_) {}
    try { window.__ARTIST_CANONICAL_NAME__ = ''; } catch(_) {}
  }

  async function loadProfile(uid) {
    const { data, error } = await supabase
      .from('artists')
      .select('id,name,description,image_url,matrix_text,tg_url,vk_url,inst_url')
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
          matrix_text: profile.matrix_text,
          tg_url: profile.tg_url,
          vk_url: profile.vk_url,
          inst_url: profile.inst_url,
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
          matrix_text: profile.matrix_text,
          tg_url: profile.tg_url,
          vk_url: profile.vk_url,
          inst_url: profile.inst_url,
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
        updateDescCounter();
        const matrixEl = els.pMatrix && els.pMatrix();
        if (matrixEl) {
          matrixEl.value = profile.matrix_text || '';
          updateMatrixCounter();
        }
        // восстановим ссылки в dataset кнопок, чтобы модалка подхватывала сохранённые значения
        try {
          const tgBtn = els.btnTg(); if (tgBtn) tgBtn.dataset.url = profile.tg_url || '';
          const vkBtn = els.btnVk(); if (vkBtn) vkBtn.dataset.url = profile.vk_url || '';
          const instBtn = els.btnInst(); if (instBtn) instBtn.dataset.url = profile.inst_url || '';
        } catch(_) {}
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

  function bindOwnerInvites() {
    const tab = els.ownerInvitesTab();
    const panel = els.ownerInvitesPanel();
    const close = els.ownerInvitesClose();
    const artistSelect = els.ownerInviteArtist();
    const emailInput = els.ownerInviteEmail();
    const createButton = els.ownerInviteCreate();
    const status = els.ownerInviteStatus();
    const result = els.ownerInviteResult();
    const link = els.ownerInviteLink();
    const copy = els.ownerInviteCopy();
    if (!tab || !panel || !artistSelect || !emailInput || !createButton) return;

    let artistsLoaded = false;
    const setInviteStatus = (text) => { if (status) status.textContent = text || ''; };

    async function loadArtists() {
      if (artistsLoaded) return;
      artistSelect.disabled = true;
      const { data, error } = await supabase
        .from('artists')
        .select('id,name')
        .order('name', { ascending: true });
      if (error) throw error;
      artistSelect.innerHTML = '<option value="">Выбери артиста</option>';
      (data || []).forEach((artist) => {
        const option = document.createElement('option');
        option.value = artist.id;
        option.textContent = artist.name || 'Без имени';
        artistSelect.appendChild(option);
      });
      artistSelect.disabled = false;
      artistsLoaded = true;
    }

    async function readFunctionError(error) {
      try {
        const body = await error?.context?.json?.();
        return body?.error || error?.message || 'request_failed';
      } catch (_) {
        return error?.message || 'request_failed';
      }
    }

    tab.addEventListener('click', async () => {
      panel.hidden = false;
      if (result) result.hidden = true;
      setInviteStatus('');
      try {
        await loadArtists();
      } catch (error) {
        setInviteStatus('Не удалось загрузить артистов: ' + (error.message || error));
      }
    });
    close?.addEventListener('click', () => { panel.hidden = true; });
    panel.addEventListener('click', (event) => {
      if (event.target === panel) panel.hidden = true;
    });

    createButton.addEventListener('click', async () => {
      const artistId = artistSelect.value;
      const email = emailInput.value.trim().toLowerCase();
      if (!artistId) return setInviteStatus('Выбери артиста.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setInviteStatus('Укажи корректный email.');

      createButton.disabled = true;
      setInviteStatus('Создаём защищённую ссылку…');
      if (result) result.hidden = true;
      try {
        const { data, error } = await supabase.functions.invoke('artist-invites', {
          body: { action: 'create', artist_id: artistId, email }
        });
        if (error) throw error;
        const inviteUrl = new URL('/invite/', window.location.origin);
        inviteUrl.searchParams.set('token', data.token);
        if (link) link.value = inviteUrl.toString();
        if (result) result.hidden = false;
        setInviteStatus(`Инвайт для ${data.artist?.name || 'артиста'} готов.`);
      } catch (error) {
        const code = await readFunctionError(error);
        const messages = {
          owner_access_required: 'Эта вкладка доступна только владельцу INMISE.',
          artist_not_found: 'Артист больше не найден.',
          invalid_email: 'Некорректный email.',
        };
        setInviteStatus(messages[code] || 'Не удалось создать инвайт.');
      } finally {
        createButton.disabled = false;
      }
    });

    copy?.addEventListener('click', async () => {
      const value = link?.value || '';
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
      } catch (_) {
        link.focus();
        link.select();
        document.execCommand('copy');
      }
      copy.textContent = 'Скопировано';
      window.setTimeout(() => { copy.textContent = 'Копировать ссылку'; }, 1200);
    });
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
        // show busy overlay for save
        const saveBtn = els.pSave();
        if (saveBtn) saveBtn.disabled = true;
        let busy = document.createElement('div');
        busy.className = 'busy-overlay';
        busy.innerHTML = '<div class="busy-box"><div class="spinner"></div>Сохранение…</div>';
        const profileCard = document.getElementById('profile-card');
        if (profileCard) profileCard.appendChild(busy);

        const imageUrl = await uploadArtistImageIfAny(uid);
        const profile = buildProfileDraft({ image_url: imageUrl });
        try {
          await saveProfileWithFallback(uid, profile);
        } catch (e) {
          throw e;
        }
        setStatus('Профиль сохранен');
        if (busy && busy.parentNode) busy.parentNode.removeChild(busy);
        if (saveBtn) saveBtn.disabled = false;
      } catch (e) {
        const found = document.querySelector('#profile-card .busy-overlay');
        if (found && found.parentNode) found.parentNode.removeChild(found);
        const saveBtn = els.pSave();
        if (saveBtn) saveBtn.disabled = false;
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
    bindProfileSave();
    bindBeatAdd();
    bindOwnerInvites();

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
    // Счетчик символов для подробного описания (макс 629)
    const mtx = els.pMatrix();
    if (mtx) {
      mtx.addEventListener('input', updateMatrixCounter);
    }
    updateMatrixCounter();

    const d = els.pDesc();
    if (d) {
      d.addEventListener('input', updateDescCounter);
    }
    updateDescCounter();

    // Быстрые ссылки (заглушки): клик открывает соответствующие URL поля, если есть
    const tgBtn = els.btnTg();
    const vkBtn = els.btnVk();
    const instBtn = els.btnInst();
    const linkModal = els.linkModal();
    const linkInput = els.linkInput();
    const linkSave = els.linkSave();
    const linkCancel = els.linkCancel();
    const linkTitle = els.linkTitle();

    let currentLinkTarget = null; // 'tg' | 'vk' | 'inst'
    function openLinkModal(target, title) {
      currentLinkTarget = target;
      if (linkTitle) linkTitle.textContent = title || 'Ссылка';
      if (linkInput) {
        let preset = '';
        if (target === 'tg' && tgBtn) preset = tgBtn.dataset.url || '';
        if (target === 'vk' && vkBtn) preset = vkBtn.dataset.url || '';
        if (target === 'inst' && instBtn) preset = instBtn.dataset.url || '';
        linkInput.value = preset;
      }
      if (linkModal) linkModal.style.display = 'flex';
      if (linkInput) setTimeout(() => linkInput.focus(), 0);
    }
    function closeLinkModal() {
      if (linkModal) linkModal.style.display = 'none';
      currentLinkTarget = null;
    }
    linkCancel && linkCancel.addEventListener('click', (e) => { e.preventDefault(); closeLinkModal(); });
    linkSave && linkSave.addEventListener('click', async (e) => {
      e.preventDefault();
      const url = (linkInput && linkInput.value || '').trim();
      if (!url) { closeLinkModal(); return; }
      const btnMap = { tg: tgBtn, vk: vkBtn, inst: instBtn };
      const btn = btnMap[currentLinkTarget];
      if (btn) btn.dataset.url = url;
      // анимация сохранения на карточке
      let busy = document.createElement('div');
      busy.className = 'busy-overlay';
      busy.innerHTML = '<div class="busy-box"><div class="spinner"></div>Сохранение…</div>';
      const profileCard = document.getElementById('profile-card');
      if (profileCard) profileCard.appendChild(busy);
      try {
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess?.session?.user?.id;
        if (!uid) throw new Error('Нет сессии');
        await saveProfileWithFallback(uid, buildProfileDraft());
        setStatus('Ссылка сохранена');
      } catch (err) {
        alert('Ошибка сохранения ссылки: ' + (err.message || err));
      } finally {
        if (busy && busy.parentNode) busy.parentNode.removeChild(busy);
        closeLinkModal();
      }
    });
    tgBtn && tgBtn.addEventListener('click', () => openLinkModal('tg', 'Ссылка TG'));
    vkBtn && vkBtn.addEventListener('click', () => openLinkModal('vk', 'Ссылка VK'));
    instBtn && instBtn.addEventListener('click', () => openLinkModal('inst', 'Ссылка INST'));

    // пересчёт при ресайзе
    window.addEventListener('resize', () => updateSideBlur());
  });
})();
