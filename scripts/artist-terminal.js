(function () {
  'use strict';

  if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    console.error('[artist-terminal] Supabase configuration is missing');
    return;
  }

  const db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  const publicDb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'inmise-public-client' },
  });
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const escapeHTML = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const formatMoney = (value, currency = 'RUB') => value == null || value === '' ? 'Цена не указана' : new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value));
  const formatDate = (value, options = {}) => value ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', ...options }).format(new Date(value)) : 'Дата не назначена';
  const padDatePart = (value) => String(value).padStart(2, '0');
  const localDateKey = (value) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
  };
  const dateKeyToISO = (key) => new Date(`${key}T12:00:00`).toISOString();
  const toLocalInput = (value) => {
    if (!value) return '';
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };
  const safeFileName = (name) => String(name || 'file').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-110);
  const PROFILE_IMAGE = Object.freeze({ minWidth: 800, minHeight: 1000, aspect: 4 / 5, aspectTolerance: 0.015, maxBytes: 8 * 1024 * 1024 });
  const PROFILE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
  let profilePreviewObjectUrl = '';

  function readImageSize(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => {
        const size = { width: image.naturalWidth, height: image.naturalHeight };
        URL.revokeObjectURL(url);
        resolve(size);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Не удалось прочитать изображение.'));
      };
      image.src = url;
    });
  }

  async function validateProfileImage(file) {
    if (!PROFILE_IMAGE_TYPES.has(file.type)) throw new Error('Загрузите фото в формате JPG, PNG или WebP.');
    if (file.size > PROFILE_IMAGE.maxBytes) throw new Error('Фото должно весить не больше 8 МБ.');
    const size = await readImageSize(file);
    if (size.width < PROFILE_IMAGE.minWidth || size.height < PROFILE_IMAGE.minHeight) {
      throw new Error(`Фото слишком маленькое: ${size.width} × ${size.height} px. Минимум — 800 × 1000 px.`);
    }
    if (Math.abs((size.width / size.height) - PROFILE_IMAGE.aspect) > PROFILE_IMAGE.aspectTolerance) {
      throw new Error(`Нужна вертикальная пропорция 4:5. Сейчас — ${size.width} × ${size.height} px.`);
    }
    return size;
  }

  function setProfileImageStatus(message = '', isError = false) {
    const status = $('#profile-image-status');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  }

  function restoreStoredProfileImage() {
    const image = $('#profile-image-preview');
    const placeholder = $('#profile-photo > span');
    if (profilePreviewObjectUrl) {
      URL.revokeObjectURL(profilePreviewObjectUrl);
      profilePreviewObjectUrl = '';
    }
    if (state.artist?.image_url) {
      image.src = state.artist.image_url;
      image.hidden = false;
      placeholder.hidden = true;
    } else {
      image.removeAttribute('src');
      image.hidden = true;
      placeholder.hidden = false;
    }
  }

  async function previewProfileImage(file) {
    try {
      const size = await validateProfileImage(file);
      if (profilePreviewObjectUrl) URL.revokeObjectURL(profilePreviewObjectUrl);
      profilePreviewObjectUrl = URL.createObjectURL(file);
      const image = $('#profile-image-preview');
      image.src = profilePreviewObjectUrl;
      image.hidden = false;
      $('#profile-photo > span').hidden = true;
      setProfileImageStatus(`Фото подходит: ${size.width} × ${size.height} px.`);
    } catch (error) {
      $('#profile-image').value = '';
      restoreStoredProfileImage();
      setProfileImageStatus(error.message, true);
      toast(error.message, 'error');
    }
  }

  const BEAT_GROUPS = {
    private: ['private', 'archived'],
    sale: ['draft', 'published', 'sold'],
  };
  const BEAT_STATUS = { private: 'Личный', draft: 'Черновик', published: 'На витрине', sold: 'Продан', archived: 'Архив' };
  const PROJECT_STATUS = { idea: 'Идея', demo: 'Демо', mix: 'Сведение', scheduled: 'Запланирован', released: 'Выпущен', archived: 'Архив' };
  const PROJECT_STATUS_HINT = { idea: 'Мечтаем', demo: 'Записываем', mix: 'Работаем', scheduled: 'Добавлен в календарь!', released: 'Ожидаем успеха', archived: 'Архив' };
  const TASK_WORKFLOW = { idea: 'Придумал', doing: 'Делаю', uploaded: 'Загружено' };
  const DEFAULT_PROJECT_TASKS = ['Сделать обложку', 'Записать вокал', 'Свести'];
  const DEFAULT_LYRICS_CATEGORIES = ['На альбом', 'Ипишка', 'В работе'];
  const LINK_CATEGORIES = { social: 'Соцсети', distribution: 'Дистрибуция', cloud: 'Облако', reference: 'Референсы', other: 'Другое' };
  const LINKS_VIEW_STORAGE_KEY = 'inmise-artist-links-view';
  const EVENT_STATUS = { planned: 'Запланировано', ready: 'Готово', completed: 'Завершено', cancelled: 'Отменено' };
  const VIEW_TITLES = {
    dashboard: ['01', 'Дашборд'], beats: ['02', 'Биты'], projects: ['03', 'Треки и релизы'], track: ['03', 'Рабочее пространство трека'], tasks: ['04', 'Задачи'], lyrics: ['05', 'Тексты'],
    calendar: ['06', 'Календарь'], profile: ['07', 'Карточка артиста'], links: ['08', 'Ссылки'], autopost: ['09', 'Автопостинг'], secretary: ['10', 'Секретарь'], invites: ['11', 'Инвайты'],
  };

  const state = {
    user: null,
    artist: null,
    beats: [],
    projects: [],
    lyrics: [],
    links: [],
    events: [],
    files: [],
    tasks: [],
    beatTab: 'private',
    calendarDate: new Date(),
    dashboardDate: new Date(),
    dashboardSearch: '',
    dashboardProjectId: '',
    activeLyricsId: null,
    lyricsReturnProjectId: '',
    activeLyricsFilter: 'all',
    activeProjectId: null,
    freshDraftProjectId: null,
    projectReturnView: 'projects',
    linksCategory: 'all',
    linksView: localStorage.getItem(LINKS_VIEW_STORAGE_KEY) === 'list' ? 'list' : 'cards',
    booted: false,
    booting: false,
  };
  let activeWorkspaceFlush = null;

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

  function showBusy(text, hint = '') {
    const overlay = $('#busy-overlay');
    if (!overlay) return;
    $('#busy-overlay-text').textContent = text || 'Загрузка…';
    $('#busy-overlay-hint').textContent = hint;
    overlay.hidden = false;
  }

  function hideBusy() {
    const overlay = $('#busy-overlay');
    if (overlay) overlay.hidden = true;
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

  async function goView(view) {
    if (!VIEW_TITLES[view]) return;
    const currentView = $('.view.is-active')?.dataset.viewPanel;
    if (currentView === 'track' && view !== 'track' && activeWorkspaceFlush) {
      const flush = activeWorkspaceFlush;
      activeWorkspaceFlush = null;
      try {
        await flush();
      } catch (error) {
        toast(error.message || 'Не удалось автоматически сохранить изменения.', 'error');
      }
    }
    $$('.view').forEach((panel) => {
      const active = panel.dataset.viewPanel === view;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
    $$('.nav-item').forEach((button) => button.classList.toggle('is-active', button.dataset.view === view));
    $('#view-code').textContent = `ТЕРМИНАЛ / ${VIEW_TITLES[view][0]}`;
    $('#view-title').textContent = VIEW_TITLES[view][1];
    $('#view-actions').innerHTML = '';
    $('#sidebar').classList.remove('is-open');
    window.history.replaceState({}, '', `/admin/?section=${view}`);
    if (view === 'calendar') renderCalendar();
    if (view === 'tasks') renderTasksView();
    if (view === 'invites') loadInviteArtists();
    if (view === 'autopost') renderAutopost();
  }

  function withTimeout(promise, timeoutMs, message) {
    let timer = 0;
    const timeout = new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return Promise.race([Promise.resolve(promise), timeout]).finally(() => window.clearTimeout(timer));
  }

  async function safeQuery(promise, fallback = [], timeoutMs = 12000) {
    const { data, error } = await withTimeout(
      promise,
      timeoutMs,
      'Сервер слишком долго отвечает. Обновите страницу или попробуйте ещё раз.',
    );
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
      safeQuery(db.from('project_files').select('*').eq('artist_id', artistId).order('created_at', { ascending: false })),
      safeQuery(db.from('project_tasks').select('*').eq('artist_id', artistId).order('is_done').order('sort_order').order('due_at')),
    ]);
    const keys = ['beats', 'projects', 'lyrics', 'links', 'events', 'files', 'tasks'];
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
    renderTasksView();
    renderLyricsList();
    renderLinks();
    renderCalendar();
    hydrateProfile();
    $('#nav-beats-count').textContent = state.beats.length;
    $('#nav-tasks-count').textContent = state.tasks.filter((task) => (task.workflow_status || (task.is_done ? 'uploaded' : 'idea')) !== 'uploaded').length;
  }

  const WHEEL_COLORS = ['#c91c78', '#1fa8a9', '#d9c53f', '#5c3593', '#2f9e6b', '#e0672b', '#2758a8', '#a8296b'];
  let wheelSpinning = false;

  function drawWheel(tasks) {
    const canvas = $('#wheel-canvas');
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const center = size / 2;
    const radius = size / 2 - 4;
    const sliceAngle = (2 * Math.PI) / tasks.length;
    ctx.clearRect(0, 0, size, size);
    tasks.forEach((task, index) => {
      const start = index * sliceAngle;
      const end = start + sliceAngle;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = WHEEL_COLORS[index % WHEEL_COLORS.length];
      ctx.fill();
      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(start + sliceAngle / 2);
      ctx.textAlign = 'right';
      ctx.font = '600 15px "IBM Plex Mono", monospace';
      const label = task.title.length > 22 ? `${task.title.slice(0, 21)}…` : task.title;
      ctx.fillStyle = 'rgba(224,111,192,.75)';
      ctx.fillText(label, radius - 15, 5);
      ctx.fillStyle = 'rgba(31,168,169,.75)';
      ctx.fillText(label, radius - 13, 5);
      ctx.fillStyle = '#f2f4ef';
      ctx.fillText(label, radius - 14, 5);
      ctx.restore();
    });
  }

  function openWheel() {
    const pendingTasks = state.tasks.filter((task) => !task.is_done);
    if (!pendingTasks.length) return toast('Нет незавершённых задач для колеса.', 'error');
    state.wheelTasks = pendingTasks;
    const canvas = $('#wheel-canvas');
    canvas.style.transition = 'none';
    canvas.style.transform = 'rotate(0deg)';
    drawWheel(pendingTasks);
    $('#wheel-result').hidden = true;
    $('#wheel-backdrop').hidden = false;
    $('#wheel-modal').hidden = false;
  }

  function closeWheel() {
    $('#wheel-backdrop').hidden = true;
    $('#wheel-modal').hidden = true;
  }

  function spinWheel() {
    if (wheelSpinning) return;
    const tasks = state.wheelTasks || [];
    if (!tasks.length) return;
    wheelSpinning = true;
    $('#wheel-result').hidden = true;
    const canvas = $('#wheel-canvas');
    const winnerIndex = Math.floor(Math.random() * tasks.length);
    const sliceDeg = 360 / tasks.length;
    const winnerCenterDeg = winnerIndex * sliceDeg + sliceDeg / 2;
    const randomJitter = (Math.random() - 0.5) * sliceDeg * 0.6;
    const extraSpins = 6 * 360;
    const landingDeg = ((270 - winnerCenterDeg) % 360 + 360) % 360;
    const targetRotation = extraSpins + landingDeg + randomJitter;
    canvas.style.transition = 'transform 4.5s cubic-bezier(0.12, 0.67, 0.1, 1)';
    canvas.style.transform = `rotate(${targetRotation}deg)`;
    const onEnd = () => {
      canvas.removeEventListener('transitionend', onEnd);
      wheelSpinning = false;
      const winner = tasks[winnerIndex];
      $('#wheel-result-title').textContent = winner.title;
      $('#wheel-result').hidden = false;
    };
    canvas.addEventListener('transitionend', onEnd);
  }

  function renderDashboard() {
    const selectedProject = selectedDashboardProject();
    const activeProjects = state.projects.filter((project) => !['released', 'archived'].includes(project.status));
    const released = state.projects.filter((project) => project.status === 'released').length;
    const dashboardTasks = selectedProject ? state.tasks.filter((task) => task.project_id === selectedProject.id) : state.tasks;
    const totalTasks = dashboardTasks.length;
    const completedTasks = dashboardTasks.filter((task) => task.is_done).length;

    $('#stat-projects').textContent = String(activeProjects.length).padStart(2, '0');
    $('#stat-releases').textContent = String(released).padStart(2, '0');
    $('#stat-completion').textContent = totalTasks ? `${Math.round((completedTasks / totalTasks) * 100)}%` : '0%';

    renderDashboardProjectSelect();
    renderDashboardCalendar();
    renderDashboardTasks(dashboardTasks, selectedProject);
    renderDashboardProjectFocus(selectedProject);
    renderDashboardPipeline();
    renderDashboardFiles();
    renderDashboardSearchResults();
  }

  function projectById(id) {
    return state.projects.find((project) => project.id === id) || null;
  }

  function selectedDashboardProject() {
    if (!state.dashboardProjectId) return null;
    const project = projectById(state.dashboardProjectId);
    if (!project) state.dashboardProjectId = '';
    return project;
  }

  function renderDashboardProjectSelect() {
    const select = $('#dashboard-project-select');
    if (!select) return;
    const selected = selectedDashboardProject();
    select.innerHTML = [
      '<option value="">Все проекты</option>',
      ...state.projects.map((project) => `<option value="${project.id}" ${selected?.id === project.id ? 'selected' : ''}>${escapeHTML(project.title)}</option>`),
    ].join('');
  }

  function renderDashboardCalendar() {
    const selectedProject = selectedDashboardProject();
    const month = new Date(state.dashboardDate.getFullYear(), state.dashboardDate.getMonth(), 1);
    $('#dashboard-calendar-month').textContent = month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    const first = new Date(month);
    first.setDate(1 - ((month.getDay() + 6) % 7));
    const headers = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => `<div class="dashboard-calendar-weekday">${day}</div>`).join('');
    const today = new Date();
    const cells = [];
    for (let index = 0; index < 42; index += 1) {
      const current = new Date(first);
      current.setDate(first.getDate() + index);
      const key = localDateKey(current);
      const projects = state.projects.filter((project) => (!selectedProject || project.id === selectedProject.id) && ['scheduled', 'released', 'archived'].includes(project.status) && project.release_at && localDateKey(project.release_at) === key);
      const tasks = state.tasks.filter((task) => (!selectedProject || task.project_id === selectedProject.id) && task.due_at && localDateKey(task.due_at) === key);
      const entries = [
        ...projects.map((project) => ({ title: project.title, projectId: project.id, status: project.status })),
        ...tasks.map((task) => ({ title: task.title, taskId: task.id, projectId: task.project_id, status: task.is_done ? 'task-done' : 'task' })),
      ];
      cells.push(`<div class="dashboard-calendar-day ${current.getMonth() !== month.getMonth() ? 'is-muted' : ''} ${current.toDateString() === today.toDateString() ? 'is-today' : ''}" data-calendar-drop-date="${key}"><span>${current.getDate()}</span><div class="calendar-entry-stack">${entries.map((entry) => `<button class="calendar-entry-${entry.status}" ${entry.taskId ? `data-open-task="${entry.taskId}" data-task-drag="${entry.taskId}" draggable="true"` : `data-open-project="${entry.projectId || ''}" ${entry.projectId ? `data-project-drag="${entry.projectId}" draggable="true"` : ''}`} type="button">${escapeHTML(entry.title)}</button>`).join('')}</div></div>`);
    }
    const container = $('#dashboard-calendar');
    container.innerHTML = headers + cells.join('');
    bindProjectButtons(container);
    bindTaskButtons(container);
    bindCalendarDnD(container);
  }

  function renderDashboardTasks(tasks, selectedProject = null) {
    const container = $('#dashboard-tasks');
    if (!container) return;
    const sorted = [...tasks].sort((a, b) => Number(a.is_done) - Number(b.is_done) || new Date(a.due_at || '2999-12-31') - new Date(b.due_at || '2999-12-31'));
    container.innerHTML = sorted.length ? sorted.slice(0, 8).map((task) => {
      const project = projectById(task.project_id);
      return `<article class="dashboard-task-row ${task.is_done ? 'is-done' : ''}" data-task-drag="${task.id}" draggable="true">
        <label><input type="checkbox" data-dashboard-task-check="${task.id}" ${task.is_done ? 'checked' : ''}><span></span></label>
        <button data-open-task="${task.id}" type="button"><strong>${escapeHTML(task.title)}</strong><small>${escapeHTML(project?.title || 'Без релиза')} · ${task.due_at ? formatDate(task.due_at, { year: undefined }) : 'без даты'}</small></button>
      </article>`;
    }).join('') : `<div class="empty-list">${selectedProject ? 'У этого релиза задач пока нет.' : 'Задач пока нет.'}</div>`;
    $$('[data-dashboard-task-check]', container).forEach((input) => input.addEventListener('change', () => toggleTask(input.dataset.dashboardTaskCheck, input.checked)));
    bindTaskButtons(container);
    bindTaskDragSources(container);
  }

  function renderDashboardPipeline() {
    const statuses = ['idea', 'demo', 'mix', 'scheduled', 'released'];
    const query = state.dashboardSearch.toLowerCase();
    const selectedProject = selectedDashboardProject();
    const container = $('#dashboard-pipeline');
    container.innerHTML = statuses.map((status) => {
      const projects = state.projects.filter((project) => project.status === status && (!selectedProject || project.id === selectedProject.id) && (!query || project.title.toLowerCase().includes(query)));
      return `<section class="pipeline-column" data-project-dropzone="${status}"><header><span>${PROJECT_STATUS[status]}</span><b>${projects.length}</b></header><div>${projects.map((project) => `<button class="pipeline-card" data-open-project="${project.id}" data-project-drag="${project.id}" draggable="true" type="button"><strong>${escapeHTML(project.title)}</strong><small>${project.beat_id ? 'Бит подключён' : 'Без бита'} · ${project.release_at ? formatDate(project.release_at) : 'дата не назначена'}</small></button>`).join('') || '<p>Перетащите проект сюда</p>'}</div><button class="pipeline-add" data-pipeline-status="${status}" type="button">+ Добавить</button></section>`;
    }).join('');
    bindProjectButtons(container);
    bindProjectPipelineDnD(container);
    $$('[data-pipeline-status]', container).forEach((button) => button.addEventListener('click', () => openProjectEditor(null, button.dataset.pipelineStatus)));
  }

  function renderDashboardProjectFocus(project) {
    const container = $('#dashboard-project-focus');
    if (!container) return;
    const pipelineEyebrow = $('#dashboard-pipeline-eyebrow');
    const pipelineTitle = $('#dashboard-pipeline-title');
    if (pipelineEyebrow) pipelineEyebrow.textContent = '';
    if (pipelineTitle) pipelineTitle.textContent = project ? `Прогресс: ${project.title}` : 'Прогресс релиза';
    if (!project) {
      container.innerHTML = '<div class="dashboard-focus-empty"><strong>Выберите релиз выше — календарь, задачи и прогресс отфильтруются по нему.</strong></div>';
      return;
    }
    const nextTask = state.tasks
      .filter((task) => task.project_id === project.id && task.due_at && !task.is_done)
      .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))[0];
    container.innerHTML = `<div class="dashboard-focus-summary"><div><span class="eyebrow">Работаем над</span><h3>${escapeHTML(project.title)}</h3><p>${PROJECT_STATUS[project.status] || project.status} · ${PROJECT_STATUS_HINT[project.status] || 'Следующий шаг можно добавить задачей.'}</p></div><button class="text-button" data-open-project="${project.id}" type="button">Открыть карточку →</button></div><div class="dashboard-focus-meta"><span>Дата: ${project.release_at ? formatDate(project.release_at) : 'не назначена'}</span><span>Бит: ${project.beat_id ? escapeHTML(state.beats.find((beat) => beat.id === project.beat_id)?.title || 'подключён') : 'не выбран'}</span><span>Ближайшее: ${nextTask ? escapeHTML(nextTask.title) : 'нет задач'}</span></div>`;
    bindProjectButtons(container);
  }

  function bindProjectPipelineDnD(container) {
    bindProjectDragSources(container);
    $$('[data-project-dropzone]', container).forEach((zone) => {
      zone.addEventListener('dragover', (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; zone.classList.add('is-dragover'); });
      zone.addEventListener('dragleave', (event) => { if (!zone.contains(event.relatedTarget)) zone.classList.remove('is-dragover'); });
      zone.addEventListener('drop', (event) => {
        event.preventDefault();
        zone.classList.remove('is-dragover');
        const id = event.dataTransfer.getData('text/project-id');
        if (id) moveProjectToStage(id, zone.dataset.projectDropzone);
      });
    });
  }

  function bindProjectDragSources(container) {
    $$('[data-project-drag]', container).forEach((card) => {
      card.addEventListener('dragstart', (event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/project-id', card.dataset.projectDrag);
        card.classList.add('is-dragging');
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('is-dragging');
        $$('[data-project-dropzone], [data-calendar-drop-date]', document).forEach((zone) => zone.classList.remove('is-dragover'));
      });
    });
  }

  function bindTaskDragSources(container) {
    $$('[data-task-drag]', container).forEach((card) => {
      card.addEventListener('dragstart', (event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/task-id', card.dataset.taskDrag);
        card.classList.add('is-dragging');
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('is-dragging');
        $$('[data-task-dropzone], [data-calendar-drop-date]', document).forEach((zone) => zone.classList.remove('is-dragover'));
      });
    });
  }

  function bindCalendarDnD(container) {
    bindProjectDragSources(container);
    bindTaskDragSources(container);
    $$('[data-calendar-drop-date]', container).forEach((day) => {
      day.addEventListener('dragover', (event) => {
        const dragTypes = Array.from(event.dataTransfer.types || []);
        if (dragTypes.includes('text/project-id') || dragTypes.includes('text/task-id')) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          day.classList.add('is-dragover');
        }
      });
      day.addEventListener('dragleave', (event) => {
        if (!day.contains(event.relatedTarget)) day.classList.remove('is-dragover');
      });
      day.addEventListener('drop', (event) => {
        event.preventDefault();
        day.classList.remove('is-dragover');
        const dateKey = day.dataset.calendarDropDate;
        const projectId = event.dataTransfer.getData('text/project-id');
        const taskId = event.dataTransfer.getData('text/task-id');
        if (projectId) moveProjectToCalendar(projectId, dateKey);
        if (taskId) moveTaskToCalendar(taskId, dateKey);
      });
    });
  }

  async function moveProjectToStage(id, status) {
    const project = state.projects.find((item) => item.id === id);
    if (!project || project.status === status) return;
    if (['scheduled', 'released'].includes(status) && !project.release_at) {
      toast('Сначала укажите дату релиза.', 'error');
      return openProjectEditor(id, project.status, 'dashboard');
    }
    const previous = project.status;
    project.status = status;
    renderDashboard();
    try {
      const { data, error } = await db.from('artist_projects').update({ status }).eq('id', id).eq('artist_id', state.artist.id).select().single();
      if (error) throw error;
      Object.assign(project, data);
      await renderProjects();
      renderDashboard();
      renderCalendar();
      toast(`Проект перенесён: ${PROJECT_STATUS[status]}.`);
    } catch (error) {
      project.status = previous;
      renderDashboard();
      toast(error.message || 'Не удалось изменить этап проекта.', 'error');
    }
  }

  async function moveProjectToCalendar(id, dateKey) {
    const project = state.projects.find((item) => item.id === id);
    if (!project || !dateKey) return;
    const previousReleaseAt = project.release_at;
    const previousStatus = project.status;
    const nextStatus = ['scheduled', 'released', 'archived'].includes(project.status) ? project.status : 'scheduled';
    const releaseAt = dateKeyToISO(dateKey);
    project.release_at = releaseAt;
    project.status = nextStatus;
    renderDashboard();
    renderCalendar();
    try {
      const { data, error } = await db.from('artist_projects').update({ release_at: releaseAt, status: nextStatus }).eq('id', id).eq('artist_id', state.artist.id).select().single();
      if (error) throw error;
      Object.assign(project, data);
      renderDashboard();
      renderCalendar();
      toast('Релиз добавлен в календарь.');
    } catch (error) {
      project.release_at = previousReleaseAt;
      project.status = previousStatus;
      renderDashboard();
      renderCalendar();
      toast(error.message || 'Не удалось перенести релиз в календаре.', 'error');
    }
  }

  function taskWorkflow(task) {
    return task.workflow_status || (task.is_done ? 'uploaded' : 'idea');
  }

  function renderTasksView() {
    $('#nav-tasks-count').textContent = state.tasks.filter((task) => taskWorkflow(task) !== 'uploaded').length;
    const container = $('#tasks-board');
    if (!container) return;
    renderTaskWorkflowBoard(container, state.tasks);
  }

  function renderTaskWorkflowBoard(container, tasks, projectId = '') {
    container.innerHTML = Object.entries(TASK_WORKFLOW).map(([status, label]) => {
      const columnTasks = tasks.filter((task) => taskWorkflow(task) === status);
      return `<section class="task-pipeline-column" data-task-dropzone="${status}"><header><span>${label}</span><b>${columnTasks.length}</b></header><div>${columnTasks.map((task) => {
        const project = projectById(task.project_id);
        const overdue = status !== 'uploaded' && task.due_at && new Date(task.due_at) < new Date();
        return `<article class="task-pipeline-card ${overdue ? 'is-overdue' : ''}" data-task-drag="${task.id}" draggable="true"><strong>${escapeHTML(task.title)}</strong><span>${escapeHTML(project?.title || 'Без проекта')}</span><time>${task.due_at ? formatDate(task.due_at, { year: undefined }) : 'без даты'}</time></article>`;
      }).join('') || '<p>Перетащите задачу сюда</p>'}</div><button class="pipeline-add" data-task-add="${status}" type="button">+ Добавить</button></section>`;
    }).join('');
    $$('[data-task-add]', container).forEach((button) => button.addEventListener('click', () => openTaskEditor(button.dataset.taskAdd, projectId)));
    $$('[data-task-drag]', container).forEach((card) => card.addEventListener('click', () => {
      const task = state.tasks.find((item) => item.id === card.dataset.taskDrag);
      if (task) openTaskEditor(taskWorkflow(task), task.project_id || '', task.id);
    }));
    bindTaskPipelineDnD(container);
  }

  function bindTaskPipelineDnD(container) {
    bindTaskDragSources(container);
    $$('[data-task-dropzone]', container).forEach((zone) => {
      zone.addEventListener('dragover', (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; zone.classList.add('is-dragover'); });
      zone.addEventListener('dragleave', (event) => { if (!zone.contains(event.relatedTarget)) zone.classList.remove('is-dragover'); });
      zone.addEventListener('drop', (event) => {
        event.preventDefault();
        zone.classList.remove('is-dragover');
        const id = event.dataTransfer.getData('text/task-id');
        if (id) moveTaskToStage(id, zone.dataset.taskDropzone);
      });
    });
  }

  async function moveTaskToStage(id, workflowStatus) {
    const task = state.tasks.find((item) => item.id === id);
    if (!task || taskWorkflow(task) === workflowStatus) return;
    const previous = taskWorkflow(task);
    task.workflow_status = workflowStatus;
    task.is_done = workflowStatus === 'uploaded';
    renderDashboard();
    renderTasksView();
    try {
      const { data, error } = await db.from('project_tasks').update({ workflow_status: workflowStatus, is_done: workflowStatus === 'uploaded' }).eq('id', id).eq('artist_id', state.artist.id).select().single();
      if (error) throw error;
      Object.assign(task, data);
      renderDashboard();
      renderTasksView();
      if (state.activeProjectId) await renderTrackWorkspace(state.activeProjectId);
      toast(`Задача перенесена: ${TASK_WORKFLOW[workflowStatus]}.`);
    } catch (error) {
      task.workflow_status = previous;
      task.is_done = previous === 'uploaded';
      renderDashboard();
      renderTasksView();
      if (state.activeProjectId) await renderTrackWorkspace(state.activeProjectId);
      toast(error.message || 'Не удалось изменить этап задачи.', 'error');
    }
  }

  function formatFileSize(value) {
    const bytes = Number(value || 0);
    if (!bytes) return '—';
    if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} КБ`;
    return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  }

  function renderDashboardFiles() {
    const query = state.dashboardSearch.toLowerCase();
    const selectedProject = selectedDashboardProject();
    const files = state.files.filter((file) => (!selectedProject || file.project_id === selectedProject.id) && (!query || file.original_name.toLowerCase().includes(query) || projectById(file.project_id)?.title?.toLowerCase().includes(query)));
    const container = $('#dashboard-files');
    container.innerHTML = files.length ? `<div class="dashboard-file-head"><span>Имя</span><span>Проект</span><span>Тип</span><span>Размер</span></div>${files.slice(0, 3).map((file) => `<button class="dashboard-file-row" data-download-file="${file.id}" type="button"><span>${escapeHTML(file.original_name)}</span><span>${escapeHTML(projectById(file.project_id)?.title || '—')}</span><span>${escapeHTML(file.file_kind)}</span><span>${formatFileSize(file.size_bytes)}</span></button>`).join('')}` : '<div class="empty-list">Рабочих файлов пока нет.</div>';
    $$('[data-download-file]', container).forEach((button) => button.addEventListener('click', () => downloadProjectFile(button.dataset.downloadFile)));
  }

  function renderDashboardSearchResults() {
    const container = $('#dashboard-search-results');
    const query = state.dashboardSearch.trim().toLowerCase();
    if (!query) { container.hidden = true; container.innerHTML = ''; return; }
    const results = [
      ...state.projects.filter((item) => item.title.toLowerCase().includes(query)).map((item) => ({ type: 'project', id: item.id, title: item.title, label: 'Проект' })),
      ...state.beats.filter((item) => item.title.toLowerCase().includes(query)).map((item) => ({ type: 'beat', id: item.id, title: item.title, label: 'Бит' })),
      ...state.lyrics.filter((item) => item.title.toLowerCase().includes(query) || item.body?.toLowerCase().includes(query)).map((item) => ({ type: 'lyrics', id: item.id, title: item.title, label: 'Текст' })),
      ...state.files.filter((item) => item.original_name.toLowerCase().includes(query)).map((item) => ({ type: 'file', id: item.id, title: item.original_name, label: 'Файл' })),
    ].slice(0, 8);
    container.hidden = false;
    container.innerHTML = results.length ? results.map((item) => `<button data-search-type="${item.type}" data-search-id="${item.id}" type="button"><span>${escapeHTML(item.title)}</span><small>${item.label}</small></button>`).join('') : '<p>Ничего не найдено.</p>';
    $$('[data-search-type]', container).forEach((button) => button.addEventListener('click', () => openSearchResult(button.dataset.searchType, button.dataset.searchId)));
  }

  function openSearchResult(type, id) {
    $('#dashboard-search-results').hidden = true;
    if (type === 'project') return openProjectEditor(id);
    if (type === 'beat') return goView('beats');
    if (type === 'lyrics') { goView('lyrics'); return openLyrics(id); }
    if (type === 'file') return downloadProjectFile(id);
  }

  function openTaskEditor(initialStatus = 'idea', initialProjectId = '', taskId = null) {
    const task = state.tasks.find((item) => item.id === taskId) || null;
    const selectedProjectId = task?.project_id || initialProjectId;
    const selectedStatus = task ? taskWorkflow(task) : initialStatus;
    const projectOptions = ['<option value="">Без привязки к релизу</option>', ...state.projects.map((project) => `<option value="${project.id}" ${project.id === selectedProjectId ? 'selected' : ''}>${escapeHTML(project.title)}</option>`)].join('');
    const workflowOptions = Object.entries(TASK_WORKFLOW).map(([value, label]) => `<option value="${value}" ${value === selectedStatus ? 'selected' : ''}>${label}</option>`).join('');
    openDrawer('TASK / PROJECT', task ? 'Редактирование задачи' : 'Новая задача', `<form id="task-form"><label class="field"><span>Задача</span><input name="title" value="${escapeHTML(task?.title || '')}" required placeholder="Например: подготовить обложку"></label><label class="field"><span>Связанный релиз</span><select name="project_id">${projectOptions}</select></label><div class="form-grid two"><label class="field"><span>Этап</span><select name="workflow_status">${workflowOptions}</select></label><label class="field"><span>Срок</span><input name="due_at" type="datetime-local" value="${toLocalInput(task?.due_at)}"></label></div><div class="drawer-actions">${task ? '<button class="button button-danger" id="delete-task" type="button">Удалить</button>' : '<span></span>'}<button class="button button-primary" type="submit">${task ? 'Сохранить' : 'Добавить задачу'}</button></div></form>`);
    $('#task-form').addEventListener('submit', (event) => saveTask(event, task));
    $('#delete-task')?.addEventListener('click', () => deleteTask(task));
  }

  async function saveTask(event, task = null) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('button[type="submit"]', form);
    const data = new FormData(form);
    const workflowStatus = data.get('workflow_status') || 'idea';
    const payload = { artist_id: state.artist.id, project_id: data.get('project_id') || null, title: String(data.get('title') || '').trim(), workflow_status: workflowStatus, is_done: workflowStatus === 'uploaded', due_at: data.get('due_at') ? new Date(data.get('due_at')).toISOString() : null };
    if (!payload.title) return toast('Введите задачу.', 'error');
    setBusy(button, true, 'Сохраняем…');
    try {
      const query = task
        ? db.from('project_tasks').update(payload).eq('id', task.id).eq('artist_id', state.artist.id)
        : db.from('project_tasks').insert(payload);
      const { error } = await query;
      if (error) throw error;
      state.tasks = await safeQuery(db.from('project_tasks').select('*').eq('artist_id', state.artist.id).order('is_done').order('sort_order').order('due_at'));
      renderDashboard(); renderTasksView(); renderCalendar();
      if (state.activeProjectId) await renderTrackWorkspace(state.activeProjectId);
      closeDrawer(); toast(task ? 'Задача обновлена.' : 'Задача добавлена.');
    } catch (error) { toast(error.message || 'Не удалось сохранить задачу.', 'error'); }
    finally { setBusy(button, false); }
  }

  async function toggleTask(id, isDone) {
    const previous = state.tasks.find((task) => task.id === id)?.is_done;
    const task = state.tasks.find((item) => item.id === id);
    const previousWorkflow = task ? taskWorkflow(task) : 'idea';
    const workflowStatus = isDone ? 'uploaded' : (previousWorkflow === 'uploaded' ? 'doing' : previousWorkflow);
    if (task) { task.is_done = isDone; task.workflow_status = workflowStatus; }
    renderDashboard();
    renderTasksView();
    try {
      const { error } = await db.from('project_tasks').update({ is_done: isDone, workflow_status: workflowStatus }).eq('id', id).eq('artist_id', state.artist.id);
      if (error) throw error;
      renderDashboard(); renderTasksView(); renderCalendar();
      if (state.activeProjectId) await renderTrackWorkspace(state.activeProjectId);
    } catch (error) {
      if (task) { task.is_done = previous; task.workflow_status = previousWorkflow; }
      renderDashboard(); renderTasksView(); renderCalendar();
      if (state.activeProjectId) await renderTrackWorkspace(state.activeProjectId);
      toast(error.message || 'Не удалось обновить задачу.', 'error');
    }
  }

  async function moveTaskToCalendar(id, dateKey) {
    const task = state.tasks.find((item) => item.id === id);
    if (!task || !dateKey) return;
    const previousDueAt = task.due_at;
    const dueAt = dateKeyToISO(dateKey);
    task.due_at = dueAt;
    renderDashboard();
    renderTasksView();
    renderCalendar();
    try {
      const { data, error } = await db.from('project_tasks').update({ due_at: dueAt }).eq('id', id).eq('artist_id', state.artist.id).select().single();
      if (error) throw error;
      Object.assign(task, data);
      renderDashboard();
      renderTasksView();
      renderCalendar();
      if (state.activeProjectId) await renderTrackWorkspace(state.activeProjectId);
      toast('Задача перенесена в календаре.');
    } catch (error) {
      task.due_at = previousDueAt;
      renderDashboard();
      renderTasksView();
      renderCalendar();
      toast(error.message || 'Не удалось перенести задачу в календаре.', 'error');
    }
  }

  async function deleteTask(task) {
    if (!task || !confirm(`Удалить задачу «${task.title}»?`)) return;
    try {
      const { error } = await db.from('project_tasks').delete().eq('id', task.id).eq('artist_id', state.artist.id);
      if (error) throw error;
      state.tasks = state.tasks.filter((item) => item.id !== task.id);
      renderDashboard();
      renderTasksView();
      renderCalendar();
      if (state.activeProjectId) await renderTrackWorkspace(state.activeProjectId);
      closeDrawer();
      toast('Задача удалена.');
    } catch (error) {
      toast(error.message || 'Не удалось удалить задачу.', 'error');
    }
  }

  function openFileUploader(initialProjectId = '') {
    if (!state.projects.length) return toast('Сначала создайте проект трека.', 'error');
    const projectOptions = state.projects.map((project) => `<option value="${project.id}" ${project.id === initialProjectId ? 'selected' : ''}>${escapeHTML(project.title)}</option>`).join('');
    openDrawer('PRIVATE / FILES', 'Загрузка файлов', `<form id="project-file-form"><label class="field"><span>Проект</span><select name="project_id">${projectOptions}</select></label><label class="field"><span>Тип файлов</span><select name="file_kind"><option value="demo">Демо</option><option value="master">Мастер</option><option value="stem">Стемы</option><option value="document">Документы</option><option value="other">Другое</option></select></label><label class="dashboard-upload-picker"><span>Выбрать файлы</span><small>Можно загрузить несколько файлов одновременно</small><input name="files" type="file" multiple required></label><div class="drawer-actions"><span></span><button class="button button-primary" type="submit">Загрузить</button></div></form>`);
    $('#project-file-form').addEventListener('submit', uploadProjectFiles);
  }

  async function uploadProjectFiles(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('button[type="submit"]', form);
    const data = new FormData(form);
    const files = Array.from($('[name="files"]', form).files || []);
    if (!files.length) return toast('Выберите файлы.', 'error');
    const projectId = data.get('project_id');
    const kind = data.get('file_kind') || 'other';
    setBusy(button, true, `Загрузка 0/${files.length}`);
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        button.textContent = `Загрузка ${index + 1}/${files.length}`;
        const path = `${state.user.id}/projects/${projectId}/files/${Date.now()}-${index}-${safeFileName(file.name)}`;
        const { error: uploadError } = await db.storage.from('artist-private').upload(path, file, { contentType: file.type || 'application/octet-stream' });
        if (uploadError) throw uploadError;
        const { error: rowError } = await db.from('project_files').insert({ artist_id: state.artist.id, project_id: projectId, file_kind: kind, bucket_id: 'artist-private', storage_path: path, original_name: file.name, mime_type: file.type || null, size_bytes: file.size });
        if (rowError) { await db.storage.from('artist-private').remove([path]); throw rowError; }
      }
      state.files = await safeQuery(db.from('project_files').select('*').eq('artist_id', state.artist.id).order('created_at', { ascending: false }));
      renderDashboard();
      if (state.activeProjectId) await renderTrackWorkspace(state.activeProjectId);
      closeDrawer(); toast('Файлы загружены.');
    } catch (error) { toast(error.message || 'Не удалось загрузить файлы.', 'error'); }
    finally { setBusy(button, false); }
  }

  async function downloadProjectFile(id) {
    const file = state.files.find((item) => item.id === id);
    if (!file) return;
    const url = await signedUrl(file.bucket_id || 'artist-private', file.storage_path, 120);
    if (!url) return toast('Не удалось получить ссылку на файл.', 'error');
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = file.original_name; anchor.rel = 'noopener';
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
  }

  function renderEventList(container, events) {
    container.innerHTML = events.length ? events.map((event) => `
      <div class="timeline-row"><div class="timeline-date">${new Date(event.starts_at).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}</div><div><strong>${escapeHTML(event.title)}</strong><span>${EVENT_STATUS[event.status] || PROJECT_STATUS[event.status] || event.status} · ${new Date(event.starts_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span></div></div>
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
      button.classList.add('is-loading');
      button.disabled = true;
      let url;
      try {
        url = await getBeatAudio(beat);
      } finally {
        button.classList.remove('is-loading');
        button.disabled = false;
      }
      if (!url) return toast('У бита нет доступного аудиофайла.', 'error');
      audio = new Audio(url);
      button.__audio = audio;
      audio.addEventListener('ended', () => { button.textContent = '▶'; });
      audio.addEventListener('waiting', () => button.classList.add('is-loading'));
      audio.addEventListener('playing', () => button.classList.remove('is-loading'));
    }
    if (audio.paused) {
      $$('.track-actions button').forEach((other) => {
        if (other !== button && other.__audio && !other.__audio.paused) { other.__audio.pause(); other.textContent = '▶'; }
      });
      button.classList.add('is-loading');
      await audio.play();
      button.classList.remove('is-loading');
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
    if (state.activeProjectId) await renderTrackWorkspace(state.activeProjectId);
  }

  async function projectCover(project) {
    return project.cover_storage_path ? signedUrl('artist-private', project.cover_storage_path) : '';
  }

  async function renderProjects() {
    const container = $('#projects-list');
    if (!state.projects.length) { container.innerHTML = '<div class="empty-list">Проектов пока нет. Создайте карточку первого трека.</div>'; return; }
    const cards = await Promise.all(state.projects.map(async (project) => {
      const cover = await projectCover(project);
      const coverMarkup = cover
        ? `<img class="project-cover-bg" src="${escapeHTML(cover)}" alt="" aria-hidden="true"><img class="project-cover-fg" src="${escapeHTML(cover)}" alt="">`
        : '<span>NO COVER</span>';
      return `<article class="project-card" data-open-project="${project.id}"><div class="project-cover">${coverMarkup}</div><div class="project-body"><span class="eyebrow">${formatDate(project.release_at)}</span><h3>${escapeHTML(project.title)}</h3><p class="project-stage-copy">${PROJECT_STATUS_HINT[project.status] || ''}</p><div class="project-meta"><span>${project.beat_id ? 'Бит выбран' : 'Без бита'}</span><span class="status-chip ${project.status}">${PROJECT_STATUS[project.status] || project.status}</span></div></div></article>`;
    }));
    container.innerHTML = cards.join('');
    bindProjectButtons(container);
  }

  function bindProjectButtons(root) {
    $$('[data-open-project]', root).forEach((node) => node.addEventListener('click', () => {
      const source = $('.view.is-active')?.dataset.viewPanel;
      if (node.dataset.openProject) openProjectEditor(node.dataset.openProject, 'idea', source === 'dashboard' ? 'dashboard' : 'projects');
    }));
  }

  function bindTaskButtons(root) {
    $$('[data-open-task]', root).forEach((node) => node.addEventListener('click', () => {
      const task = state.tasks.find((item) => item.id === node.dataset.openTask);
      if (task) openTaskEditor(taskWorkflow(task), task.project_id || '', task.id);
    }));
  }

  async function createDraftProject(initialStatus) {
    const payload = { artist_id: state.artist.id, title: 'Без названия', status: initialStatus, beat_id: null, description: '', release_at: null, timezone: 'Europe/Moscow' };
    const { data: saved, error } = await db.from('artist_projects').insert(payload).select().single();
    if (error) throw error;
    const defaults = DEFAULT_PROJECT_TASKS.map((title, index) => ({ artist_id: state.artist.id, project_id: saved.id, title, workflow_status: 'idea', is_done: false, sort_order: index }));
    const { error: taskError } = await db.from('project_tasks').insert(defaults);
    if (taskError) console.error('Failed to seed default tasks for draft project', taskError);
    state.projects = [saved, ...state.projects];
    state.tasks = await safeQuery(db.from('project_tasks').select('*').eq('artist_id', state.artist.id).order('is_done').order('sort_order').order('due_at'));
    state.freshDraftProjectId = saved.id;
    return saved.id;
  }

  function isPristineDraft(project) {
    if (!project || state.freshDraftProjectId !== project.id) return false;
    const linkedTasks = state.tasks.filter((task) => task.project_id === project.id);
    const tasksArePristine = linkedTasks.length === DEFAULT_PROJECT_TASKS.length
      && linkedTasks.every((task) => DEFAULT_PROJECT_TASKS.includes(task.title) && !task.is_done);
    const hasLyrics = state.lyrics.some((doc) => doc.project_id === project.id);
    const hasFiles = state.files.some((file) => file.project_id === project.id);
    return tasksArePristine && !hasLyrics && !hasFiles
      && project.title === 'Без названия'
      && !project.description
      && !project.beat_id
      && !project.release_at
      && !project.cover_storage_path;
  }

  async function deleteDraftSilently(project) {
    if (!project) return;
    try {
      const { error } = await db.from('artist_projects').delete().eq('id', project.id).eq('artist_id', state.artist.id);
      if (error) throw error;
      state.projects = state.projects.filter((item) => item.id !== project.id);
      state.tasks = state.tasks.filter((task) => task.project_id !== project.id);
      state.files = state.files.filter((file) => file.project_id !== project.id);
      state.lyrics = state.lyrics.map((doc) => doc.project_id === project.id ? { ...doc, project_id: null } : doc);
      if (state.freshDraftProjectId === project.id) state.freshDraftProjectId = null;
      renderDashboard();
      renderCalendar();
      renderLyricsList();
    } catch (error) {
      console.error('Failed to clean up an empty draft project', error);
    }
  }

  async function openProjectEditor(id = null, initialStatus = 'idea', returnView = null) {
    const visibleView = $('.view.is-active')?.dataset.viewPanel;
    state.projectReturnView = returnView || (visibleView === 'dashboard' ? 'dashboard' : 'projects');
    if (!id) {
      try {
        id = await createDraftProject(initialStatus);
      } catch (error) {
        toast(error.message || 'Не удалось создать черновик трека.', 'error');
        return;
      }
    }
    state.activeProjectId = id;
    await renderTrackWorkspace(id, initialStatus);
    await goView('track');
    const url = new URL(location.href);
    url.searchParams.set('section', 'track');
    url.searchParams.set('project', id);
    history.replaceState({}, '', `${url.pathname}${url.search}`);
  }

  async function renderTrackWorkspace(id = null, initialStatus = 'idea') {
    activeWorkspaceFlush = null;
    const project = state.projects.find((item) => item.id === id) || null;
    const selectedStatus = project?.status === 'master' ? 'mix' : (project?.status || initialStatus);
    const stageOrder = Object.keys(PROJECT_STATUS);
    const selectedStageIndex = Math.max(0, stageOrder.indexOf(selectedStatus));
    const stageRail = Object.entries(PROJECT_STATUS).map(([status, label], index) => `
      <button class="${index <= selectedStageIndex ? 'is-reached' : ''} ${status === selectedStatus ? 'is-active' : ''}" data-track-stage="${status}" type="button">
        <i>0${index + 1}</i><span>${label}</span><small>${PROJECT_STATUS_HINT[status]}</small>
      </button>`).join('');
    const cover = project ? await projectCover(project) : '';
    const beatOptions = ['<option value="">Бит не выбран</option>', ...state.beats.map((beat) => `<option value="${beat.id}" ${project?.beat_id === beat.id ? 'selected' : ''}>${escapeHTML(beat.title)}</option>`), '<option value="__new__">+ Добавить бит…</option>'].join('');
    const linkedTasks = project ? state.tasks.filter((task) => task.project_id === project.id) : [];
    const linkedFiles = project ? state.files.filter((file) => file.project_id === project.id) : [];
    const linkedLyrics = project ? state.lyrics.filter((doc) => doc.project_id === project.id) : [];
    const taskRows = linkedTasks.length ? [...linkedTasks]
      .sort((a, b) => Number(a.is_done) - Number(b.is_done) || new Date(a.due_at || '2999-12-31') - new Date(b.due_at || '2999-12-31'))
      .map((task) => `<article class="dashboard-task-row track-task-row ${task.is_done ? 'is-done' : ''}">
        <label><input type="checkbox" data-track-task-check="${task.id}" ${task.is_done ? 'checked' : ''}><span></span></label>
        <button data-open-task="${task.id}" type="button"><strong>${escapeHTML(task.title)}</strong><small>${task.due_at ? formatDate(task.due_at, { year: undefined }) : 'без даты'} · ${TASK_WORKFLOW[taskWorkflow(task)]}</small></button>
      </article>`).join('') : '<p class="track-workspace-empty">Задач пока нет.</p>';
    const fileRows = linkedFiles.length ? linkedFiles.map((file) => `<button class="track-workspace-list-row" data-download-file="${file.id}" type="button"><span>${escapeHTML(file.original_name)}</span><small>${escapeHTML(file.file_kind)} · ${formatFileSize(file.size_bytes)}</small></button>`).join('') : '<p class="track-workspace-empty">Файлов пока нет.</p>';
    const lyricRows = linkedLyrics.length ? linkedLyrics.map((doc) => `<article class="track-lyrics-inline" data-track-lyrics-inline="${doc.id}"><textarea data-inline-lyrics-body="${doc.id}" placeholder="Слова, строки, идеи…">${escapeHTML(doc.body || '')}</textarea><footer><button class="text-button" data-project-lyrics="${doc.id}" type="button">Открыть полностью</button><button class="button button-primary" data-save-inline-lyrics="${doc.id}" type="button">Сохранить</button></footer></article>`).join('') : '<p class="track-workspace-empty">Текст ещё не привязан.</p>';
    const container = $('#track-workspace');
    container.innerHTML = `
      <div class="track-workspace-toolbar">
        <button class="text-button" id="track-workspace-back" type="button">← ${state.projectReturnView === 'dashboard' ? 'На дашборд' : 'Ко всем трекам'}</button>
        <span class="eyebrow">TRACK / ${project ? 'PROJECT' : 'NEW'}</span>
      </div>
      <form class="track-workspace-form" id="project-form">
        <section class="panel track-workspace-hero">
          <label class="cover-upload track-workspace-cover" id="project-cover-label">${cover ? `<img src="${escapeHTML(cover)}" alt="Обложка">` : '<span>+ Обложка</span>'}<input name="cover" type="file" accept="image/*" hidden></label>
          <div class="track-workspace-title" ${project ? `draggable="true" data-track-project-drag="${project.id}" title="Перетащите трек на нужную стадию"` : ''}>
            <span class="eyebrow">Текст · релиз · задачи · промо</span>
            <input class="track-title-input" name="title" value="${escapeHTML(project?.title || '')}" required placeholder="Название трека">
          </div>
          <div class="track-workspace-actions">
            <button class="button button-primary track-save-button" type="submit">${project && !isPristineDraft(project) ? 'Сохранить трек' : 'Создать трек'}</button>
          </div>
          <div class="track-status-row">
            <p id="project-status-hint">${PROJECT_STATUS_HINT[selectedStatus] || ''}</p>
            <div class="track-progress track-progress-compact" aria-label="Стадия релиза">${stageRail}</div>
          </div>
        </section>

        <div class="track-workspace-grid">
          <section class="panel track-workspace-lyrics">
            <header class="panel-header"><div><span class="eyebrow">Материал</span><h3>Текст</h3></div>${project ? '<button class="text-button" id="track-add-lyrics" type="button">+ Добавить</button>' : ''}</header>
            <div class="track-workspace-list track-workspace-lyrics-list">${project ? lyricRows : '<p class="track-workspace-empty">Сначала сохраните трек.</p>'}</div>
          </section>

          <section class="panel track-workspace-release">
            <header class="panel-header"><div><span class="eyebrow">Публикация</span><h3>Релиз</h3></div></header>
            <div class="track-workspace-section-body">
              <label class="field"><span>Статус</span><select name="status">${Object.entries(PROJECT_STATUS).map(([value,label]) => `<option value="${value}" ${selectedStatus === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
              <label class="field"><span>Дата релиза</span><input name="release_at" type="datetime-local" value="${toLocalInput(project?.release_at)}"><small>Запланированные и выпущенные релизы появляются в календаре.</small></label>
            </div>
          </section>

          <section class="panel track-workspace-main">
            <header class="panel-header"><div><span class="eyebrow">Внутреннее</span><h3>Бит и заметки</h3></div><select class="track-beat-select" name="beat_id" aria-label="Бит">${beatOptions}</select></header>
            <div class="track-workspace-section-body">
              <div class="field notes-field"><div class="notes-toolbar"><button type="button" class="notes-toolbar-btn" data-note-format="bold" title="Жирный текст"><b>B</b></button><button type="button" class="notes-toolbar-btn" data-note-format="insertUnorderedList" title="Список точками">&bull;</button><button type="button" class="notes-toolbar-btn" data-note-format="insertOrderedList" title="Нумерованный список">1.</button></div><div class="notes-editor" data-notes-editor contenteditable="true" role="textbox" aria-multiline="true" aria-label="Заметки по треку" data-placeholder="Заметки по треку…">${notesToHTML(project?.description || '')}</div></div>
            </div>
          </section>

          <section class="panel track-workspace-tasks">
            <header class="panel-header"><div><span class="eyebrow">Производство и промо</span><h3>Задачи трека</h3></div>${project ? '<button class="text-button" id="track-add-task" type="button">+ Задача</button>' : ''}</header>
            ${project ? `<div class="track-task-list" id="track-tasks-list">${taskRows}</div>` : '<p class="track-workspace-empty large">Сохраните трек — стандартные задачи появятся автоматически.</p>'}
          </section>

          <section class="panel track-workspace-files">
            <header class="panel-header"><div><span class="eyebrow">Необязательно</span><h3>Материалы проекта</h3><p>Обложки, документы и финальные версии. Аудио загружать не требуется.</p></div>${project ? '<button class="text-button" id="track-add-file" type="button">+ Файл</button>' : ''}</header>
            <div class="track-workspace-list">${project ? fileRows : '<p class="track-workspace-empty">Сначала сохраните трек.</p>'}</div>
          </section>

          ${project ? `<section class="panel track-workspace-danger">
            <header class="panel-header"><div><span class="eyebrow">Опасная зона</span><h3>Удаление</h3></div></header>
            <div class="track-workspace-section-body track-danger-body">
              <p>Удаление уберёт релиз из кабинета, календаря и прогресса. Связанные задачи и даты тоже будут очищены.</p>
              <button class="button button-danger track-delete-button" id="delete-project" type="button">Удалить релиз</button>
            </div>
          </section>` : ''}
        </div>
      </form>`;
    const form = $('#project-form', container);
    const statusSelect = $('[name="status"]', form);
    let projectDirty = false;
    let acceptedStage = selectedStatus;
    const syncTrackStatus = (status) => {
      statusSelect.value = status;
      $('#project-status-hint').textContent = PROJECT_STATUS_HINT[status] || '';
    };
    const stageButtons = $$('[data-track-stage]', form);
    const refreshStageRail = (status) => {
      const activeIndex = stageOrder.indexOf(status);
      stageButtons.forEach((button, index) => {
        button.classList.toggle('is-active', button.dataset.trackStage === status);
        button.classList.toggle('is-reached', index <= activeIndex);
      });
    };
    const chooseStage = (status) => {
      const releaseInput = $('[name="release_at"]', form);
      if (['scheduled', 'released', 'archived'].includes(status) && !releaseInput.value) {
        toast('Для этого статуса сначала укажите дату релиза.', 'error');
        releaseInput.focus();
        return false;
      }
      syncTrackStatus(status);
      refreshStageRail(status);
      acceptedStage = status;
      if (project) projectDirty = true;
      return true;
    };
    statusSelect.addEventListener('change', (event) => {
      if (!chooseStage(statusSelect.value)) {
        syncTrackStatus(acceptedStage);
        refreshStageRail(acceptedStage);
        event.stopPropagation();
      }
    });
    stageButtons.forEach((button) => {
      button.addEventListener('click', () => chooseStage(button.dataset.trackStage));
      button.addEventListener('dragover', (event) => {
        if (!project) return;
        event.preventDefault();
        button.classList.add('is-drag-over');
      });
      button.addEventListener('dragleave', () => button.classList.remove('is-drag-over'));
      button.addEventListener('drop', (event) => {
        event.preventDefault();
        button.classList.remove('is-drag-over');
        chooseStage(button.dataset.trackStage);
      });
    });
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
    if (project) {
      const dragTitle = $('[data-track-project-drag]', form);
      dragTitle?.addEventListener('dragstart', (event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/project-id', project.id);
      });
      $$('[data-track-task-check]', container).forEach((input) => input.addEventListener('change', () => toggleTask(input.dataset.trackTaskCheck, input.checked)));
      bindTaskButtons($('#track-tasks-list', container));
      $('#track-add-task').addEventListener('click', () => openTaskEditor('idea', project.id));
      $('#track-add-file').addEventListener('click', () => openFileUploader(project.id));
      $('#track-add-lyrics').addEventListener('click', () => openLyricsDrawer(null, project.id));
      $('#delete-project')?.addEventListener('click', () => deleteProject(project));

      const dirtyLyrics = new Set();
      let saveInFlight = Promise.resolve();
      let autosaveTimer = null;
      const persistWorkspace = async () => {
        const shouldSaveProject = projectDirty;
        const lyricIds = [...dirtyLyrics];
        if (!shouldSaveProject && !lyricIds.length) {
          await saveInFlight.catch(() => {});
          return;
        }
        if (shouldSaveProject) projectDirty = false;
        lyricIds.forEach((id) => dirtyLyrics.delete(id));
        saveInFlight = saveInFlight.catch(() => {}).then(async () => {
          if (shouldSaveProject) {
            const { payload } = projectPayloadFromForm(form);
            if (!payload.title) throw new Error('Укажите название трека.');
            if (['scheduled', 'released', 'archived'].includes(payload.status) && !payload.release_at) {
              throw new Error('Для этого статуса укажите дату релиза.');
            }
            const { data, error } = await db.from('artist_projects').update(payload).eq('id', project.id).eq('artist_id', state.artist.id).select().single();
            if (error) throw error;
            state.projects = state.projects.map((item) => item.id === project.id ? data : item);
          }
          for (const lyricId of lyricIds) {
            const textarea = $$('[data-inline-lyrics-body]', form).find((node) => node.dataset.inlineLyricsBody === lyricId);
            if (!textarea) continue;
            const { data, error } = await db.from('lyrics_documents').update({ body: textarea.value }).eq('id', lyricId).eq('artist_id', state.artist.id).select().single();
            if (error) throw error;
            state.lyrics = state.lyrics.map((item) => item.id === lyricId ? data : item);
          }
        });
        try {
          await saveInFlight;
        } catch (error) {
          if (shouldSaveProject) projectDirty = true;
          lyricIds.forEach((id) => dirtyLyrics.add(id));
          throw error;
        }
      };
      const scheduleWorkspaceSave = () => {
        clearTimeout(autosaveTimer);
        autosaveTimer = setTimeout(() => {
          persistWorkspace().catch((error) => toast(error.message || 'Не удалось автоматически сохранить изменения.', 'error'));
        }, 800);
      };
      form.addEventListener('input', (event) => {
        if (event.target.matches('[data-inline-lyrics-body]')) dirtyLyrics.add(event.target.dataset.inlineLyricsBody);
        else if (event.target.matches('[data-notes-editor]')) projectDirty = true;
        else if (event.target.name && event.target.name !== 'cover') projectDirty = true;
        scheduleWorkspaceSave();
      });
      form.addEventListener('change', (event) => {
        if (event.target.name && event.target.name !== 'cover') projectDirty = true;
        scheduleWorkspaceSave();
      });
      const notesEditor = $('[data-notes-editor]', form);
      if (notesEditor) {
        $$('[data-note-format]', form).forEach((button) => button.addEventListener('mousedown', (event) => {
          event.preventDefault(); // keep the caret/selection inside the editor
          notesEditor.focus();
          document.execCommand(button.dataset.noteFormat, false, null);
          projectDirty = true;
          scheduleWorkspaceSave();
        }));
        notesEditor.addEventListener('paste', (event) => {
          event.preventDefault();
          const text = (event.clipboardData || window.clipboardData).getData('text/plain');
          document.execCommand('insertText', false, text);
        });
      }
      activeWorkspaceFlush = async () => {
        clearTimeout(autosaveTimer);
        await persistWorkspace();
        const latestProject = state.projects.find((item) => item.id === project.id);
        if (!latestProject) return;
        const isFreshDraft = state.freshDraftProjectId === latestProject.id;
        if (!isFreshDraft) return;
        // An untouched draft leaves no trace; a touched-but-never-explicitly-saved
        // draft asks whether to keep it before the user navigates away.
        if (isPristineDraft(latestProject)) {
          await deleteDraftSilently(latestProject);
          return;
        }
        const named = latestProject.title && latestProject.title !== 'Без названия' ? ` «${latestProject.title}»` : '';
        const keep = window.confirm(`Сохранить новый трек${named}?\n\nОК — сохранить, Отмена — удалить черновик.`);
        if (keep) {
          state.freshDraftProjectId = null;
        } else {
          await deleteDraftSilently(latestProject);
        }
      };
    }
    $$('[data-download-file]', form).forEach((button) => button.addEventListener('click', () => downloadProjectFile(button.dataset.downloadFile)));
    $$('[data-save-inline-lyrics]', form).forEach((button) => button.addEventListener('click', () => saveInlineLyrics(button.dataset.saveInlineLyrics, form)));
    $$('[data-project-lyrics]', form).forEach((button) => button.addEventListener('click', () => openLyricsDrawer(button.dataset.projectLyrics, project ? project.id : '')));
    $('#track-workspace-back').addEventListener('click', () => { state.activeProjectId = null; goView(state.projectReturnView); });
    form.addEventListener('submit', (event) => saveProject(event, project));
    const beatSelect = $('[name="beat_id"]', form);
    let acceptedBeatId = beatSelect.value;
    beatSelect.addEventListener('change', (event) => {
      if (beatSelect.value === '__new__') {
        event.stopPropagation();
        beatSelect.value = acceptedBeatId;
        openBeatEditor(null);
        return;
      }
      acceptedBeatId = beatSelect.value;
    });
  }

  // Notes are stored as light HTML (bold + native lists). Old plain-text notes
  // are escaped and line-broken so they keep rendering correctly.
  function notesToHTML(raw) {
    if (!raw) return '';
    return /<[a-z][\s\S]*>/i.test(raw) ? raw : escapeHTML(raw).replace(/\n/g, '<br>');
  }

  function readNotesHTML(element) {
    if (!element) return '';
    const text = (element.textContent || '').replace(/ /g, ' ').trim();
    return text ? element.innerHTML : '';
  }

  async function saveInlineLyrics(id, root) {
    const doc = state.lyrics.find((item) => item.id === id);
    const textarea = $$('[data-inline-lyrics-body]', root).find((node) => node.dataset.inlineLyricsBody === id);
    const button = $$('[data-save-inline-lyrics]', root).find((node) => node.dataset.saveInlineLyrics === id);
    if (!doc || !textarea) return;
    setBusy(button, true, '...');
    try {
      const { data, error } = await db.from('lyrics_documents').update({ body: textarea.value }).eq('id', id).eq('artist_id', state.artist.id).select().single();
      if (error) throw error;
      state.lyrics = state.lyrics.map((item) => item.id === id ? data : item);
      renderLyricsList();
      toast('Текст сохранён.');
    } catch (error) {
      toast(error.message || 'Не удалось сохранить текст.', 'error');
    } finally {
      setBusy(button, false);
    }
  }

  function projectPayloadFromForm(form) {
    const data = new FormData(form);
    return {
      data,
      payload: {
        artist_id: state.artist.id,
        title: String(data.get('title') || '').trim(),
        status: data.get('status') || 'idea',
        beat_id: data.get('beat_id') || null,
        description: readNotesHTML($('[data-notes-editor]', form)),
        release_at: data.get('release_at') ? new Date(data.get('release_at')).toISOString() : null,
        timezone: 'Europe/Moscow',
      },
    };
  }

  async function saveProject(event, project) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = $('button[type="submit"]', form);
    const { data, payload } = projectPayloadFromForm(form);
    if (['scheduled', 'released', 'archived'].includes(payload.status) && !payload.release_at) {
      return toast('Для этого статуса укажите дату релиза.', 'error');
    }
    setBusy(submit, true, 'Сохраняем…');
    try {
      const { data: row, error } = await db.from('artist_projects').update(payload).eq('id', project.id).eq('artist_id', state.artist.id).select().single();
      if (error) throw error;
      let saved = row;
      const cover = data.get('cover');
      if (cover instanceof File && cover.size) {
        const path = `${state.user.id}/projects/${saved.id}/cover-${Date.now()}-${safeFileName(cover.name)}`;
        const { error: uploadError } = await db.storage.from('artist-private').upload(path, cover, { contentType: cover.type });
        if (uploadError) throw uploadError;
        const { data: coverRow, error: coverError } = await db.from('artist_projects').update({ cover_storage_path: path }).eq('id', saved.id).eq('artist_id', state.artist.id).select().single();
        if (coverError) throw coverError;
        saved = coverRow;
      }
      state.projects = await safeQuery(db.from('artist_projects').select('*').eq('artist_id', state.artist.id).order('updated_at', { ascending: false }));
      if (state.freshDraftProjectId === saved.id) state.freshDraftProjectId = null;
      await renderProjects(); renderDashboard(); renderCalendar();
      activeWorkspaceFlush = null;
      state.activeProjectId = saved.id;
      await renderTrackWorkspace(saved.id, saved.status);
      goView('track');
      const url = new URL(location.href); url.searchParams.set('section', 'track'); url.searchParams.set('project', saved.id); history.replaceState({}, '', `${url.pathname}${url.search}`);
      toast('Проект обновлён.');
    } catch (error) { toast(error.message || 'Не удалось сохранить проект.', 'error'); }
    finally { setBusy(submit, false); }
  }

  async function deleteProject(project) {
    if (!project) return;
    const answer = prompt(`Чтобы удалить релиз «${project.title}», введите слово: удалить`);
    if (String(answer || '').trim().toLowerCase() !== 'удалить') {
      toast('Удаление отменено.');
      return;
    }
    try {
      const { error } = await db.from('artist_projects').delete().eq('id', project.id).eq('artist_id', state.artist.id);
      if (error) throw error;
      state.projects = state.projects.filter((item) => item.id !== project.id);
      state.tasks = state.tasks.filter((task) => task.project_id !== project.id);
      state.events = state.events.filter((event) => event.project_id !== project.id);
      state.files = state.files.filter((file) => file.project_id !== project.id);
      state.lyrics = state.lyrics.map((doc) => doc.project_id === project.id ? { ...doc, project_id: null } : doc);
      if (state.dashboardProjectId === project.id) state.dashboardProjectId = '';
      state.activeProjectId = null;
      await renderProjects();
      renderTasksView();
      renderLyricsList();
      renderDashboard();
      renderCalendar();
      goView(state.projectReturnView === 'dashboard' ? 'dashboard' : 'projects');
      closeDrawer();
      toast('Релиз удалён.');
    } catch (error) {
      toast(error.message || 'Не удалось удалить релиз.', 'error');
    }
  }

  function renderLyricsList() {
    renderLyricsFilters();
    const container = $('#lyrics-list');
    const documents = state.activeLyricsFilter === 'all'
      ? state.lyrics
      : state.lyrics.filter((doc) => (doc.category || 'В работе') === state.activeLyricsFilter);
    container.innerHTML = documents.length ? documents.map((doc) => `<button class="document-item ${state.activeLyricsId === doc.id ? 'is-active' : ''}" data-lyrics-id="${doc.id}" type="button"><strong>${escapeHTML(doc.title)}</strong><em>${escapeHTML(doc.category || 'В работе')}</em><span>${doc.document_status === 'ready' ? 'Готов' : doc.document_status === 'archived' ? 'Архив' : 'Черновик'} · ${formatDate(doc.updated_at)}</span></button>`).join('') : `<div class="empty-list">${state.lyrics.length ? 'В этой категории текстов пока нет.' : 'Текстов пока нет.'}</div>`;
    $$('[data-lyrics-id]', container).forEach((button) => button.addEventListener('click', () => openLyrics(button.dataset.lyricsId)));
  }

  function lyricsCategories() {
    return [...new Set([...DEFAULT_LYRICS_CATEGORIES, ...state.lyrics.map((doc) => String(doc.category || '').trim()).filter(Boolean)])];
  }

  function renderLyricsFilters() {
    const select = $('#lyrics-filter-select');
    if (!select) return;
    const categories = lyricsCategories();
    if (state.activeLyricsFilter !== 'all' && !categories.includes(state.activeLyricsFilter)) state.activeLyricsFilter = 'all';
    select.innerHTML = [
      `<option value="all">Все тексты · ${state.lyrics.length}</option>`,
      ...categories.map((category) => {
        const count = state.lyrics.filter((doc) => (doc.category || 'В работе') === category).length;
        return `<option value="${escapeHTML(category)}">${escapeHTML(category)} · ${count}</option>`;
      }),
    ].join('');
    select.value = state.activeLyricsFilter;

    const visibleCount = state.activeLyricsFilter === 'all'
      ? state.lyrics.length
      : state.lyrics.filter((doc) => (doc.category || 'В работе') === state.activeLyricsFilter).length;
    const count = $('#lyrics-filter-count');
    if (count) count.textContent = lyricsCountLabel(visibleCount);

    select.onchange = () => {
      state.activeLyricsFilter = select.value;
      const activeDocument = state.lyrics.find((doc) => doc.id === state.activeLyricsId);
      if (activeDocument && state.activeLyricsFilter !== 'all' && (activeDocument.category || 'В работе') !== state.activeLyricsFilter) {
        state.activeLyricsId = null;
        $('#lyrics-editor').innerHTML = '<div class="empty-state"><span>TXT</span><h3>Выберите текст</h3><p>Или создайте новый документ.</p></div>';
      }
      renderLyricsList();
    };
  }

  function lyricsCountLabel(count) {
    const mod100 = count % 100;
    const mod10 = count % 10;
    const word = mod100 >= 11 && mod100 <= 14
      ? 'текстов'
      : mod10 === 1
        ? 'текст'
        : mod10 >= 2 && mod10 <= 4
          ? 'текста'
          : 'текстов';
    return `${count} ${word}`;
  }

  function openLyricsDrawer(id = null, initialProjectId = '') {
    const doc = state.lyrics.find((item) => item.id === id) || null;
    const selectedProjectId = doc?.project_id || initialProjectId;
    const projectOptions = ['<option value="">Не привязан к треку</option>', ...state.projects.map((project) => `<option value="${project.id}" ${selectedProjectId === project.id ? 'selected' : ''}>${escapeHTML(project.title)}</option>`)].join('');
    const selectedCategory = doc?.category || 'В работе';
    const categoryOptions = lyricsCategories().map((category) => `<option value="${escapeHTML(category)}" ${selectedCategory === category ? 'selected' : ''}>${escapeHTML(category)}</option>`).join('');
    openDrawer('TEXT / LYRICS', doc ? 'Редактирование текста' : 'Новый текст', `<form id="lyrics-drawer-form"><div class="form-grid two"><label class="field"><span>Название</span><input name="title" value="${escapeHTML(doc?.title || '')}" required></label><label class="field"><span>Статус</span><select name="document_status"><option value="draft" ${doc?.document_status === 'draft' ? 'selected' : ''}>Черновик</option><option value="ready" ${doc?.document_status === 'ready' ? 'selected' : ''}>Готов</option><option value="archived" ${doc?.document_status === 'archived' ? 'selected' : ''}>Архив</option></select></label></div><div class="form-grid two"><label class="field"><span>Трек</span><select name="project_id">${projectOptions}</select></label><label class="field"><span>Категория</span><select name="category">${categoryOptions}<option value="__custom__">+ Своя категория…</option></select></label></div><label class="field lyrics-custom-category" id="lyrics-drawer-custom-category" hidden><span>Название своей категории</span><input name="custom_category" maxlength="40" placeholder="Например: Второй альбом"></label><label class="field"><span>Текст</span><textarea class="lyrics-body lyrics-body-autogrow" name="body" placeholder="Начните писать…">${escapeHTML(doc?.body || '')}</textarea></label><div class="drawer-actions">${doc ? '<button class="button button-danger" id="delete-lyrics-drawer" type="button">Удалить</button>' : '<span></span>'}<button class="button button-primary" type="submit">Сохранить текст</button></div></form>`);
    const categorySelect = $('[name="category"]', $('#lyrics-drawer-form'));
    const customCategory = $('#lyrics-drawer-custom-category');
    categorySelect.addEventListener('change', () => {
      customCategory.hidden = categorySelect.value !== '__custom__';
      if (!customCategory.hidden) $('[name="custom_category"]', customCategory).focus();
    });
    $('#lyrics-drawer-form').addEventListener('submit', (event) => saveLyricsDrawer(event, doc));
    $('#delete-lyrics-drawer')?.addEventListener('click', () => deleteLyricsDrawer(doc));
    const autogrowBody = $('.lyrics-body-autogrow', $('#lyrics-drawer-form'));
    const resizeAutogrow = () => { autogrowBody.style.height = 'auto'; autogrowBody.style.height = `${autogrowBody.scrollHeight}px`; };
    autogrowBody.addEventListener('input', resizeAutogrow);
    resizeAutogrow();
  }

  async function saveLyricsDrawer(event, doc) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('button[type="submit"]', form);
    const data = new FormData(form);
    const category = data.get('category') === '__custom__' ? String(data.get('custom_category') || '').trim() : String(data.get('category') || 'В работе').trim();
    if (!category) return toast('Назовите свою категорию.', 'error');
    const payload = { artist_id: state.artist.id, project_id: data.get('project_id') || null, title: String(data.get('title') || '').trim(), body: String(data.get('body') || ''), document_status: data.get('document_status') || 'draft', category };
    setBusy(button, true, 'Сохраняем…');
    try {
      const query = doc ? db.from('lyrics_documents').update(payload).eq('id', doc.id).eq('artist_id', state.artist.id) : db.from('lyrics_documents').insert(payload);
      const { error } = await query; if (error) throw error;
      state.lyrics = await safeQuery(db.from('lyrics_documents').select('*').eq('artist_id', state.artist.id).order('updated_at', { ascending: false }));
      closeDrawer();
      toast('Текст сохранён.');
      if (state.activeProjectId) await renderTrackWorkspace(state.activeProjectId);
    } catch (error) { toast(error.message || 'Не удалось сохранить текст.', 'error'); }
    finally { setBusy(button, false); }
  }

  async function deleteLyricsDrawer(doc) {
    if (!doc || !confirm(`Удалить текст «${doc.title}»?`)) return;
    const { error } = await db.from('lyrics_documents').delete().eq('id', doc.id).eq('artist_id', state.artist.id);
    if (error) return toast(error.message, 'error');
    state.lyrics = state.lyrics.filter((item) => item.id !== doc.id);
    closeDrawer();
    toast('Текст удалён.');
    if (state.activeProjectId) await renderTrackWorkspace(state.activeProjectId);
  }

  const SOCIAL_PLATFORM_LABEL = { youtube: 'YouTube', instagram: 'Instagram', telegram: 'Telegram', vk: 'VK' };
  const SOCIAL_VIDEO_PLATFORMS = ['youtube', 'instagram', 'vk', 'telegram'];
  const SOCIAL_TEXT_PLATFORMS = ['vk', 'telegram'];
  const SOCIAL_TOKEN_PLATFORMS = ['telegram']; // connected by pasting a token; VK/YouTube/Instagram use OAuth
  const SOCIAL_MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // R2 staging — 2GB sanity cap
  const formatSize = (bytes) => bytes >= 1024 * 1024 * 1024 ? `${(bytes / 1024 / 1024 / 1024).toFixed(1)} ГБ` : `${(bytes / 1024 / 1024).toFixed(1)} МБ`;

  function socialRedirectUri() {
    return `${location.origin}/admin/`;
  }

  // PKCE для VK ID OAuth 2.1.
  function pkceRandom(len) {
    const arr = new Uint8Array(len);
    crypto.getRandomValues(arr);
    return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, len);
  }
  async function pkceChallenge(verifier) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function startSocialConnect(platform) {
    const redirectUri = socialRedirectUri();
    if (platform === 'vk') {
      if (!window.VK_APP_ID) return toast('VK_APP_ID не настроен в scripts/config.js.', 'error');
      // groups.get недоступен бизнес-профилям, поэтому ID сообщества спрашиваем заранее.
      const groupId = (prompt('ID сообщества VK (число, без «club»):', '') || '').trim();
      if (!groupId) return;
      const verifier = pkceRandom(64);
      // localStorage, а не sessionStorage: переживает возврат из VK в любом сценарии.
      localStorage.setItem('vk_group_id', groupId);
      localStorage.setItem('vk_code_verifier', verifier);
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: window.VK_APP_ID,
        redirect_uri: redirectUri,
        scope: 'video wall photos docs groups',
        state: 'vk',
        code_challenge: await pkceChallenge(verifier),
        code_challenge_method: 'S256',
      });
      location.href = `https://id.vk.com/authorize?${params.toString()}`;
      return;
    }
    if (platform === 'youtube') {
      if (!window.GOOGLE_CLIENT_ID) return toast('GOOGLE_CLIENT_ID не настроен в scripts/config.js.', 'error');
      const params = new URLSearchParams({
        client_id: window.GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        access_type: 'offline',
        prompt: 'consent',
        scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
        state: 'youtube',
      });
      location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
      return;
    }
    if (!window.META_APP_ID) return toast('META_APP_ID не настроен в scripts/config.js.', 'error');
    const params = new URLSearchParams({
      client_id: window.META_APP_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,business_management',
      state: 'instagram',
      auth_type: 'rerequest',
    });
    location.href = `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
  }

  async function completeSocialConnect(platform, code, extra = {}) {
    const label = SOCIAL_PLATFORM_LABEL[platform] || platform;
    const { data, error } = await db.functions.invoke('social-connect', {
      body: { action: 'exchange', platform, code, redirect_uri: socialRedirectUri(), ...extra },
    });
    if (error || data?.error) {
      const detail = await edgeErrorDetail(error, data);
      toast(`Не удалось подключить ${label}: ${socialErrorHint(platform, detail)}`, 'error');
      return;
    }
    toast(`${label} подключён: ${data.account_name || ''}`);
  }

  async function disconnectSocial(platform) {
    const label = SOCIAL_PLATFORM_LABEL[platform] || platform;
    if (!confirm(`Отключить ${label}?`)) return;
    const { data, error } = await db.functions.invoke('social-connect', { body: { action: 'disconnect', platform } });
    if (error || data?.error) return toast(`Не удалось отключить ${label}.`, 'error');
    toast(`${label} отключён.`);
    renderAutopost();
  }

  async function renderAutopost() {
    const container = $('#autopost-panel');
    container.innerHTML = '<p class="track-workspace-empty">Загружаем…</p>';
    try {
    // The connection-status call must never break the whole page: if the edge
    // function is unavailable, we still render the cards as "not connected".
    const [statusResult, posts, targets] = await Promise.all([
      db.functions.invoke('social-connect', { body: { action: 'status' } }).catch((error) => ({ error })),
      safeQuery(db.from('social_posts').select('*').eq('artist_id', state.artist.id).order('created_at', { ascending: false })),
      safeQuery(db.from('social_post_targets').select('*').eq('artist_id', state.artist.id)),
    ]);
    if (statusResult?.error || statusResult?.data?.error) {
      console.warn('social-connect status unavailable', statusResult.error || statusResult.data?.error);
    }
    const connections = statusResult?.data?.connections || {};

    const platformMark = { youtube: 'YT', instagram: 'IG', telegram: 'TG', vk: 'VK' };
    const connCard = (platform) => {
      const label = SOCIAL_PLATFORM_LABEL[platform];
      const info = connections[platform] || { connected: false };
      const helpToggle = platform === 'instagram'
        ? '<button type="button" class="autopost-help-toggle" data-ig-help aria-expanded="false">помощь <span aria-hidden="true">?</span></button>'
        : (platform === 'vk' && info.connected
          ? `<button type="button" class="autopost-help-toggle ${info.has_community_token ? '' : 'is-required'}" data-vk-community title="Нужен для записей на стене: токен VK ID их публиковать не может">${info.has_community_token ? 'токен сообщества ✓' : '⚠ нужен токен сообщества'}</button>`
          : '');
      return `<div class="autopost-conn autopost-conn-${platform} ${info.connected ? 'is-connected' : ''}">
        <span class="autopost-conn-mark">${platformMark[platform]}</span>
        <div class="autopost-conn-body"><div class="autopost-conn-head"><span class="eyebrow">${label}</span>${helpToggle}</div><strong><span class="autopost-conn-dot"></span>${info.connected ? escapeHTML(info.account_name || 'Подключено') : 'Не подключено'}</strong></div>
        <button class="button ${info.connected ? 'button-danger' : 'button-primary'} autopost-conn-btn" type="button" data-social-${info.connected ? 'disconnect' : 'connect'}="${platform}">${info.connected ? 'Отключить' : 'Подключить'}</button>
      </div>`;
    };
    const videoConnectionCards = SOCIAL_VIDEO_PLATFORMS.map(connCard).join('');
    const textConnectionCards = SOCIAL_TEXT_PLATFORMS.map(connCard).join('');

    const pill = (platform) => {
      const info = connections[platform] || { connected: false };
      return `<label class="autopost-pill ${info.connected ? '' : 'is-disabled'}"${info.connected ? '' : ' title="Подключите площадку выше"'}><input type="checkbox" name="platforms" value="${platform}" ${info.connected ? '' : 'disabled'}><span>${SOCIAL_PLATFORM_LABEL[platform]}</span></label>`;
    };
    const videoPills = SOCIAL_VIDEO_PLATFORMS.map(pill).join('');
    const textPills = SOCIAL_TEXT_PLATFORMS.map(pill).join('');

    const historyRows = (posts || []).map((post) => {
      const postTargets = (targets || []).filter((target) => target.post_id === post.id);
      const targetBadges = postTargets.map((target) => {
        const label = SOCIAL_PLATFORM_LABEL[target.platform] || target.platform;
        if (target.status === 'success') return `<a class="autopost-target-badge is-success" href="${escapeHTML(target.external_post_url || '#')}" target="_blank" rel="noopener">${label}: опубликовано</a>`;
        if (target.status === 'failed') return `<span class="autopost-target-badge is-failed" title="${escapeHTML(target.error_message || '')}">${label}: ошибка</span>`;
        return `<span class="autopost-target-badge">${label}: ${escapeHTML(target.status)}</span>`;
      }).join('');
      const canRetry = post.storage_path && postTargets.some((target) => target.status === 'failed');
      return `<article class="autopost-history-row">
        <div><strong>${escapeHTML(post.title || 'Без названия')}</strong><small>${formatDate(post.created_at)}</small></div>
        <div class="autopost-target-badges">${targetBadges || '<span class="autopost-target-badge">нет площадок</span>'}</div>
        ${canRetry ? `<button class="text-button" data-retry-post="${post.id}" type="button">Повторить</button>` : ''}
      </article>`;
    }).join('') || '<p class="track-workspace-empty">Публикаций пока нет.</p>';

    container.innerHTML = `
      <div class="autopost-connections" data-mode="video">${videoConnectionCards}</div>
      <div class="autopost-connections" data-mode="text" hidden>${textConnectionCards}</div>
      <div class="autopost-help" id="ig-help" hidden>
        <ol class="autopost-help-steps">
          <li><strong>Нужен аккаунт Facebook.</strong> Именно с личного профиля Facebook создаётся Страница и выполняется вход при подключении. Нет аккаунта — сначала зарегистрируйтесь на facebook.com.</li>
          <li><strong>Сделайте Instagram бизнес-аккаунтом.</strong> В приложении Instagram: профиль → ☰ → «Настройки и конфиденциальность» → раздел «Для профессионалов» → «Тип аккаунта и инструменты» → выберите <strong>«Бизнес»</strong> (не «Автор»).</li>
          <li><strong>Создайте страницу Facebook и привяжите к ней Instagram.</strong> На facebook.com: Меню → «Страницы» → «Создать». Затем откройте <strong>Meta Business Suite</strong> → Настройки → «Аккаунты Instagram» → подключите свою инсту и свяжите со страницей.</li>
          <li><strong>Нажмите «Подключить».</strong> Войдите в Facebook и на экране согласия <strong>обязательно отметьте свою Страницу и Instagram</strong> — не снимайте разрешения.</li>
        </ol>
      </div>
      <section class="panel autopost-composer">
        <header class="panel-header">
          <div><span class="eyebrow">Новая публикация</span><h3 id="autopost-composer-title">Загрузить видео</h3></div>
        </header>
        <form id="autopost-form" class="autopost-form" data-mode="video">
          <label class="autopost-dropzone" id="autopost-dropzone">
            <video class="autopost-dropzone-video" id="autopost-dropzone-video" muted playsinline hidden></video>
            <span class="autopost-dropzone-empty" id="autopost-dropzone-empty"><span class="autopost-dropzone-icon">↥</span><strong>Перетащите видео сюда</strong><small>или нажмите, чтобы выбрать файл</small></span>
            <span class="autopost-orient-tag" id="autopost-orient-tag" hidden></span>
            <span class="autopost-file-badge" id="autopost-file-badge" hidden></span>
            <input type="file" name="video" accept="video/*" hidden required>
          </label>
          <div class="shorts-bar" id="shorts-bar" hidden>
            <button type="button" class="button shorts-open-btn" id="shorts-open">✂ Обрезать / сделать вертикальным</button>
            <span class="shorts-hint" id="shorts-hint" hidden>Видео горизонтальное — для Reels/Shorts сделайте его вертикальным</span>
          </div>
          <div class="shorts-editor" id="shorts-editor" hidden>
            <div class="shorts-preview"><canvas id="shorts-canvas" width="270" height="480"></canvas></div>
            <div class="shorts-controls">
              <label class="shorts-range"><span>Начало отрезка</span><input type="range" id="shorts-start" min="0" max="100" step="0.05" value="0"></label>
              <label class="shorts-range"><span>Конец отрезка</span><input type="range" id="shorts-end" min="0" max="100" step="0.05" value="100"></label>
              <div class="shorts-meta"><span id="shorts-range-label">0:00 – 0:00</span><span class="shorts-warn" id="shorts-warn" hidden>&gt; 60 сек — для Shorts длинновато</span></div>
              <div class="shorts-editor-actions">
                <button type="button" class="button" id="shorts-cancel">Отмена</button>
                <button type="button" class="button button-primary" id="shorts-render">Готово</button>
              </div>
              <div class="shorts-progress" id="shorts-progress" hidden><span class="shorts-progress-bar"><span id="shorts-progress-fill"></span></span><span id="shorts-progress-pct">Рендер… 0%</span></div>
            </div>
          </div>
          <label class="field"><span>Название</span><input type="text" name="title" maxlength="120" placeholder="Название публикации" required></label>
          <label class="field"><span>Подпись / описание</span><textarea name="caption" rows="3" placeholder="Текст под видео…"></textarea></label>
          <label class="autopost-clip-toggle" id="autopost-clip-toggle" hidden><input type="checkbox" name="vk_clip"><span>В VK попробовать опубликовать как <strong>Клип</strong> — если API откажет, уйдёт обычным видео</span></label>
          <div class="autopost-publish-row"><div class="autopost-platform-checks">${videoPills}</div><button class="button button-primary autopost-publish-btn" type="submit">Опубликовать</button></div>
        </form>
        <form id="autopost-text-form" class="autopost-form" data-mode="text" hidden>
          <label class="field"><span>Текст поста</span><textarea name="body" rows="6" placeholder="Текст поста для VK и Telegram…" required></textarea></label>
          <div class="autopost-attach">
            <div class="autopost-attach-head"><span>Картинки</span><label class="text-button autopost-attach-add">+ Добавить<input type="file" accept="image/*" multiple hidden data-attach="image"></label></div>
            <div class="autopost-attach-list" id="autopost-image-list"></div>
          </div>
          <div class="autopost-attach">
            <div class="autopost-attach-head"><span>Аудио</span><label class="text-button autopost-attach-add">+ Добавить<input type="file" accept="audio/*" multiple hidden data-attach="audio"></label></div>
            <div class="autopost-attach-list" id="autopost-audio-list"></div>
            <small class="autopost-attach-note">В VK аудио отправится как файл-документ (ограничение API VK).</small>
          </div>
          <div class="autopost-publish-row"><div class="autopost-platform-checks">${textPills}</div><button class="button button-primary autopost-publish-btn" type="submit">Опубликовать</button></div>
        </form>
      </section>
      <section class="panel autopost-history">
        <header class="panel-header"><div><span class="eyebrow">История</span><h3>Публикации</h3></div></header>
        <div class="autopost-history-list">${historyRows}</div>
      </section>`;

    // Mode toggle lives in the workspace header, next to the "Автопостинг" title.
    const viewActions = $('#view-actions');
    viewActions.innerHTML = '<div class="autopost-mode-toggle" role="group" aria-label="Тип публикации"><button type="button" class="is-active" data-autopost-mode="video">Видео</button><button type="button" data-autopost-mode="text">Текст</button></div>';
    const modeEls = $$('[data-mode]', container);
    const composerTitle = $('#autopost-composer-title', container);
    $$('[data-autopost-mode]', viewActions).forEach((btn) => btn.addEventListener('click', () => {
      const mode = btn.dataset.autopostMode;
      $$('[data-autopost-mode]', viewActions).forEach((b) => b.classList.toggle('is-active', b === btn));
      modeEls.forEach((el) => { el.hidden = el.dataset.mode !== mode; });
      composerTitle.textContent = mode === 'text' ? 'Написать пост' : 'Загрузить видео';
    }));
    bindTextComposer(container);

    const form = $('#autopost-form', container);
    const dropzone = $('#autopost-dropzone', container);
    const fileInput = $('input[name="video"]', form);
    const dzVideo = $('#autopost-dropzone-video', container);
    const dzEmpty = $('#autopost-dropzone-empty', container);
    const fileBadge = $('#autopost-file-badge', container);
    const orientTag = $('#autopost-orient-tag', container);
    let previewUrl = '';
    const showFirstFrame = (video) => video.addEventListener('loadeddata', () => { try { video.currentTime = 0.1; } catch (e) { /* seek unsupported */ } }, { once: true });
    const formatClip = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      dropzone.classList.remove('is-vertical', 'is-horizontal');
      orientTag.hidden = true;
      if (file) {
        previewUrl = URL.createObjectURL(file);
        dzVideo.src = previewUrl; dzVideo.hidden = false; dzEmpty.hidden = true; dropzone.classList.add('has-file');
        showFirstFrame(dzVideo);
        if (shortsBar) shortsBar.hidden = !canMakeShort;
        if (shortsEditor) shortsEditor.hidden = true;
        const tooBig = file.size > SOCIAL_MAX_UPLOAD_BYTES;
        fileBadge.hidden = false;
        fileBadge.classList.toggle('is-too-big', tooBig);
        fileBadge.textContent = `${formatSize(file.size)}${tooBig ? ' — больше лимита 2 ГБ' : ' · готово к публикации'}`;
        if (tooBig) toast('Видео больше 2 ГБ — слишком большое.', 'error');
        dzVideo.addEventListener('loadedmetadata', () => {
          const w = dzVideo.videoWidth, h = dzVideo.videoHeight, dur = dzVideo.duration || 0;
          if (!w || !h) return;
          const vertical = h > w;
          const isShort = vertical && dur > 0 && dur <= 180;
          const orient = h > w ? 'Вертикальное' : (w > h ? 'Горизонтальное' : 'Квадратное');
          const kind = isShort ? 'Shorts' : 'Обычное видео';
          orientTag.hidden = false;
          orientTag.classList.toggle('is-horizontal', !vertical);
          orientTag.textContent = `${orient} · ${kind}${dur ? ` · ${formatClip(dur)}` : ''}`;
          dropzone.classList.toggle('is-vertical', vertical);
          dropzone.classList.toggle('is-horizontal', !vertical);
          if (shortsHint) shortsHint.hidden = vertical;
          // Клипы VK — формат вертикальных роликов, поэтому предлагаем их по умолчанию.
          const clipToggle = $('#autopost-clip-toggle', container);
          if (clipToggle) {
            clipToggle.hidden = false;
            $('input', clipToggle).checked = vertical;
          }
        }, { once: true });
      } else {
        previewUrl = ''; dzVideo.hidden = true; dzVideo.removeAttribute('src'); dzEmpty.hidden = false; dropzone.classList.remove('has-file');
        fileBadge.hidden = true;
        if (shortsBar) shortsBar.hidden = true;
        if (shortsEditor) shortsEditor.hidden = true;
      }
    });
    ['dragover', 'dragenter'].forEach((ev) => dropzone.addEventListener(ev, (event) => { event.preventDefault(); dropzone.classList.add('is-dragover'); }));
    ['dragleave', 'drop'].forEach((ev) => dropzone.addEventListener(ev, (event) => { event.preventDefault(); dropzone.classList.remove('is-dragover'); }));
    dropzone.addEventListener('drop', (event) => {
      const file = event.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('video/')) { fileInput.files = event.dataTransfer.files; fileInput.dispatchEvent(new Event('change')); }
    });

    // --- Shorts-редактор: вертикаль + блюр-фон + обрезка ---
    const canMakeShort = !!pickMp4Mime();
    const shortsBar = $('#shorts-bar', container);
    const shortsHint = $('#shorts-hint', container);
    const shortsOpen = $('#shorts-open', container);
    const shortsEditor = $('#shorts-editor', container);
    const shortsCanvas = $('#shorts-canvas', container);
    const shortsStart = $('#shorts-start', container);
    const shortsEnd = $('#shorts-end', container);
    const shortsRangeLabel = $('#shorts-range-label', container);
    const shortsWarn = $('#shorts-warn', container);
    const shortsCancel = $('#shorts-cancel', container);
    const shortsRenderBtn = $('#shorts-render', container);
    const shortsProgress = $('#shorts-progress', container);
    const shortsProgressFill = $('#shorts-progress-fill', container);
    const shortsProgressPct = $('#shorts-progress-pct', container);

    if (shortsCanvas) {
      const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      const drawPreview = () => {
        const vw = dzVideo.videoWidth, vh = dzVideo.videoHeight;
        if (!vw || !vh) return;
        const ctx = shortsCanvas.getContext('2d');
        const W = shortsCanvas.width, H = shortsCanvas.height;
        ctx.filter = 'blur(10px) brightness(0.55)';
        const bg = Math.max(W / vw, H / vh) * 1.15;
        ctx.drawImage(dzVideo, (W - vw * bg) / 2, (H - vh * bg) / 2, vw * bg, vh * bg);
        ctx.filter = 'none';
        const fg = Math.min(W / vw, H / vh);
        ctx.drawImage(dzVideo, (W - vw * fg) / 2, (H - vh * fg) / 2, vw * fg, vh * fg);
      };
      const bounds = () => {
        const a = Math.min(Number(shortsStart.value), Number(shortsEnd.value));
        const b = Math.max(Number(shortsStart.value), Number(shortsEnd.value));
        return [a, b];
      };
      const updateMeta = () => {
        const [a, b] = bounds();
        shortsRangeLabel.textContent = `${fmtT(a)} – ${fmtT(b)}  ·  ${Math.round(b - a)} сек`;
        shortsWarn.hidden = (b - a) <= 60;
      };
      const seek = (t) => { try { dzVideo.currentTime = t; } catch { /* ignore */ } };
      dzVideo.addEventListener('seeked', () => { if (!shortsEditor.hidden) drawPreview(); });
      shortsStart.addEventListener('input', () => { updateMeta(); seek(Number(shortsStart.value)); });
      shortsEnd.addEventListener('input', () => { updateMeta(); seek(Number(shortsEnd.value)); });

      shortsOpen.addEventListener('click', () => {
        const dur = dzVideo.duration || 0;
        if (!dur) return toast('Видео ещё грузится, повторите через секунду.', 'error');
        shortsStart.max = shortsEnd.max = String(dur);
        shortsStart.value = '0';
        shortsEnd.value = String(Math.min(dur, 60));
        updateMeta();
        shortsEditor.hidden = false;
        seek(0);
      });
      shortsCancel.addEventListener('click', () => { shortsEditor.hidden = true; });

      shortsRenderBtn.addEventListener('click', async () => {
        const [a, b] = bounds();
        if (b - a < 1) return toast('Слишком короткий отрезок.', 'error');
        const srcFile = fileInput.files && fileInput.files[0];
        if (!srcFile) return;
        shortsRenderBtn.disabled = true; shortsCancel.disabled = true; shortsProgress.hidden = false;
        try {
          const short = await renderShort(srcFile, a, b, (p) => {
            const pct = Math.round(p * 100);
            shortsProgressFill.style.width = `${pct}%`;
            shortsProgressPct.textContent = `Рендер… ${pct}%`;
          });
          const dt = new DataTransfer();
          dt.items.add(short);
          fileInput.files = dt.files;
          fileInput.dispatchEvent(new Event('change'));
          shortsEditor.hidden = true;
          toast('Вертикальный ролик готов — можно публиковать.');
        } catch (e) {
          toast(`Не удалось собрать ролик: ${e && e.message ? e.message : e}`, 'error');
        } finally {
          shortsRenderBtn.disabled = false; shortsCancel.disabled = false;
          shortsProgress.hidden = true; shortsProgressFill.style.width = '0%';
        }
      });
    }

    $$('[data-social-connect]', container).forEach((button) => button.addEventListener('click', () => {
      const platform = button.dataset.socialConnect;
      if (SOCIAL_TOKEN_PLATFORMS.includes(platform)) openTokenConnectDrawer(platform);
      else startSocialConnect(platform);
    }));
    $$('[data-social-disconnect]', container).forEach((button) => button.addEventListener('click', () => disconnectSocial(button.dataset.socialDisconnect)));
    const vkCommunityBtn = $('[data-vk-community]', container);
    if (vkCommunityBtn) vkCommunityBtn.addEventListener('click', openVkCommunityTokenDrawer);
    const igHelpBtn = $('[data-ig-help]', container);
    const igHelp = $('#ig-help', container);
    if (igHelpBtn && igHelp) igHelpBtn.addEventListener('click', () => {
      igHelp.hidden = !igHelp.hidden;
      igHelpBtn.setAttribute('aria-expanded', String(!igHelp.hidden));
      if (!igHelp.hidden) igHelp.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    $$('[data-retry-post]', container).forEach((button) => button.addEventListener('click', () => retrySocialPost(button.dataset.retryPost)));
    form.addEventListener('submit', uploadSocialPost);
    } catch (error) {
      console.error('renderAutopost failed', error);
      container.innerHTML = '<p class="track-workspace-empty">Не удалось загрузить автопостинг. <button class="text-button" id="autopost-retry" type="button">Повторить</button></p>';
      $('#autopost-retry')?.addEventListener('click', renderAutopost);
    }
  }

  async function uploadSocialPost(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('button[type="submit"]', form);
    const data = new FormData(form);
    const file = data.get('video');
    const platforms = data.getAll('platforms');
    if (!(file instanceof File) || !file.size) return toast('Выберите видеофайл.', 'error');
    if (file.size > SOCIAL_MAX_UPLOAD_BYTES) return toast(`Видео ${formatSize(file.size)} — превышает лимит 2 ГБ.`, 'error');
    if (!platforms.length) return toast('Выберите хотя бы одну площадку.', 'error');

    setBusy(button, true, 'Загружаем видео…');
    showBusy('Загружаем видео в хранилище…', 'Не закрывайте вкладку');
    try {
      // 1. Ask the server for a short-lived direct-upload URL to R2 (bypasses the 50MB Supabase cap).
      const { data: urlData, error: urlError } = await db.functions.invoke('social-storage', { body: { action: 'upload_url', content_type: file.type || 'video/mp4' } });
      if (urlError || urlData?.error) throw new Error(urlData?.detail || urlData?.error || urlError?.message || 'Не удалось подготовить загрузку.');
      const { upload_url: uploadUrl, key } = urlData;

      // 2. Upload the file straight to R2 — no size limit, no proxy through our server.
      const putResponse = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'video/mp4' } });
      if (!putResponse.ok) throw new Error(`Не удалось загрузить видео (${putResponse.status}).`);

      // 3. Record the post (bucket_id "r2" tells social-publish where to read/delete from).
      const { data: post, error: insertError } = await db.from('social_posts').insert({
        artist_id: state.artist.id,
        title: String(data.get('title') || '').trim(),
        caption: String(data.get('caption') || ''),
        bucket_id: 'r2',
        storage_path: key,
        original_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      }).select().single();
      if (insertError) throw insertError;

      form.reset();
      await publishSocialPost(post.id, platforms, { vk_clip: data.get('vk_clip') === 'on' });
    } catch (error) {
      toast(error.message || 'Не удалось загрузить видео.', 'error');
    } finally {
      setBusy(button, false);
      hideBusy();
    }
  }

  async function retrySocialPost(postId) {
    const posts = await safeQuery(db.from('social_posts').select('*').eq('id', postId).limit(1));
    if (!posts[0]) return;
    const targets = await safeQuery(db.from('social_post_targets').select('*').eq('post_id', postId));
    const failedPlatforms = targets.filter((target) => target.status === 'failed').map((target) => target.platform);
    if (!failedPlatforms.length) return;
    await publishSocialPost(postId, failedPlatforms);
  }

  async function publishSocialPost(postId, platforms, options = {}) {
    const labels = platforms.map((platform) => SOCIAL_PLATFORM_LABEL[platform] || platform).join(', ');
    showBusy(`Публикуем на площадках…`, labels ? `${labels} · это может занять минуту` : 'Это может занять минуту');
    try {
      const { data, error } = await db.functions.invoke('social-publish', { body: { post_id: postId, platforms, ...options } });
      if (error || data?.error) {
        toast(`Ошибка публикации: ${data?.detail || data?.error || error?.message || ''}`, 'error');
      } else {
        const failed = (data?.targets || []).filter((target) => target.status === 'failed');
        // Показываем причину сразу: без неё приходится лезть в базу за error_message.
        if (failed.length) toast(`Не опубликовано — ${failed.map((target) => `${SOCIAL_PLATFORM_LABEL[target.platform] || target.platform}: ${socialErrorHint(target.platform, target.error_message || 'без деталей')}`).join('; ')}`, 'error');
        else toast('Опубликовано ✓');
      }
    } finally {
      hideBusy();
    }
    renderAutopost();
  }

  function bindTextComposer(container) {
    const form = $('#autopost-text-form', container);
    if (!form) return;
    const attachments = { image: [], audio: [] };
    const lists = { image: $('#autopost-image-list', container), audio: $('#autopost-audio-list', container) };
    const renderList = (kind) => {
      lists[kind].innerHTML = attachments[kind].map((file, index) => `<div class="autopost-attach-item"><span>${escapeHTML(file.name)}</span><small>${formatSize(file.size)}</small><button type="button" class="autopost-attach-remove" data-attach-remove="${kind}:${index}" aria-label="Убрать">×</button></div>`).join('');
    };
    $$('input[data-attach]', form).forEach((input) => input.addEventListener('change', () => {
      const kind = input.dataset.attach;
      for (const file of input.files) attachments[kind].push(file);
      input.value = '';
      renderList(kind);
    }));
    form.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-attach-remove]');
      if (!remove) return;
      const [kind, index] = remove.dataset.attachRemove.split(':');
      attachments[kind].splice(Number(index), 1);
      renderList(kind);
    });
    form.addEventListener('submit', (event) => publishTextPost(event, attachments));
  }

  async function publishTextPost(event, attachments) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('button[type="submit"]', form);
    const body = $('textarea[name="body"]', form).value.trim();
    const platforms = $$('input[name="platforms"]:checked', form).map((el) => el.value);
    const files = [...attachments.image.map((file) => ({ file, type: 'image' })), ...attachments.audio.map((file) => ({ file, type: 'audio' }))];
    if (!body && !files.length) return toast('Введите текст или прикрепите файл.', 'error');
    if (!platforms.length) return toast('Выберите хотя бы одну площадку.', 'error');

    setBusy(button, true, 'Публикуем…');
    showBusy(files.length ? 'Загружаем вложения…' : 'Публикуем…', 'Не закрывайте вкладку');
    try {
      const uploaded = [];
      for (const { file, type } of files) {
        const { data: urlData, error: urlError } = await db.functions.invoke('social-storage', { body: { action: 'upload_url', content_type: file.type || 'application/octet-stream' } });
        if (urlError || urlData?.error) throw new Error(urlData?.detail || urlData?.error || 'Не удалось подготовить загрузку.');
        const put = await fetch(urlData.upload_url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
        if (!put.ok) throw new Error(`Не удалось загрузить вложение (${put.status}).`);
        uploaded.push({ type, key: urlData.key, mime: file.type, name: file.name });
      }
      const { data: post, error: insertError } = await db.from('social_posts').insert({
        artist_id: state.artist.id,
        post_type: 'text',
        title: body.slice(0, 80) || 'Текстовый пост',
        body,
        bucket_id: 'r2',
        attachments: uploaded,
      }).select().single();
      if (insertError) throw insertError;
      form.reset();
      await publishSocialPost(post.id, platforms);
    } catch (error) {
      toast(error.message || 'Не удалось опубликовать.', 'error');
    } finally {
      setBusy(button, false);
      hideBusy();
    }
  }

  function openVkCommunityTokenDrawer() {
    openDrawer('VK / ТОКЕН', 'Токен сообщества', `<form id="vk-community-form">
      <p class="drawer-note">У VK два ключа на разные задачи. Кнопка «Подключить» (уже нажата) отвечает только за <strong>загрузку видеофайла</strong> — обычного или вертикального шортса; он попадает в раздел «Видео» сообщества.<br><br>
      Этот токен отвечает за <strong>ленту сообщества</strong>: текстовые посты, картинки и саму запись с видео, которую видят подписчики.<br><br>
      Без него видео просто лежит в разделе «Видео», в ленте его нет, а текстовые посты не отправляются. Вставить нужно один раз.</p>
      <ol class="autopost-help-steps">
        <li>Откройте своё сообщество VK → <strong>Управление</strong>.</li>
        <li><strong>Настройки → Работа с API → Ключи доступа</strong> → «Создать ключ».</li>
        <li>Отметьте права: <strong>Управление, Стена, Фотографии, Документы</strong>.</li>
        <li>Скопируйте ключ (начинается на <code>vk1.a.</code>) и вставьте ниже.</li>
      </ol>
      <label class="field"><span>Токен сообщества VK</span><input name="token" placeholder="vk1.a...." required></label>
      <div class="drawer-actions"><span></span><button class="button button-primary" type="submit">Сохранить</button></div>
    </form>`);
    $('#vk-community-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = $('button[type="submit"]', event.currentTarget);
      const token = $('[name="token"]', event.currentTarget).value.trim();
      if (!token) return;
      setBusy(button, true, 'Сохраняем…');
      const { data, error } = await db.functions.invoke('social-connect', { body: { action: 'connect_vk_community', token } });
      setBusy(button, false);
      if (error || data?.error) {
        const detail = await edgeErrorDetail(error, data);
        return toast(`Не удалось сохранить токен: ${socialErrorHint('vk', detail)}`, 'error');
      }
      closeDrawer();
      toast('Токен сообщества сохранён — записи на стену пойдут через него.');
      renderAutopost();
    });
  }

  function openTokenConnectDrawer(platform) {
    const label = SOCIAL_PLATFORM_LABEL[platform];
    const fields = platform === 'telegram'
      ? `<label class="field"><span>Токен бота</span><input name="token" placeholder="123456:ABC-DEF..." required></label>
         <label class="field"><span>Канал</span><input name="target" placeholder="@mychannel или -100123..." required><small>Создайте бота через @BotFather и добавьте его администратором канала.</small></label>`
      : `<label class="field"><span>Токен сообщества VK</span><input name="token" placeholder="vk1.a...." required></label>
         <label class="field"><span>ID группы</span><input name="target" placeholder="123456789" required><small>Число без «club». Токен: настройки сообщества → Работа с API → создать ключ с правами «Управление», «Стена», «Документы».</small></label>`;
    openDrawer(`${platform.toUpperCase()} / CONNECT`, `Подключить ${label}`, `<form id="token-connect-form">${fields}<div class="drawer-actions"><span></span><button class="button button-primary" type="submit">Подключить</button></div></form>`);
    $('#token-connect-form').addEventListener('submit', (event) => submitTokenConnect(event, platform));
  }

  async function edgeErrorDetail(error, data) {
    if (data?.detail || data?.error) return data.detail || data.error;
    const context = error?.context;
    if (context && typeof context.clone === 'function') {
      try {
        const body = await context.clone().json();
        if (body?.detail || body?.error) return body.detail || body.error;
      } catch { /* тело не JSON — используем сообщение ниже */ }
    }
    return error?.message || 'unknown_error';
  }

  // Понятная подсказка для артиста + сохранённый технический текст (нужен для диагностики).
  function socialErrorHint(platform, detail) {
    const hint = socialErrorHintText(platform, detail);
    return hint === detail ? detail : `${hint} [${detail}]`;
  }

  function socialErrorHintText(platform, detail) {
    const d = String(detail || '').toLowerCase();
    if (platform === 'instagram') {
      if (d.includes('business=no')) return 'Instagram не в режиме Business. Профиль → Настройки → Тип аккаунта → «Бизнес» (не «Автор»), затем подключите заново.';
      if (d.includes('0 страниц') || d.includes('me/accounts')) return 'Приложение не получило доступ к вашей Странице Facebook. Нажмите «Подключить» ещё раз и на экране Facebook отметьте свою Страницу и Instagram.';
      if (d.includes('no_instagram_business_account')) return 'Ваш Instagram (Business) должен быть привязан к странице Facebook — см. «Как подключить Instagram?» ниже.';
      if (d.includes('not_configured') || d.includes('meta_app')) return 'Instagram ещё не настроен на стороне сервиса — сообщите куратору.';
    }
    if (platform === 'telegram') {
      if (d.includes('chat not found')) return 'Канал не найден. Укажите @username канала и добавьте бота администратором канала.';
      if (d.includes('unauthorized') || d.includes('401')) return 'Неверный токен бота. Проверьте токен из @BotFather.';
    }
    if (platform === 'vk') {
      if (d.includes('invalid access_token') || d.includes('authorization failed')) return 'Неверный токен сообщества VK. Ключ создаётся в: Управление → Настройки → Работа с API.';
      if (d.includes('access denied') || d.includes('group_id')) return 'Проверьте ID группы (число) и права токена (Управление, Стена).';
    }
    if (platform === 'youtube' && d.includes('refresh_token')) return 'Переподключите YouTube, разрешив доступ на экране согласия Google.';
    return detail;
  }

  // Есть ли в браузере запись в MP4 (Chrome/Safari — да, Firefox — нет).
  function pickMp4Mime() {
    if (typeof MediaRecorder === 'undefined') return null;
    const cands = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=h264,aac', 'video/mp4'];
    for (const m of cands) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* ignore */ } }
    return null;
  }

  // Собирает вертикальный ролик 1080x1920 (блюр-фон + оригинал по центру) из отрезка [startSec, endSec].
  async function renderShort(sourceFile, startSec, endSec, onProgress) {
    const OUT_W = 1080, OUT_H = 1920, FPS = 30;
    const mime = pickMp4Mime() || 'video/webm';
    const url = URL.createObjectURL(sourceFile);
    const v = document.createElement('video');
    v.src = url; v.playsInline = true; v.preload = 'auto';
    v.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0;';
    document.body.appendChild(v);
    const cleanup = (actx) => { try { if (actx) actx.close(); } catch { /* ignore */ } try { v.pause(); } catch { /* ignore */ } v.remove(); URL.revokeObjectURL(url); };

    try {
      await new Promise((res, rej) => { v.onloadedmetadata = () => res(); v.onerror = () => rej(new Error('не удалось прочитать видео')); });

      const canvas = document.createElement('canvas');
      canvas.width = OUT_W; canvas.height = OUT_H;
      const ctx = canvas.getContext('2d');

      const AC = window.AudioContext || window.webkitAudioContext;
      const actx = new AC();
      let audioTrack = null;
      try {
        const dest = actx.createMediaStreamDestination();
        actx.createMediaElementSource(v).connect(dest);
        audioTrack = dest.stream.getAudioTracks()[0] || null;
      } catch { /* видео без звука — ок */ }

      const stream = canvas.captureStream(FPS);
      if (audioTrack) stream.addTrack(audioTrack);
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8000000 });
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

      const draw = () => {
        const vw = v.videoWidth, vh = v.videoHeight;
        if (!vw || !vh) return;
        ctx.filter = 'blur(28px) brightness(0.55)';
        const bg = Math.max(OUT_W / vw, OUT_H / vh) * 1.15;
        ctx.drawImage(v, (OUT_W - vw * bg) / 2, (OUT_H - vh * bg) / 2, vw * bg, vh * bg);
        ctx.filter = 'none';
        const fg = Math.min(OUT_W / vw, OUT_H / vh);
        ctx.drawImage(v, (OUT_W - vw * fg) / 2, (OUT_H - vh * fg) / 2, vw * fg, vh * fg);
      };

      await new Promise((resolve, reject) => {
        let raf = 0;
        const tick = () => {
          if (v.currentTime >= endSec || v.ended) {
            cancelAnimationFrame(raf);
            if (recorder.state !== 'inactive') recorder.stop();
            return;
          }
          draw();
          if (onProgress) onProgress(Math.min(1, (v.currentTime - startSec) / Math.max(0.1, endSec - startSec)));
          raf = requestAnimationFrame(tick);
        };
        recorder.onstop = () => resolve();
        recorder.onerror = (e) => reject(e.error || new Error('ошибка записи'));
        const run = () => { draw(); recorder.start(200); v.play().then(() => { raf = requestAnimationFrame(tick); }).catch(reject); };
        const onSeeked = () => { v.removeEventListener('seeked', onSeeked); if (actx.state === 'suspended') actx.resume().finally(run); else run(); };
        v.addEventListener('seeked', onSeeked);
        v.currentTime = Math.max(0, startSec);
      });

      const blob = new Blob(chunks, { type: mime });
      const ext = mime.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
      cleanup(actx);
      if (!blob.size) throw new Error('пустой результат');
      return new File([blob], `short_${Date.now()}.${ext}`, { type: mime.split(';')[0] });
    } catch (err) {
      cleanup();
      throw err;
    }
  }

  async function submitTokenConnect(event, platform) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('button[type="submit"]', form);
    const token = $('[name="token"]', form).value.trim();
    const target = $('[name="target"]', form).value.trim();
    if (!token || !target) return;
    setBusy(button, true, 'Подключаем…');
    const { data, error } = await db.functions.invoke('social-connect', { body: { action: 'connect_token', platform, token, target } });
    setBusy(button, false);
    if (error || data?.error) {
      const detail = await edgeErrorDetail(error, data);
      return toast(`Не удалось подключить ${SOCIAL_PLATFORM_LABEL[platform]}: ${socialErrorHint(platform, detail)}`, 'error');
    }
    closeDrawer();
    toast(`${SOCIAL_PLATFORM_LABEL[platform]} подключён: ${data.account_name || ''}`);
    renderAutopost();
  }

  function openLyrics(id = null, initialProjectId = '') {
    const doc = state.lyrics.find((item) => item.id === id) || null;
    state.activeLyricsId = doc?.id || null;
    renderLyricsList();
    const selectedProjectId = doc?.project_id || initialProjectId;
    const projectOptions = ['<option value="">Не привязан к треку</option>', ...state.projects.map((project) => `<option value="${project.id}" ${selectedProjectId === project.id ? 'selected' : ''}>${escapeHTML(project.title)}</option>`)].join('');
    const selectedCategory = doc?.category || 'В работе';
    const categoryOptions = lyricsCategories().map((category) => `<option value="${escapeHTML(category)}" ${selectedCategory === category ? 'selected' : ''}>${escapeHTML(category)}</option>`).join('');
    $('#lyrics-editor').innerHTML = `<form id="lyrics-form"><div class="form-grid two"><label class="field"><span>Название</span><input name="title" value="${escapeHTML(doc?.title || '')}" required></label><label class="field"><span>Статус</span><select name="document_status"><option value="draft" ${doc?.document_status === 'draft' ? 'selected' : ''}>Черновик</option><option value="ready" ${doc?.document_status === 'ready' ? 'selected' : ''}>Готов</option><option value="archived" ${doc?.document_status === 'archived' ? 'selected' : ''}>Архив</option></select></label></div><div class="form-grid two"><label class="field"><span>Трек</span><select name="project_id">${projectOptions}</select></label><label class="field"><span>Категория</span><select name="category">${categoryOptions}<option value="__custom__">+ Своя категория…</option></select></label></div><label class="field lyrics-custom-category" id="lyrics-custom-category" hidden><span>Название своей категории</span><input name="custom_category" maxlength="40" placeholder="Например: Второй альбом"></label><label class="field"><span>Текст</span><textarea class="lyrics-body" name="body" placeholder="Начните писать…">${escapeHTML(doc?.body || '')}</textarea></label><div class="editor-actions">${doc ? '<button class="button button-danger" id="delete-lyrics" type="button">Удалить</button>' : '<span></span>'}<button class="button button-primary" type="submit">Сохранить текст</button></div></form>`;
    if (state.lyricsReturnProjectId) {
      $('#lyrics-editor').insertAdjacentHTML('afterbegin', '<div class="lyrics-editor-return"><button class="text-button" id="lyrics-return-track" type="button">← К треку</button></div>');
    }
    const categorySelect = $('[name="category"]', $('#lyrics-form'));
    const customCategory = $('#lyrics-custom-category');
    categorySelect.addEventListener('change', () => {
      customCategory.hidden = categorySelect.value !== '__custom__';
      if (!customCategory.hidden) $('[name="custom_category"]', customCategory).focus();
    });
    $('#lyrics-form').addEventListener('submit', (event) => saveLyrics(event, doc));
    $('#delete-lyrics')?.addEventListener('click', () => deleteLyrics(doc));
    $('#lyrics-return-track')?.addEventListener('click', () => {
      const projectId = state.lyricsReturnProjectId;
      state.lyricsReturnProjectId = '';
      if (projectId) openProjectEditor(projectId, 'idea', state.projectReturnView || 'projects');
    });
  }

  async function saveLyrics(event, doc) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const category = data.get('category') === '__custom__' ? String(data.get('custom_category') || '').trim() : String(data.get('category') || 'В работе').trim();
    if (!category) return toast('Назовите свою категорию.', 'error');
    const payload = { artist_id: state.artist.id, project_id: data.get('project_id') || null, title: String(data.get('title') || '').trim(), body: String(data.get('body') || ''), document_status: data.get('document_status') || 'draft', category };
    try {
      const query = doc ? db.from('lyrics_documents').update(payload).eq('id', doc.id).eq('artist_id', state.artist.id) : db.from('lyrics_documents').insert(payload);
      const { error } = await query; if (error) throw error;
      state.lyrics = await safeQuery(db.from('lyrics_documents').select('*').eq('artist_id', state.artist.id).order('updated_at', { ascending: false }));
      const returnProjectId = state.lyricsReturnProjectId;
      state.activeLyricsId = null;
      renderLyricsList();
      $('#lyrics-editor').innerHTML = '<div class="empty-state"><span>TXT</span><h3>Выберите текст</h3><p>Или создайте новый документ.</p></div>';
      toast('Текст сохранён.');
      if (returnProjectId) {
        state.lyricsReturnProjectId = '';
        openProjectEditor(returnProjectId, 'idea', state.projectReturnView || 'projects');
      }
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
    const categorySelect = $('#links-category-filter');
    const categoryCounts = state.links.reduce((counts, link) => {
      const category = LINK_CATEGORIES[link.category] ? link.category : 'other';
      counts[category] = (counts[category] || 0) + 1;
      return counts;
    }, {});
    categorySelect.innerHTML = [`<option value="all">Все категории · ${state.links.length}</option>`, ...Object.entries(LINK_CATEGORIES).map(([value, label]) => `<option value="${value}">${label} · ${categoryCounts[value] || 0}</option>`)].join('');
    categorySelect.value = state.linksCategory;

    const links = state.links.filter((link) => state.linksCategory === 'all' || (LINK_CATEGORIES[link.category] ? link.category : 'other') === state.linksCategory);
    container.classList.toggle('is-list', state.linksView === 'list');
    $$('[data-links-view]').forEach((button) => {
      const active = button.dataset.linksView === state.linksView;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    container.innerHTML = links.length ? links.map((link) => {
      const category = LINK_CATEGORIES[link.category] || LINK_CATEGORIES.other;
      return `<article class="link-card"><span class="eyebrow link-card-category">${escapeHTML(category)}</span><div class="link-card-main"><strong>${escapeHTML(link.label)}</strong><a href="${escapeHTML(link.url)}" target="_blank" rel="noopener">${escapeHTML(link.url)}</a>${link.notes ? `<p>${escapeHTML(link.notes)}</p>` : ''}</div><footer><button class="link-action" data-copy-link="${link.id}" type="button">Копировать</button><button class="link-action" data-edit-link="${link.id}" type="button">Изменить</button><button class="link-action is-danger" data-delete-link="${link.id}" type="button">Удалить</button></footer></article>`;
    }).join('') : `<div class="empty-list">${state.links.length ? 'В этой категории ссылок пока нет.' : 'Сохранённых ссылок пока нет.'}</div>`;
    $$('[data-copy-link]', container).forEach((button) => button.addEventListener('click', () => copyLink(button.dataset.copyLink)));
    $$('[data-edit-link]', container).forEach((button) => button.addEventListener('click', () => openLinkEditor(button.dataset.editLink)));
    $$('[data-delete-link]', container).forEach((button) => button.addEventListener('click', () => deleteLink(button.dataset.deleteLink)));
  }

  async function copyLink(id) {
    const link = state.links.find((item) => item.id === id);
    if (!link) return;
    const fallbackCopy = () => {
      const input = document.createElement('textarea');
      input.value = link.url;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.append(input);
      input.select();
      const copied = document.execCommand('copy');
      input.remove();
      if (!copied) throw new Error('Copy command failed');
    };
    try {
      if (navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(link.url); }
        catch (error) { fallbackCopy(); }
      } else {
        fallbackCopy();
      }
      toast('Ссылка скопирована.');
    } catch (error) {
      toast('Не удалось скопировать ссылку.', 'error');
    }
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
      const key = localDateKey(current);
      const dayProjects = state.projects.filter((project) => ['scheduled', 'released', 'archived'].includes(project.status) && project.release_at && localDateKey(project.release_at) === key);
      const dayTasks = state.tasks.filter((task) => task.due_at && localDateKey(task.due_at) === key);
      const today = new Date();
      const entries = [
        ...dayProjects.map((project) => `<button class="calendar-entry-${project.status}" data-open-project="${project.id}" data-project-drag="${project.id}" draggable="true" type="button">${escapeHTML(project.title)}</button>`),
        ...dayTasks.map((task) => `<button class="calendar-entry-${task.is_done ? 'task-done' : 'task'}" data-open-task="${task.id}" data-task-drag="${task.id}" draggable="true" type="button">${escapeHTML(task.title)}</button>`),
      ];
      days.push(`<div class="calendar-day ${current.getMonth() !== date.getMonth() ? 'is-muted' : ''} ${current.toDateString() === today.toDateString() ? 'is-today' : ''}" data-calendar-drop-date="${key}"><span>${current.getDate()}</span><div class="calendar-entry-stack">${entries.join('')}</div></div>`);
    }
    const grid = $('#calendar-grid');
    grid.innerHTML = weekdays + days.join('');
    bindProjectButtons(grid);
    bindTaskButtons(grid);
    bindCalendarDnD(grid);
    const calendarFeed = [
      ...state.projects.filter((project) => ['scheduled', 'released', 'archived'].includes(project.status) && project.release_at).map((project) => ({ title: project.title, status: project.status, starts_at: project.release_at })),
      ...state.tasks.filter((task) => task.due_at).map((task) => ({ title: task.title, status: task.is_done ? 'done' : 'task', starts_at: task.due_at })),
    ].filter((entry) => new Date(entry.starts_at) >= new Date()).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    renderEventList($('#calendar-events'), calendarFeed.slice(0, 12));
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
    restoreStoredProfileImage();
    setProfileImageStatus();
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
        await validateProfileImage(file);
        const path = `${state.user.id}/avatar-${Date.now()}-${safeFileName(file.name)}`;
        const { error } = await db.storage.from('artists').upload(path, file, { contentType: file.type }); if (error) throw error;
        imageUrl = db.storage.from('artists').getPublicUrl(path).data.publicUrl;
      }
      const payload = { name: $('#profile-name').value.trim(), description: $('#profile-description').value.trim(), matrix_text: $('#profile-matrix').value.trim(), tg_url: $('#profile-tg').value.trim() || null, vk_url: $('#profile-vk').value.trim() || null, inst_url: $('#profile-inst').value.trim() || null, image_url: imageUrl };
      const { data, error } = await db.from('artists').update(payload).eq('id', state.artist.id).eq('owner_user_id', state.user.id).select().single(); if (error) throw error;
      state.artist = data; $('#profile-image').value = ''; hydrateProfile(); syncIdentity(); $('#profile-save-state').textContent = 'Сохранено'; toast('Карточка артиста обновлена.');
    } catch (error) { toast(error.message || 'Не удалось сохранить карточку.', 'error'); }
    finally { setBusy(button, false); setTimeout(() => { $('#profile-save-state').textContent = ''; }, 1800); }
  }

  async function loadInviteArtists() {
    if (!isOwner()) return;
    const select = $('#invite-artist');
    if (select.dataset.loaded || select.dataset.loading) return;
    select.dataset.loading = '1';
    select.disabled = true;
    select.innerHTML = '<option value="">Загружаем артистов…</option>';
    try {
      const artists = await safeQuery(publicDb.from('artists').select('id,name').order('name'));
      select.innerHTML = artists.length ? '<option value="">Выберите артиста</option>' + artists.map((artist) => `<option value="${artist.id}">${escapeHTML(artist.name || 'Без имени')}</option>`).join('') : '<option value="">Карточки артистов не найдены</option>';
      select.dataset.loaded = '1';
      select.disabled = !artists.length;
    } catch (error) {
      select.innerHTML = '<option value="">Не удалось загрузить — нажмите ещё раз</option>';
      select.disabled = false;
      toast('Не удалось загрузить список артистов.', 'error');
    } finally { delete select.dataset.loading; }
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
    if (state.booting) return;
    state.booting = true;
    state.user = user;
    syncOwnerUI();
    if (isOwner()) loadInviteArtists();
    $('#sidebar-email').textContent = user.email || '';
    $('#auth-screen').hidden = true;
    $('#auth-loading-screen').hidden = true;
    $('#terminal-shell').hidden = false;
    state.booted = true;
    setSystemStatus('Загружаем кабинет…');
    try {
      await loadAllData();
      const query = new URLSearchParams(location.search);
      const oauthCode = query.get('code');
      const oauthState = query.get('state');
      if (oauthCode && (oauthState === 'youtube' || oauthState === 'instagram')) {
        await completeSocialConnect(oauthState, oauthCode);
        history.replaceState({}, '', '/admin/?section=autopost');
        return goView('autopost');
      }
      // VK ID не всегда возвращает state, поэтому опознаём ещё и по префиксу кода vk2.
      if (oauthCode && ((oauthState || '').startsWith('vk') || oauthCode.startsWith('vk2.'))) {
        const codeVerifier = localStorage.getItem('vk_code_verifier') || '';
        const vkGroupId = localStorage.getItem('vk_group_id') || '';
        localStorage.removeItem('vk_code_verifier');
        localStorage.removeItem('vk_group_id');
        await completeSocialConnect('vk', oauthCode, { code_verifier: codeVerifier, device_id: query.get('device_id') || '', group_id: vkGroupId });
        history.replaceState({}, '', '/admin/?section=autopost');
        return goView('autopost');
      }
      const requested = query.get('section');
      const requestedProject = query.get('project');
      if (requested === 'track' && requestedProject && state.projects.some((project) => project.id === requestedProject)) await openProjectEditor(requestedProject, 'idea', 'projects');
      else goView(VIEW_TITLES[requested] && requested !== 'track' && (requested !== 'invites' || isOwner()) ? requested : 'dashboard');
    } catch (error) {
      const pendingInviteToken = localStorage.getItem('inmise-pending-invite-token');
      if (pendingInviteToken && /^[a-f0-9]{64}$/i.test(pendingInviteToken)) {
        const inviteUrl = new URL('/invite/', window.location.origin);
        inviteUrl.searchParams.set('token', pendingInviteToken);
        inviteUrl.searchParams.set('claim', '1');
        window.location.replace(inviteUrl.toString());
        return;
      }
      setSystemStatus('Ошибка привязки');
      $('#auth-loading-screen').hidden = true;
      $('#terminal-shell').hidden = false;
      toast(error.message || 'Не удалось открыть кабинет.', 'error');
    } finally {
      state.booting = false;
    }
  }

  function showLogin(message = '') {
    $('#auth-loading-screen').hidden = true;
    $('#auth-screen').hidden = false; $('#terminal-shell').hidden = true;
    $('#login-form').hidden = false; $('#recovery-form').hidden = true;
    $('#auth-title').textContent = 'Вход в кабинет'; $('#auth-copy').textContent = 'Доступ только для артистов INMISE.';
    setAuthMessage(message);
  }

  function showRecovery(message = 'Придумайте новый пароль для кабинета.') {
    $('#auth-loading-screen').hidden = true;
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
    const { data, error: sessionError } = await withTimeout(
      db.auth.getSession(),
      8000,
      'Проверка сессии заняла слишком много времени.',
    );
    if (sessionError) throw sessionError;
    if (data.session?.user && !recovery) await bootApp(data.session.user);
    else if (!recovery) showLogin();

    db.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { state.booted = false; state.booting = false; showLogin(); }
      if (event === 'PASSWORD_RECOVERY') showRecovery();
      if (event === 'SIGNED_IN' && session?.user && sessionStorage.getItem('inmise-password-recovery') !== '1' && !state.booted && !state.booting) bootApp(session.user);
    });
  }

  function bindEvents() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && activeWorkspaceFlush) {
        activeWorkspaceFlush().catch(() => {});
      }
    });
    window.addEventListener('pagehide', () => {
      if (activeWorkspaceFlush) activeWorkspaceFlush().catch(() => {});
    });
    $$('[data-theme-choice]').forEach((button) => button.addEventListener('click', () => setTheme(button.dataset.themeChoice)));
    $$('.nav-item').forEach((button) => button.addEventListener('click', () => goView(button.dataset.view)));
    $$('[data-go-view]').forEach((button) => button.addEventListener('click', () => goView(button.dataset.goView)));
    $('#mobile-menu').addEventListener('click', () => $('#sidebar').classList.toggle('is-open'));
    $('#drawer-close').addEventListener('click', closeDrawer); $('#drawer-backdrop').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeDrawer(); });
    $('#dashboard-wheel-trigger').addEventListener('click', openWheel);
    $('#wheel-modal-close').addEventListener('click', closeWheel);
    $('#wheel-backdrop').addEventListener('click', closeWheel);
    $('#wheel-spin').addEventListener('click', spinWheel);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeWheel(); });
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
    $('#dashboard-new-project').addEventListener('click', () => openProjectEditor());
    $('#new-task').addEventListener('click', () => openTaskEditor());
    $('#dashboard-new-file').addEventListener('click', openFileUploader);
    const dashboardStart = $('#dashboard-start');
    const dashboardStartMenu = $('#dashboard-start-menu');
    const closeDashboardStart = () => {
      dashboardStartMenu.hidden = true;
      dashboardStart.setAttribute('aria-expanded', 'false');
    };
    dashboardStart.addEventListener('click', (event) => {
      event.stopPropagation();
      dashboardStartMenu.hidden = !dashboardStartMenu.hidden;
      dashboardStart.setAttribute('aria-expanded', String(!dashboardStartMenu.hidden));
    });
    dashboardStartMenu.addEventListener('click', (event) => {
      const action = event.target.closest('[data-start-action]')?.dataset.startAction;
      if (!action) return;
      closeDashboardStart();
      if (action === 'project') openProjectEditor();
      if (action === 'beat') openBeatEditor();
      if (action === 'task') openTaskEditor('idea', state.dashboardProjectId || '');
      if (action === 'event') openEventEditor();
    });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.dashboard-start-wrap')) closeDashboardStart();
    });
    $('#dashboard-calendar-prev').addEventListener('click', () => { state.dashboardDate.setMonth(state.dashboardDate.getMonth() - 1); renderDashboardCalendar(); });
    $('#dashboard-calendar-next').addEventListener('click', () => { state.dashboardDate.setMonth(state.dashboardDate.getMonth() + 1); renderDashboardCalendar(); });
    $('#dashboard-project-select').addEventListener('change', (event) => { state.dashboardProjectId = event.currentTarget.value; renderDashboard(); });
    $('#dashboard-new-task').addEventListener('click', () => openTaskEditor('idea', state.dashboardProjectId || ''));
    $('#dashboard-search').addEventListener('input', (event) => { state.dashboardSearch = event.currentTarget.value; renderDashboardProjectFocus(selectedDashboardProject()); renderDashboardPipeline(); renderDashboardFiles(); renderDashboardSearchResults(); });
    $('#dashboard-search').addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.currentTarget.value = ''; state.dashboardSearch = ''; renderDashboard(); } });
    $('#new-lyrics').addEventListener('click', () => openLyrics());
    $('#new-link').addEventListener('click', () => openLinkEditor());
    $('#links-category-filter').addEventListener('change', (event) => { state.linksCategory = event.currentTarget.value; renderLinks(); });
    $$('.links-view-toggle [data-links-view]').forEach((button) => button.addEventListener('click', () => {
      state.linksView = button.dataset.linksView === 'list' ? 'list' : 'cards';
      localStorage.setItem(LINKS_VIEW_STORAGE_KEY, state.linksView);
      renderLinks();
    }));
    $('#new-event').addEventListener('click', openEventEditor);
    $('#calendar-prev').addEventListener('click', () => { state.calendarDate.setMonth(state.calendarDate.getMonth() - 1); renderCalendar(); });
    $('#calendar-next').addEventListener('click', () => { state.calendarDate.setMonth(state.calendarDate.getMonth() + 1); renderCalendar(); });
    $('#profile-form').addEventListener('submit', saveProfile);
    ['profile-name','profile-description','profile-matrix'].forEach((id) => $(`#${id}`).addEventListener('input', updateProfileCounters));
    $('#profile-image').addEventListener('change', () => { const file = $('#profile-image').files?.[0]; if (file) previewProfileImage(file); });
    $('#create-invite').addEventListener('click', createInvite);
    $('#copy-invite').addEventListener('click', async () => { const value = $('#invite-link').value; if (!value) return; await navigator.clipboard.writeText(value); toast('Ссылка скопирована.'); });
  }

  document.addEventListener('DOMContentLoaded', () => { initialiseTheme(); bindEvents(); initialiseAuth().catch((error) => { console.error(error); showLogin('Не удалось инициализировать авторизацию.'); }); });
})();
