(function () {
  'use strict';

  if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    console.error('[artist-terminal] Supabase configuration is missing');
    return;
  }

  const db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const escapeHTML = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const formatMoney = (value, currency = 'RUB') => value == null || value === '' ? 'Цена не указана' : new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value));
  const formatDate = (value, options = {}) => value ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', ...options }).format(new Date(value)) : 'Дата не назначена';
  const toLocalInput = (value) => {
    if (!value) return '';
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };
  const safeFileName = (name) => String(name || 'file').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-110);

  const BEAT_GROUPS = {
    private: ['private', 'archived'],
    sale: ['draft', 'published', 'sold'],
  };
  const BEAT_STATUS = { private: 'Личный', draft: 'Черновик', published: 'На витрине', sold: 'Продан', archived: 'Архив' };
  const PROJECT_STATUS = { idea: 'Идея', demo: 'Демо', mix: 'Сведение', master: 'Мастер', scheduled: 'Запланирован', released: 'Выпущен', archived: 'Архив' };
  const EVENT_STATUS = { planned: 'Запланировано', ready: 'Готово', completed: 'Завершено', cancelled: 'Отменено' };
  const VIEW_TITLES = {
    dashboard: ['01', 'Дашборд'], beats: ['02', 'Биты'], projects: ['03', 'Треки и релизы'], lyrics: ['04', 'Тексты'],
    links: ['05', 'Ссылки'], calendar: ['06', 'Календарь'], profile: ['07', 'Карточка артиста'], autopost: ['08', 'Автопостинг'], invites: ['09', 'Инвайты'],
  };

  const state = {
    user: null,
    artist: null,
    beats: [],
    projects: [],
    lyrics: [],
    links: [],
    events: [],
    beatTab: 'private',
    calendarDate: new Date(),
    activeLyricsId: null,
    booted: false,
  };

  const THEME_STORAGE_KEY = 'inmise-artist-theme';

  function setTheme(theme, persist = true) {
    const nextTheme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nextTheme;
    if (persist) localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    $$('[data-theme-choice]').forEach((button) => {
      const active = button.dataset.themeChoice === nextTheme;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = nextTheme === 'light' ? '#e5e1d5' : '#0b0d0b';
  }

  function initialiseTheme() {
    setTheme(document.documentElement.dataset.theme || localStorage.getItem(THEME_STORAGE_KEY) || 'dark', false);
  }

  function toast(message, type = 'success') {
    const stack = $('#toast-stack');
    const item = document.createElement('div');
    item.className = `toast${type === 'error' ? ' is-error' : ''}`;
    item.textContent = message;
    stack.appendChild(item);
    setTimeout(() => item.remove(), 3600);
  }

  function setSystemStatus(message) {
    const node = $('#system-status');
    if (node) node.textContent = message || 'Система онлайн';
  }

  function setAuthMessage(message, isError = false) {
    const node = $('#auth-message');
    node.textContent = message || '';
    node.style.color = isError ? '#d68074' : '#79bd7d';
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
      button.dataset.label = button.textContent;
      button.textContent = label || 'Загрузка…';
      button.disabled = true;
    } else {
      button.textContent = button.dataset.label || button.textContent;
      button.disabled = false;
    }
  }

  function openDrawer(code, title, content) {
    $('#drawer-code').textContent = code;
    $('#drawer-title').textContent = title;
    $('#drawer-body').innerHTML = content;
    $('#drawer').hidden = false;
    $('#drawer-backdrop').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    $('#drawer').hidden = true;
    $('#drawer-backdrop').hidden = true;
    $('#drawer-body').innerHTML = '';
    document.body.style.overflow = '';
  }

  function goView(view) {
    if (!VIEW_TITLES[view]) return;
    $$('.view').forEach((panel) => {
      const active = panel.dataset.viewPanel === view;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
    $$('.nav-item').forEach((button) => button.classList.toggle('is-active', button.dataset.view === view));
    $('#view-code').textContent = `ТЕРМИНАЛ / ${VIEW_TITLES[view][0]}`;
    $('#view-title').textContent = VIEW_TITLES[view][1];
    $('#sidebar').classList.remove('is-open');
    window.history.replaceState({}, '', `/admin/?section=${view}`);
    if (view === 'calendar') renderCalendar();
    if (view === 'invites') loadInviteArtists();
  }

  async function safeQuery(promise, fallback = []) {
    const { data, error } = await promise;
    if (error) throw error;
    return data ?? fallback;
  }

  async function signedUrl(bucket, path, expires = 3600) {
    if (!path) return '';
    try {
      const { data, error } = await db.storage.from(bucket).createSignedUrl(path, expires);
      if (error) throw error;
      return data?.signedUrl || '';
    } catch (_) {
      return '';
    }
  }

  function isOwner() {
    return state.user?.app_metadata?.role === 'owner';
  }

  function syncOwnerUI() {
    $$('.owner-only').forEach((node) => { node.hidden = !isOwner(); });
  }

  async function loadArtist() {
    const rows = await safeQuery(db.from('artists').select('id,name,description,image_url,matrix_text,tg_url,vk_url,inst_url,owner_user_id').eq('owner_user_id', state.user.id).limit(1));
    state.artist = rows[0] || null;
    if (!state.artist) throw new Error('К этому аккаунту пока не привязана карточка артиста.');
  }

  async function loadAllData() {
    setSystemStatus('Синхронизация…');
    await loadArtist();
    const artistId = state.artist.id;
    const results = await Promise.allSettled([
      safeQuery(db.from('beats').select('id,title,seller,seller_link,price,audio_url,storage_path,publication_status,public_preview_path,private_master_path,cover_url,currency,published_at,created_at,updated_at').eq('owner_user_id', state.user.id).order('created_at', { ascending: false })),
      safeQuery(db.from('artist_projects').select('*').eq('artist_id', artistId).order('updated_at', { ascending: false })),
      safeQuery(db.from('lyrics_documents').select('*').eq('artist_id', artistId).order('updated_at', { ascending: false })),
      safeQuery(db.from('artist_private_links').select('*').eq('artist_id', artistId).order('sort_order').order('created_at')),
      safeQuery(db.from('release_events').select('*').eq('artist_id', artistId).order('starts_at')),
    ]);
    const keys = ['beats', 'projects', 'lyrics', 'links', 'events'];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') state[keys[index]] = result.value;
      else {
        state[keys[index]] = [];
        console.warn(`[artist-terminal] ${keys[index]}:`, result.reason);
      }
    });
    renderEverything();
    setSystemStatus('Система онлайн');
  }

  function syncIdentity() {
    const name = state.artist?.name || 'Артист';
    $('#sidebar-artist').textContent = name;
    $('#sidebar-email').textContent = state.user?.email || '';
    $('#dashboard-greeting').textContent = name;
    const avatar = $('#sidebar-avatar');
    avatar.innerHTML = state.artist?.image_url ? `<img src="${escapeHTML(state.artist.image_url)}" alt="">` : '<span>—</span>';
  }

  function renderEverything() {
    syncIdentity();
    renderDashboard();
    renderBeats();
    renderProjects();
    renderLyricsList();
    renderLinks();
    renderCalendar();
    hydrateProfile();
    $('#nav-beats-count').textContent = state.beats.length;
  }

  function renderDashboard() {
    const published = state.beats.filter((beat) => beat.publication_status === 'published').length;
    const activeProjects = state.projects.filter((project) => !['released', 'archived'].includes(project.status)).length;
    const upcoming = state.events.filter((event) => new Date(event.starts_at) >= new Date() && event.status !== 'cancelled').sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    $('#stat-beats').textContent = state.beats.length;
    $('#stat-published').textContent = published;
    $('#stat-projects').textContent = state.projects.length;
    $('#stat-beats-note').textContent = `${state.beats.filter((beat) => beat.publication_status === 'private').length} личных`;
    $('#stat-projects-note').textContent = `${activeProjects} в работе`;
    $('#stat-next-release').textContent = upcoming[0] ? formatDate(upcoming[0].starts_at, { day: '2-digit', month: '2-digit' }) : '—';
    $('#stat-next-release-note').textContent = upcoming[0]?.title || 'не запланирован';

    const projects = $('#dashboard-projects');
    projects.innerHTML = state.projects.length ? state.projects.slice(0, 5).map((project) => `
      <button class="compact-row" data-open-project="${project.id}" type="button">
        <span><strong>${escapeHTML(project.title)}</strong><span>${project.beat_id ? 'Бит выбран' : 'Без бита'} · ${formatDate(project.updated_at)}</span></span>
        <span class="status-chip ${project.status}">${PROJECT_STATUS[project.status] || project.status}</span>
      </button>`).join('') : '<div class="empty-list">Проектов пока нет. Создайте первый трек.</div>';
    bindProjectButtons(projects);
    renderEventList($('#dashboard-events'), upcoming.slice(0, 5));
  }

  function renderEventList(container, events) {
    container.innerHTML = events.length ? events.map((event) => `
      <div class="timeline-row"><div class="timeline-date">${new Date(event.starts_at).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}</div><div><strong>${escapeHTML(event.title)}</strong><span>${EVENT_STATUS[event.status] || event.status} · ${new Date(event.starts_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span></div></div>
    `).join('') : '<div class="empty-list">Ближайших событий нет.</div>';
  }

  async function getBeatAudio(beat) {
    if (beat.audio_url) return beat.audio_url;
    if (beat.private_master_path) return signedUrl('artist-private', beat.private_master_path);
    return '';
  }

  function renderBeats() {
    $$('#beat-tabs button').forEach((button) => button.classList.toggle('is-active', button.dataset.beatTab === state.beatTab));
    const rows = state.beats.filter((beat) => BEAT_GROUPS[state.beatTab].includes(beat.publication_status || 'published'));
    const container = $('#beats-list');
    container.innerHTML = rows.length ? rows.map((beat, index) => `
      <article class="track-row" data-beat-id="${beat.id}">
        <span class="track-index">${String(index + 1).padStart(2, '0')}</span>
        <div class="track-title"><strong>${escapeHTML(beat.title)}</strong><span>${escapeHTML(beat.seller || state.artist?.name || '')}</span></div>
        <div class="mini-wave" aria-hidden="true"></div>
        <span class="track-price">${formatMoney(beat.price, beat.currency)}</span>
        <span class="status-chip ${beat.publication_status}">${BEAT_STATUS[beat.publication_status] || beat.publication_status}</span>
        <div class="track-actions"><button class="icon-button" data-play-beat="${beat.id}" type="button" aria-label="Слушать">▶</button><button class="icon-button" data-edit-beat="${beat.id}" type="button" aria-label="Настройки">•••</button></div>
      </article>`).join('') : `<div class="empty-list">${state.beatTab === 'private' ? 'Личных битов пока нет.' : 'Битов для продажи пока нет.'}</div>`;
    $$('[data-play-beat]', container).forEach((button) => button.addEventListener('click', () => playBeat(button.dataset.playBeat, button)));
    $$('[data-edit-beat]', container).forEach((button) => button.addEventListener('click', () => openBeatEditor(button.dataset.editBeat)));
  }

  async function playBeat(id, button) {
    const beat = state.beats.find((item) => item.id === id);
    if (!beat) return;
    let audio = button.__audio;
    if (!audio) {
      const url = await getBeatAudio(beat);
      if (!url) return toast('У бита нет доступного аудиофайла.', 'error');
      audio = new Audio(url);
      button.__audio = audio;
      audio.addEventListener('ended', () => { button.textContent = '▶'; });
    }
    if (audio.paused) {
      $$('.track-actions button').forEach((other) => {
        if (other !== button && other.__audio && !other.__audio.paused) { other.__audio.pause(); other.textContent = '▶'; }
      });
      await audio.play();
      button.textContent = 'Ⅱ';
    } else {
      audio.pause();
      button.textContent = '▶';
    }
  }

  function beatForm(beat = null) {
    const status = beat?.publication_status || (state.beatTab === 'sale' ? 'draft' : 'private');
    return `
      <form id="beat-editor-form">
        <div class="drawer-section">
          <label class="field"><span>Название</span><input name="title" value="${escapeHTML(beat?.title || '')}" required></label>
          <div class="form-grid two"><label class="field"><span>Раздел</span><select name="publication_status"><option value="private" ${status === 'private' ? 'selected' : ''}>Личные биты</option><option value="draft" ${status === 'draft' ? 'selected' : ''}>На продажу — черновик</option><option value="published" ${status === 'published' ? 'selected' : ''}>На витрине</option><option value="sold" ${status === 'sold' ? 'selected' : ''}>Продан</option><option value="archived" ${status === 'archived' ? 'selected' : ''}>Архив</option></select></label><label class="field"><span>Цена, ₽</span><input name="price" type="number" min="0" step="100" value="${escapeHTML(beat?.price ?? '')}"></label></div>
          <label class="field"><span>Ссылка для покупки</span><input name="seller_link" type="url" value="${escapeHTML(beat?.seller_link || '')}" placeholder="https://t.me/..."></label>
          <label class="field"><span>${beat ? 'Новый аудиофайл (необязательно)' : 'Аудиофайл'}</span><input name="audio" type="file" accept="audio/*" ${beat ? '' : 'required'}></label>
        </div>
        <div class="drawer-actions">${beat ? '<button class="button button-danger" id="delete-beat" type="button">Удалить</button>' : '<span></span>'}<button class="button button-primary" type="submit">${beat ? 'Сохранить' : 'Загрузить бит'}</button></div>
      </form>`;
  }

  function openBeatEditor(id) {
    const beat = state.beats.find((item) => item.id === id) || null;
    openDrawer('AUDIO / BEAT', beat ? beat.title : 'Новый бит', beatForm(beat));
    const form = $('#beat-editor-form');
    form.addEventListener('submit', (event) => saveBeat(event, beat));
    $('#delete-beat')?.addEventListener('click', () => deleteBeat(beat));
  }

  async function saveBeat(event, beat) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = $('button[type="submit"]', form);
    const data = new FormData(form);
    const status = data.get('publication_status');
    const payload = {
      title: String(data.get('title') || '').trim(),
      publication_status: status,
      price: data.get('price') ? Number(data.get('price')) : null,
      seller_link: String(data.get('seller_link') || '').trim() || null,
      seller: state.artist.name,
      currency: 'RUB',
      owner_user_id: state.user.id,
    };
    if (!payload.title) return toast('Укажите название бита.', 'error');
    setBusy(submit, true, beat ? 'Сохраняем…' : 'Загружаем…');
    try {
      const file = data.get('audio');
      const hasNewAudio = file instanceof File && file.size > 0;
      const isPrivate = status === 'private' || status === 'archived';
      if (!beat && !hasNewAudio) throw new Error('Выберите аудиофайл.');
      if (beat && !hasNewAudio && isPrivate && !beat.private_master_path) {
        throw new Error('Для личного раздела загрузите приватный аудиофайл.');
      }
      if (beat && !hasNewAudio && !isPrivate && !beat.audio_url && !beat.public_preview_path && !beat.storage_path) {
        throw new Error('Для продажи загрузите публичное превью бита.');
      }
      if (hasNewAudio) {
        const path = `${state.user.id}/beats/${Date.now()}-${safeFileName(file.name)}`;
        if (isPrivate) {
          const { error } = await db.storage.from('artist-private').upload(path, file, { contentType: file.type, upsert: false });
          if (error) throw error;
          payload.private_master_path = path;
        } else {
          const publicPath = `${state.user.id}/${Date.now()}-${safeFileName(file.name)}`;
          const { error } = await db.storage.from('beats').upload(publicPath, file, { contentType: file.type, upsert: false });
          if (error) throw error;
          payload.storage_path = publicPath;
          payload.public_preview_path = publicPath;
          payload.audio_url = db.storage.from('beats').getPublicUrl(publicPath).data.publicUrl;
        }
      }
      if (!beat) {
        const { error } = await db.from('beats').insert(payload);
        if (error) throw error;
      } else {
        const { error } = await db.from('beats').update(payload).eq('id', beat.id).eq('owner_user_id', state.user.id);
        if (error) throw error;
      }
      await refreshBeats();
      closeDrawer();
      toast(beat ? 'Бит обновлён.' : 'Бит загружен.');
    } catch (error) {
      toast(error.message || 'Не удалось сохранить бит.', 'error');
    } finally { setBusy(submit, false); }
  }

  async function deleteBeat(beat) {
    if (!beat || !confirm(`Удалить бит «${beat.title}»?`)) return;
    try {
      const { error } = await db.from('beats').delete().eq('id', beat.id).eq('owner_user_id', state.user.id);
      if (error) throw error;
      if (beat.storage_path) await db.storage.from('beats').remove([beat.storage_path]);
      if (beat.private_master_path) await db.storage.from('artist-private').remove([beat.private_master_path]);
      await refreshBeats();
      closeDrawer();
      toast('Бит удалён.');
    } catch (error) { toast(error.message || 'Не удалось удалить бит.', 'error'); }
  }

  async function refreshBeats() {
    state.beats = await safeQuery(db.from('beats').select('id,title,seller,seller_link,price,audio_url,storage_path,publication_status,public_preview_path,private_master_path,cover_url,currency,published_at,created_at,updated_at').eq('owner_user_id', state.user.id).order('created_at', { ascending: false }));
    renderBeats(); renderDashboard(); $('#nav-beats-count').textContent = state.beats.length;
  }

  async function projectCover(project) {
    return project.cover_storage_path ? signedUrl('artist-private', project.cover_storage_path) : '';
  }

  async function renderProjects() {
    const container = $('#projects-list');
    if (!state.projects.length) { container.innerHTML = '<div class="empty-list">Проектов пока нет. Создайте карточку первого трека.</div>'; return; }
    const cards = await Promise.all(state.projects.map(async (project) => {
      const cover = await projectCover(project);
      return `<article class="project-card" data-open-project="${project.id}"><div class="project-cover">${cover ? `<img src="${escapeHTML(cover)}" alt="">` : '<span>NO COVER</span>'}</div><div class="project-body"><span class="eyebrow">${formatDate(project.release_at)}</span><h3>${escapeHTML(project.title)}</h3><div class="project-meta"><span>${project.beat_id ? 'Бит выбран' : 'Без бита'}</span><span class="status-chip ${project.status}">${PROJECT_STATUS[project.status] || project.status}</span></div></div></article>`;
    }));
    container.innerHTML = cards.join('');
    bindProjectButtons(container);
  }

  function bindProjectButtons(root) {
    $$('[data-open-project]', root).forEach((node) => node.addEventListener('click', () => openProjectEditor(node.dataset.openProject)));
  }

  async function openProjectEditor(id = null) {
    const project = state.projects.find((item) => item.id === id) || null;
    const cover = project ? await projectCover(project) : '';
    const beatOptions = ['<option value="">Бит не выбран</option>', ...state.beats.map((beat) => `<option value="${beat.id}" ${project?.beat_id === beat.id ? 'selected' : ''}>${escapeHTML(beat.title)}</option>`)].join('');
    openDrawer('TRACK / PROJECT', project?.title || 'Новый трек', `
      <form id="project-form">
        <div class="drawer-section"><label class="cover-upload" id="project-cover-label">${cover ? `<img src="${escapeHTML(cover)}" alt="Обложка">` : '<span>+ Загрузить обложку</span>'}<input name="cover" type="file" accept="image/*" hidden></label></div>
        <div class="drawer-section">
          <label class="field"><span>Название трека</span><input name="title" value="${escapeHTML(project?.title || '')}" required></label>
          <div class="form-grid two"><label class="field"><span>Статус</span><select name="status">${Object.entries(PROJECT_STATUS).map(([value,label]) => `<option value="${value}" ${project?.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="field"><span>Дата релиза</span><input name="release_at" type="datetime-local" value="${toLocalInput(project?.release_at)}"></label></div>
          <label class="field"><span>Бит</span><select name="beat_id">${beatOptions}</select></label>
          <label class="field"><span>Заметки по треку</span><textarea name="description" rows="7">${escapeHTML(project?.description || '')}</textarea></label>
        </div>
        <div class="drawer-actions"><span></span><button class="button button-primary" type="submit">${project ? 'Сохранить проект' : 'Создать проект'}</button></div>
      </form>`);
    const form = $('#project-form');
    const coverInput = $('[name="cover"]', form);
    coverInput.addEventListener('change', () => {
      const file = coverInput.files?.[0]; if (!file) return;
      const label = $('#project-cover-label');
      const previousPreview = $('img', label);
      if (previousPreview?.src?.startsWith('blob:')) URL.revokeObjectURL(previousPreview.src);
      const preview = previousPreview || document.createElement('img');
      preview.src = URL.createObjectURL(file);
      preview.alt = 'Обложка';
      $('span', label)?.remove();
      if (!previousPreview) label.insertBefore(preview, coverInput);
    });
    form.addEventListener('submit', (event) => saveProject(event, project));
  }

  async function saveProject(event, project) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = $('button[type="submit"]', form);
    const data = new FormData(form);
    const payload = {
      artist_id: state.artist.id,
      title: String(data.get('title') || '').trim(),
      status: data.get('status') || 'idea',
      beat_id: data.get('beat_id') || null,
      description: String(data.get('description') || '').trim(),
      release_at: data.get('release_at') ? new Date(data.get('release_at')).toISOString() : null,
      timezone: 'Europe/Moscow',
    };
    setBusy(submit, true, 'Сохраняем…');
    try {
      let saved = project;
      if (project) {
        const { data: row, error } = await db.from('artist_projects').update(payload).eq('id', project.id).eq('artist_id', state.artist.id).select().single();
        if (error) throw error; saved = row;
      } else {
        const { data: row, error } = await db.from('artist_projects').insert(payload).select().single();
        if (error) throw error; saved = row;
      }
      const cover = data.get('cover');
      if (cover instanceof File && cover.size) {
        const path = `${state.user.id}/projects/${saved.id}/cover-${Date.now()}-${safeFileName(cover.name)}`;
        const { error: uploadError } = await db.storage.from('artist-private').upload(path, cover, { contentType: cover.type });
        if (uploadError) throw uploadError;
        const { data: row, error } = await db.from('artist_projects').update({ cover_storage_path: path }).eq('id', saved.id).eq('artist_id', state.artist.id).select().single();
        if (error) throw error; saved = row;
      }
      state.projects = await safeQuery(db.from('artist_projects').select('*').eq('artist_id', state.artist.id).order('updated_at', { ascending: false }));
      await renderProjects(); renderDashboard(); renderCalendar();
      closeDrawer(); toast(project ? 'Проект обновлён.' : 'Проект создан.');
    } catch (error) { toast(error.message || 'Не удалось сохранить проект.', 'error'); }
    finally { setBusy(submit, false); }
  }

  function renderLyricsList() {
    const container = $('#lyrics-list');
    container.innerHTML = state.lyrics.length ? state.lyrics.map((doc) => `<button class="document-item ${state.activeLyricsId === doc.id ? 'is-active' : ''}" data-lyrics-id="${doc.id}" type="button"><strong>${escapeHTML(doc.title)}</strong><span>${doc.document_status === 'ready' ? 'Готов' : doc.document_status === 'archived' ? 'Архив' : 'Черновик'} · ${formatDate(doc.updated_at)}</span></button>`).join('') : '<div class="empty-list">Текстов пока нет.</div>';
    $$('[data-lyrics-id]', container).forEach((button) => button.addEventListener('click', () => openLyrics(button.dataset.lyricsId)));
  }

  function openLyrics(id = null) {
    const doc = state.lyrics.find((item) => item.id === id) || null;
    state.activeLyricsId = doc?.id || null;
    renderLyricsList();
    const projectOptions = ['<option value="">Не привязан к треку</option>', ...state.projects.map((project) => `<option value="${project.id}" ${doc?.project_id === project.id ? 'selected' : ''}>${escapeHTML(project.title)}</option>`)].join('');
    $('#lyrics-editor').innerHTML = `<form id="lyrics-form"><div class="form-grid two"><label class="field"><span>Название</span><input name="title" value="${escapeHTML(doc?.title || '')}" required></label><label class="field"><span>Статус</span><select name="document_status"><option value="draft" ${doc?.document_status === 'draft' ? 'selected' : ''}>Черновик</option><option value="ready" ${doc?.document_status === 'ready' ? 'selected' : ''}>Готов</option><option value="archived" ${doc?.document_status === 'archived' ? 'selected' : ''}>Архив</option></select></label></div><label class="field"><span>Трек</span><select name="project_id">${projectOptions}</select></label><label class="field"><span>Текст</span><textarea class="lyrics-body" name="body" placeholder="Начните писать…">${escapeHTML(doc?.body || '')}</textarea></label><div class="editor-actions">${doc ? '<button class="button button-danger" id="delete-lyrics" type="button">Удалить</button>' : '<span></span>'}<button class="button button-primary" type="submit">Сохранить текст</button></div></form>`;
    $('#lyrics-form').addEventListener('submit', (event) => saveLyrics(event, doc));
    $('#delete-lyrics')?.addEventListener('click', () => deleteLyrics(doc));
  }

  async function saveLyrics(event, doc) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = { artist_id: state.artist.id, project_id: data.get('project_id') || null, title: String(data.get('title') || '').trim(), body: String(data.get('body') || ''), document_status: data.get('document_status') || 'draft' };
    try {
      const query = doc ? db.from('lyrics_documents').update(payload).eq('id', doc.id).eq('artist_id', state.artist.id) : db.from('lyrics_documents').insert(payload);
      const { error } = await query; if (error) throw error;
      state.lyrics = await safeQuery(db.from('lyrics_documents').select('*').eq('artist_id', state.artist.id).order('updated_at', { ascending: false }));
      state.activeLyricsId = doc?.id || state.lyrics[0]?.id || null;
      renderLyricsList(); if (state.activeLyricsId) openLyrics(state.activeLyricsId);
      toast('Текст сохранён.');
    } catch (error) { toast(error.message || 'Не удалось сохранить текст.', 'error'); }
  }

  async function deleteLyrics(doc) {
    if (!doc || !confirm(`Удалить текст «${doc.title}»?`)) return;
    const { error } = await db.from('lyrics_documents').delete().eq('id', doc.id).eq('artist_id', state.artist.id);
    if (error) return toast(error.message, 'error');
    state.lyrics = state.lyrics.filter((item) => item.id !== doc.id); state.activeLyricsId = null; renderLyricsList();
    $('#lyrics-editor').innerHTML = '<div class="empty-state"><span>TXT</span><h3>Выберите текст</h3><p>Или создайте новый документ.</p></div>';
  }

  function renderLinks() {
    const container = $('#links-list');
    container.innerHTML = state.links.length ? state.links.map((link) => `<article class="link-card"><span class="eyebrow">${escapeHTML(link.category)}</span><strong>${escapeHTML(link.label)}</strong><a href="${escapeHTML(link.url)}" target="_blank" rel="noopener">${escapeHTML(link.url)}</a><p>${escapeHTML(link.notes || '')}</p><footer><button class="icon-button" data-edit-link="${link.id}" type="button">✎</button><button class="icon-button" data-delete-link="${link.id}" type="button">×</button></footer></article>`).join('') : '<div class="empty-list">Сохранённых ссылок пока нет.</div>';
    $$('[data-edit-link]', container).forEach((button) => button.addEventListener('click', () => openLinkEditor(button.dataset.editLink)));
    $$('[data-delete-link]', container).forEach((button) => button.addEventListener('click', () => deleteLink(button.dataset.deleteLink)));
  }

  function openLinkEditor(id = null) {
    const link = state.links.find((item) => item.id === id) || null;
    openDrawer('PRIVATE / LINK', link?.label || 'Новая ссылка', `<form id="private-link-form"><label class="field"><span>Название</span><input name="label" value="${escapeHTML(link?.label || '')}" required></label><label class="field"><span>URL</span><input name="url" type="url" value="${escapeHTML(link?.url || '')}" required></label><label class="field"><span>Категория</span><select name="category"><option value="social">Соцсети</option><option value="distribution">Дистрибуция</option><option value="cloud">Облако</option><option value="reference">Референс</option><option value="other" ${!link || link.category === 'other' ? 'selected' : ''}>Другое</option></select></label><label class="field"><span>Заметка</span><textarea name="notes" rows="5">${escapeHTML(link?.notes || '')}</textarea></label><div class="drawer-actions"><span></span><button class="button button-primary" type="submit">Сохранить</button></div></form>`);
    if (link) $('[name="category"]').value = link.category;
    $('#private-link-form').addEventListener('submit', (event) => saveLink(event, link));
  }

  async function saveLink(event, link) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const payload = { artist_id: state.artist.id, label: String(data.get('label') || '').trim(), url: String(data.get('url') || '').trim(), category: data.get('category') || 'other', notes: String(data.get('notes') || '').trim() };
    try { const query = link ? db.from('artist_private_links').update(payload).eq('id', link.id).eq('artist_id', state.artist.id) : db.from('artist_private_links').insert(payload); const { error } = await query; if (error) throw error; state.links = await safeQuery(db.from('artist_private_links').select('*').eq('artist_id', state.artist.id).order('sort_order').order('created_at')); renderLinks(); closeDrawer(); toast('Ссылка сохранена.'); } catch (error) { toast(error.message, 'error'); }
  }

  async function deleteLink(id) {
    if (!confirm('Удалить эту ссылку?')) return;
    const { error } = await db.from('artist_private_links').delete().eq('id', id).eq('artist_id', state.artist.id); if (error) return toast(error.message, 'error'); state.links = state.links.filter((item) => item.id !== id); renderLinks();
  }

  function renderCalendar() {
    const date = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth(), 1);
    $('#calendar-month').textContent = date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    const first = new Date(date); first.setDate(1 - ((date.getDay() + 6) % 7));
    const weekdays = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((day) => `<div class="calendar-weekday">${day}</div>`).join('');
    const days = [];
    for (let index = 0; index < 42; index += 1) {
      const current = new Date(first); current.setDate(first.getDate() + index);
      const key = current.toISOString().slice(0, 10);
      const hasEvent = state.events.some((event) => new Date(event.starts_at).toISOString().slice(0,10) === key);
      const today = new Date();
      days.push(`<div class="calendar-day ${current.getMonth() !== date.getMonth() ? 'is-muted' : ''} ${current.toDateString() === today.toDateString() ? 'is-today' : ''} ${hasEvent ? 'has-event' : ''}">${current.getDate()}</div>`);
    }
    $('#calendar-grid').innerHTML = weekdays + days.join('');
    renderEventList($('#calendar-events'), state.events.filter((event) => new Date(event.starts_at) >= new Date()).slice(0, 12));
  }

  function openEventEditor() {
    if (!state.projects.length) return toast('Сначала создайте проект трека.', 'error');
    openDrawer('CALENDAR / EVENT', 'Новая дата', `<form id="event-form"><label class="field"><span>Событие</span><input name="title" required placeholder="Релиз сингла"></label><label class="field"><span>Проект</span><select name="project_id">${state.projects.map((project) => `<option value="${project.id}">${escapeHTML(project.title)}</option>`).join('')}</select></label><div class="form-grid two"><label class="field"><span>Дата и время</span><input name="starts_at" type="datetime-local" required></label><label class="field"><span>Статус</span><select name="status"><option value="planned">Запланировано</option><option value="ready">Готово</option><option value="completed">Завершено</option><option value="cancelled">Отменено</option></select></label></div><label class="field"><span>Заметка</span><textarea name="notes" rows="5"></textarea></label><div class="drawer-actions"><span></span><button class="button button-primary" type="submit">Добавить в календарь</button></div></form>`);
    $('#event-form').addEventListener('submit', saveEvent);
  }

  async function saveEvent(event) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const payload = { artist_id: state.artist.id, project_id: data.get('project_id'), title: String(data.get('title') || '').trim(), status: data.get('status') || 'planned', starts_at: new Date(data.get('starts_at')).toISOString(), timezone: 'Europe/Moscow', notes: String(data.get('notes') || '') };
    try { const { error } = await db.from('release_events').insert(payload); if (error) throw error; state.events = await safeQuery(db.from('release_events').select('*').eq('artist_id', state.artist.id).order('starts_at')); renderCalendar(); renderDashboard(); closeDrawer(); toast('Событие добавлено.'); } catch (error) { toast(error.message, 'error'); }
  }

  function hydrateProfile() {
    const artist = state.artist;
    $('#profile-name').value = artist?.name || '';
    $('#profile-description').value = artist?.description || '';
    $('#profile-matrix').value = artist?.matrix_text || '';
    $('#profile-tg').value = artist?.tg_url || '';
    $('#profile-vk').value = artist?.vk_url || '';
    $('#profile-inst').value = artist?.inst_url || '';
    $('#profile-preview-name').textContent = artist?.name || 'Имя артиста';
    $('#profile-preview-description').textContent = artist?.description || 'Короткое описание появится здесь.';
    const image = $('#profile-image-preview');
    if (artist?.image_url) { image.src = artist.image_url; image.hidden = false; $('#profile-photo > span').hidden = true; }
    updateProfileCounters();
  }

  function updateProfileCounters() {
    $('#profile-description-count').textContent = `${$('#profile-description').value.length}/60`;
    $('#profile-matrix-count').textContent = `${$('#profile-matrix').value.length}/515`;
    $('#profile-preview-name').textContent = $('#profile-name').value || 'Имя артиста';
    $('#profile-preview-description').textContent = $('#profile-description').value || 'Короткое описание появится здесь.';
  }

  async function saveProfile(event) {
    event.preventDefault(); const button = $('button[type="submit"]', event.currentTarget); setBusy(button, true, 'Сохраняем…');
    try {
      let imageUrl = state.artist.image_url || null;
      const file = $('#profile-image').files?.[0];
      if (file) {
        const path = `${state.user.id}/avatar-${Date.now()}-${safeFileName(file.name)}`;
        const { error } = await db.storage.from('artists').upload(path, file, { contentType: file.type }); if (error) throw error;
        imageUrl = db.storage.from('artists').getPublicUrl(path).data.publicUrl;
      }
      const payload = { name: $('#profile-name').value.trim(), description: $('#profile-description').value.trim(), matrix_text: $('#profile-matrix').value.trim(), tg_url: $('#profile-tg').value.trim() || null, vk_url: $('#profile-vk').value.trim() || null, inst_url: $('#profile-inst').value.trim() || null, image_url: imageUrl };
      const { data, error } = await db.from('artists').update(payload).eq('id', state.artist.id).eq('owner_user_id', state.user.id).select().single(); if (error) throw error;
      state.artist = data; hydrateProfile(); syncIdentity(); $('#profile-save-state').textContent = 'Сохранено'; toast('Карточка артиста обновлена.');
    } catch (error) { toast(error.message || 'Не удалось сохранить карточку.', 'error'); }
    finally { setBusy(button, false); setTimeout(() => { $('#profile-save-state').textContent = ''; }, 1800); }
  }

  async function loadInviteArtists() {
    if (!isOwner()) return;
    const select = $('#invite-artist');
    if (select.dataset.loaded) return;
    try {
      const artists = await safeQuery(db.from('artists').select('id,name').order('name'));
      select.innerHTML = '<option value="">Выберите артиста</option>' + artists.map((artist) => `<option value="${artist.id}">${escapeHTML(artist.name || 'Без имени')}</option>`).join('');
      select.dataset.loaded = '1';
    } catch (error) { toast('Не удалось загрузить список артистов.', 'error'); }
  }

  async function createInvite() {
    const button = $('#create-invite'); const artistId = $('#invite-artist').value; const email = $('#invite-email').value.trim().toLowerCase();
    if (!artistId) return toast('Выберите артиста.', 'error');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('Укажите корректный e-mail.', 'error');
    setBusy(button, true, 'Создаём…'); $('#invite-result').hidden = true;
    try {
      const { data, error } = await db.functions.invoke('artist-invites', { body: { action: 'create', artist_id: artistId, email } });
      if (error) throw error;
      const url = new URL('/invite/', location.origin); url.searchParams.set('token', data.token);
      $('#invite-link').value = url.toString(); $('#invite-result').hidden = false; $('#invite-status').textContent = `Инвайт для ${data.artist?.name || 'артиста'} готов.`;
    } catch (error) { $('#invite-status').textContent = 'Не удалось создать инвайт.'; toast(error.message || 'Ошибка создания инвайта.', 'error'); }
    finally { setBusy(button, false); }
  }

  async function bootApp(user) {
    state.user = user;
    syncOwnerUI();
    $('#sidebar-email').textContent = user.email || '';
    $('#auth-screen').hidden = true;
    $('#terminal-shell').hidden = false;
    try {
      await loadAllData();
      const requested = new URLSearchParams(location.search).get('section');
      goView(VIEW_TITLES[requested] && (requested !== 'invites' || isOwner()) ? requested : 'dashboard');
      state.booted = true;
    } catch (error) {
      setSystemStatus('Ошибка привязки');
      toast(error.message || 'Не удалось открыть кабинет.', 'error');
    }
  }

  function showLogin(message = '') {
    $('#auth-screen').hidden = false; $('#terminal-shell').hidden = true;
    $('#login-form').hidden = false; $('#recovery-form').hidden = true;
    $('#auth-title').textContent = 'Вход в кабинет'; $('#auth-copy').textContent = 'Доступ только для артистов INMISE.';
    setAuthMessage(message);
  }

  function showRecovery(message = 'Придумайте новый пароль для кабинета.') {
    $('#auth-screen').hidden = false; $('#terminal-shell').hidden = true;
    $('#login-form').hidden = true; $('#recovery-form').hidden = false;
    $('#auth-title').textContent = 'Смена пароля'; $('#auth-copy').textContent = message; setAuthMessage('');
  }

  async function initialiseAuth() {
    const query = new URLSearchParams(location.search);
    const tokenHash = query.get('token_hash');
    const recovery = query.get('type') === 'recovery' || query.get('mode') === 'recovery' || sessionStorage.getItem('inmise-password-recovery') === '1';
    if (recovery) { sessionStorage.setItem('inmise-password-recovery', '1'); showRecovery(tokenHash ? 'Проверяем ссылку восстановления…' : undefined); }
    if (tokenHash && query.get('type') === 'recovery') {
      const { data, error } = await db.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
      if (error || !data.session) return showRecovery('Ссылка недействительна или уже использована. Запросите новое письмо.');
      history.replaceState({}, '', '/admin/?mode=recovery');
      showRecovery('Ссылка подтверждена. Придумайте новый пароль.');
      return;
    }
    const { data } = await db.auth.getSession();
    if (data.session?.user && !recovery) await bootApp(data.session.user);
    else if (!recovery) showLogin();

    db.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { state.booted = false; showLogin(); }
      if (event === 'PASSWORD_RECOVERY') showRecovery();
      if (event === 'SIGNED_IN' && session?.user && sessionStorage.getItem('inmise-password-recovery') !== '1' && !state.booted) bootApp(session.user);
    });
  }

  function bindEvents() {
    $$('[data-theme-choice]').forEach((button) => button.addEventListener('click', () => setTheme(button.dataset.themeChoice)));
    $$('.nav-item').forEach((button) => button.addEventListener('click', () => goView(button.dataset.view)));
    $$('[data-go-view]').forEach((button) => button.addEventListener('click', () => goView(button.dataset.goView)));
    $('#mobile-menu').addEventListener('click', () => $('#sidebar').classList.toggle('is-open'));
    $('#drawer-close').addEventListener('click', closeDrawer); $('#drawer-backdrop').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeDrawer(); });
    $('#logout-button').addEventListener('click', () => db.auth.signOut());
    $('#auth-submit').addEventListener('click', async () => {
      const button = $('#auth-submit'); const email = $('#auth-email').value.trim(); const password = $('#auth-password').value;
      if (!email || !password) return setAuthMessage('Укажите e-mail и пароль.', true);
      setBusy(button, true, 'Входим…'); const { error } = await db.auth.signInWithPassword({ email, password }); setBusy(button, false);
      if (error) setAuthMessage('Не удалось войти: ' + error.message, true);
    });
    $('#auth-password').addEventListener('keydown', (event) => { if (event.key === 'Enter') $('#auth-submit').click(); });
    $('#auth-forgot').addEventListener('click', async () => {
      const email = $('#auth-email').value.trim(); if (!email) return setAuthMessage('Сначала укажите e-mail.', true);
      const button = $('#auth-forgot'); button.disabled = true;
      const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: new URL('/admin/', location.origin).toString() }); button.disabled = false;
      setAuthMessage(error ? `Не удалось отправить письмо: ${error.message}` : 'Письмо для восстановления отправлено.', Boolean(error));
    });
    $('#recovery-submit').addEventListener('click', async () => {
      const password = $('#recovery-password').value; const confirmation = $('#recovery-confirm').value;
      if (password.length < 8) return setAuthMessage('Минимум 8 символов.', true);
      if (password !== confirmation) return setAuthMessage('Пароли не совпадают.', true);
      const button = $('#recovery-submit'); setBusy(button, true, 'Сохраняем…'); const { data, error } = await db.auth.updateUser({ password }); setBusy(button, false);
      if (error) return setAuthMessage(error.message, true);
      sessionStorage.removeItem('inmise-password-recovery'); history.replaceState({}, '', '/admin/'); toast('Пароль обновлён.'); await bootApp(data.user);
    });
    $('#recovery-cancel').addEventListener('click', () => { sessionStorage.removeItem('inmise-password-recovery'); history.replaceState({}, '', '/admin/'); showLogin(); });
    $('#beat-tabs').addEventListener('click', (event) => { const button = event.target.closest('[data-beat-tab]'); if (!button) return; state.beatTab = button.dataset.beatTab; renderBeats(); });
    $('#open-beat-form').addEventListener('click', () => openBeatEditor());
    $('#new-project').addEventListener('click', () => openProjectEditor());
    $('#new-lyrics').addEventListener('click', () => openLyrics());
    $('#new-link').addEventListener('click', () => openLinkEditor());
    $('#new-event').addEventListener('click', openEventEditor);
    $('#calendar-prev').addEventListener('click', () => { state.calendarDate.setMonth(state.calendarDate.getMonth() - 1); renderCalendar(); });
    $('#calendar-next').addEventListener('click', () => { state.calendarDate.setMonth(state.calendarDate.getMonth() + 1); renderCalendar(); });
    $('#profile-form').addEventListener('submit', saveProfile);
    ['profile-name','profile-description','profile-matrix'].forEach((id) => $(`#${id}`).addEventListener('input', updateProfileCounters));
    $('#profile-image').addEventListener('change', () => { const file = $('#profile-image').files?.[0]; if (!file) return; const image = $('#profile-image-preview'); image.src = URL.createObjectURL(file); image.hidden = false; $('#profile-photo > span').hidden = true; });
    $('#create-invite').addEventListener('click', createInvite);
    $('#copy-invite').addEventListener('click', async () => { const value = $('#invite-link').value; if (!value) return; await navigator.clipboard.writeText(value); toast('Ссылка скопирована.'); });
  }

  document.addEventListener('DOMContentLoaded', () => { initialiseTheme(); bindEvents(); initialiseAuth().catch((error) => { console.error(error); showLogin('Не удалось инициализировать авторизацию.'); }); });
})();
