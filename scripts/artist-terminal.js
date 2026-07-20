(function () {
  'use strict';

  if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    console.error('[artist-terminal] Supabase configuration is missing');
    return;
  }

  const db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  const publicDb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
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
  const PROJECT_STATUS = { idea: 'Идея', demo: 'Демо', mix: 'Сведение', scheduled: 'Запланирован', released: 'Выпущен', archived: 'Архив' };
  const PROJECT_STATUS_HINT = { idea: 'Мечтаем', demo: 'Записываем', mix: 'Работаем', scheduled: 'Добавлен в календарь!', released: 'Ожидаем успеха', archived: 'Архив' };
  const TASK_WORKFLOW = { idea: 'Придумал', doing: 'Делаю', uploaded: 'Загружено' };
  const DEFAULT_PROJECT_TASKS = ['Сделать обложку', 'Записать вокал', 'Свести'];
  const DEFAULT_LYRICS_CATEGORIES = ['На альбом', 'Ипишка', 'В работе'];
  const EVENT_STATUS = { planned: 'Запланировано', ready: 'Готово', completed: 'Завершено', cancelled: 'Отменено' };
  const VIEW_TITLES = {
    dashboard: ['01', 'Дашборд'], beats: ['02', 'Биты'], projects: ['03', 'Треки и релизы'], track: ['03', 'Рабочее пространство трека'], tasks: ['04', 'Задачи'], lyrics: ['05', 'Тексты'],
    calendar: ['06', 'Календарь'], profile: ['07', 'Карточка артиста'], links: ['08', 'Ссылки'], autopost: ['09', 'Автопостинг'], invites: ['10', 'Инвайты'],
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
    activeLyricsId: null,
    activeLyricsFilter: 'all',
    activeProjectId: null,
    projectReturnView: 'projects',
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
    if (view === 'tasks') renderTasksView();
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

  function renderDashboard() {
    const activeProjects = state.projects.filter((project) => !['released', 'archived'].includes(project.status));
    const released = state.projects.filter((project) => project.status === 'released').length;
    const upcoming = state.events
      .filter((event) => new Date(event.starts_at) >= new Date() && event.status !== 'cancelled')
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    const totalTasks = state.tasks.length;
    const completedTasks = state.tasks.filter((task) => task.is_done).length;

    $('#stat-projects').textContent = String(activeProjects.length).padStart(2, '0');
    $('#stat-releases').textContent = String(released).padStart(2, '0');
    $('#stat-completion').textContent = totalTasks ? `${Math.round((completedTasks / totalTasks) * 100)}%` : '0%';

    renderDashboardCalendar();
    renderDashboardUpcoming(upcoming.slice(0, 5));
    renderDashboardPipeline();
    renderDashboardFiles();
    renderDashboardSearchResults();
  }

  function projectById(id) {
    return state.projects.find((project) => project.id === id) || null;
  }

  function renderDashboardCalendar() {
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
      const key = current.toISOString().slice(0, 10);
      const events = state.events.filter((event) => new Date(event.starts_at).toISOString().slice(0, 10) === key && event.status !== 'cancelled');
      const projects = state.projects.filter((project) => ['scheduled', 'released', 'archived'].includes(project.status) && project.release_at && new Date(project.release_at).toISOString().slice(0, 10) === key);
      const entries = [...events.map((event) => ({ title: event.title, projectId: event.project_id, status: 'event' })), ...projects.map((project) => ({ title: project.title, projectId: project.id, status: project.status }))];
      const visibleEntries = entries.slice(0, 2);
      const more = entries.length > 2 ? `<small class="dashboard-calendar-more">+${entries.length - 2}</small>` : '';
      cells.push(`<div class="dashboard-calendar-day ${current.getMonth() !== month.getMonth() ? 'is-muted' : ''} ${current.toDateString() === today.toDateString() ? 'is-today' : ''}"><span>${current.getDate()}</span>${visibleEntries.map((entry) => `<button class="calendar-entry-${entry.status}" data-open-project="${entry.projectId || ''}" type="button">${escapeHTML(entry.title)}</button>`).join('')}${more}</div>`);
    }
    const container = $('#dashboard-calendar');
    container.innerHTML = headers + cells.join('');
    bindProjectButtons(container);
  }

  function renderDashboardUpcoming(events) {
    const container = $('#dashboard-events');
    container.innerHTML = events.length ? events.map((event) => {
      const project = projectById(event.project_id);
      return `<button class="dashboard-upcoming-row" ${project ? `data-open-project="${project.id}"` : ''} type="button"><span class="dashboard-upcoming-cover">${project?.cover_storage_path ? '▧' : 'IN'}</span><span><strong>${escapeHTML(event.title)}</strong><small>${project ? escapeHTML(project.title) : EVENT_STATUS[event.status] || event.status}</small></span><time>${formatDate(event.starts_at, { year: undefined })}</time></button>`;
    }).join('') : '<div class="empty-list">Ближайших событий нет.</div>';
    bindProjectButtons(container);
  }

  function renderDashboardPipeline() {
    const statuses = ['idea', 'demo', 'mix', 'scheduled', 'released'];
    const query = state.dashboardSearch.toLowerCase();
    const container = $('#dashboard-pipeline');
    container.innerHTML = statuses.map((status) => {
      const projects = state.projects.filter((project) => project.status === status && (!query || project.title.toLowerCase().includes(query)));
      return `<section class="pipeline-column" data-project-dropzone="${status}"><header><span>${PROJECT_STATUS[status]}</span><b>${projects.length}</b></header><div>${projects.map((project) => `<button class="pipeline-card" data-open-project="${project.id}" data-project-drag="${project.id}" draggable="true" type="button"><strong>${escapeHTML(project.title)}</strong><span>${PROJECT_STATUS_HINT[project.status] || ''}</span><small>${project.beat_id ? 'Бит подключён' : 'Без бита'} · ${formatDate(project.updated_at)}</small></button>`).join('') || '<p>Перетащите проект сюда</p>'}</div><button class="pipeline-add" data-pipeline-status="${status}" type="button">+ Добавить</button></section>`;
    }).join('');
    bindProjectButtons(container);
    bindProjectPipelineDnD(container);
    $$('[data-pipeline-status]', container).forEach((button) => button.addEventListener('click', () => openProjectEditor(null, button.dataset.pipelineStatus)));
  }

  function bindProjectPipelineDnD(container) {
    $$('[data-project-drag]', container).forEach((card) => {
      card.addEventListener('dragstart', (event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/project-id', card.dataset.projectDrag);
        card.classList.add('is-dragging');
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('is-dragging');
        $$('[data-project-dropzone]', container).forEach((zone) => zone.classList.remove('is-dragover'));
      });
    });
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

  async function moveProjectToStage(id, status) {
    const project = state.projects.find((item) => item.id === id);
    if (!project || project.status === status) return;
    if (['scheduled', 'released'].includes(status) && !project.release_at) {
      toast('Сначала укажите дату релиза.', 'error');
      return openProjectEditor(id, project.status, 'dashboard');
    }
    const previous = project.status;
    project.status = status;
    renderDashboardPipeline();
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
    $$('[data-task-drag]', container).forEach((card) => {
      card.addEventListener('dragstart', (event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/task-id', card.dataset.taskDrag);
        card.classList.add('is-dragging');
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('is-dragging');
        $$('[data-task-dropzone]', container).forEach((zone) => zone.classList.remove('is-dragover'));
      });
    });
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
    const files = state.files.filter((file) => !query || file.original_name.toLowerCase().includes(query) || projectById(file.project_id)?.title?.toLowerCase().includes(query));
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
    openDrawer('TASK / PROJECT', task ? 'Редактирование задачи' : 'Новая задача', `<form id="task-form"><label class="field"><span>Задача</span><input name="title" value="${escapeHTML(task?.title || '')}" required placeholder="Например: подготовить обложку"></label><label class="field"><span>Связанный релиз</span><select name="project_id">${projectOptions}</select></label><div class="form-grid two"><label class="field"><span>Этап</span><select name="workflow_status">${workflowOptions}</select></label><label class="field"><span>Срок</span><input name="due_at" type="datetime-local" value="${toLocalInput(task?.due_at)}"></label></div><div class="drawer-actions"><span>${task ? 'Можно оставить задачу без привязки к релизу.' : ''}</span><button class="button button-primary" type="submit">${task ? 'Сохранить' : 'Добавить задачу'}</button></div></form>`);
    $('#task-form').addEventListener('submit', (event) => saveTask(event, task));
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
      renderDashboard(); renderTasksView();
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
    renderTasksView();
    try {
      const { error } = await db.from('project_tasks').update({ is_done: isDone, workflow_status: workflowStatus }).eq('id', id).eq('artist_id', state.artist.id);
      if (error) throw error;
      renderDashboard(); renderTasksView();
    } catch (error) {
      if (task) { task.is_done = previous; task.workflow_status = previousWorkflow; }
      renderDashboard(); renderTasksView();
      if (state.activeProjectId) await renderTrackWorkspace(state.activeProjectId);
      toast(error.message || 'Не удалось обновить задачу.', 'error');
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
      return `<article class="project-card" data-open-project="${project.id}"><div class="project-cover">${cover ? `<img src="${escapeHTML(cover)}" alt="">` : '<span>NO COVER</span>'}</div><div class="project-body"><span class="eyebrow">${formatDate(project.release_at)}</span><h3>${escapeHTML(project.title)}</h3><p class="project-stage-copy">${PROJECT_STATUS_HINT[project.status] || ''}</p><div class="project-meta"><span>${project.beat_id ? 'Бит выбран' : 'Без бита'}</span><span class="status-chip ${project.status}">${PROJECT_STATUS[project.status] || project.status}</span></div></div></article>`;
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

  async function openProjectEditor(id = null, initialStatus = 'idea', returnView = null) {
    const visibleView = $('.view.is-active')?.dataset.viewPanel;
    state.projectReturnView = returnView || (visibleView === 'dashboard' ? 'dashboard' : 'projects');
    state.activeProjectId = id || null;
    await renderTrackWorkspace(id, initialStatus);
    goView('track');
    const url = new URL(location.href);
    url.searchParams.set('section', 'track');
    if (id) url.searchParams.set('project', id); else url.searchParams.delete('project');
    history.replaceState({}, '', `${url.pathname}${url.search}`);
  }

  async function renderTrackWorkspace(id = null, initialStatus = 'idea') {
    const project = state.projects.find((item) => item.id === id) || null;
    const selectedStatus = project?.status === 'master' ? 'mix' : (project?.status || initialStatus);
    const cover = project ? await projectCover(project) : '';
    const beatOptions = ['<option value="">Бит не выбран</option>', ...state.beats.map((beat) => `<option value="${beat.id}" ${project?.beat_id === beat.id ? 'selected' : ''}>${escapeHTML(beat.title)}</option>`)].join('');
    const linkedTasks = project ? state.tasks.filter((task) => task.project_id === project.id) : [];
    const linkedFiles = project ? state.files.filter((file) => file.project_id === project.id) : [];
    const linkedLyrics = project ? state.lyrics.filter((doc) => doc.project_id === project.id) : [];
    const progressStatuses = ['idea', 'demo', 'mix', 'scheduled', 'released'];
    const activeIndex = selectedStatus === 'archived'
      ? progressStatuses.length - 1
      : Math.max(0, progressStatuses.indexOf(selectedStatus));
    const fileRows = linkedFiles.length ? linkedFiles.slice(0, 8).map((file) => `<button class="track-workspace-list-row" data-download-file="${file.id}" type="button"><span>${escapeHTML(file.original_name)}</span><small>${escapeHTML(file.file_kind)} · ${formatFileSize(file.size_bytes)}</small></button>`).join('') : '<p class="track-workspace-empty">Файлов пока нет.</p>';
    const lyricRows = linkedLyrics.length ? linkedLyrics.map((doc) => `<button class="track-workspace-list-row" data-project-lyrics="${doc.id}" type="button"><span>${escapeHTML(doc.title)}</span><small>${doc.document_status === 'ready' ? 'Готов' : 'Черновик'}</small></button>`).join('') : '<p class="track-workspace-empty">Текст ещё не привязан.</p>';
    const container = $('#track-workspace');
    container.innerHTML = `
      <div class="track-workspace-toolbar">
        <button class="text-button" id="track-workspace-back" type="button">← ${state.projectReturnView === 'dashboard' ? 'На дашборд' : 'Ко всем трекам'}</button>
        <span class="eyebrow">TRACK / ${project ? 'PROJECT' : 'NEW'}</span>
      </div>
      <form class="track-workspace-form" id="project-form">
        <section class="panel track-workspace-hero">
          <label class="cover-upload track-workspace-cover" id="project-cover-label">${cover ? `<img src="${escapeHTML(cover)}" alt="Обложка">` : '<span>+ Обложка</span>'}<input name="cover" type="file" accept="image/*" hidden></label>
          <div class="track-workspace-title">
            <span class="eyebrow">Единое рабочее пространство</span>
            <input class="track-title-input" name="title" value="${escapeHTML(project?.title || '')}" required placeholder="Название трека">
            <p id="project-status-hint">${PROJECT_STATUS_HINT[selectedStatus] || ''}</p>
          </div>
          <button class="button button-primary track-save-button" type="submit">${project ? 'Сохранить трек' : 'Создать трек'}</button>
          <div class="track-progress" aria-label="Прогресс релиза">${progressStatuses.map((status, index) => `<button class="${index <= activeIndex ? 'is-reached' : ''} ${status === selectedStatus ? 'is-active' : ''}" data-track-status="${status}" type="button"><i>${String(index + 1).padStart(2, '0')}</i><span>${PROJECT_STATUS[status]}</span><small>${PROJECT_STATUS_HINT[status]}</small></button>`).join('')}</div>
        </section>

        <div class="track-workspace-grid">
          <section class="panel track-workspace-main">
            <header class="panel-header"><div><span class="eyebrow">Основа проекта</span><h3>Трек</h3></div></header>
            <div class="track-workspace-section-body">
              <label class="field"><span>Бит</span><select name="beat_id">${beatOptions}</select></label>
              <label class="field"><span>Заметки по треку</span><textarea name="description" rows="8" placeholder="Идеи, референсы, детали записи…">${escapeHTML(project?.description || '')}</textarea></label>
            </div>
          </section>

          <section class="panel track-workspace-release">
            <header class="panel-header"><div><span class="eyebrow">Публикация</span><h3>Релиз</h3></div></header>
            <div class="track-workspace-section-body">
              <label class="field"><span>Статус</span><select name="status">${Object.entries(PROJECT_STATUS).map(([value,label]) => `<option value="${value}" ${selectedStatus === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
              <label class="field"><span>Дата релиза</span><input name="release_at" type="datetime-local" value="${toLocalInput(project?.release_at)}"><small>Запланированные и выпущенные релизы появляются в календаре.</small></label>
              <div class="track-release-summary"><span>Текущая стадия</span><strong id="track-current-status">${PROJECT_STATUS[selectedStatus]}</strong><small>${formatDate(project?.release_at)}</small></div>
            </div>
          </section>

          <section class="panel track-workspace-tasks">
            <header class="panel-header"><div><span class="eyebrow">Производство</span><h3>Задачи трека</h3></div>${project ? '<button class="text-button" id="track-add-task" type="button">+ Задача</button>' : ''}</header>
            ${project ? '<div class="task-pipeline-board track-task-board" id="track-tasks-board"></div>' : '<p class="track-workspace-empty large">Сохраните трек — стандартные задачи появятся автоматически.</p>'}
          </section>

          <section class="panel track-workspace-lyrics">
            <header class="panel-header"><div><span class="eyebrow">Материал</span><h3>Текст</h3></div>${project ? '<button class="text-button" id="track-add-lyrics" type="button">+ Текст</button>' : ''}</header>
            <div class="track-workspace-list">${project ? lyricRows : '<p class="track-workspace-empty">Сначала сохраните трек.</p>'}</div>
          </section>

          <section class="panel track-workspace-files">
            <header class="panel-header"><div><span class="eyebrow">Приватное хранилище</span><h3>Файлы</h3></div>${project ? '<button class="text-button" id="track-add-file" type="button">+ Файл</button>' : ''}</header>
            <div class="track-workspace-list">${project ? fileRows : '<p class="track-workspace-empty">Сначала сохраните трек.</p>'}</div>
          </section>
        </div>
      </form>`;
    const form = $('#project-form', container);
    const statusSelect = $('[name="status"]', form);
    const syncTrackStatus = (status) => {
      statusSelect.value = status;
      $('#project-status-hint').textContent = PROJECT_STATUS_HINT[status] || '';
      $('#track-current-status').textContent = PROJECT_STATUS[status] || status;
      const index = progressStatuses.indexOf(status);
      $$('[data-track-status]', container).forEach((button, buttonIndex) => {
        button.classList.toggle('is-active', button.dataset.trackStatus === status);
        button.classList.toggle('is-reached', index >= 0 && buttonIndex <= index);
      });
    };
    statusSelect.addEventListener('change', () => syncTrackStatus(statusSelect.value));
    $$('[data-track-status]', container).forEach((button) => button.addEventListener('click', () => syncTrackStatus(button.dataset.trackStatus)));
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
      const taskBoard = $('#track-tasks-board', container);
      taskBoard.dataset.projectId = project.id;
      renderTaskWorkflowBoard(taskBoard, linkedTasks, project.id);
      $('#track-add-task').addEventListener('click', () => openTaskEditor('idea', project.id));
      $('#track-add-file').addEventListener('click', () => openFileUploader(project.id));
      $('#track-add-lyrics').addEventListener('click', () => { goView('lyrics'); openLyrics(null, project.id); });
    }
    $$('[data-download-file]', form).forEach((button) => button.addEventListener('click', () => downloadProjectFile(button.dataset.downloadFile)));
    $$('[data-project-lyrics]', form).forEach((button) => button.addEventListener('click', () => { goView('lyrics'); openLyrics(button.dataset.projectLyrics); }));
    $('#track-workspace-back').addEventListener('click', () => { state.activeProjectId = null; goView(state.projectReturnView); });
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
    if (['scheduled', 'released', 'archived'].includes(payload.status) && !payload.release_at) {
      return toast('Для этого статуса укажите дату релиза.', 'error');
    }
    setBusy(submit, true, 'Сохраняем…');
    try {
      let saved = project;
      const isNewProject = !project;
      if (project) {
        const { data: row, error } = await db.from('artist_projects').update(payload).eq('id', project.id).eq('artist_id', state.artist.id).select().single();
        if (error) throw error; saved = row;
      } else {
        const { data: row, error } = await db.from('artist_projects').insert(payload).select().single();
        if (error) throw error; saved = row;
        const defaults = DEFAULT_PROJECT_TASKS.map((title, index) => ({ artist_id: state.artist.id, project_id: saved.id, title, workflow_status: 'idea', is_done: false, sort_order: index }));
        const { error: taskError } = await db.from('project_tasks').insert(defaults);
        if (taskError) throw taskError;
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
      if (isNewProject) state.tasks = await safeQuery(db.from('project_tasks').select('*').eq('artist_id', state.artist.id).order('is_done').order('sort_order').order('due_at'));
      await renderProjects(); renderDashboard(); renderCalendar();
      state.activeProjectId = saved.id;
      await renderTrackWorkspace(saved.id, saved.status);
      goView('track');
      const url = new URL(location.href); url.searchParams.set('section', 'track'); url.searchParams.set('project', saved.id); history.replaceState({}, '', `${url.pathname}${url.search}`);
      toast(project ? 'Проект обновлён.' : 'Проект создан со стандартными задачами.');
    } catch (error) { toast(error.message || 'Не удалось сохранить проект.', 'error'); }
    finally { setBusy(submit, false); }
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

  function openLyrics(id = null, initialProjectId = '') {
    const doc = state.lyrics.find((item) => item.id === id) || null;
    state.activeLyricsId = doc?.id || null;
    renderLyricsList();
    const selectedProjectId = doc?.project_id || initialProjectId;
    const projectOptions = ['<option value="">Не привязан к треку</option>', ...state.projects.map((project) => `<option value="${project.id}" ${selectedProjectId === project.id ? 'selected' : ''}>${escapeHTML(project.title)}</option>`)].join('');
    const selectedCategory = doc?.category || 'В работе';
    const categoryOptions = lyricsCategories().map((category) => `<option value="${escapeHTML(category)}" ${selectedCategory === category ? 'selected' : ''}>${escapeHTML(category)}</option>`).join('');
    $('#lyrics-editor').innerHTML = `<form id="lyrics-form"><div class="form-grid two"><label class="field"><span>Название</span><input name="title" value="${escapeHTML(doc?.title || '')}" required></label><label class="field"><span>Статус</span><select name="document_status"><option value="draft" ${doc?.document_status === 'draft' ? 'selected' : ''}>Черновик</option><option value="ready" ${doc?.document_status === 'ready' ? 'selected' : ''}>Готов</option><option value="archived" ${doc?.document_status === 'archived' ? 'selected' : ''}>Архив</option></select></label></div><div class="form-grid two"><label class="field"><span>Трек</span><select name="project_id">${projectOptions}</select></label><label class="field"><span>Категория</span><select name="category">${categoryOptions}<option value="__custom__">+ Своя категория…</option></select></label></div><label class="field lyrics-custom-category" id="lyrics-custom-category" hidden><span>Название своей категории</span><input name="custom_category" maxlength="40" placeholder="Например: Второй альбом"></label><label class="field"><span>Текст</span><textarea class="lyrics-body" name="body" placeholder="Начните писать…">${escapeHTML(doc?.body || '')}</textarea></label><div class="editor-actions">${doc ? '<button class="button button-danger" id="delete-lyrics" type="button">Удалить</button>' : '<span></span>'}<button class="button button-primary" type="submit">Сохранить текст</button></div></form>`;
    const categorySelect = $('[name="category"]', $('#lyrics-form'));
    const customCategory = $('#lyrics-custom-category');
    categorySelect.addEventListener('change', () => {
      customCategory.hidden = categorySelect.value !== '__custom__';
      if (!customCategory.hidden) $('[name="custom_category"]', customCategory).focus();
    });
    $('#lyrics-form').addEventListener('submit', (event) => saveLyrics(event, doc));
    $('#delete-lyrics')?.addEventListener('click', () => deleteLyrics(doc));
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
      const dayEvents = state.events.filter((event) => new Date(event.starts_at).toISOString().slice(0,10) === key && event.status !== 'cancelled');
      const dayProjects = state.projects.filter((project) => ['scheduled', 'released', 'archived'].includes(project.status) && project.release_at && new Date(project.release_at).toISOString().slice(0, 10) === key);
      const today = new Date();
      days.push(`<div class="calendar-day ${current.getMonth() !== date.getMonth() ? 'is-muted' : ''} ${current.toDateString() === today.toDateString() ? 'is-today' : ''}"><span>${current.getDate()}</span>${dayEvents.slice(0, 1).map((event) => `<button class="calendar-entry-event" data-open-project="${event.project_id || ''}" type="button">${escapeHTML(event.title)}</button>`).join('')}${dayProjects.slice(0, 2).map((project) => `<button class="calendar-entry-${project.status}" data-open-project="${project.id}" type="button">${escapeHTML(project.title)}</button>`).join('')}</div>`);
    }
    const grid = $('#calendar-grid');
    grid.innerHTML = weekdays + days.join('');
    bindProjectButtons(grid);
    const calendarFeed = [
      ...state.events.filter((event) => event.status !== 'cancelled'),
      ...state.projects.filter((project) => ['scheduled', 'released', 'archived'].includes(project.status) && project.release_at).map((project) => ({ title: project.title, status: project.status, starts_at: project.release_at })),
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
    state.user = user;
    syncOwnerUI();
    if (isOwner()) loadInviteArtists();
    $('#sidebar-email').textContent = user.email || '';
    $('#auth-screen').hidden = true;
    $('#terminal-shell').hidden = false;
    try {
      await loadAllData();
      const query = new URLSearchParams(location.search);
      const requested = query.get('section');
      const requestedProject = query.get('project');
      if (requested === 'track' && requestedProject && state.projects.some((project) => project.id === requestedProject)) await openProjectEditor(requestedProject, 'idea', 'projects');
      else goView(VIEW_TITLES[requested] && requested !== 'track' && (requested !== 'invites' || isOwner()) ? requested : 'dashboard');
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
      if (action === 'task') openTaskEditor();
      if (action === 'event') openEventEditor();
    });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.dashboard-start-wrap')) closeDashboardStart();
    });
    $('#dashboard-calendar-prev').addEventListener('click', () => { state.dashboardDate.setMonth(state.dashboardDate.getMonth() - 1); renderDashboardCalendar(); });
    $('#dashboard-calendar-next').addEventListener('click', () => { state.dashboardDate.setMonth(state.dashboardDate.getMonth() + 1); renderDashboardCalendar(); });
    $('#dashboard-search').addEventListener('input', (event) => { state.dashboardSearch = event.currentTarget.value; renderDashboardPipeline(); renderDashboardFiles(); renderDashboardSearchResults(); });
    $('#dashboard-search').addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.currentTarget.value = ''; state.dashboardSearch = ''; renderDashboard(); } });
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
