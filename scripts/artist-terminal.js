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
  // Задачи создаются вместе с релизом и привязаны к этапам по названию.
  // Переименовать и удалить их нельзя — иначе связь рассыплется.
  const STAGE_TASKS = [
    { title: 'Подтвердить права на бит', stage: 'Получение прав', needs: [] },
    { title: 'Записать вокал', stage: 'Запись', needs: [] },
    { title: 'Сделать обложку', stage: 'Сведение и обложка', needs: [] },
    { title: 'Свести', stage: 'Сведение и обложка', needs: ['Записать вокал'] },
    { title: 'Загрузить дистрибьютору', stage: 'Дистрибуция и питч', needs: ['Свести', 'Сделать обложку', 'Подтвердить права на бит'] },
    { title: 'Отправить питч на площадки', stage: 'Дистрибуция и питч', needs: ['Загрузить дистрибьютору'] },
    { title: 'Тизер 1', stage: 'Пресейв и тизеры', needs: ['Загрузить дистрибьютору'] },
    { title: 'Тизер 2', stage: 'Пресейв и тизеры', needs: ['Тизер 1'] },
    { title: 'Выложить во все площадки', stage: 'День Х — во все площадки', needs: ['Загрузить дистрибьютору'] },
  ];
  const DEFAULT_PROJECT_TASKS = STAGE_TASKS.map((task) => task.title);
  const stageTaskByTitle = (title) => STAGE_TASKS.filter((task) => task.title === title)[0] || null;
  const isAutoTask = (task) => !!(task && stageTaskByTitle(task.title));

  // Задача заблокирована, пока не закрыты её предшественники в том же релизе.
  function taskBlockers(task) {
    const spec = stageTaskByTitle(task && task.title);
    if (!spec || !spec.needs.length) return [];
    return spec.needs.filter((needTitle) => state.tasks.some((row) => row.project_id === task.project_id
      && row.title === needTitle && !row.is_done));
  }
  // Статус трека больше не выбирают руками — он следует за закрытыми задачами.
  // Права закрыты или ничего — «Запланирован». Вокал записан — «В работе».
  // Тронута дистрибуция или тизеры — «Продвижение». День Х закрыт — «Готово»:
  // релиз вышел, даже если тизер остался неотмеченным.
  const PROJECT_PHASE = { planned: 'Запланирован', working: 'В работе', promo: 'Продвижение', done: 'Готово' };
  const PROMO_STAGES = ['Дистрибуция и питч', 'Пресейв и тизеры', 'День Х — во все площадки'];
  function projectPhase(project) {
    if (!project) return 'planned';
    const closed = (title) => (state.tasks || []).some((task) => task.project_id === project.id
      && task.title === title && task.is_done);
    if (closed('Выложить во все площадки') || STAGE_TASKS.every((task) => closed(task.title))) return 'done';
    if (STAGE_TASKS.some((task) => PROMO_STAGES.includes(task.stage) && closed(task.title))) return 'promo';
    if (closed('Записать вокал')) return 'working';
    return 'planned';
  }

  // В базе статус остаётся — по нему работают фильтры календаря. Но теперь
  // он подтягивается за фазой и датой сам, а не выбирается в селекте.
  async function syncProjectStatus(project) {
    if (!project || project.status === 'archived') return;
    const phase = projectPhase(project);
    const dayPassed = project.release_at && dayStart(project.release_at).getTime() <= dayStart(new Date()).getTime();
    const next = (phase === 'done' || dayPassed) ? 'released' : (project.release_at ? 'scheduled' : 'idea');
    if (project.status === next) return;
    const { error } = await db.from('artist_projects').update({ status: next })
      .eq('id', project.id).eq('artist_id', state.artist.id);
    if (error) return console.warn('[artist-terminal] syncProjectStatus:', error);
    project.status = next;
    state.projects = state.projects.map((row) => (row.id === project.id ? { ...row, status: next } : row));
  }
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
    secretaryTab: 'now',
    secretaryFilter: 'all',
    secretaryProjectFilter: 'all',
    secretaryPrefs: null,
    stages: [],
    secretaryEvents: [],
    secretaryFailures: [],
    secretaryLoaded: false,
    calendarDate: new Date(),
    dashboardDate: new Date(),
    dashboardProjectId: '',
    dashboardTaskFilter: 'all', // какие задачи показывает список на дашборде: all / overdue / blocked / undated
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
  let lyricsBeat = null; // { audio, beatId } — бит, включённый в шапке «Текст»; живёт между перерисовками экрана трека

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

  function setPending(element, pending) {
    if (!element) return;
    element.classList.toggle('is-pending', !!pending);
    if ('disabled' in element) element.disabled = !!pending;
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

  // Если в шторке что-то напечатали и не сохранили, закрытие спрашивает.
  let drawerDirty = false;
  const markDrawerDirty = () => { drawerDirty = true; };

  function openDrawer(code, title, content) {
    drawerDirty = false;
    $('#drawer-code').textContent = code;
    $('#drawer-title').textContent = title;
    $('#drawer-body').innerHTML = content;
    $('#drawer').hidden = false;
    $('#drawer-backdrop').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer(force = false) {
    if (drawerDirty && !force && !confirm('Изменения не сохранены. Закрыть и потерять их?')) return;
    drawerDirty = false;
    $('#drawer').hidden = true;
    $('#drawer-backdrop').hidden = true;
    $('#drawer-body').innerHTML = '';
    document.body.style.overflow = '';
  }

  async function goView(view) {
    if (!VIEW_TITLES[view]) return;
    const currentView = $('.view.is-active')?.dataset.viewPanel;
    if (currentView === 'track' && view !== 'track') stopLyricsBeat();
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
    if (view === 'secretary') renderSecretary();
  }

  // --- Секретарь -------------------------------------------------------------
  const SECRETARY_TABS = [
    ['now', 'Требует внимания'],
    ['notify', 'Уведомления'],
    ['log', 'История всего'],
  ];
  // Матрица «событие × канал». timing задаёт варианты «когда» для каждого типа.
  const NOTIFY_EVENTS = [
    { type: 'release_soon', title: 'Скоро релиз', hint: 'дата стоит в календаре', timing: [['3d', 'за 3 дня'], ['1d', 'за день'], ['0d', 'в день релиза']] },
    { type: 'task_due', title: 'Пора браться за задачу', hint: 'наступил запланированный день', timing: [['default', 'в день задачи']] },
    { type: 'task_overdue', title: 'Задача просрочена', hint: 'срок прошёл, задача открыта', timing: [['daily', 'каждый день'], ['once', 'один раз']] },
    { type: 'publish_failed', title: 'Публикация не прошла', hint: 'площадка вернула ошибку', timing: [['default', 'сразу']] },
    { type: 'tasks_unplanned', title: 'Задачи без сроков', hint: 'висят без даты и тонут', timing: [['weekly', 'раз в неделю'], ['daily', 'каждый день']] },
  ];
  const EVENT_KIND_LABEL = {
    release: 'релиз', task: 'задача', publication: 'публикация',
    beat: 'бит', lyrics: 'текст', file: 'файл', platform: 'площадка', system: 'система',
  };
  const dayStart = (date) => { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; };
  const daysUntil = (value) => Math.round((dayStart(value) - dayStart(new Date())) / 86400000);

  // «Требует внимания» считается из уже существующих данных: отдельных
  // напоминаний в базе нет, поэтому ничего не рассинхронизируется.
  function secretaryAttention() {
    const items = [];
    (state.tasks || []).filter((task) => !task.is_done && task.due_at).forEach((task) => {
      const left = daysUntil(task.due_at);
      if (left < 0) {
        items.push({ key: `overdue:${task.id}`, level: 'crit', title: 'Задача просрочена', detail: task.title, when: `${Math.abs(left)} ${plural(Math.abs(left), 'день', 'дня', 'дней')}`, action: 'К задаче', view: 'tasks', sort: left });
      } else if (left === 0) {
        items.push({ key: `due:${task.id}`, level: 'ok', title: 'Пора браться', detail: task.title, when: 'сегодня', action: 'Начать', view: 'tasks', sort: 0.5 });
      } else if (left <= 3) {
        items.push({ key: `soon:${task.id}:${left}`, level: 'soon', title: 'Срок задачи близко', detail: task.title, when: `через ${left} ${plural(left, 'день', 'дня', 'дней')}`, action: 'К задаче', view: 'tasks', sort: left });
      }
    });
    (state.projects || []).filter((project) => project.release_at && project.status === 'scheduled').forEach((project) => {
      const left = daysUntil(project.release_at);
      if (left >= 0 && left <= 7) {
        items.push({ key: `release:${project.id}:${left}`, level: left <= 2 ? 'soon' : 'ok', title: 'Скоро релиз', detail: project.title || 'Без названия', when: left === 0 ? 'сегодня' : `через ${left} ${plural(left, 'день', 'дня', 'дней')}`, action: 'К релизу', view: 'track', id: project.id, sort: left });
      }
    });
    (state.secretaryFailures || []).forEach((row) => {
      items.push({ key: `fail:${row.platform}:${row.created_at}`, level: 'crit', title: `${SOCIAL_PLATFORM_LABEL[row.platform] || row.platform}: публикация не прошла`, detail: socialErrorHint(row.platform, row.error_message || 'без деталей'), when: formatDate(row.created_at), action: 'К автопостингу', view: 'autopost', sort: -100 });
    });
    const hidden = dismissedKeys();
    return items.filter((item) => !hidden.has(item.key)).sort((a, b) => a.sort - b.sort);
  }

  // Цифра на вкладке — индикатор непросмотренного, а не просто счётчик:
  // ключи увиденных пунктов запоминаем локально.
  const SEEN_KEY = 'inmise-secretary-seen';
  const seenKeys = () => {
    try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); }
  };
  const markSeen = (items) => {
    const seen = seenKeys();
    items.forEach((item) => seen.add(item.key));
    // Держим список коротким: старые ключи исчезают вместе с поводом.
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen).slice(-200))); } catch { /* приватный режим */ }
  };
  const DISMISSED_KEY = 'inmise-secretary-dismissed';
  const dismissedKeys = () => {
    try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]')); } catch { return new Set(); }
  };
  const dismissKey = (key) => {
    const set = dismissedKeys();
    set.add(key);
    try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(set).slice(-300))); } catch { /* приватный режим */ }
  };

  const unseenCount = (items) => {
    const seen = seenKeys();
    return items.filter((item) => !seen.has(item.key)).length;
  };

  function secretaryAttentionMarkup() {
    const items = secretaryAttention();
    if (!items.length) {
      return `<section class="panel"><div class="secretary-empty"><b>Всё под контролем</b>Просроченных задач нет, сбоев публикаций нет, ближайшие релизы не горят.</div></section>`;
    }
    return `<section class="panel">
      <header class="panel-header"><div><span class="eyebrow">Сегодня</span><h3>Что нужно сделать</h3></div><span class="secretary-count-note">${items.length} ${plural(items.length, 'пункт', 'пункта', 'пунктов')}</span></header>
      ${items.map((item) => `<div class="secretary-item is-${item.level}" data-item-key="${escapeHTML(item.key)}">
        <span class="secretary-item-bar" aria-hidden="true"></span>
        <div><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.detail || '')}</small></div>
        <span class="secretary-item-when">${escapeHTML(item.when)}</span>
        <button class="secretary-item-go" type="button" data-secretary-go="${item.view}" ${item.id ? `data-secretary-id="${item.id}"` : ''}>${item.action}</button>
        <button class="secretary-item-done" type="button" data-item-dismiss="${escapeHTML(item.key)}" title="Убрать из списка" aria-label="Убрать «${escapeHTML(item.title)}» из списка">✓</button>
      </div>`).join('')}
    </section>`;
  }

  function secretaryLogMarkup() {
    const filter = state.secretaryFilter || 'all';
    const projectFilter = state.secretaryProjectFilter || 'all';
    const all = state.secretaryEvents || [];
    const rows = all
      .filter((row) => filter === 'all' || row.kind === filter)
      .filter((row) => projectFilter === 'all'
        || (projectFilter === 'none' ? !row.project_id : row.project_id === projectFilter));

    const kinds = ['all', ...Array.from(new Set(all.map((row) => row.kind)))];
    const filters = kinds.map((kind) => `<button type="button" data-secretary-filter="${kind}" aria-pressed="${filter === kind}">${kind === 'all' ? 'Всё' : EVENT_KIND_LABEL[kind] || kind}</button>`).join('');

    // Фильтр по релизам показываем только здесь — на других вкладках он не нужен.
    const usedProjects = Array.from(new Set(all.map((row) => row.project_id).filter(Boolean)));
    const projectOptions = ['<option value="all">Все релизы</option>',
      ...usedProjects.map((pid) => `<option value="${pid}" ${projectFilter === pid ? 'selected' : ''}>${escapeHTML(projectById(pid)?.title || 'Удалённый релиз')}</option>`),
      `<option value="none" ${projectFilter === 'none' ? 'selected' : ''}>Без релиза</option>`].join('');

    const body = rows.length
      ? `<div class="secretary-log-wrap"><table class="secretary-log"><tbody>${rows.map((row) => {
          // Строку про релиз показываем только там, где она добавляет смысл.
          // У события про сам релиз он и есть подлежащее, у бита или площадки
          // релиза не бывает вовсе — писать «не связано» было бы абсурдом.
          const scoped = ['task', 'publication', 'file', 'lyrics'].includes(row.kind);
          const project = row.project_id ? projectById(row.project_id) : null;
          const release = !scoped ? ''
            : row.project_id
              ? `<em class="secretary-log-release">${escapeHTML(project?.title || 'Удалённый релиз')}</em>`
              : '<em class="secretary-log-release is-none">не связано с релизом</em>';
          return `<tr>
            <td class="secretary-log-ts">${formatDate(row.created_at)}</td>
            <td><span class="secretary-log-kind">${EVENT_KIND_LABEL[row.kind] || row.kind}</span></td>
            <td class="secretary-log-obj"><strong>${escapeHTML(row.title)}</strong>${row.detail ? `<small>${escapeHTML(row.detail)}</small>` : ''}${release}</td>
          </tr>`;
        }).join('')}</tbody></table></div>`
      : '<p class="track-workspace-empty">Под эти фильтры событий нет.</p>';

    return `<section class="panel">
      <header class="panel-header">
        <div><span class="eyebrow">Журнал</span><h3>История всего</h3></div>
        <div class="secretary-log-filters">
          <div class="secretary-filters">${filters}</div>
          <label class="secretary-release-filter"><span>Релиз</span><select data-secretary-project>${projectOptions}</select></label>
        </div>
      </header>
      ${body}
    </section>`;
  }

  function secretaryNotifyMarkup() {
    const channels = state.secretaryChannels || [];
    const rules = state.secretaryRules || [];
    const mail = channels.find((row) => row.kind === 'email');
    const tg = channels.find((row) => row.kind === 'telegram');
    const rule = (type, kind) => rules.find((row) => row.event_type === type && row.channel_kind === kind) || { enabled: false, timing: 'default' };
    const sendHour = state.secretaryPrefs?.send_hour ?? 10;

    const channelCard = (kind, icon, name, row, hint) => `<div class="secretary-chan secretary-chan-${kind} ${row?.verified ? 'is-on' : ''}">
      <span class="secretary-chan-ic" aria-hidden="true">${icon}</span>
      <b>${name}</b>
      <small>${row?.verified ? `${escapeHTML(row.address)} · подключён` : hint}</small>
      <div class="secretary-chan-actions">
        <button class="text-button" type="button" data-notify-setup="${kind}">${row?.verified ? 'изменить' : 'подключить'}</button>
        ${row?.verified ? `<button class="text-button" type="button" data-notify-test="${kind}">Проверить</button>` : ''}
      </div>
    </div>`;

    return `<section class="panel secretary-notify">
      <div class="secretary-zone secretary-zone-channels">
        <div class="secretary-zone-head" data-step="1"><span class="eyebrow">Куда присылать</span><h3>Каналы</h3></div>
        <div class="secretary-chans">
          ${channelCard('email', '@', 'Почта', mail, 'письма о задачах и релизах')}
          ${channelCard('telegram', 'TG', 'Telegram', tg, 'в личку через вашего бота из автопостинга')}
        </div>
      </div>
      <div class="secretary-zone">
        <div class="secretary-zone-head" data-step="2"><span class="eyebrow">О чём предупреждать</span><h3>Правила</h3></div>
      <div class="secretary-log-wrap">
        <table class="secretary-matrix">
          <thead><tr><th>Событие</th><th class="secretary-mx-ch">Почта</th><th class="secretary-mx-ch">Telegram</th><th>Когда</th></tr></thead>
          <tbody>
            ${NOTIFY_EVENTS.map((event) => {
              const mailRule = rule(event.type, 'email');
              const tgRule = rule(event.type, 'telegram');
              const timing = mailRule.enabled ? mailRule.timing : tgRule.timing;
              const options = event.timing.map(([value, label]) => `<option value="${value}" ${timing === value ? 'selected' : ''}>${label}</option>`).join('');
              return `<tr>
                <td class="secretary-mx-ev"><strong>${event.title}</strong><small>${event.hint}</small></td>
                <td class="secretary-mx-ch"><input type="checkbox" data-notify-rule="${event.type}:email" ${mailRule.enabled ? 'checked' : ''} ${mail?.verified ? '' : 'disabled'} aria-label="${event.title} на почту"></td>
                <td class="secretary-mx-ch"><input type="checkbox" data-notify-rule="${event.type}:telegram" ${tgRule.enabled ? 'checked' : ''} ${tg?.verified ? '' : 'disabled'} aria-label="${event.title} в Telegram"></td>
                <td>${event.timing.length > 1 ? `<select data-notify-timing="${event.type}" aria-label="Когда предупреждать: ${event.title}">${options}</select>` : `<span class="secretary-mx-fixed">${event.timing[0][1]}</span>`}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="secretary-hour">
        <span>Ежедневные напоминания приходят в</span>
        <select data-notify-hour aria-label="Час ежедневных напоминаний">
          ${Array.from({ length: 24 }, (_, hour) => `<option value="${hour}" ${hour === sendHour ? 'selected' : ''}>${String(hour).padStart(2, '0')}:00</option>`).join('')}
        </select>
        <span>по Москве. О сбоях публикации сообщаем сразу, не дожидаясь этого часа.</span>
      </div>
      ${mail?.verified || tg?.verified ? '' : '<p class="secretary-note">Сначала подключите канал — до этого галочки недоступны.</p>'}
      </div>
    </section>`;
  }

  function openNotifyEmailDrawer() {
    const current = (state.secretaryChannels || []).find((row) => row.kind === 'email');
    openDrawer('СЕКРЕТАРЬ / ПОЧТА', 'Адрес для писем', `<form id="notify-email-form">
      <p class="drawer-note">Сюда будут приходить напоминания о задачах и релизах. Проверьте, что письма не уходят в спам — первое письмо можно отправить кнопкой «Проверить».</p>
      <label class="field"><span>E-mail</span><input name="address" type="email" value="${escapeHTML(current?.address || state.user?.email || '')}" required></label>
      <div class="drawer-actions"><span></span><button class="button button-primary" type="submit">Сохранить</button></div>
    </form>`);
    $('#notify-email-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = $('button[type="submit"]', event.currentTarget);
      const address = $('[name="address"]', event.currentTarget).value.trim();
      setBusy(button, true, 'Сохраняем…');
      const { data, error } = await db.functions.invoke('secretary-notify', { body: { action: 'save_email', address } });
      setBusy(button, false);
      if (error || data?.error) return toast(`Не сохранилось: ${await edgeErrorDetail(error, data)}`, 'error');
      closeDrawer();
      toast('Почта подключена.');
      state.secretaryLoaded = false;
      renderSecretary();
    });
  }

  // Личный chat_id забираем из истории бота: артист пишет ему «Старт»,
  // мы читаем последнее личное сообщение — вебхук не нужен.
  async function linkNotifyTelegram() {
    openDrawer('СЕКРЕТАРЬ / TELEGRAM', 'Уведомления в Telegram', `<div>
      <p class="drawer-note">Новый бот не нужен — используем того же, что подключён в автопостинге.</p>
      <ol class="autopost-help-steps">
        <li>Откройте своего бота в Telegram (того, чей токен вы вставляли в автопостинге).</li>
        <li>Напишите ему <strong>«Старт»</strong> — любое сообщение в личку.</li>
        <li>Вернитесь сюда и нажмите кнопку ниже.</li>
      </ol>
      <div class="drawer-actions"><span></span><button class="button button-primary" id="notify-tg-check" type="button">Я написал боту</button></div>
    </div>`);
    $('#notify-tg-check').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      setBusy(button, true, 'Ищем сообщение…');
      const { data, error } = await db.functions.invoke('secretary-notify', { body: { action: 'link_telegram' } });
      setBusy(button, false);
      if (error || data?.error) return toast(`Не получилось: ${await edgeErrorDetail(error, data)}`, 'error');
      closeDrawer();
      toast(`Telegram подключён: ${data.address || ''}`);
      state.secretaryLoaded = false;
      renderSecretary();
    });
  }

  async function saveNotifyRule(type, kind, enabled, timing) {
    const rules = state.secretaryRules || [];
    const existing = rules.find((row) => row.event_type === type && row.channel_kind === kind);
    const payload = {
      artist_id: state.artist.id,
      event_type: type,
      channel_kind: kind,
      enabled,
      timing: timing || existing?.timing || 'default',
    };
    const { error } = await db.from('notification_rules').upsert(payload, { onConflict: 'artist_id,event_type,channel_kind' });
    if (error) return toast(error.message || 'Не удалось сохранить настройку.', 'error');
    if (existing) Object.assign(existing, payload);
    else rules.push(payload);
    state.secretaryRules = rules;
  }

  // Срочное видно в сайдбаре, чтобы не приходилось открывать раздел.
  function updateSecretaryBadge() {
    const badge = $('#nav-secretary-count');
    if (!badge) return;
    const unseen = unseenCount(secretaryAttention());
    badge.textContent = unseen;
    badge.hidden = !unseen;
    badge.classList.toggle('is-alert', !!unseen);
  }

  async function renderSecretary() {
    const tabsHost = $('#secretary-tabs');
    const panel = $('#secretary-panel');
    if (!tabsHost || !panel) return;
    const active = state.secretaryTab || 'now';

    if (!state.secretaryLoaded) {
      panel.innerHTML = '<p class="track-workspace-empty">Загружаем…</p>';
      const [events, failures, channels, rules, prefs] = await Promise.all([
        safeQuery(db.from('artist_events').select('*').eq('artist_id', state.artist.id).order('created_at', { ascending: false }).limit(200)),
        safeQuery(db.from('social_post_targets').select('platform, status, error_message, created_at').eq('artist_id', state.artist.id).eq('status', 'failed').order('created_at', { ascending: false }).limit(10)),
        safeQuery(db.from('notification_channels').select('*').eq('artist_id', state.artist.id)),
        safeQuery(db.from('notification_rules').select('*').eq('artist_id', state.artist.id)),
        safeQuery(db.from('notification_prefs').select('*').eq('artist_id', state.artist.id)),
      ]);
      state.secretaryEvents = events;
      state.secretaryFailures = failures;
      state.secretaryChannels = channels;
      state.secretaryRules = rules;
      state.secretaryPrefs = prefs[0] || null;
      state.secretaryLoaded = true;
    }

    const attention = secretaryAttention();
    const counts = { now: unseenCount(attention), log: (state.secretaryEvents || []).length };
    tabsHost.innerHTML = SECRETARY_TABS.map(([key, label]) => `<button type="button" role="tab" aria-selected="${key === active}" data-secretary-tab="${key}">${label}${counts[key] ? `<span class="secretary-tab-count ${key === 'now' ? 'is-alert' : ''}">${counts[key]}</span>` : ''}</button>`).join('');
    panel.innerHTML = active === 'log' ? secretaryLogMarkup()
      : active === 'notify' ? secretaryNotifyMarkup()
      : secretaryAttentionMarkup();

    // Открыли вкладку — значит просмотрели: гасим цифру и здесь, и в сайдбаре.
    if (active === 'now' && attention.length) {
      markSeen(attention);
      $$('.secretary-tab-count.is-alert', tabsHost).forEach((el) => el.remove());
      updateSecretaryBadge();
    renderUnplannedNotice();
    }

    $$('[data-secretary-tab]', tabsHost).forEach((button) => button.addEventListener('click', () => {
      state.secretaryTab = button.dataset.secretaryTab;
      renderSecretary();
    }));
    $$('[data-secretary-filter]', panel).forEach((button) => button.addEventListener('click', () => {
      state.secretaryFilter = button.dataset.secretaryFilter;
      renderSecretary();
    }));
    $('[data-secretary-project]', panel)?.addEventListener('change', (event) => {
      state.secretaryProjectFilter = event.target.value;
      renderSecretary();
    });
    $$('[data-notify-rule]', panel).forEach((box) => box.addEventListener('change', async () => {
      const [type, kind] = box.dataset.notifyRule.split(':');
      setPending(box, true);
      await saveNotifyRule(type, kind, box.checked);
      setPending(box, false);
    }));
    $$('[data-notify-timing]', panel).forEach((select) => select.addEventListener('change', () => {
      const type = select.dataset.notifyTiming;
      // «Когда» одно для события, поэтому пишем его в оба канала.
      ['email', 'telegram'].forEach((kind) => {
        const existing = (state.secretaryRules || []).find((row) => row.event_type === type && row.channel_kind === kind);
        if (existing) saveNotifyRule(type, kind, existing.enabled, select.value);
      });
    }));
    $('[data-notify-hour]', panel)?.addEventListener('change', async (event) => {
      const hour = Number(event.target.value);
      const { error } = await db.from('notification_prefs').upsert({
        artist_id: state.artist.id, send_hour: hour, timezone: 'Europe/Moscow', updated_at: new Date().toISOString(),
      }, { onConflict: 'artist_id' });
      if (error) return toast(error.message || 'Не удалось сохранить время.', 'error');
      state.secretaryPrefs = { ...(state.secretaryPrefs || {}), send_hour: hour };
      toast(`Напоминания будут приходить в ${String(hour).padStart(2, '0')}:00.`);
    });
    $$('[data-notify-setup]', panel).forEach((button) => button.addEventListener('click', () => {
      if (button.dataset.notifySetup === 'email') openNotifyEmailDrawer();
      else linkNotifyTelegram();
    }));
    $$('[data-notify-test]', panel).forEach((button) => button.addEventListener('click', async () => {
      setBusy(button, true, 'Отправляем…');
      const { data, error } = await db.functions.invoke('secretary-notify', { body: { action: 'test', kind: button.dataset.notifyTest } });
      setBusy(button, false);
      if (error || data?.error) return toast(`Не отправилось: ${await edgeErrorDetail(error, data)}`, 'error');
      toast('Проверочное сообщение отправлено.');
    }));
    $$('[data-item-dismiss]', panel).forEach((button) => button.addEventListener('click', () => {
      const row = button.closest('.secretary-item');
      dismissKey(button.dataset.itemDismiss);
      updateSecretaryBadge();
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const finish = () => {
        const list = row.parentElement;
        row.remove();
        // Список опустел — показываем «всё под контролем» вместо пустой панели.
        if (!$$('.secretary-item', list).length) renderSecretary();
      };
      if (reduced) return finish();
      row.classList.add('is-dismissing');
      window.setTimeout(finish, 460);
    }));
    $$('[data-secretary-go]', panel).forEach((button) => button.addEventListener('click', async () => {
      const view = button.dataset.secretaryGo;
      const id = button.dataset.secretaryId;
      if (view === 'track' && id) { await openProjectEditor(id, 'idea', 'secretary'); return; }
      goView(view);
    }));
  }

  function withTimeout(promise, timeoutMs, message) {
    let timer = 0;
    const timeout = new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return Promise.race([Promise.resolve(promise), timeout]).finally(() => window.clearTimeout(timer));
  }

  const wait = (ms) => new Promise((resolve) => { window.setTimeout(resolve, ms); });

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

  const ARTIST_COLUMNS = 'id,name,description,image_url,matrix_text,tg_url,vk_url,inst_url,owner_user_id';
  const ARTIST_NOT_READY = 'Кабинет не догрузился. Обновите страницу.';

  function bootError(code, message, cause = null) {
    const error = new Error(message);
    error.bootCode = code;
    if (cause) error.cause = cause;
    return error;
  }

  // Этот запрос держит всю загрузку: остальные идут через allSettled и падают
  // поодиночке, а здесь одна сетевая икота хоронила весь кабинет. Поэтому связь
  // пробуем трижды, а вот пустой ответ повторять бессмысленно — карточки просто
  // нет, и это другой разговор с пользователем.
  async function loadArtist() {
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const rows = await safeQuery(db.from('artists').select(ARTIST_COLUMNS).eq('owner_user_id', state.user.id).limit(1));
        state.artist = rows[0] || null;
        if (!state.artist) throw bootError('artist-missing', 'К этому аккаунту пока не привязана карточка артиста.');
        return;
      } catch (error) {
        if (error.bootCode === 'artist-missing') throw error;
        lastError = error;
        console.warn(`[artist-terminal] artist load attempt ${attempt}:`, error);
        if (attempt < 3) await wait(700 * attempt);
      }
    }
    throw bootError('artist-unreachable', 'Не удалось получить данные кабинета — похоже, оборвалась связь с базой.', lastError);
  }

  async function loadAllData() {
    setSystemStatus('Синхронизация…');
    await loadArtist();
    const artistId = state.artist.id;
    const results = await Promise.allSettled([
      safeQuery(db.from('beats').select('id,title,seller,seller_link,price,bpm,audio_url,storage_path,publication_status,public_preview_path,private_master_path,cover_url,currency,published_at,created_at,updated_at').eq('artist_id', state.artist.id).order('created_at', { ascending: false })),
      safeQuery(db.from('artist_projects').select('*').eq('artist_id', artistId).order('updated_at', { ascending: false })),
      safeQuery(db.from('lyrics_documents').select('*').eq('artist_id', artistId).order('updated_at', { ascending: false })),
      safeQuery(db.from('artist_private_links').select('*').eq('artist_id', artistId).order('sort_order').order('created_at')),
      safeQuery(db.from('release_events').select('*').eq('artist_id', artistId).order('starts_at')),
      safeQuery(db.from('project_files').select('*').eq('artist_id', artistId).order('created_at', { ascending: false })),
      safeQuery(db.from('project_tasks').select('*').eq('artist_id', artistId).order('is_done').order('sort_order').order('due_at')),
      safeQuery(db.from('release_stages').select('*').eq('artist_id', artistId).order('sort_order')),
    ]);
    const keys = ['beats', 'projects', 'lyrics', 'links', 'events', 'files', 'tasks', 'stages'];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') state[keys[index]] = result.value;
      else {
        state[keys[index]] = [];
        console.warn(`[artist-terminal] ${keys[index]}:`, result.reason);
      }
    });
    await reconcileReleased();
    for (const project of state.projects) await syncProjectStatus(project);
    renderEverything();
    setSystemStatus('Система онлайн');
  }

  // День выхода наступил, а релиз оставался «Запланирован»: путь горел
  // красным бесконечно, и в «пропущено» попадал сам день Х. Раз статус
  // больше не выставляется руками, закрывать его должна система.
  async function reconcileReleased() {
    const today = dayStart(new Date()).getTime();
    const due = state.projects.filter((project) => project.status === 'scheduled'
      && project.release_at && dayStart(project.release_at).getTime() <= today);
    if (!due.length) return;
    const ids = due.map((project) => project.id);
    const { error } = await db.from('artist_projects').update({ status: 'released' })
      .in('id', ids).eq('artist_id', state.artist.id);
    if (error) return console.warn('[artist-terminal] reconcileReleased:', error);
    state.projects = state.projects.map((project) => (ids.includes(project.id)
      ? { ...project, status: 'released' } : project));
    const closing = (state.stages || []).filter((stage) => stage.day_offset === 0
      && !stage.is_done && ids.includes(stage.project_id));
    if (closing.length) {
      const stageIds = closing.map((stage) => stage.id);
      const { error: stageError } = await db.from('release_stages').update({ is_done: true })
        .in('id', stageIds).eq('artist_id', state.artist.id);
      if (stageError) console.warn('[artist-terminal] reconcileReleased stages:', stageError);
      else state.stages = state.stages.map((stage) => (stageIds.includes(stage.id)
        ? { ...stage, is_done: true } : stage));
    }
    due.forEach((project) => logEvent('release', 'Релиз вышел', project.title || 'Без названия',
      { view: 'dashboard', project: project.id }));
  }

  // Свой диалог вместо системного confirm(): системный не умеет три кнопки,
  // не в стиле кабинета и блокирует вкладку. Возвращает id нажатой кнопки,
  // null — если закрыли мимо или Esc.
  function askDialog({ title, text = '', actions }) {
    return new Promise((resolve) => {
      $$('.ask-backdrop').forEach((node) => node.remove());
      const wrap = document.createElement('div');
      wrap.className = 'ask-backdrop';
      wrap.innerHTML = '<div class="ask-box" role="dialog" aria-modal="true" aria-labelledby="ask-title">'
        + '<strong id="ask-title">' + escapeHTML(title) + '</strong>'
        + (text ? '<p>' + escapeHTML(text).replace(/\n/g, '<br>') + '</p>' : '')
        // Все варианты — кнопки одного размера, иначе «Своя дата» читается
        // как второсортный выбор. Текстом — только отказ (quiet).
        + '<div class="ask-actions">' + actions.map((action) => '<button type="button" class="'
          + (action.primary ? 'button button-primary' : (action.danger ? 'button button-danger' : (action.quiet ? 'text-button' : 'button')))
          + '" data-ask="' + escapeHTML(action.id) + '">' + escapeHTML(action.label) + '</button>').join('')
        + '</div></div>';
      const done = (id) => { wrap.remove(); document.removeEventListener('keydown', onKey); resolve(id); };
      const onKey = (event) => { if (event.key === 'Escape') done(null); };
      document.addEventListener('keydown', onKey);
      wrap.addEventListener('click', (event) => { if (event.target === wrap) done(null); });
      $$('[data-ask]', wrap).forEach((button) => button.addEventListener('click', () => done(button.dataset.ask)));
      document.body.appendChild(wrap);
      const focus = $('.button-primary', wrap) || $('[data-ask]', wrap);
      if (focus) focus.focus();
    });
  }

  // Простой «да / нет» на базе askDialog — замена системному confirm().
  async function askYesNo(title, text = '', yesLabel = 'Да', danger = false) {
    const answer = await askDialog({ title, text, actions: [
      { id: 'no', label: 'Отмена', quiet: true },
      { id: 'yes', label: yesLabel, primary: !danger, danger },
    ] });
    return answer === 'yes';
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
    updateSecretaryBadge();
  }

  // Классическое колесо: спокойные насыщенные цвета через один, белые
  // разделители, тёмный обод и ступица. Без VHS-эффектов — они были не к месту.
  const WHEEL_COLORS = ['#c5473f', '#2f8a4c', '#d9a441', '#3b6fb6', '#8a4fb0', '#d8742c', '#2a9d8f', '#b83a7a'];
  let wheelSpinning = false;

  function drawWheel(tasks) {
    const canvas = $('#wheel-canvas');
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const center = size / 2;
    const rim = 10;
    const radius = size / 2 - rim;
    const sliceAngle = (2 * Math.PI) / tasks.length;
    // Соседние сегменты не должны совпадать по цвету, в том числе последний с первым.
    const palette = tasks.length % WHEEL_COLORS.length === 1 && tasks.length > 1 ? WHEEL_COLORS.slice(0, -1) : WHEEL_COLORS;
    ctx.clearRect(0, 0, size, size);
    tasks.forEach((task, index) => {
      const start = index * sliceAngle;
      const end = start + sliceAngle;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = palette[index % palette.length];
      ctx.fill();
      ctx.strokeStyle = '#f5f2e8';
      ctx.lineWidth = 3;
      ctx.stroke();
    });
    // Подписи — после всех сегментов, чтобы разделители их не перечёркивали.
    tasks.forEach((task, index) => {
      const start = index * sliceAngle;
      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(start + sliceAngle / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.font = '500 17px "IBM Plex Mono", monospace';
      const label = task.title.length > 22 ? task.title.slice(0, 21) + '…' : task.title;
      ctx.shadowColor = 'rgba(0,0,0,.45)';
      ctx.shadowBlur = 4;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, radius - 26, 0);
      ctx.restore();
    });
    // Обод и ступица.
    ctx.beginPath();
    ctx.arc(center, center, radius + rim / 2, 0, 2 * Math.PI);
    ctx.strokeStyle = '#1c1f1b';
    ctx.lineWidth = rim;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(center, center, radius + rim / 2 - 1, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(center, center, size * 0.065, 0, 2 * Math.PI);
    ctx.fillStyle = '#f5f2e8';
    ctx.fill();
    ctx.strokeStyle = '#1c1f1b';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(center, center, size * 0.02, 0, 2 * Math.PI);
    ctx.fillStyle = '#1c1f1b';
    ctx.fill();
  }

  function openWheel() {
    // Колесо не должно предлагать то, за что сейчас физически не взяться:
    // питч без загрузки к дистрибьютору сделать нельзя.
    const pendingTasks = state.tasks.filter((task) => !task.is_done && !taskBlockers(task).length);
    if (!pendingTasks.length) {
      const blocked = state.tasks.filter((task) => !task.is_done).length;
      return toast(blocked
        ? 'Все открытые задачи ждут предыдущих. Закройте их — и колесо оживёт.'
        : 'Нет незавершённых задач для колеса.', 'error');
    }
    state.wheelTasks = pendingTasks;
    wheelSpinning = false; // окно могли закрыть посреди вращения — иначе флаг залипает
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
    const duration = 4500;
    canvas.style.transition = 'transform ' + duration + 'ms cubic-bezier(0.12, 0.67, 0.1, 1)';
    canvas.style.transform = `rotate(${targetRotation}deg)`;
    // Результат показываем по концу анимации, но transitionend в некоторых
    // браузерах не приходит — страхуемся таймером; что сработает первым.
    let finished = false;
    const onEnd = () => {
      if (finished) return;
      finished = true;
      canvas.removeEventListener('transitionend', onEnd);
      wheelSpinning = false;
      const winner = tasks[winnerIndex];
      $('#wheel-result-title').textContent = winner.title;
      $('#wheel-result').hidden = false;
    };
    canvas.addEventListener('transitionend', onEnd);
    setTimeout(onEnd, duration + 150);
  }

  function renderDashboard() {
    const selectedProject = selectedDashboardProject();
    const dashboardTasks = selectedProject ? state.tasks.filter((task) => task.project_id === selectedProject.id) : state.tasks;

    // Панель стоит под списком задач и подводит итог именно ему, по тому же
    // фильтру. Раньше «Готовность» считалась по выбранному релизу, а два
    // соседних числа — по всем сразу, и три числа жили по разным правилам.
    // Каждое число — ещё и фильтр: клик показывает в списке только эти
    // задачи, повторный клик возвращает всё.
    const today = dayStart(new Date()).getTime();
    const openTasks = dashboardTasks.filter((task) => !task.is_done);
    const buckets = {
      all: dashboardTasks,
      overdue: openTasks.filter((task) => task.due_at && dayStart(task.due_at).getTime() < today),
      blocked: openTasks.filter((task) => taskBlockers(task).length),
      undated: openTasks.filter((task) => !task.due_at),
    };
    if (!buckets[state.dashboardTaskFilter]) state.dashboardTaskFilter = 'all';

    $('#stat-total').textContent = String(openTasks.length).padStart(2, '0');
    $('#stat-overdue').textContent = String(buckets.overdue.length).padStart(2, '0');
    $('#stat-blocked').textContent = String(buckets.blocked.length).padStart(2, '0');
    $('#stat-undated').textContent = String(buckets.undated.length).padStart(2, '0');
    $('#stat-overdue').classList.toggle('is-alert', buckets.overdue.length > 0);
    $('#stat-blocked').classList.toggle('is-waiting', buckets.blocked.length > 0);
    $$('[data-task-filter]').forEach((button) => button.classList.toggle('is-active', button.dataset.taskFilter === state.dashboardTaskFilter));

    renderDashboardProjectSelect();
    renderDashboardCalendar();
    renderDashboardTasks(buckets[state.dashboardTaskFilter], selectedProject, state.dashboardTaskFilter);
    renderRollout();
  }

  // Шаблон роллаута: смещения в днях от дня выхода. Профессиональный план
  // считается назад от даты релиза, поэтому здесь отрицательные числа.
  const ROLLOUT_TEMPLATES = {
    single: { label: 'Сингл · 5 недель', stages: [
      { day: -35, title: 'Получение прав', repeat: 'once' },
      { day: -30, title: 'Запись', repeat: 'once' },
      { day: -25, title: 'Сведение и обложка', repeat: 'once' },
      { day: -21, title: 'Дистрибуция и питч', repeat: 'once' },
      { day: -14, title: 'Пресейв и тизеры', repeat: 'every_2_days' },
      { day: 0, title: 'День Х — во все площадки', repeat: 'once' },
    ] },
  };
  const REPEAT_LABEL = { once: 'один раз', every_2_days: 'раз в 2 дня до дня Х', weekly: 'раз в неделю' };
  const STAGE_HINTS = {
    'права и фиты': 'Договориться с фитующими и владельцем бита. До этого выпускать нечего — всё остальное упрётся в права.',
    'запись': 'Записать вокал целиком. Дальше идёт сведение, поэтому дозаписывать после этого этапа дорого.',
    'сведение и обложка': 'Мастер и обложка делаются параллельно разными людьми. Оба нужны для загрузки к дистрибьютору.',
    'дистрибуция и питч': 'Загрузка релиза дистрибьютору и питч в редакции площадок. Единственный жёсткий срок в плане: опоздаешь — дата выхода поедет физически, площадки не успеют рассмотреть.',
    'пресейв и тизеры': 'Ссылка на пресейв появляется только после дистрибуции. Тизеры выходят раз в два дня до дня Х.',
    'день х — во все площадки': 'День выхода. Он не делается, он наступает — публикации во все площадки в этот день.',
    'итоги': 'Посмотреть, что получилось: прослушивания, попадания в плейлисты, что сработало из тизеров.',
  };

  // Меньше четырёх недель — шаблон не помещается, даты расставляются руками.
  const ROLLOUT_MIN_DAYS = 28;
  const shortDate = (value) => new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const longDate = (value) => new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  // Дата без времени по местным часам. toISOString() считает по Гринвичу:
  // после полуночи по Москве «сегодня» выходило вчерашним, и новый этап
  // сразу оказывался просроченным. Строку «ГГГГ-ММ-ДД» отдаём как есть.
  const isoDate = (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : localDateKey(value));
  const addDays = (value, days) => { const d = new Date(value); d.setDate(d.getDate() + days); return d; };

  async function generateRollout(target, templateKey = 'single', button) {
    // Дата релиза могла смениться после отрисовки — замыкание держит старый
    // объект, поэтому проект всегда перечитываем из state.
    const project = projectById(target && target.id) || target;
    if (!project || !project.release_at) return toast('Сначала задайте дату релиза.', 'error');
    setBusy(button, true, 'Собираем…');
    const template = ROLLOUT_TEMPLATES[templateKey] || ROLLOUT_TEMPLATES.single;
    const pinned = (state.stages || []).filter((stage) => stage.project_id === project.id && stage.is_pinned);
    await db.from('release_stages').delete().eq('project_id', project.id)
      .eq('artist_id', state.artist.id).eq('is_pinned', false);
    // Шаблон считает назад от дня Х. Если до выхода осталось меньше, чем он
    // просит, офсеты ужимаются под остаток — иначе половина этапов легла бы
    // в прошлое и план был бы просрочен в момент создания.
    const draft = template.stages.map((stage) => ({ offset: stage.day }));
    const fitted = fitOffsets(draft, daysUntil(project.release_at));
    const pinnedTitles = pinned.map((stage) => stage.title);
    // Отметка «сделано» берётся из задач этапа: они при сборке не трогаются,
    // и закрытый этап не должен снова стать открытым.
    const stageDone = (title) => {
      const owned = STAGE_TASKS.filter((row) => row.stage === title).map((row) => row.title);
      return owned.length > 0 && owned.every((task) => state.tasks.some((row) => row.project_id === project.id && row.title === task && row.is_done));
    };
    const rows = template.stages.filter((stage) => !pinnedTitles.includes(stage.title)).map((stage, index) => ({
      artist_id: state.artist.id,
      project_id: project.id,
      title: stage.title,
      stage_date: isoDate(addDays(project.release_at, draft[template.stages.indexOf(stage)].offset)),
      day_offset: draft[template.stages.indexOf(stage)].offset,
      repeat_rule: stage.repeat,
      is_done: stageDone(stage.title),
      sort_order: index,
    }));
    const { error } = await db.from('release_stages').insert(rows);
    setBusy(button, false);
    if (error) return toast(error.message || 'Не удалось собрать план.', 'error');
    state.stages = await safeQuery(db.from('release_stages').select('*').eq('artist_id', state.artist.id).order('sort_order'));
    const runway = daysUntil(project.release_at);
    toast(fitted
      ? 'План собран и ужат в ' + runway + ' ' + plural(runway, 'день', 'дня', 'дней') + ' до выхода.'
      : 'План собран: ' + rows.length + ' этапов.');
    logEvent('release', 'Собран план выпуска', project.title || '', { view: 'dashboard', project: project.id });
    renderRollout();
  }

  // Пятинедельный план не ужимается в короткий срок, а переносит день Х:
  // так план остаётся полноценным, а не превращается в четыре дня подряд.
  async function buildFiveWeeks(target, button) {
    const project = projectById(target && target.id) || target;
    if (!project || !project.release_at) return toast('Сначала задайте дату релиза.', 'error');
    const need = templateNeed('single');
    const runway = daysUntil(project.release_at);
    if (runway < need) {
      // Срок короче шаблона. Два понятных пути: перенести день Х туда, где
      // план поместится, или назначить свою дату. Кнопки «ужать» нет —
      // из неё не понять ни на сколько, ни что это значит.
      const moved = addDays(new Date(), need);
      const answer = await askDialog({
        title: 'Плану нужно ' + need + ' дней, а до выхода ' + Math.max(0, runway),
        text: 'Перенести день Х на ' + shortDate(moved) + ' — план поместится целиком. Или назначить свою дату выхода.',
        actions: [
          { id: 'custom', label: 'Своя дата' },
          { id: 'move', label: 'Перенести на ' + shortDate(moved), primary: true },
        ],
      });
      if (!answer) return;
      if (answer === 'custom') return offerReleaseDate(project, () => generateRollout(project, 'single', button));
      const iso = moved.toISOString();
      const { error } = await db.from('artist_projects').update({ release_at: iso })
        .eq('id', project.id).eq('artist_id', state.artist.id);
      if (error) return toast(error.message || 'Не удалось перенести дату.', 'error');
      project.release_at = iso;
      state.projects = state.projects.map((row) => (row.id === project.id ? { ...row, release_at: iso } : row));
      toast('Дата выхода перенесена на ' + shortDate(moved) + '.');
    }
    await generateRollout(project, 'single', button);
    renderCalendar();
    renderDashboard();
  }


  // В карточке трека — ровно та же ось, что на дашборде, только смотреть.
  function trackRollout(project) {
    if (!project) return '';
    const stages = (state.stages || []).filter((stage) => stage.project_id === project.id)
      .sort((a, b) => (dayStart(a.stage_date || 0) - dayStart(b.stage_date || 0)) || a.sort_order - b.sort_order);
    if (!stages.length) return '';
    return '<div class="track-rollout" role="button" tabindex="0" data-mini-rollout="' + project.id + '"'
      + ' title="Открыть путь этого релиза на дашборде">' + rolloutAxis(stages, { readonly: true }) + '</div>';
  }

  // Релиз для пути: выбранный в фокусе, иначе ближайший по дате выхода.
  // Одна и та же ось рисуется и на дашборде, и в карточке трека, чтобы они
  // не разъезжались. Без дат этапы всё равно стоят на линии — план виден
  // до того, как назначен день Х.
  function rolloutAxis(stages, options = {}) {
    const readonly = !!options.readonly;
    const today = dayStart(new Date()).getTime();
    const dated = stages.every((stage) => stage.stage_date);
    const times = dated ? stages.map((stage) => dayStart(stage.stage_date).getTime()) : [];
    const count = stages.length;
    const centerPct = (index) => ((index + 0.5) / count) * 100;

    const todayPct = !dated ? 0 : (() => {
      if (today <= times[0]) return 0;
      if (today >= times[count - 1]) return 100;
      for (let index = 1; index < count; index += 1) {
        if (today <= times[index]) {
          const before = times[index - 1];
          const after = times[index];
          const frac = after === before ? 0 : (today - before) / (after - before);
          return centerPct(index - 1) + frac * (centerPct(index) - centerPct(index - 1));
        }
      }
      return 100;
    })();

    const stageClass = (stage) => {
      if (stage.is_done) return 'is-done';
      if (stage.day_offset === 0) return 'is-release';
      return dated && dayStart(stage.stage_date).getTime() < today ? 'is-late' : '';
    };

    const caps = stages.map((stage, index) => '<span class="rollout-cap ' + stageClass(stage) + '" data-col="' + index + '">'
      + '<b>' + escapeHTML(stage.title) + '</b>'
      + '<span class="rollout-cap-date">' + (stage.stage_date ? shortDate(stage.stage_date) : '—') + '</span></span>').join('');

    const nodeCells = stages.map((stage, index) => '<span data-col="' + index + '">'
      + (stage.is_pinned && !readonly ? '<button class="rollout-lock" type="button" data-stage-pin="' + stage.id
        + '" title="Закреплён: не сдвигается при переносе дня Х. Нажмите, чтобы снять"></button>' : '')
      + '<' + (readonly ? 'span' : 'button') + ' class="rollout-node ' + stageClass(stage) + '"'
      + (readonly ? '' : ' type="button" data-stage="' + stage.id + '"')
      + ' title="' + escapeHTML(stage.title) + (stage.stage_date ? ' · ' + shortDate(stage.stage_date) : ' · даты нет')
      + (stage.repeat_rule !== 'once' ? ' · ' + REPEAT_LABEL[stage.repeat_rule] : '') + '">'
      + '</' + (readonly ? 'span' : 'button') + '></span>').join('');

    const gapCells = stages.map((stage, index) => {
      if (!index || !dated) return '<span></span>';
      const days = Math.round((times[index] - times[index - 1]) / 86400000);
      return '<span><i>' + days + ' ' + plural(days, 'день', 'дня', 'дней') + '</i></span>';
    }).join('');

    // Этап с повтором — это период, а не точка: тизеры идут раз в два дня
    // до следующего узла. Штрихуем этот отрезок, иначе он выглядит перерывом.
    const step = count > 1 ? 100 / count : 0;
    const bands = stages.map((stage, index) => {
      if (stage.repeat_rule === 'once' || index >= count - 1) return '';
      // Доля закрытых задач этапа заливает штрих: один тизер из двух — половина.
      const owned = STAGE_TASKS.filter((row) => row.stage === stage.title).map((row) => row.title);
      const closed = owned.filter((title) => state.tasks.some((row) => row.project_id === stage.project_id
        && row.title === title && row.is_done)).length;
      const share = owned.length ? Math.round((closed / owned.length) * 100) : (stage.is_done ? 100 : 0);
      return '<span class="rollout-band" style="left:' + centerPct(index) + '%; width:' + step + '%" title="'
        + escapeHTML(REPEAT_LABEL[stage.repeat_rule] || '') + (owned.length ? ' · ' + closed + ' из ' + owned.length : '') + '">'
        + (share ? '<i style="width:' + share + '%"></i>' : '') + '</span>';
    }).join('');
    return '<div class="rollout-axis" style="--rollout-count:' + count + '">'
      + '<div class="rollout-row">' + caps + '</div>'
      + '<div class="rollout-noderow"><span class="rollout-bar"><i style="width:' + todayPct + '%"></i>' + bands + '</span>'
      + '<div class="rollout-row rollout-nodes">' + nodeCells + '</div>'
      + (dated ? '<span class="rollout-today" style="left:' + todayPct + '%" title="сегодня · ' + shortDate(new Date()) + '"></span>' : '')
      + (readonly ? '' : '<button class="rollout-add" type="button" data-rollout-add title="Добавить этап" aria-label="Добавить этап">+</button>')
      + '</div>'
      + '<div class="rollout-row rollout-gaps">' + gapCells + '</div>'
      + '</div>';
  }

  function renderRollout() {
    const host = $('#dashboard-rollout');
    if (!host) return;
    // Бар показывает только трек, выбранный в фокусе. «Все проекты» —
    // пустая линия без дат и названий: видно, что бар здесь есть, и всё.
    const project = selectedDashboardProject();
    if (!project) {
      const count = 6;
      host.innerHTML = '<header class="panel-header"><div><span class="eyebrow">План выпуска</span><h3>Путь релиза</h3></div></header>'
        + '<div class="rollout-stage-wrap"><div class="rollout-axis rollout-skeleton" style="--rollout-count:' + count + '">'
        + '<div class="rollout-noderow"><span class="rollout-bar"></span><div class="rollout-row rollout-nodes">'
        + Array.from({ length: count }, () => '<span><span class="rollout-node"></span></span>').join('')
        + '</div></div></div></div>'
        + '<p class="rollout-skeleton-note">Выберите трек <button class="text-button" type="button" data-rollout-focus>в фокусе</button> — здесь появится его путь.</p>';
      // Клик по «в фокусе» ведёт к самому селекту: прокрутка и короткая подсветка поля.
      $('[data-rollout-focus]', host).addEventListener('click', () => {
        const select = $('#dashboard-project-select');
        const field = select.closest('.dashboard-focus-select') || select;
        field.scrollIntoView({ behavior: 'smooth', block: 'center' });
        field.classList.remove('is-spotlit');
        void field.offsetWidth; // перезапуск анимации, если кликнули дважды
        field.classList.add('is-spotlit');
        field.addEventListener('animationend', () => field.classList.remove('is-spotlit'), { once: true });
      });
      return;
    }

    const stages = (state.stages || []).filter((stage) => stage.project_id === project.id)
      .sort((a, b) => dayStart(a.stage_date) - dayStart(b.stage_date) || a.sort_order - b.sort_order);
    if (!stages.length) {
      host.innerHTML = '<header class="panel-header"><div><span class="eyebrow">План выпуска</span><h3>' + escapeHTML(project.title || 'Без названия') + '</h3></div>'
        + '</header>'
        // Шаблон считается назад от дня Х. Если до выхода меньше четырёх недель,
        // он не помещается и раскидал бы половину этапов в прошлое — тогда
        // вместо шаблона предлагаем расставить даты руками.
        + '<div class="rollout-empty"><p>Плана выпуска ещё нет. Соберём его на пять недель: '
        + 'права, дистрибуция, сведение, тизеры, день Х.</p><div class="rollout-empty-actions">'
        + '<button class="button button-primary" type="button" data-rollout-build>Собрать план</button></div></div>';
      bindRollout(host, project);
      return;
    }

    const today = dayStart(new Date()).getTime();
    const left = project.release_at ? daysUntil(project.release_at) : null;
    const lateList = stages.filter((stage) => !stage.is_done && stage.day_offset !== 0
      && stage.stage_date && dayStart(stage.stage_date).getTime() < today);

    const doneCount = stages.filter((stage) => stage.is_done).length;
    // Просроченное больше не выносит приговор, а спрашивает: этап мог быть
    // сделан и просто не отмечен, и раньше это стоило четырёх действий.
    const askBlock = lateList.length
      ? '<div class="rollout-ask"><div class="rollout-ask-head">'
        + '<span>' + lateList.length + ' ' + plural(lateList.length, 'этап', 'этапа', 'этапов')
        + ' ' + plural(lateList.length, 'прошёл', 'прошли', 'прошли') + ', но не ' + plural(lateList.length, 'отмечен', 'отмечены', 'отмечены')
        + ' — система не решает за вас</span></div>'
        + lateList.map((stage) => {
          const ago = Math.abs(daysUntil(stage.stage_date));
          return '<div class="rollout-ask-row"><div><strong>' + escapeHTML(stage.title) + '</strong>'
            + '<small>было ' + shortDate(stage.stage_date) + ' · ' + ago + ' ' + plural(ago, 'день', 'дня', 'дней') + ' назад</small></div>'
            + '<div class="rollout-ask-pair">'
            + '<button class="rollout-mini is-go" type="button" data-stage-done="' + stage.id + '">сделал</button>'
            + '<button class="rollout-mini" type="button" data-stage-move="' + stage.id + '">перенести</button>'
            + '</div></div>';
        }).join('') + '</div>'
      : '';

    host.innerHTML = '<header class="panel-header">'
      + '<div><span class="eyebrow">Путь релиза</span><h3>' + escapeHTML(project.title || 'Без названия') + '</h3></div>'
      + '<div class="rollout-head-actions">'
      + (doneCount ? '<span class="rollout-progress">' + doneCount + ' из ' + stages.length + '</span>' : '')
      + '</div></header>'
      + '<div class="rollout-stage-wrap">' + rolloutAxis(stages) + '</div>'
      // Название и дата уже на баре — в подвале только дни до выхода и сброс.
      + '<div class="rollout-foot"><div class="rollout-count">'
      + (left === null ? '<b>—</b><span>дата не назначена</span>'
        : '<b>' + Math.abs(left) + '</b><span>'
          + plural(Math.abs(left), 'день', 'дня', 'дней') + (left >= 0 ? ' до выхода' : ' назад вышел') + '</span>')
      + '</div><button class="button rollout-reset" type="button" data-rollout-reset>Сбросить к шаблону</button></div>'
      + askBlock;
    bindRollout(host, project);
  }

  function bindRollout(host, project) {
    const build = $('[data-rollout-build]', host);
    if (build) build.addEventListener('click', () => buildFiveWeeks(project, build));
    const add = $('[data-rollout-add]', host);
    if (add) add.addEventListener('click', () => openStageEditor(null, project));
    // Сброс — это бывшая «пересборка»: шаблон один, спрашивать нечего.
    const reset = $('[data-rollout-reset]', host);
    if (reset) reset.addEventListener('click', async () => {
      // Не «ручные даты будут потеряны», а по именам: что удалится,
      // сколько дат пересчитается, что останется.
      const mine = (state.stages || []).filter((stage) => stage.project_id === project.id);
      const templateTitles = ROLLOUT_TEMPLATES.single.stages.map((stage) => stage.title);
      const custom = mine.filter((stage) => !stage.is_pinned && !templateTitles.includes(stage.title));
      const pinned = mine.filter((stage) => stage.is_pinned);
      const recount = templateTitles.filter((title) => !pinned.some((stage) => stage.title === title)).length;
      const names = (list) => list.map((stage) => '«' + stage.title + '»').join(', ');
      const lines = [];
      if (custom.length) lines.push('Удалятся свои этапы: ' + names(custom) + '.');
      lines.push('Даты ' + recount + ' ' + plural(recount, 'этапа', 'этапов', 'этапов') + ' шаблона встанут заново'
        + (project.release_at ? ' от дня Х (' + shortDate(project.release_at) + ')' : '') + '.');
      if (pinned.length) lines.push('Останутся на месте (закреплены): ' + names(pinned) + '.');
      const ok = await askYesNo('Собрать план заново по шаблону?', lines.join('\n'), 'Собрать заново');
      if (ok) buildFiveWeeks(project, reset);
    });
    $$('[data-stage-pin]', host).forEach((button) => button.addEventListener('click', () => {
      toggleStagePin(button.dataset.stagePin, button);
    }));
    $$('[data-stage-done]', host).forEach((button) => button.addEventListener('click', () => {
      setStageDone(button.dataset.stageDone, button);
    }));
    $$('[data-stage-move]', host).forEach((button) => button.addEventListener('click', () => {
      moveStageToToday(button.dataset.stageMove, button);
    }));
    // Пояснение живёт вне прокручиваемой полосы (иначе её край его режет),
    // поэтому при прокрутке полосы под ним уезжает узел — закрываем.
    const wrap = $('.rollout-stage-wrap', host);
    if (wrap) wrap.addEventListener('scroll', closeStageHint);
    $$('[data-stage]', host).forEach((button) => button.addEventListener('click', (event) => {
      event.stopPropagation();
      const stage = stageById(button.dataset.stage);
      if (stage) openStageHint(button, stage, project);
    }));
  }

  function stageById(id) {
    return (state.stages || []).filter((row) => row.id === id)[0] || null;
  }

  const templateNeed = (key) => Math.abs(Math.min.apply(null,
    ROLLOUT_TEMPLATES[key].stages.map((stage) => stage.day)));

  // Шаблон считает назад от дня Х на пять недель. Если до выхода осталось
  // меньше, офсеты сжимаются пропорционально: форма плана сохраняется, а даты
  // укладываются в реальный остаток. Раньше настройщик брал офсеты шаблона как
  // есть, и половина этапов оказывалась в прошлом, за пределами линейки.
  function fitOffsets(rows, runway) {
    const before = rows.filter((row) => row.offset < 0);
    if (!before.length || runway < 1) return false;
    const span = Math.max.apply(null, before.map((row) => Math.abs(row.offset)));
    if (!span || runway >= span) return false;
    const scale = runway / span;
    before.forEach((row) => { row.offset = -Math.max(0, Math.round(Math.abs(row.offset) * scale)); });
    return true;
  }

  // Этап ушёл за день выхода. День Х сам не едет никогда — это слишком крупное
  // последствие, чтобы прятать его в общий вопрос. Спрашиваем отдельно и
  // называем дату, чтобы решение принималось глядя на результат.
  async function offerReleaseShift(project, delta, title) {
    if (!project || !project.release_at || !delta) return;
    const moved = addDays(project.release_at, delta);
    const days = Math.abs(delta);
    const answer = await askDialog({
      title: '«' + title + '» теперь позже дня выхода',
      text: 'День Х сам не двигается. Перенести его на ' + days + ' ' + plural(days, 'день', 'дня', 'дней')
        + ' — на ' + shortDate(moved) + ' — или назначить свою дату?',
      actions: [
        { id: 'custom', label: 'Своя дата' },
        { id: 'move', label: 'Перенести на ' + shortDate(moved), primary: true },
      ],
    });
    if (answer === 'custom') return offerReleaseDate(project);
    if (answer !== 'move') return;
    const previousReleaseAt = project.release_at;
    const { error } = await db.from('artist_projects').update({ release_at: moved.toISOString() })
      .eq('id', project.id).eq('artist_id', state.artist.id);
    if (error) return toast(error.message || 'Не удалось перенести дату.', 'error');
    project.release_at = moved.toISOString();
    state.projects = state.projects.map((row) => (row.id === project.id ? { ...row, release_at: project.release_at } : row));
    await syncReleaseStage(project);
    toast('День Х перенесён на ' + shortDate(moved) + '.');
    logEvent('release', 'День Х перенесён за этапом', project.title || '', { view: 'dashboard', project: project.id });
    renderCalendar(); renderDashboard();
  }

  // Клик по узлу объясняет этап, а не сразу открывает правку: порядок этапов
  // задан зависимостями, и это единственное место, где можно это рассказать.
  function openStageHint(node, stage, project) {
    closeStageHint();
    const host = node.closest('.dashboard-rollout-panel') || node.closest('.panel') || document.body;
    const key = String(stage.title || '').trim().toLowerCase();
    const hint = STAGE_HINTS[key] || 'Свой этап плана. Дата и повтор настраиваются в правке.';
    const box = document.createElement('div');
    box.className = 'rollout-hint';
    box.innerHTML = '<strong>' + escapeHTML(stage.title) + '</strong>'
      + '<p>' + escapeHTML(hint) + '</p>'
      + '<div class="rollout-hint-foot"><span>' + shortDate(stage.stage_date)
      + (stage.repeat_rule !== 'once' ? ' · ' + REPEAT_LABEL[stage.repeat_rule] : '') + '</span>'
      + '<button class="text-button" type="button" data-hint-edit>изменить</button></div>';
    host.appendChild(box);
    // Над узлом, по центру; у краёв панели прижимаем внутрь. Если сверху
    // не помещается — под узлом.
    const hostRect = host.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const width = box.offsetWidth;
    const height = box.offsetHeight;
    const centerX = nodeRect.left + nodeRect.width / 2 - hostRect.left;
    const left = Math.max(8, Math.min(hostRect.width - width - 8, centerX - width / 2));
    let top = nodeRect.top - hostRect.top - 10 - height;
    if (top < 4) top = nodeRect.bottom - hostRect.top + 10;
    box.style.left = Math.round(left) + 'px';
    box.style.top = Math.round(top) + 'px';
    $('[data-hint-edit]', box).addEventListener('click', (event) => {
      event.stopPropagation();
      closeStageHint();
      openStageEditor(stage, project);
    });
    box.addEventListener('click', (event) => event.stopPropagation());
    setTimeout(() => {
      document.addEventListener('click', closeStageHint, { once: true });
      document.addEventListener('keydown', hintEscape);
    }, 0);
  }

  function hintEscape(event) { if (event.key === 'Escape') closeStageHint(); }

  function closeStageHint() {
    $$('.rollout-hint').forEach((box) => box.remove());
    document.removeEventListener('keydown', hintEscape);
  }

  // Замок снимается там же, где виден. Ставится он только в шторке этапа,
  // поэтому здесь одно действие — разблокировать, и один вопрос.
  async function toggleStagePin(stageId, button) {
    const stage = stageById(stageId);
    if (!stage) return;
    if (!(await askYesNo('Разблокировать этап?', 'Он снова будет двигаться вместе с днём Х.', 'Разблокировать'))) return;
    setBusy(button, true, '');
    const { error } = await db.from('release_stages').update({ is_pinned: false })
      .eq('id', stageId).eq('artist_id', state.artist.id);
    setBusy(button, false);
    if (error) return toast(error.message || 'Не удалось снять закрепление.', 'error');
    state.stages = state.stages.map((row) => (row.id === stageId ? { ...row, is_pinned: false } : row));
    toast('Закрепление снято — этап поедет за днём Х.');
    renderRollout();
  }

  // Задачи этапа, которые ещё не в нужном состоянии: открытые — если этап
  // закрывают, закрытые — если открывают обратно.
  function stageTasksToFlip(stage, isDone) {
    const owned = STAGE_TASKS.filter((row) => row.stage === stage.title).map((row) => row.title);
    return state.tasks.filter((row) => row.project_id === stage.project_id
      && owned.includes(row.title) && !!row.is_done !== isDone);
  }

  // Этап и его задачи — одно целое: закрыл этап — задачи закрылись,
  // открыл обратно — открылись. Иначе бар говорит «сделано», а список задач
  // висит, и наоборот.
  async function flipStageTasks(stage, isDone) {
    const tasks = stageTasksToFlip(stage, isDone);
    if (!tasks.length) return 0;
    const ids = tasks.map((row) => row.id);
    const workflow_status = isDone ? 'uploaded' : 'doing';
    const { error } = await db.from('project_tasks')
      .update({ is_done: isDone, workflow_status })
      .in('id', ids).eq('artist_id', state.artist.id);
    if (error) throw error;
    state.tasks = state.tasks.map((row) => (ids.includes(row.id) ? { ...row, is_done: isDone, workflow_status } : row));
    renderTasksView();
    return ids.length;
  }

  async function setStageDone(stageId, button) {
    const stage = stageById(stageId);
    if (!stage) return;
    // У этапа есть свои задачи — закрываем их заодно, иначе этап окажется
    // закрытым, а его задачи так и останутся висеть в списке.
    const openTasks = stageTasksToFlip(stage, true);
    if (openTasks.length) {
      const names = openTasks.map((row) => '· ' + row.title).join('\n');
      if (!(await askYesNo('Закрыть этап вместе с задачами?', names, 'Закрыть'))) return;
    }
    setBusy(button, true, '…');
    try {
      await flipStageTasks(stage, true);
    } catch (taskError) {
      setBusy(button, false);
      return toast(taskError.message || 'Не удалось закрыть задачи.', 'error');
    }
    const { error } = await db.from('release_stages').update({ is_done: true })
      .eq('id', stageId).eq('artist_id', state.artist.id);
    setBusy(button, false);
    if (error) return toast(error.message || 'Не удалось отметить этап.', 'error');
    state.stages = state.stages.map((row) => (row.id === stageId ? { ...row, is_done: true } : row));
    await syncProjectStatus(projectById(stage.project_id));
    logEvent('release', 'Этап закрыт', stage.title || '', { view: 'dashboard', project: stage.project_id });
    renderRollout();
    renderDashboardCalendar();
  }

  // «Перенести» ставит этап на сегодня: просроченное почти всегда переносят
  // на текущий день. Другая дата — через редактор по клику на узел.
  async function moveStageToToday(stageId, button) {
    const stage = stageById(stageId);
    if (!stage) return;
    const project = projectById(stage.project_id);
    const stageDate = isoDate(new Date());
    const payload = { stage_date: stageDate };
    if (project && project.release_at) {
      payload.day_offset = Math.round((dayStart(stageDate) - dayStart(project.release_at)) / 86400000);
    }
    setBusy(button, true, '…');
    const { error } = await db.from('release_stages').update(payload)
      .eq('id', stageId).eq('artist_id', state.artist.id);
    setBusy(button, false);
    if (error) return toast(error.message || 'Не удалось перенести этап.', 'error');
    state.stages = state.stages.map((row) => (row.id === stageId ? { ...row, ...payload } : row));
    toast('«' + (stage.title || 'Этап') + '» перенесён на сегодня.');
    renderRollout();
    renderDashboardCalendar();
  }

  // День Х переехал — план едет следом. Но только незакрытыми этапами:
  // отмеченное «сделал» остаётся на своей дате, это история, а не план.
  // Закреплённые (is_pinned) тоже стоят на месте — галочка наконец работает.
  // День Х назначен впервые — раскладываем этапы по их смещениям.
  async function fillStageDates(project) {
    if (!project || !project.release_at) return false;
    const blank = (state.stages || []).filter((stage) => stage.project_id === project.id && !stage.stage_date);
    if (!blank.length) return false;
    const draft = blank.map((stage) => ({ offset: stage.day_offset }));
    fitOffsets(draft, daysUntil(project.release_at));
    const updates = blank.map((stage, index) => ({
      id: stage.id,
      stage_date: isoDate(addDays(project.release_at, draft[index].offset)),
      day_offset: draft[index].offset,
    }));
    const results = await Promise.all(updates.map((row) => db.from('release_stages')
      .update({ stage_date: row.stage_date, day_offset: row.day_offset })
      .eq('id', row.id).eq('artist_id', state.artist.id)));
    if (results.some((result) => result.error)) {
      toast('Не удалось разложить этапы по датам.', 'error');
      return false;
    }
    const byId = {};
    updates.forEach((row) => { byId[row.id] = row; });
    state.stages = state.stages.map((stage) => (byId[stage.id]
      ? { ...stage, stage_date: byId[stage.id].stage_date, day_offset: byId[stage.id].day_offset }
      : stage));
    toast('План разложен от дня Х: ' + updates.length + ' ' + plural(updates.length, 'этап', 'этапа', 'этапов') + '.');
    return true;
  }

  // Кружок дня Х на баре — это этап с нулевым смещением. Его дата обязана
  // совпадать с датой выхода: иначе календарь показывает одно, бар — другое.
  // Двигаем без вопросов: вопрос про остальные этапы задаёт shiftStagesForRelease.
  async function syncReleaseStage(project) {
    if (!project || !project.release_at) return;
    const stage = (state.stages || []).filter((row) => row.project_id === project.id && row.day_offset === 0)[0];
    const date = isoDate(project.release_at);
    if (!stage || stage.stage_date === date) return;
    const { error } = await db.from('release_stages').update({ stage_date: date }).eq('id', stage.id).eq('artist_id', state.artist.id);
    if (error) return toast(error.message || 'Не удалось перенести день Х на баре.', 'error');
    state.stages = state.stages.map((row) => (row.id === stage.id ? { ...row, stage_date: date } : row));
  }

  async function shiftStagesForRelease(project, previousReleaseAt) {
    if (!project || !project.release_at || !previousReleaseAt) return;
    await syncReleaseStage(project);
    const delta = Math.round((dayStart(project.release_at) - dayStart(previousReleaseAt)) / 86400000);
    if (!delta) return;
    const mine = (state.stages || []).filter((stage) => stage.project_id === project.id);
    const movable = mine.filter((stage) => !stage.is_done && !stage.is_pinned && stage.day_offset !== 0);
    if (!movable.length) return;
    const keptDone = mine.filter((stage) => stage.is_done).length;
    const keptPinned = mine.filter((stage) => !stage.is_done && stage.is_pinned).length;
    const days = Math.abs(delta);
    let note = '';
    if (keptDone) note += 'Закрытых: ' + keptDone + ' — останутся на своих датах.\n';
    if (keptPinned) note += 'Закреплённых: ' + keptPinned + ' — останутся на месте.';
    const ok = await askYesNo('День Х уехал на ' + days + ' ' + plural(days, 'день', 'дня', 'дней') + (delta > 0 ? ' вперёд' : ' назад'),
      (note ? note.trim() + '\n\n' : '') + 'Сдвинуть ' + movable.length + ' ' + plural(movable.length, 'этап', 'этапа', 'этапов') + ' на столько же?',
      'Сдвинуть');
    if (!ok) return;
    await applyStageShift(project, movable, delta);
  }

  // Этапы, которые едут за днём Х: незакрытые, незакреплённые, не сам день Х.
  function stagesFollowingRelease(project) {
    return (state.stages || []).filter((stage) => stage.project_id === project.id
      && !stage.is_done && !stage.is_pinned && stage.day_offset !== 0 && stage.stage_date);
  }

  async function applyStageShift(project, movable, delta) {
    const updates = movable.map((stage) => ({ id: stage.id, stage_date: isoDate(addDays(stage.stage_date, delta)) }));
    const results = await Promise.all(updates.map((row) => db.from('release_stages')
      .update({ stage_date: row.stage_date }).eq('id', row.id).eq('artist_id', state.artist.id)));
    const failed = results.filter((result) => result.error).length;
    if (failed) return toast('Не удалось сдвинуть ' + failed + ' из ' + updates.length + ' этапов.', 'error');
    const byId = {};
    updates.forEach((row) => { byId[row.id] = row.stage_date; });
    state.stages = state.stages.map((stage) => (byId[stage.id] ? { ...stage, stage_date: byId[stage.id] } : stage));
    toast('План сдвинут: ' + updates.length + ' ' + plural(updates.length, 'этап', 'этапа', 'этапов') + '.');
    logEvent('release', 'План сдвинут за днём Х', project.title || '', { view: 'dashboard', project: project.id });
  }

  // Правка этапа: название, дата, повтор, отметки.
  function openStageEditor(stage, project) {
    const isNew = !stage;
    openDrawer('РЕЛИЗ / ЭТАП', isNew ? 'Новый этап' : 'Этап пути', '<form id="stage-form">'
      + '<label class="field"><span>Название</span><input name="title" value="' + escapeHTML(stage ? stage.title : '') + '" placeholder="Что нужно сделать" required></label>'
      + '<label class="field"><span>Дата</span><input name="stage_date" type="date" value="' + ((stage && stage.stage_date) || isoDate(new Date())) + '" required></label>'
      + '<label class="field"><span>Повтор</span><select name="repeat_rule">'
      + Object.keys(REPEAT_LABEL).map((key) => '<option value="' + key + '"' + (stage && stage.repeat_rule === key ? ' selected' : '') + '>' + REPEAT_LABEL[key] + '</option>').join('')
      + '</select></label>'
      + '<div class="field"><span>Отметки</span><div class="stage-flags">'
      + '<label><input type="checkbox" name="is_done"' + (stage && stage.is_done ? ' checked' : '') + '> Сделано</label>'
      + '<label><input type="checkbox" name="is_pinned"' + (stage && stage.is_pinned ? ' checked' : '') + '> Не сдвигать при переносе дня Х</label>'
      + '</div></div>'
      + '<div class="drawer-actions">' + (isNew ? '<span></span>' : '<button class="button button-danger" type="button" id="stage-delete">Удалить</button>')
      + '<button class="button button-primary" type="submit">Сохранить</button></div></form>');

    const del = $('#stage-delete');
    if (del) del.addEventListener('click', async () => {
      const { error } = await db.from('release_stages').delete().eq('id', stage.id).eq('artist_id', state.artist.id);
      if (error) return toast(error.message || 'Не удалось удалить этап.', 'error');
      state.stages = (state.stages || []).filter((row) => row.id !== stage.id);
      closeDrawer(true);
      toast('Этап удалён.');
      renderRollout();
    });

    $('#stage-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = $('button[type="submit"]', event.currentTarget);
      const data = new FormData(event.currentTarget);
      const stageDate = String(data.get('stage_date'));
      const payload = {
        artist_id: state.artist.id,
        project_id: project.id,
        title: String(data.get('title') || '').trim(),
        stage_date: stageDate,
        day_offset: Math.round((dayStart(stageDate) - dayStart(project.release_at)) / 86400000),
        repeat_rule: String(data.get('repeat_rule') || 'once'),
        is_done: data.get('is_done') === 'on',
        is_pinned: data.get('is_pinned') === 'on',
        sort_order: stage ? stage.sort_order : (state.stages || []).length,
      };
      // Дата сдвинулась — решаем, едут ли за ней следующие этапы.
      // Пример: «Сведение» с 24-го на 29-е — «Дистрибуция» и «Пресейв»
      // либо остаются, либо тоже уезжают на 5 дней, промежутки те же.
      const oldDate = stage && stage.stage_date ? dayStart(stage.stage_date).getTime() : null;
      const newDate = dayStart(stageDate).getTime();
      const delta = oldDate === null ? 0 : Math.round((newDate - oldDate) / 86400000);
      const isRelease = stage && stage.day_offset === 0;
      const followers = (delta && !isRelease) ? (state.stages || []).filter((row) => row.project_id === project.id
        && row.id !== stage.id && !row.is_done && !row.is_pinned && row.day_offset !== 0
        && row.stage_date && dayStart(row.stage_date).getTime() > oldDate) : [];
      const releaseDay = project.release_at ? dayStart(project.release_at).getTime() : null;
      const pastRelease = releaseDay !== null && !isRelease && newDate > releaseDay;
      let shiftFollowers = false;
      if (pastRelease) {
        // За днём Х следующие едут без вопроса: иначе дистрибуция окажется
        // раньше сведения, а так не бывает.
        shiftFollowers = followers.length > 0;
      } else if (followers.length) {
        const days = Math.abs(delta);
        const answer = await askDialog({
          title: '«' + payload.title + '» сдвигается на ' + days + ' ' + plural(days, 'день', 'дня', 'дней') + (delta > 0 ? ' вперёд' : ' назад'),
          text: 'После него ещё ' + followers.length + ' ' + plural(followers.length, 'этап', 'этапа', 'этапов')
            + '. Сдвинуть их на столько же — промежутки останутся прежними — или оставить на месте?',
          actions: [
            { id: 'one', label: 'Только этот' },
            { id: 'all', label: 'И следующие ' + followers.length, primary: true },
          ],
        });
        if (!answer) return;
        shiftFollowers = answer === 'all';
      }
      setBusy(button, true, 'Сохраняем…');
      try {
        const query = stage
          ? db.from('release_stages').update(payload).eq('id', stage.id).eq('artist_id', state.artist.id)
          : db.from('release_stages').insert(payload);
        const { error } = await query;
        if (error) throw error;
        if (shiftFollowers) {
          const results = await Promise.all(followers.map((row) => db.from('release_stages')
            .update({ stage_date: isoDate(addDays(row.stage_date, delta)), day_offset: row.day_offset + delta })
            .eq('id', row.id).eq('artist_id', state.artist.id)));
          const failed = results.filter((result) => result.error).length;
          if (failed) toast('Не удалось сдвинуть ' + failed + ' из ' + followers.length + ' этапов.', 'error');
        }
        state.stages = await safeQuery(db.from('release_stages').select('*').eq('artist_id', state.artist.id).order('sort_order'));
        closeDrawer(true);
        // Галочка «сделано» — те же задачи, что и у кнопки «сделал».
        const flipped = stage && !!stage.is_done !== payload.is_done ? await flipStageTasks(stage, payload.is_done) : 0;
        if (flipped) {
          toast((payload.is_done ? 'Закрыто задач: ' : 'Открыто задач: ') + flipped + '.');
          await syncProjectStatus(project);
          renderDashboard();
        }
        // Кружок дня Х — теперь единственный путь к дате выхода на баре:
        // его дата и есть дата релиза, остальные этапы спрашиваем как обычно.
        if (isRelease && delta) {
          const previousReleaseAt = project.release_at;
          const iso = new Date(stageDate + 'T12:00:00').toISOString();
          const { error: dateError } = await db.from('artist_projects').update({ release_at: iso })
            .eq('id', project.id).eq('artist_id', state.artist.id);
          if (dateError) toast(dateError.message || 'Не удалось перенести дату выхода.', 'error');
          else {
            project.release_at = iso;
            state.projects = state.projects.map((row) => (row.id === project.id ? { ...row, release_at: iso } : row));
            await shiftStagesForRelease(project, previousReleaseAt);
            await syncProjectStatus(project);
            renderCalendar();
            if (state.activeProjectId) await renderTrackWorkspace(state.activeProjectId);
          }
        }
        toast(stage ? (shiftFollowers ? 'Этап и ' + followers.length + ' следующих сдвинуты.' : 'Этап обновлён.') : 'Этап добавлен.');
        renderRollout();
        renderDashboardCalendar();
        if (pastRelease) offerReleaseShift(project, delta, payload.title);
      } catch (error) { toast(error.message || 'Не удалось сохранить этап.', 'error'); }
      finally { setBusy(button, false); }
    });
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

  // Календарь — окно: пролистал вперёд, и просроченное просто исчезло с экрана.
  // Счётчики висят на стрелках и считаются от сегодня, а не от показанного
  // месяца, поэтому не прыгают при листании и остаются опорой.
  // Счётчик показывает, что осталось за границами видимого окна, а не «от
  // сегодня»: иначе листаешь назад, а он упрямо твердит одно и то же число.
  function calendarOutside(first, last) {
    const from = dayStart(first).getTime();
    const to = dayStart(last).getTime();
    const selected = selectedDashboardProject();
    const mine = (projectId) => !selected || projectId === selected.id;
    const items = [];
    state.tasks.forEach((task) => {
      if (task.is_done || !task.due_at || !mine(task.project_id)) return;
      items.push({ time: dayStart(task.due_at).getTime(), title: task.title });
    });
    (state.stages || []).forEach((stage) => {
      if (stage.is_done || stage.day_offset === 0 || !stage.stage_date || !mine(stage.project_id)) return;
      items.push({ time: dayStart(stage.stage_date).getTime(), title: stage.title });
    });
    state.projects.forEach((project) => {
      if (project.status !== 'scheduled' || !project.release_at || !mine(project.id)) return;
      items.push({ time: dayStart(project.release_at).getTime(), title: project.title });
    });
    const before = items.filter((item) => item.time < from).sort((a, b) => b.time - a.time);
    const after = items.filter((item) => item.time > to).sort((a, b) => a.time - b.time);
    return { before, after };
  }

  function updateCalendarBadges(first, last) {
    const { before, after } = calendarOutside(first, last);
    const paint = (badge, list) => {
      if (!badge) return;
      badge.textContent = list.length;
      badge.hidden = !list.length;
      badge.dataset.jump = list.length ? String(list[0].time) : '';
      badge.title = list.length ? 'Ближайшее: ' + list[0].title + ' · ' + shortDate(list[0].time) : '';
    };
    paint($('#cal-badge-back'), before);
    paint($('#cal-badge-fwd'), after);
    const prev = $('#dashboard-calendar-prev');
    const next = $('#dashboard-calendar-next');
    if (prev) prev.setAttribute('aria-label', before.length ? 'Предыдущий месяц, позади ' + before.length : 'Предыдущий месяц');
    if (next) next.setAttribute('aria-label', after.length ? 'Следующий месяц, впереди ' + after.length : 'Следующий месяц');
    const now = new Date();
    const home = $('#dashboard-calendar-today');
    if (home) home.hidden = dayStart(first).getTime() <= dayStart(now).getTime()
      && dayStart(last).getTime() >= dayStart(now).getTime();
  }

  // Помощники для текста: слоги и рифмы. Слоги — числом в колонке справа.
  // Рифмы — подкрашенные куски слов прямо в тексте: под прозрачным полем
  // лежит подложка с теми же строками и переносами, красим в ней.
  //
  // Рифма считается от ударной гласной. Откуда берём ударение, по старшинству:
  //   1. заглавная гласная внутри слова — артист поставил сам («нЕльзя»);
  //   2. словарь ударений (assets/stress, грузится при первом включении);
  //   3. слово неизвестно — пробуем два последних слога, красим бледнее.
  const LYRICS_TOOLS_KEY = 'inmise-lyrics-tools';
  const RHYME_WINDOW = 4; // пару ищем в пределах четырёх строк вверх и вниз
  const RHYME_COLORS = ['rgba(112,238,121,.45)', 'rgba(213,154,77,.5)', 'rgba(125,149,200,.55)', 'rgba(212,85,73,.45)', 'rgba(197,138,217,.5)', 'rgba(95,196,196,.5)', 'rgba(224,179,76,.5)', 'rgba(155,212,90,.45)', 'rgba(232,120,160,.45)', 'rgba(240,140,60,.45)', 'rgba(140,120,230,.5)', 'rgba(180,140,90,.5)'];
  // В режиме «все рифмы» цвет привязан к гласной, чтобы его можно было выучить.
  const VOWEL_COLORS = { 'а': 'rgba(213,154,77,.5)', 'о': 'rgba(125,149,200,.55)', 'у': 'rgba(197,138,217,.5)', 'е': 'rgba(112,238,121,.45)', 'и': 'rgba(95,196,196,.5)' };
  const VOWEL_CLASS = { 'а': 'а', 'я': 'а', 'о': 'о', 'е': 'е', 'ё': 'е', 'э': 'е', 'и': 'и', 'ы': 'и', 'у': 'у', 'ю': 'у' };
  const VOWEL_RE = /[аеёиоуыэюя]/;
  // Служебные слова, которые в речи обычно без ударения. В режиме «все»
  // не красим, если артист не поставил ударение сам.
  const RHYME_STOP = new Set('это эта этот эти все всё вся весь меня тебя себя него неё нее них нам вам его её ее ему ей ими мне тебе себе нас вас как так что кто где куда когда тут там вот еще ещё уже или либо если чтоб чтобы пока даже ведь лишь только тоже также был была было были быть есть нет над под при про без для через между потом тогда сюда туда'.split(' '));

  function lyricsToolsState() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(LYRICS_TOOLS_KEY) || '{}') || {}; } catch (_) { saved = {}; }
    if (saved.rhymes === true) saved.rhymes = 'ends';
    return saved;
  }

  const countSyllables = (line) => (line.match(/[аеёиоуыэюя]/gi) || []).length;

  // Словарь ударений: отсортированный список форм слов и номера ударных
  // гласных (у омографов несколько). Файл ≈0,5 МБ, грузится один раз при
  // первом включении рифм; поиск двоичный, чтобы не держать в памяти Map.
  const STRESS_DICT_URL = '/assets/stress/ru-stress.txt.gz?v=1';
  let stressDict = null;
  let stressDictLoading = null;
  let stressDictFailed = false;

  function loadStressDict() {
    if (stressDict) return Promise.resolve(stressDict);
    if (stressDictLoading) return stressDictLoading;
    if (stressDictFailed) return Promise.resolve(null);
    if (!window.DecompressionStream) {
      stressDictFailed = true;
      toast('Браузер не умеет распаковывать словарь ударений — рифмы считаются приблизительно.', 'error');
      return Promise.resolve(null);
    }
    toast('Загружаем словарь ударений…');
    stressDictLoading = fetch(STRESS_DICT_URL).then(async (response) => {
      if (!response.ok) throw new Error('Словарь ударений не найден на сервере.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      let text;
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
        text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
      } else {
        text = new TextDecoder().decode(bytes); // сервер распаковал сам
      }
      const words = [];
      const stress = [];
      let prev = '';
      for (const line of text.split('\n')) {
        if (!line) continue;
        let end = line.length;
        while (end > 1 && /[0-9a-z]/.test(line[end - 1])) end -= 1;
        const word = prev.slice(0, parseInt(line[0], 36)) + line.slice(1, end);
        words.push(word);
        stress.push([...line.slice(end)].map((c) => parseInt(c, 36)));
        prev = word;
      }
      stressDict = { words, stress };
      toast('Словарь загружен. Ударение можно поправить заглавной буквой: нЕльзя.');
      return stressDict;
    }).catch((error) => {
      stressDictFailed = true;
      toast(error.message || 'Не удалось загрузить словарь ударений.', 'error');
      return null;
    }).finally(() => { stressDictLoading = null; });
    return stressDictLoading;
  }

  function stressLookup(word) {
    if (!stressDict) return null;
    const { words, stress } = stressDict;
    let lo = 0;
    let hi = words.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (words[mid] === word) return stress[mid];
      if (words[mid] < word) lo = mid + 1; else hi = mid - 1;
    }
    return null;
  }

  // Где ударение в слове: индексы ударных гласных (обычно один, у омографов
  // два), manual — поставил артист, guessed — не знаем, пробуем два последних.
  function stressCandidates(raw, firstInLine) {
    const lower = raw.toLowerCase();
    const vowels = [];
    for (let i = 0; i < lower.length; i += 1) if (VOWEL_RE.test(lower[i])) vowels.push(i);
    if (!vowels.length) return null;
    if (raw !== lower && raw !== raw.toUpperCase()) {
      const manual = vowels.filter((i) => raw[i] !== lower[i] && !(i === 0 && firstInLine));
      if (manual.length) return { positions: [manual[manual.length - 1]], manual: true };
    }
    const found = stressLookup(lower.replace(/ё/g, 'е'));
    if (found) {
      const positions = found.map((n) => vowels[n]).filter((i) => i !== undefined);
      if (positions.length) return { positions, manual: false };
    }
    if (lower.includes('ё')) return { positions: [lower.indexOf('ё')], manual: false };
    if (vowels.length === 1) return { positions: [vowels[0]], manual: false };
    return { positions: vowels.slice(-2), manual: false, guessed: true };
  }

  // Хвост слова от ударной гласной «как слышится»: ё/э → е, ы → и; после
  // ударения безударные о → а, е/я → и, ю → у; звонкая согласная на конце
  // глохнет («год/рот» → «от»); «-тся/-ться» → «ца». Если слово кончается
  // ударной гласной, берём и согласную перед ней («окно/давно» → «но»).
  function rhymeTail(word, at) {
    const head = VOWEL_CLASS[word[at]] || word[at];
    let rest = word.slice(at + 1).replace(/ъ/g, '')
      .replace(/ть?ся$/, 'ца')
      .replace(/о/g, 'а').replace(/[еэёяы]/g, 'и').replace(/ю/g, 'у')
      .replace(/([бвгдзж])(ь?)$/, (m, c, soft) => ({ 'б': 'п', 'в': 'ф', 'г': 'к', 'д': 'т', 'з': 'с', 'ж': 'ш' })[c] + soft);
    const support = at === word.length - 1 && at > 0 && !VOWEL_RE.test(word[at - 1]) ? word[at - 1] : '';
    return { key: support + head + rest, from: support ? at - 1 : at };
  }

  // Токены слова — куски, которые могут рифмоваться, по одному на каждое
  // возможное ударение. «В конце» — хвост до конца слова; «все» — ударный
  // слог: согласная перед гласной, гласная и согласная после.
  function wordTokens(raw, wordId, mode, firstInLine) {
    const lower = raw.toLowerCase();
    const info = stressCandidates(raw, firstInLine);
    if (!info) return [];
    if (!info.manual && (lower.length < 3 || (mode === 'all' && RHYME_STOP.has(lower)))) return [];
    return info.positions.map((at) => {
      if (mode === 'all') {
        const vowel = VOWEL_CLASS[lower[at]] || lower[at];
        const from = at > 0 && !VOWEL_RE.test(lower[at - 1]) && !/[ьъ]/.test(lower[at - 1]) ? at - 1 : at;
        let to = at + 1;
        if (to < lower.length && !VOWEL_RE.test(lower[to])) {
          to += 1;
          if (to < lower.length && /[ьй]/.test(lower[to])) to += 1;
        }
        return { key: 'v:' + vowel, from, to, wordId, guess: !!info.guessed, color: VOWEL_COLORS[vowel] || null };
      }
      const tail = rhymeTail(lower, at);
      return { key: 'e:' + tail.key, from: tail.from, to: lower.length, wordId, guess: !!info.guessed, color: null };
    });
  }

  // Что красить: для каждой строки список { from, to, color, guess }. Токен
  // активен, если такой же ключ есть у другого слова в пределах RHYME_WINDOW
  // строк. Группа — сам ключ, поэтому цепочки «стола → дела → делать →
  // забрать» не склеиваются в один цвет. Уверенное ударение красится поверх
  // угаданного.
  function rhymeMarks(lines, mode) {
    const tokens = [];
    let wordId = 0;
    lines.forEach((line, lineIndex) => {
      let firstInLine = true;
      for (const match of line.matchAll(/[а-яёa-z]+/gi)) {
        wordTokens(match[0], wordId++, mode, firstInLine).forEach((token) => {
          tokens.push({ ...token, line: lineIndex, from: match.index + token.from, to: match.index + token.to, active: false });
        });
        firstInLine = false;
      }
    });
    const byKey = {};
    tokens.forEach((token, index) => { (byKey[token.key] = byKey[token.key] || []).push(index); });
    const colors = {};
    let next = 0;
    tokens.forEach((token) => {
      token.active = byKey[token.key].some((other) => tokens[other].wordId !== token.wordId && Math.abs(tokens[other].line - token.line) <= RHYME_WINDOW);
      if (!token.active || token.color) return;
      if (!(token.key in colors)) colors[token.key] = RHYME_COLORS[next++ % RHYME_COLORS.length];
      token.color = colors[token.key];
    });
    const paint = lines.map((line) => new Array(line.length).fill(null));
    tokens.forEach((token) => {
      if (!token.active) return;
      const row = paint[token.line];
      for (let i = token.from; i < token.to; i += 1) if (!row[i] || (row[i].guess && !token.guess)) row[i] = token;
    });
    return paint.map((row) => {
      const marks = [];
      row.forEach((token, i) => {
        const open = marks[marks.length - 1];
        if (token && open && open.to === i && open.color === token.color && open.guess === token.guess) open.to = i + 1;
        else if (token) marks.push({ from: i, to: i + 1, color: token.color, guess: token.guess });
      });
      return marks;
    });
  }

  function markupLine(line, marks) {
    let html = '';
    let cursor = 0;
    marks.forEach(({ from, to, color, guess }) => {
      html += escapeHTML(line.slice(cursor, from)) + '<mark' + (guess ? ' class="is-guess"' : '') + ' style="background:' + color + '">' + escapeHTML(line.slice(from, to)) + '</mark>';
      cursor = to;
    });
    return html + escapeHTML(line.slice(cursor));
  }

  function paintLyrics(textarea) {
    const wrap = textarea.closest('.lyrics-wrap');
    const gutter = wrap && wrap.querySelector('.lyrics-gutter');
    if (!gutter) return;
    const tools = lyricsToolsState();
    const showSyl = !!tools.syllables;
    const showRhy = tools.rhymes === 'ends' || tools.rhymes === 'all';
    wrap.classList.toggle('has-gutter', showSyl);
    wrap.classList.toggle('has-rhymes', showRhy);
    if (showRhy && !stressDict && !stressDictFailed) {
      loadStressDict().then((dict) => { if (dict) $$('[data-lyrics-tools]').forEach(paintLyrics); });
    }
    const backdrop = getLyricsBackdrop(textarea);
    const lines = textarea.value.split('\n');
    const marks = showRhy ? rhymeMarks(lines, tools.rhymes) : null;
    backdrop.innerHTML = lines.map((line, index) => '<div>' + (line ? markupLine(line, marks ? marks[index] : []) : '<br>') + '</div>').join('');
    backdrop.scrollTop = textarea.scrollTop;
    if (!showSyl) { gutter.innerHTML = ''; return; }
    // Высота строки с переносом берётся из подложки — там та же разметка.
    const rows = backdrop.children;
    gutter.innerHTML = lines.map((line, index) => '<span style="height:' + rows[index].offsetHeight + 'px"><b>' + (line.trim() ? countSyllables(line) : '') + '</b></span>').join('');
    gutter.scrollTop = textarea.scrollTop;
  }

  // Подложка под полем: тот же шрифт, отступы и ширина, чтобы переносы
  // совпадали буква в букву. Полоса прокрутки поля съедает ширину текста —
  // подложке добавляем её в правый отступ.
  function getLyricsBackdrop(textarea) {
    const wrap = textarea.closest('.lyrics-wrap');
    let backdrop = wrap.querySelector('.lyrics-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'lyrics-backdrop';
      backdrop.setAttribute('aria-hidden', 'true');
      wrap.insertBefore(backdrop, textarea);
    }
    const cs = getComputedStyle(textarea);
    ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'wordSpacing', 'tabSize', 'paddingTop', 'paddingLeft', 'paddingBottom', 'borderTopWidth', 'borderLeftWidth', 'borderRightWidth', 'borderBottomWidth']
      .forEach((prop) => { backdrop.style[prop] = cs[prop]; });
    const scrollbar = textarea.offsetWidth - textarea.clientWidth - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
    backdrop.style.paddingRight = (parseFloat(cs.paddingRight) + Math.max(0, scrollbar)) + 'px';
    backdrop.style.width = textarea.offsetWidth + 'px';
    backdrop.style.height = textarea.offsetHeight + 'px';
    return backdrop;
  }

  function bindLyricsTools(root) {
    const state = lyricsToolsState();
    $$('[data-lyrics-tool]', root).forEach((input) => {
      const isRhymes = input.dataset.lyricsTool === 'rhymes';
      input.checked = isRhymes ? state.rhymes === input.value : !!state[input.dataset.lyricsTool];
      input.addEventListener('change', () => {
        const next = lyricsToolsState();
        if (isRhymes) {
          next.rhymes = input.checked ? input.value : false;
          $$('[data-lyrics-tool="rhymes"]', root).forEach((other) => { if (other !== input) other.checked = false; });
        } else next[input.dataset.lyricsTool] = input.checked;
        try { localStorage.setItem(LYRICS_TOOLS_KEY, JSON.stringify(next)); } catch (_) {}
        $$('[data-lyrics-tools]', root).forEach(paintLyrics);
      });
    });
    $$('[data-lyrics-tools]', root).forEach((textarea) => {
      const repaint = () => paintLyrics(textarea);
      textarea.addEventListener('input', repaint);
      textarea.addEventListener('scroll', () => {
        const wrap = textarea.closest('.lyrics-wrap');
        wrap.querySelectorAll('.lyrics-gutter, .lyrics-backdrop').forEach((node) => { node.scrollTop = textarea.scrollTop; });
      });
      if (window.ResizeObserver) new ResizeObserver(repaint).observe(textarea);
      repaint();
    });
  }

  // Плеер бита в шапке «Текст»: артист пишет под бит и видит номер такта.
  // Такт считаем от начала файла по BPM бита в размере 4/4. Если BPM
  // не указан — показываем только время и кнопку «указать BPM».
  // Сам звук хранится снаружи (lyricsBeat): сохранение бита перерисовывает
  // экран трека, а музыка при этом обрываться не должна.
  const formatClock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

  function stopLyricsBeat() {
    if (lyricsBeat) lyricsBeat.audio.pause();
    lyricsBeat = null;
  }

  function bindLyricsBeat(form) {
    const button = $('[data-lyrics-beat]', form);
    const counter = $('[data-lyrics-beat-counter]', form);
    const select = $('[name="beat_id"]', form);
    if (!button || !counter || !select) return;
    const icon = $('span', button);
    const bar = $('[data-beat-bar]', counter);
    const time = $('[data-beat-time]', counter);
    const bpmButton = $('[data-beat-bpm]', counter);
    let timer = 0;

    const currentBeat = () => state.beats.find((beat) => beat.id === select.value) || null;
    const tick = () => {
      const beat = lyricsBeat && state.beats.find((item) => item.id === lyricsBeat.beatId);
      if (!beat) return;
      const seconds = lyricsBeat.audio.currentTime;
      bar.textContent = beat.bpm ? `такт ${Math.floor(seconds * beat.bpm / 240) + 1}` : '';
      time.textContent = formatClock(seconds);
      bpmButton.hidden = !!beat.bpm;
    };
    const setPlaying = (on) => {
      clearInterval(timer);
      icon.textContent = on ? 'Ⅱ' : '▶';
      button.classList.toggle('is-playing', on);
      counter.hidden = false;
      tick();
      if (on) timer = setInterval(tick, 100);
    };
    const reset = () => {
      clearInterval(timer);
      icon.textContent = '▶';
      button.classList.remove('is-playing');
      counter.hidden = true;
    };
    const syncVisibility = () => { button.hidden = !currentBeat(); };

    // После перерисовки подхватываем уже играющий бит, если он тот же.
    if (lyricsBeat && lyricsBeat.beatId === select.value) {
      lyricsBeat.audio.onended = () => setPlaying(false);
      setPlaying(!lyricsBeat.audio.paused);
    } else {
      stopLyricsBeat();
    }
    syncVisibility();
    select.addEventListener('change', () => {
      if (lyricsBeat && select.value !== lyricsBeat.beatId) { stopLyricsBeat(); reset(); }
      syncVisibility();
    });

    button.addEventListener('click', async () => {
      const beat = currentBeat();
      if (!beat) return;
      if (lyricsBeat && lyricsBeat.beatId === beat.id) {
        if (lyricsBeat.audio.paused) { await lyricsBeat.audio.play(); setPlaying(true); } else { lyricsBeat.audio.pause(); setPlaying(false); }
        return;
      }
      stopLyricsBeat(); reset();
      button.disabled = true;
      button.classList.add('is-loading');
      try {
        const url = await getBeatAudio(beat);
        if (!url) { toast('У бита нет доступного аудиофайла.', 'error'); return; }
        const audio = new Audio(url);
        audio.onended = () => setPlaying(false);
        lyricsBeat = { audio, beatId: beat.id };
        await audio.play();
        setPlaying(true);
      } catch (error) {
        toast(error.message || 'Не удалось включить бит.', 'error');
      } finally {
        button.disabled = false;
        button.classList.remove('is-loading');
      }
    });
    bpmButton.addEventListener('click', () => { if (lyricsBeat) openBeatEditor(lyricsBeat.beatId); });
  }

  // «Тап» в редакторе бита: нажимаете в ритм, темп считается по средней
  // паузе между последними восемью нажатиями. Пауза дольше двух секунд —
  // начинаем заново.
  function bindTapTempo(form) {
    const button = $('[data-tap-tempo]', form);
    const input = $('[name="bpm"]', form);
    if (!button || !input) return;
    let taps = [];
    button.addEventListener('click', () => {
      const now = performance.now();
      if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
      taps.push(now);
      if (taps.length > 8) taps.shift();
      if (taps.length < 2) { button.textContent = 'Ещё… в ритм'; return; }
      const bpm = Math.round(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1)));
      input.value = Math.min(300, Math.max(40, bpm));
      button.textContent = `≈ ${input.value} BPM · ещё тап`;
    });
  }

  // Полоса-ручка под полем: тянет высоту соседа сверху. Только по вертикали —
  // ширину задаёт колонка, и тянуть вширь тут нечего. Работает и пальцем.
  function bindResizeBars(root) {
    $$('[data-resize-bar]', root).forEach((bar) => {
      const target = bar.previousElementSibling;
      if (!target) return;
      bar.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        const startY = event.clientY;
        const startHeight = target.getBoundingClientRect().height;
        bar.setPointerCapture(event.pointerId);
        bar.classList.add('is-dragging');
        const onMove = (move) => {
          target.style.height = Math.max(120, Math.round(startHeight + move.clientY - startY)) + 'px';
        };
        const onUp = () => {
          bar.classList.remove('is-dragging');
          bar.removeEventListener('pointermove', onMove);
          bar.removeEventListener('pointerup', onUp);
          bar.removeEventListener('pointercancel', onUp);
        };
        bar.addEventListener('pointermove', onMove);
        bar.addEventListener('pointerup', onUp);
        bar.addEventListener('pointercancel', onUp);
      });
    });
  }

  function bindStageButtons(host) {
    $$('[data-open-stage]', host).forEach((button) => button.addEventListener('click', () => {
      const stage = stageById(button.dataset.openStage);
      if (stage) openStageEditor(stage, projectById(stage.project_id));
    }));
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
      // Этапы плана жили только на оси, поэтому календарь выглядел пустым
      // при полностью расписанном выпуске.
      const stages = (state.stages || []).filter((stage) => (!selectedProject || stage.project_id === selectedProject.id)
        && stage.day_offset !== 0 && stage.stage_date && localDateKey(stage.stage_date) === key);
      const entries = [
        ...projects.map((project) => ({ title: project.title, projectId: project.id, status: project.status })),
        ...stages.map((stage) => ({ title: stage.title, stageId: stage.id, status: stage.is_done ? 'stage-done' : 'stage' })),
        ...tasks.map((task) => ({ title: task.title, taskId: task.id, projectId: task.project_id, status: task.is_done ? 'task-done' : 'task' })),
      ];
      cells.push(`<div class="dashboard-calendar-day ${current.getMonth() !== month.getMonth() ? 'is-muted' : ''} ${current.toDateString() === today.toDateString() ? 'is-today' : ''}" data-calendar-drop-date="${key}"><span>${current.getDate()}</span><div class="calendar-entry-stack">${entries.map((entry) => {
        if (entry.stageId) return `<button class="calendar-entry-${entry.status}" data-open-stage="${entry.stageId}" type="button">${escapeHTML(entry.title)}</button>`;
        return `<button class="calendar-entry-${entry.status}" ${entry.taskId ? `data-open-task="${entry.taskId}" data-task-drag="${entry.taskId}" draggable="true"` : `data-open-project="${entry.projectId || ''}" ${entry.projectId ? `data-project-drag="${entry.projectId}" draggable="true"` : ''}`} type="button">${escapeHTML(entry.title)}</button>`;
      }).join('')}</div></div>`);
    }
    updateCalendarBadges(first, addDays(first, 41));
    const container = $('#dashboard-calendar');
    container.innerHTML = headers + cells.join('');
    bindStageButtons(container);
    bindProjectButtons(container);
    bindTaskButtons(container);
    bindCalendarDnD(container);
  }

  const TASK_FILTER_EMPTY = { overdue: 'Просроченных нет.', blocked: 'Никто никого не ждёт.', undated: 'Все задачи с датами.' };

  function renderDashboardTasks(tasks, selectedProject = null, filter = 'all') {
    const container = $('#dashboard-tasks');
    if (!container) return;
    const sorted = [...tasks].sort((a, b) => Number(a.is_done) - Number(b.is_done) || new Date(a.due_at || '2999-12-31') - new Date(b.due_at || '2999-12-31'));
    container.innerHTML = sorted.length ? sorted.map((task) => {
      const project = projectById(task.project_id);
      const blockers = task.is_done ? [] : taskBlockers(task);
      const note = blockers.length
        ? 'ждёт: ' + blockers.join(', ')
        : `${escapeHTML(project?.title || 'Без релиза')} · ${task.due_at ? formatDate(task.due_at, { year: undefined }) : 'без даты'}`;
      return `<article class="dashboard-task-row ${task.is_done ? 'is-done' : ''} ${blockers.length ? 'is-blocked' : ''}" data-task-drag="${task.id}" draggable="true">
        <label><input type="checkbox" data-dashboard-task-check="${task.id}" ${task.is_done ? 'checked' : ''} ${blockers.length ? 'disabled' : ''}><span></span></label>
        <button data-open-task="${task.id}" type="button"><strong>${escapeHTML(task.title)}</strong><small>${escapeHTML(note)}</small></button>
      </article>`;
    }).join('') : `<div class="empty-list">${TASK_FILTER_EMPTY[filter] || (selectedProject ? 'У этого релиза задач пока нет.' : 'Задач пока нет.')}</div>`;
    $$('[data-dashboard-task-check]', container).forEach((input) => input.addEventListener('change', () => toggleTask(input.dataset.dashboardTaskCheck, input.checked)));
    bindTaskButtons(container);
    bindTaskDragSources(container);
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
    const releaseAt = dateKeyToISO(dateKey);
    const previousReleaseAt = project.release_at;
    if (previousReleaseAt && isoDate(previousReleaseAt) === isoDate(releaseAt)) return;
    // Спрашиваем до записи. «Отмена» значит, что ничего не поменялось —
    // ни в календаре, ни на баре. Раньше дата писалась сразу, а вопрос
    // был только про остальные этапы, и отмена оставляла календарь и бар
    // в разных датах.
    const delta = previousReleaseAt ? Math.round((dayStart(releaseAt) - dayStart(previousReleaseAt)) / 86400000) : 0;
    const followers = previousReleaseAt ? stagesFollowingRelease(project) : [];
    let shift = false;
    if (previousReleaseAt) {
      const days = Math.abs(delta);
      const answer = await askDialog({
        title: 'Перенести день Х на ' + shortDate(releaseAt) + '?',
        text: followers.length
          ? 'Это на ' + days + ' ' + plural(days, 'день', 'дня', 'дней') + (delta > 0 ? ' позже' : ' раньше') + '. Ещё '
            + followers.length + ' ' + plural(followers.length, 'этап', 'этапа', 'этапов') + ' плана: сдвинуть их на столько же или оставить на месте?'
          : '',
        actions: followers.length
          ? [{ id: 'no', label: 'Отмена', quiet: true }, { id: 'one', label: 'Только день Х' }, { id: 'all', label: 'День Х и ' + followers.length + ' ' + plural(followers.length, 'этап', 'этапа', 'этапов'), primary: true }]
          : [{ id: 'no', label: 'Отмена', quiet: true }, { id: 'one', label: 'Перенести', primary: true }],
      });
      if (!answer || answer === 'no') return;
      shift = answer === 'all';
    }
    const previousStatus = project.status;
    const nextStatus = ['scheduled', 'released', 'archived'].includes(project.status) ? project.status : 'scheduled';
    project.release_at = releaseAt;
    project.status = nextStatus;
    renderDashboard();
    renderCalendar();
    try {
      const { data, error } = await db.from('artist_projects').update({ release_at: releaseAt, status: nextStatus }).eq('id', id).eq('artist_id', state.artist.id).select().single();
      if (error) throw error;
      Object.assign(project, data);
      toast(previousReleaseAt ? 'День Х перенесён на ' + shortDate(releaseAt) + '.' : 'Релиз добавлен в календарь.');
      if (!(await fillStageDates(project))) {
        await syncReleaseStage(project);
        if (shift && delta) await applyStageShift(project, followers, delta);
      }
      await syncProjectStatus(project);
      renderDashboard();
      renderCalendar();
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

  function openTaskEditor(initialStatus = 'idea', initialProjectId = '', taskId = null) {
    if (!state.artist) return toast(ARTIST_NOT_READY, 'error');
    const task = state.tasks.find((item) => item.id === taskId) || null;
    const selectedProjectId = task?.project_id || initialProjectId;
    const selectedStatus = task ? taskWorkflow(task) : initialStatus;
    const projectOptions = ['<option value="">Без привязки к релизу</option>', ...state.projects.map((project) => `<option value="${project.id}" ${project.id === selectedProjectId ? 'selected' : ''}>${escapeHTML(project.title)}</option>`)].join('');
    const workflowOptions = Object.entries(TASK_WORKFLOW).map(([value, label]) => `<option value="${value}" ${value === selectedStatus ? 'selected' : ''}>${label}</option>`).join('');
    // Автоматическую задачу нельзя переименовать и удалить: по названию
    // держится вся связь с этапом плана. Не делаешь — просто отметь сделанной.
    const auto = isAutoTask(task);
    openDrawer('TASK / PROJECT', task ? 'Редактирование задачи' : 'Новая задача', `<form id="task-form"><label class="field"><span>Задача</span><input name="title" value="${escapeHTML(task?.title || '')}" required placeholder="Например: подготовить обложку" ${auto ? 'readonly' : ''}></label>${auto ? '<p class="drawer-note">Это шаг плана выпуска — название и удаление закрыты. Если шаг не нужен, просто отметьте его сделанным.</p>' : ''}<label class="field"><span>Связанный релиз</span><select name="project_id">${projectOptions}</select></label><div class="form-grid two"><label class="field"><span>Этап</span><select name="workflow_status">${workflowOptions}</select></label><label class="field"><span>Срок</span><input name="due_at" type="datetime-local" value="${toLocalInput(task?.due_at)}"></label></div><div class="drawer-actions">${task && !auto ? '<button class="button button-danger" id="delete-task" type="button">Удалить</button>' : '<span></span>'}<button class="button button-primary" type="submit">${task ? 'Сохранить' : 'Добавить задачу'}</button></div></form>`);
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
      logEvent('task', task ? 'Задача изменена' : 'Создана задача', payload.title, { view: 'tasks', project: payload.project_id });
    } catch (error) { toast(error.message || 'Не удалось сохранить задачу.', 'error'); }
    finally { setBusy(button, false); }
  }

  // Трек едет по этапам сам, когда закрывают ключевую задачу.


  // «Запланирован» без даты не попадёт в календарь, поэтому спрашиваем сразу.
  function offerReleaseDate(project, onSaved = null) {
    openDrawer('TRACK / РЕЛИЗ', 'Дата релиза', `<form id="release-date-form">
      <p class="drawer-note">Запланируйте дату релиза — и мы рассчитаем все необходимые цели на прогресс-баре.</p>
      <label class="field"><span>Когда выходит</span><input name="release_at" type="datetime-local" required></label>
      <div class="drawer-actions">
        <button class="text-button" id="release-date-skip" type="button">Позже</button>
        <button class="button button-primary" type="submit">Сохранить дату</button>
      </div>
    </form>`);
    $('#release-date-skip').addEventListener('click', () => {
      closeDrawer(true);
      toast('Дата не задана — трека пока не будет в календаре.');
    });
    $('#release-date-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = $('button[type="submit"]', event.currentTarget);
      const value = String(new FormData(event.currentTarget).get('release_at') || '');
      if (!value) return;
      setBusy(button, true, 'Сохраняем…');
      try {
        const releaseAt = new Date(value).toISOString();
        const previousReleaseAt = project.release_at;
        const { error } = await db.from('artist_projects').update({ release_at: releaseAt }).eq('id', project.id).eq('artist_id', state.artist.id);
        if (error) throw error;
        project.release_at = releaseAt;
        closeDrawer(true);
        toast('Дата релиза сохранена.');
        if (onSaved) await onSaved();
        else if (!(await fillStageDates(project))) await shiftStagesForRelease(project, previousReleaseAt);
        await syncProjectStatus(project);
        renderCalendar(); renderDashboard();
        if (state.activeProjectId) await renderTrackWorkspace(state.activeProjectId);
      } catch (error) { toast(error.message || 'Не удалось сохранить дату.', 'error'); }
      finally { setBusy(button, false); }
    });
  }

  // Этап закрыт, когда закрыты все его задачи. Открыл задачу обратно —
  // этап тоже открывается: иначе бар врал бы о готовности.
  async function syncStageFromTasks(task) {
    const spec = stageTaskByTitle(task && task.title);
    if (!spec) return;
    const stage = (state.stages || []).filter((row) => row.project_id === task.project_id
      && row.title === spec.stage)[0];
    if (!stage) return;
    const siblings = STAGE_TASKS.filter((row) => row.stage === spec.stage).map((row) => row.title);
    const allDone = siblings.every((title) => state.tasks.some((row) => row.project_id === task.project_id
      && row.title === title && row.is_done));
    if (stage.is_done === allDone) return;
    const { error } = await db.from('release_stages').update({ is_done: allDone })
      .eq('id', stage.id).eq('artist_id', state.artist.id);
    if (error) return console.warn('[artist-terminal] syncStageFromTasks:', error);
    state.stages = state.stages.map((row) => (row.id === stage.id ? { ...row, is_done: allDone } : row));
    if (allDone) toast('Этап «' + stage.title + '» закрыт.');
  }

  // Любое закрытие задачи может сменить фазу — подтягиваем статус в базе.
  async function syncProjectFromTasks(task) {
    const project = task && projectById(task.project_id);
    if (project) await syncProjectStatus(project);
  }

  async function toggleTask(id, isDone) {
    const previous = state.tasks.find((task) => task.id === id)?.is_done;
    const task = state.tasks.find((item) => item.id === id);
    // Единственная точка, через которую задачи закрываются. Проверка стоит
    // здесь, а не в разметке: списков три, и каждый забывал про блокировку.
    if (isDone && task) {
      const blockers = taskBlockers(task);
      if (blockers.length) {
        renderDashboard(); renderTasksView();
        if (state.activeProjectId) await renderTrackWorkspace(state.activeProjectId);
        return toast('Сначала: ' + blockers.join(', ') + '.', 'error');
      }
    }
    const previousWorkflow = task ? taskWorkflow(task) : 'idea';
    const workflowStatus = isDone ? 'uploaded' : (previousWorkflow === 'uploaded' ? 'doing' : previousWorkflow);
    if (task) { task.is_done = isDone; task.workflow_status = workflowStatus; }
    renderDashboard();
    renderTasksView();
    try {
      const { error } = await db.from('project_tasks').update({ is_done: isDone, workflow_status: workflowStatus }).eq('id', id).eq('artist_id', state.artist.id);
      if (error) throw error;
      logEvent('task', isDone ? 'Задача закрыта' : 'Задача снова открыта', task?.title || '', { view: 'tasks', id, project: task?.project_id });
      if (task?.project_id) { await syncStageFromTasks(task); await syncProjectFromTasks(task); }
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
    if (!(await askYesNo(`Удалить задачу «${task.title}»?`, '', 'Удалить', true))) return;
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

  // Хранить чужие мастера и стемы нам не по карману, поэтому предлагаем
  // держать файлы в облаке, а здесь — ссылки. Загрузка всё равно доступна.
  function showMaterialsHint(initialProjectId = '') {
    const host = document.createElement('div');
    host.className = 'materials-hint';
    host.innerHTML = `<div class="materials-hint-backdrop" data-hint-close></div>
      <div class="materials-hint-card" role="dialog" aria-label="О хранении материалов">
        <button class="icon-button materials-hint-x" type="button" data-hint-close aria-label="Закрыть">×</button>
        <div class="cassette-stage" aria-hidden="true">
          <div class="cassette-orbit"><div class="cassette-hold">
            <svg class="cassette" viewBox="0 0 64 52" role="img">
              <g class="cassette-arm cassette-arm-l"><rect x="1" y="20" width="9" height="4" rx="2"/></g>
              <g class="cassette-arm cassette-arm-r"><rect x="54" y="20" width="9" height="4" rx="2"/></g>
              <g class="cassette-leg cassette-leg-l"><rect x="20" y="36" width="4" height="13" rx="2"/><rect x="17" y="47" width="10" height="4" rx="2"/></g>
              <g class="cassette-leg cassette-leg-r"><rect x="40" y="36" width="4" height="13" rx="2"/><rect x="37" y="47" width="10" height="4" rx="2"/></g>
              <rect class="cassette-body" x="8" y="6" width="48" height="33" rx="4"/>
              <rect class="cassette-window" x="14" y="12" width="36" height="15" rx="2"/>
              <circle class="cassette-reel" cx="23" cy="19.5" r="4.2"/>
              <circle class="cassette-reel cassette-reel-b" cx="41" cy="19.5" r="4.2"/>
              <circle class="cassette-eye" cx="24" cy="33" r="1.7"/>
              <circle class="cassette-eye" cx="40" cy="33" r="1.7"/>
              <path class="cassette-smile" d="M27 35.5 q5 3.5 10 0"/>
            </svg>
          </div></div>
        </div>
        <h3>Мы ещё только начинающий лейбл</h3>
        <p>Без больших системных мощностей, поэтому не можем хранить все ваши материалы здесь. Но вы можете добавить их на Яндекс Диск или ещё куда-нибудь, а ссылки разместить здесь — обещаем никогда их не потерять.</p>
        <div class="materials-hint-actions">
          <button class="button button-primary" type="button" data-hint-links>Добавить ссылку</button>
        </div>
      </div>`;
    document.body.appendChild(host);
    const close = () => host.remove();
    $$('[data-hint-close]', host).forEach((element) => element.addEventListener('click', close));
    $('[data-hint-links]', host).addEventListener('click', () => { close(); openMaterialLinkDrawer(initialProjectId); });
  }

  async function deleteMaterialLink(fileId, button) {
    const file = (state.files || []).find((item) => item.id === fileId);
    if (!file) return;
    if (!(await askYesNo(`Удалить ссылку «${file.original_name}»?`, 'Файл в вашем облаке останется.', 'Удалить', true))) return;
    setPending(button, true);
    const { error } = await db.from('project_files').delete().eq('id', fileId).eq('artist_id', state.artist.id);
    setPending(button, false);
    if (error) return toast(error.message || 'Не удалось удалить ссылку.', 'error');
    state.files = state.files.filter((item) => item.id !== fileId);
    toast('Ссылка удалена.');
    logEvent('file', 'Удалена ссылка на материал', file.original_name || '', { view: 'track', id: file.project_id, project: file.project_id });
    if (state.activeProjectId) await renderTrackWorkspace(state.activeProjectId);
  }

  function openMaterialLinkDrawer(projectId) {
    openDrawer('TRACK / МАТЕРИАЛЫ', 'Ссылка на материал', `<form id="material-link-form">
      <label class="field"><span>Что это</span><input name="title" placeholder="Мастер, стемы, обложка…" required></label>
      <label class="field"><span>Ссылка</span><input name="url" type="url" placeholder="https://disk.yandex.ru/…" required><small>Проверьте, что доступ по ссылке открыт — иначе её никто не откроет.</small></label>
      <label class="field"><span>Тип</span><select name="file_kind">
        <option value="master">Мастер</option>
        <option value="demo">Демо</option>
        <option value="stem">Стемы</option>
        <option value="video">Видео</option>
        <option value="cover">Обложка</option>
        <option value="document">Документы</option>
        <option value="other" selected>Другое</option>
      </select></label>
      <div class="drawer-actions"><span></span><button class="button button-primary" type="submit">Добавить</button></div>
    </form>`);
    $('#material-link-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = $('button[type="submit"]', event.currentTarget);
      const data = new FormData(event.currentTarget);
      setBusy(button, true, 'Добавляем…');
      try {
        const { error } = await db.from('project_files').insert({
          artist_id: state.artist.id,
          project_id: projectId,
          file_kind: String(data.get('file_kind') || 'other'),
          bucket_id: 'link',
          storage_path: null,
          link_url: String(data.get('url') || '').trim(),
          original_name: String(data.get('title') || '').trim(),
        });
        if (error) throw error;
        state.files = await safeQuery(db.from('project_files').select('*').eq('artist_id', state.artist.id).order('created_at', { ascending: false }));
        closeDrawer(true);
        toast('Ссылка добавлена в материалы.');
        logEvent('file', 'Добавлена ссылка на материал', String(data.get('title') || ''), { view: 'track', id: projectId, project: projectId });
        if (state.activeProjectId) await renderTrackWorkspace(state.activeProjectId);
      } catch (error) { toast(error.message || 'Не удалось добавить ссылку.', 'error'); }
      finally { setBusy(button, false); }
    });
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
        const path = `${state.artist.id}/projects/${projectId}/files/${Date.now()}-${index}-${safeFileName(file.name)}`;
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

  async function downloadProjectFile(id, button) {
    setPending(button, true);
    try {
      await downloadProjectFileInner(id);
    } finally { setPending(button, false); }
  }

  async function downloadProjectFileInner(id) {
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
          <div class="form-grid two beat-bpm-row"><label class="field"><span>Темп, BPM</span><input name="bpm" type="number" min="40" max="300" inputmode="numeric" value="${escapeHTML(beat?.bpm ?? '')}" placeholder="например, 140"></label><div class="field"><span>Не знаете темп?</span><button class="button" type="button" data-tap-tempo>Тап — нажимайте в ритм</button></div></div>
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
    bindTapTempo(form);
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
      bpm: data.get('bpm') ? Math.min(300, Math.max(40, Math.round(Number(data.get('bpm'))))) : null,
      seller_link: String(data.get('seller_link') || '').trim() || null,
      seller: state.artist.name,
      currency: 'RUB',
      artist_id: state.artist.id,
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
        const path = `${state.artist.id}/beats/${Date.now()}-${safeFileName(file.name)}`;
        if (isPrivate) {
          const { error } = await db.storage.from('artist-private').upload(path, file, { contentType: file.type, upsert: false });
          if (error) throw error;
          payload.private_master_path = path;
        } else {
          const publicPath = `${state.artist.id}/${Date.now()}-${safeFileName(file.name)}`;
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
      logEvent('beat', beat ? 'Бит обновлён' : 'Загружен бит', payload.title || '', { view: 'beats' });
    } catch (error) {
      toast(error.message || 'Не удалось сохранить бит.', 'error');
    } finally { setBusy(submit, false); }
  }

  async function deleteBeat(beat) {
    if (!(await askYesNo(`Удалить бит «${beat.title}»?`, '', 'Удалить', true))) return;
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
    state.beats = await safeQuery(db.from('beats').select('id,title,seller,seller_link,price,bpm,audio_url,storage_path,publication_status,public_preview_path,private_master_path,cover_url,currency,published_at,created_at,updated_at').eq('artist_id', state.artist.id).order('created_at', { ascending: false }));
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
      return `<article class="project-card" data-open-project="${project.id}"><div class="project-cover">${coverMarkup}</div><div class="project-body"><span class="eyebrow">${formatDate(project.release_at)}</span><h3>${escapeHTML(project.title)}</h3><div class="project-meta"><span>${project.beat_id ? 'Бит выбран' : 'Без бита'}</span><span class="status-chip phase-${projectPhase(project)}">${PROJECT_PHASE[projectPhase(project)]}</span></div></div></article>`;
    }));
    container.innerHTML = cards.join('');
    bindProjectButtons(container);
  }

  // Клик по бару ведёт на дашборд, ставит этот релиз фокус-проектом
  // и прокручивает к полному пути. Открытие трека при этом не срабатывает.
  function bindRolloutJump(root) {
    $$('[data-mini-rollout]', root).forEach((node) => {
      node.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); node.click(); }
      });
      node.addEventListener('click', async (event) => {
        event.stopPropagation();
        state.dashboardProjectId = node.dataset.miniRollout;
        renderDashboardProjectSelect();
        await goView('dashboard');
        renderDashboard();
        const panel = $('#dashboard-rollout');
        if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }

  function bindProjectButtons(root) {
    bindRolloutJump(root);
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
    if (!state.artist) throw new Error(ARTIST_NOT_READY);
    const payload = { artist_id: state.artist.id, title: 'Без названия', status: initialStatus, beat_id: null, description: '', release_at: null, timezone: 'Europe/Moscow' };
    const { data: saved, error } = await db.from('artist_projects').insert(payload).select().single();
    if (error) throw error;
    const defaults = DEFAULT_PROJECT_TASKS.map((title, index) => ({ artist_id: state.artist.id, project_id: saved.id, title, workflow_status: 'idea', is_done: false, sort_order: index }));
    const { error: taskError } = await db.from('project_tasks').insert(defaults);
    if (taskError) console.error('Failed to seed default tasks for draft project', taskError);
    // Этапы появляются сразу вместе с релизом, но без дат: смещения известны,
    // а даты посчитаются, как только будет назначен день Х.
    const stageRows = ROLLOUT_TEMPLATES.single.stages.map((stage, index) => ({
      artist_id: state.artist.id, project_id: saved.id, title: stage.title,
      stage_date: null, day_offset: stage.day, repeat_rule: stage.repeat, sort_order: index,
    }));
    const { error: stageError } = await db.from('release_stages').insert(stageRows);
    if (stageError) console.error('Failed to seed release stages for draft project', stageError);
    state.stages = await safeQuery(db.from('release_stages').select('*').eq('artist_id', state.artist.id).order('sort_order'));
    state.projects = [saved, ...state.projects];
    state.tasks = await safeQuery(db.from('project_tasks').select('*').eq('artist_id', state.artist.id).order('is_done').order('sort_order').order('due_at'));
    state.freshDraftProjectId = saved.id;
    // Черновик в журнал не пишем: он ещё не релиз и может исчезнуть,
    // не оставив следа. Запись появится, когда трек действительно сохранят.
    return saved.id;
  }

  function isPristineDraft(project) {
    if (!project || state.freshDraftProjectId !== project.id) return false;
    const linkedTasks = state.tasks.filter((task) => task.project_id === project.id);
    const tasksArePristine = linkedTasks.length === DEFAULT_PROJECT_TASKS.length
      && linkedTasks.every((task) => DEFAULT_PROJECT_TASKS.includes(task.title) && !task.is_done);
    // Этапы у чистого черновика тоже нетронуты: без дат и не закрыты.
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
      state.stages = (state.stages || []).filter((stage) => stage.project_id !== project.id);
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
      .map((task) => {
        // Здесь задачи закрывались в любом порядке: блокировка учитывалась
        // только на дашборде, и питч можно было отметить раньше загрузки.
        const blockers = task.is_done ? [] : taskBlockers(task);
        const note = blockers.length
          ? 'ждёт: ' + blockers.join(', ')
          : `${task.due_at ? formatDate(task.due_at, { year: undefined }) : 'без даты'} · ${TASK_WORKFLOW[taskWorkflow(task)]}`;
        return `<article class="dashboard-task-row track-task-row ${task.is_done ? 'is-done' : ''} ${blockers.length ? 'is-blocked' : ''}">
        <label><input type="checkbox" data-track-task-check="${task.id}" ${task.is_done ? 'checked' : ''} ${blockers.length ? 'disabled' : ''}><span></span></label>
        <button data-open-task="${task.id}" type="button"><strong>${escapeHTML(task.title)}</strong><small>${escapeHTML(note)}</small></button>
      </article>`;
      }).join('') : '<p class="track-workspace-empty">Задач пока нет.</p>';
    const fileRows = linkedFiles.length
      ? linkedFiles.map((file) => (file.link_url
        ? `<div class="track-material-row"><a class="track-workspace-list-row is-link" href="${escapeHTML(file.link_url)}" target="_blank" rel="noopener"><span>${escapeHTML(file.original_name)}</span><small>${escapeHTML(file.file_kind)} · внешняя ссылка</small></a><button class="track-material-del" data-delete-file="${file.id}" type="button" aria-label="Удалить ссылку «${escapeHTML(file.original_name)}»" title="Удалить">×</button></div>`
        : `<button class="track-workspace-list-row" data-download-file="${file.id}" type="button"><span>${escapeHTML(file.original_name)}</span><small>${escapeHTML(file.file_kind)} · ${formatFileSize(file.size_bytes)}</small></button>`)).join('')
      : '<p class="track-workspace-empty">Файлов пока нет.</p>';
    // Пустое поле сразу пишущее: черновик хранится локально и подхватится,
    // когда текст создадут — так «Добавить» не обязательно нажимать первым.
    const lyricRows = linkedLyrics.length
      ? linkedLyrics.map((doc) => `<article class="track-lyrics-inline" data-track-lyrics-inline="${doc.id}"><div class="lyrics-wrap"><textarea data-inline-lyrics-body="${doc.id}" data-lyrics-tools placeholder="Слова, строки, идеи…">${escapeHTML(doc.body || '')}</textarea><div class="lyrics-gutter" aria-hidden="true"></div></div><div class="resize-bar" data-resize-bar title="Потяните, чтобы изменить высоту"></div><footer><button class="text-button" data-project-lyrics="${doc.id}" type="button">Открыть полностью</button><button class="button button-primary" data-save-inline-lyrics="${doc.id}" type="button">Сохранить</button></footer></article>`).join('')
      : `<article class="track-lyrics-inline"><div class="lyrics-wrap"><textarea id="track-lyrics-draft" data-lyrics-tools placeholder="Слова, строки, идеи… Текст создастся при сохранении.">${escapeHTML(lyricsDraft(id))}</textarea><div class="lyrics-gutter" aria-hidden="true"></div></div><div class="resize-bar" data-resize-bar title="Потяните, чтобы изменить высоту"></div><footer><button class="button button-primary" id="track-lyrics-draft-save" type="button">Сохранить текст</button></footer></article>`;
    const container = $('#track-workspace');
    container.innerHTML = `
      <div class="track-workspace-toolbar">
        <button class="text-button" id="track-workspace-back" type="button">← ${state.projectReturnView === 'dashboard' ? 'На дашборд' : 'Ко всем трекам'}</button>
        <span class="eyebrow">TRACK / ${project ? 'PROJECT' : 'NEW'}</span>
      </div>
      <form class="track-workspace-form" id="project-form">
        <section class="panel track-workspace-hero">
          <label class="cover-upload track-workspace-cover" id="project-cover-label" title="Обложка">${cover ? `<img src="${escapeHTML(cover)}" alt="Обложка">` : '<span>+</span>'}<input name="cover" type="file" accept="image/*" hidden></label>
          <div class="track-workspace-title" ${project ? `draggable="true" data-track-project-drag="${project.id}" title="Перетащите трек на нужную стадию"` : ''}>
            <input class="track-title-input" name="title" value="${escapeHTML(project?.title || '')}" required placeholder="Название трека">
            <button class="track-release-date" type="button" data-track-setdate title="Изменить дату релиза">${project?.release_at ? 'релиз ' + longDate(project.release_at) : 'дата релиза не назначена'}</button>
            <input name="status" value="${selectedStatus}" hidden>
            <input name="release_at" type="datetime-local" value="${toLocalInput(project?.release_at)}" hidden>
          </div>
          <div class="track-workspace-actions">
            <button class="button button-primary track-save-button" type="submit">${project && !isPristineDraft(project) ? 'Сохранить трек' : 'Создать трек'}</button>
          </div>
          <div class="track-status-row">
            ${trackRollout(project)}
          </div>
        </section>

        <div class="track-workspace-grid">
          <section class="panel track-workspace-lyrics">
            <header class="panel-header"><div><span class="eyebrow">Материал</span><h3>Текст</h3></div>
              <div class="lyrics-tools" role="group" aria-label="Помощники для текста">
                <label class="lyrics-tool"><input type="checkbox" data-lyrics-tool="syllables"><span>слоги</span></label>
                <label class="lyrics-tool" title="Рифма от ударной гласной до конца слова. Ударение можно поставить самому заглавной буквой: нЕльзя"><input type="checkbox" data-lyrics-tool="rhymes" value="ends"><span>рифмы в конце</span></label>
                <label class="lyrics-tool" title="Созвучие по ударной гласной в любом месте слова. Ударение можно поставить самому заглавной буквой: нЕльзя"><input type="checkbox" data-lyrics-tool="rhymes" value="all"><span>все рифмы</span></label>
                <button class="lyrics-beat" type="button" data-lyrics-beat hidden title="Включить бит трека"><span>▶</span> бит</button>
                <span class="lyrics-beat-counter" data-lyrics-beat-counter hidden><b data-beat-bar></b><span data-beat-time></span><button class="text-button" type="button" data-beat-bpm hidden>указать BPM</button></span>
                ${project ? '<button class="text-button" id="track-add-lyrics" type="button">+ Добавить</button>' : ''}
              </div></header>
            <div class="track-workspace-list track-workspace-lyrics-list">${project ? lyricRows : '<p class="track-workspace-empty">Сначала сохраните трек.</p>'}</div>
          </section>


          <section class="panel track-workspace-main">
            <header class="panel-header"><div><span class="eyebrow">Внутреннее</span><h3>Бит и заметки</h3></div><select class="track-beat-select" name="beat_id" aria-label="Бит">${beatOptions}</select></header>
            <div class="track-workspace-section-body">
              <div class="notes-toolbar" role="toolbar" aria-label="Форматирование заметок">
                <button type="button" class="notes-toolbar-btn" data-note-format="bold" title="Жирный"><b>B</b></button>
                <button type="button" class="notes-toolbar-btn" data-note-format="italic" title="Курсив"><i>I</i></button>
                <button type="button" class="notes-toolbar-btn" data-note-format="underline" title="Подчёркнутый"><u>U</u></button>
                <label class="notes-toolbar-btn notes-color" title="Цвет текста"><span>A</span><i></i><input type="color" data-note-color value="#eef0df"></label>
                <button type="button" class="notes-toolbar-btn" data-note-format="insertUnorderedList" title="Список точками">&bull;</button>
                <button type="button" class="notes-toolbar-btn" data-note-format="insertOrderedList" title="Нумерованный список">1.</button>
              </div>
              <div class="field notes-field"><div class="notes-editor" data-notes-editor contenteditable="true" role="textbox" aria-multiline="true" aria-label="Заметки по треку" data-placeholder="Заметки по треку…">${notesToHTML(project?.description || '')}</div><div class="resize-bar" data-resize-bar title="Потяните, чтобы изменить высоту"></div></div>
            </div>
          </section>

          <section class="panel track-workspace-tasks">
            <header class="panel-header"><div><span class="eyebrow">Производство и промо</span><h3>Задачи трека</h3></div>${project ? '<button class="text-button" id="track-add-task" type="button">+ Задача</button>' : ''}</header>
            ${project ? `<div class="track-task-list" id="track-tasks-list">${taskRows}</div>` : '<p class="track-workspace-empty large">Сохраните трек — стандартные задачи появятся автоматически.</p>'}
          </section>

          <section class="panel track-workspace-files">
            <header class="panel-header"><div><span class="eyebrow">Необязательно</span><h3>Материалы проекта</h3><p>Обложки, документы, стемы, видео, аудио и всё, всё, всё</p></div>${project ? '<button class="text-button" id="track-add-file" type="button">+ Файл</button>' : ''}</header>
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
      const hint = $('#project-status-hint');
      if (hint) hint.textContent = PROJECT_STATUS_HINT[status] || '';
    };
    const setDate = $('[data-track-setdate]', form);
    if (setDate) setDate.addEventListener('click', async () => {
      if (!project) return toast('Сначала сохраните трек.', 'error');
      // Шторка даты перерисовывает всё рабочее пространство, поэтому
      // недописанное название и заметки сначала уходят в автосохранение.
      if (activeWorkspaceFlush) {
        const flush = activeWorkspaceFlush;
        activeWorkspaceFlush = null;
        try { await flush(); } catch (error) { console.warn('[artist-terminal] flush before date:', error); }
      }
      offerReleaseDate(project);
    });
    bindRolloutJump(form);
    bindResizeBars(form);
    bindLyricsTools(form);
    bindLyricsBeat(form);
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
      // Объяснять про хранение нужно один раз: если ссылки уже есть, сразу форма.
      $('#track-add-file').addEventListener('click', () => {
        if (linkedFiles.some((file) => file.link_url)) openMaterialLinkDrawer(project.id);
        else showMaterialsHint(project.id);
      });
      $$('[data-delete-file]', container).forEach((button) => button.addEventListener('click', () => deleteMaterialLink(button.dataset.deleteFile, button)));
      // Если текст у трека уже есть, кнопка открывает его, а не пустую форму.
      $('#track-add-lyrics').addEventListener('click', () => openLyricsDrawer(linkedLyrics[0]?.id || null, project.id));
      $('#track-lyrics-draft')?.addEventListener('input', (event) => setLyricsDraft(project.id, event.target.value));
      $('#track-lyrics-draft-save')?.addEventListener('click', () => openLyricsDrawer(null, project.id));
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
        const colorInput = $('[data-note-color]', form);
        if (colorInput) {
          let savedRange = null;
          colorInput.parentElement.addEventListener('mousedown', () => {
            const selection = window.getSelection();
            savedRange = selection && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
          });
          colorInput.addEventListener('input', () => {
            notesEditor.focus();
            if (savedRange) { const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(savedRange); }
            document.execCommand('foreColor', false, colorInput.value);
            colorInput.parentElement.querySelector('i').style.background = colorInput.value;
            projectDirty = true;
            scheduleWorkspaceSave();
          });
        }
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
        const keep = await askDialog({ title: `Сохранить новый трек${named}?`,
          text: 'Если не сохранять — черновик и его задачи будут удалены.',
          actions: [{ id: 'drop', label: 'Удалить черновик', danger: true }, { id: 'keep', label: 'Сохранить', primary: true }] }) === 'keep';
        if (keep) {
          state.freshDraftProjectId = null;
          logEvent('release', 'Создан релиз', latestProject.title || 'Без названия', { view: 'track', id: latestProject.id, project: latestProject.id });
        } else {
          await deleteDraftSilently(latestProject);
        }
      };
    }
    $$('[data-download-file]', form).forEach((button) => button.addEventListener('click', () => downloadProjectFile(button.dataset.downloadFile, button)));
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
    const previousReleaseAt = project.release_at;
    try {
      const { data: row, error } = await db.from('artist_projects').update(payload).eq('id', project.id).eq('artist_id', state.artist.id).select().single();
      if (error) throw error;
      let saved = row;
      const cover = data.get('cover');
      if (cover instanceof File && cover.size) {
        const path = `${state.artist.id}/projects/${saved.id}/cover-${Date.now()}-${safeFileName(cover.name)}`;
        const { error: uploadError } = await db.storage.from('artist-private').upload(path, cover, { contentType: cover.type });
        if (uploadError) throw uploadError;
        const { data: coverRow, error: coverError } = await db.from('artist_projects').update({ cover_storage_path: path }).eq('id', saved.id).eq('artist_id', state.artist.id).select().single();
        if (coverError) throw coverError;
        saved = coverRow;
      }
      state.projects = await safeQuery(db.from('artist_projects').select('*').eq('artist_id', state.artist.id).order('updated_at', { ascending: false }));
      if (state.freshDraftProjectId === saved.id) {
        state.freshDraftProjectId = null;
        logEvent('release', 'Создан релиз', saved.title || 'Без названия', { view: 'track', id: saved.id, project: saved.id });
      }
      if (!(await fillStageDates(saved))) await shiftStagesForRelease(saved, previousReleaseAt);
      await syncProjectStatus(projectById(saved.id) || saved);
      await renderProjects(); renderDashboard(); renderCalendar();
      activeWorkspaceFlush = null;
      state.activeProjectId = null;
      await goView('projects');
      const url = new URL(location.href);
      url.searchParams.set('section', 'projects');
      url.searchParams.delete('project');
      history.replaceState({}, '', `${url.pathname}${url.search}`);
      toast('Проект обновлён.');
      // Обязательным задачам нужна только дата выхода — от неё построится
      // весь план. Остальные сроки спрашиваем, только если есть свои задачи.
      if (!saved.release_at) offerReleaseDate(saved);
      else offerTaskDates(saved.id);
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
      state.stages = (state.stages || []).filter((stage) => stage.project_id !== project.id);
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
      logEvent('release', 'Релиз удалён', project.title || '');
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

  // Черновик текста до создания документа: живёт локально, привязан к треку.
  const LYRICS_DRAFT_KEY = 'inmise-lyrics-draft';
  const lyricsDrafts = () => {
    try { return JSON.parse(localStorage.getItem(LYRICS_DRAFT_KEY) || '{}'); } catch { return {}; }
  };
  const lyricsDraft = (projectId) => (projectId ? (lyricsDrafts()[projectId] || '') : '');
  const setLyricsDraft = (projectId, value) => {
    if (!projectId) return;
    const drafts = lyricsDrafts();
    if (value.trim()) drafts[projectId] = value; else delete drafts[projectId];
    try { localStorage.setItem(LYRICS_DRAFT_KEY, JSON.stringify(drafts)); } catch { /* приватный режим */ }
  };
  const clearLyricsDraft = (projectId) => setLyricsDraft(projectId, '');

  // Автоматические задачи сроки не спрашивают: они получают их от даты
  // релиза через свои этапы. Спрашивать девять дат руками — издевательство.
  const unplannedTasks = (projectId = null) => (state.tasks || []).filter((task) => !task.is_done
    && !task.due_at && !isAutoTask(task) && (!projectId || task.project_id === projectId));

  // После сохранения трека предлагаем сроки его задачам: без дат они не попадают
  // ни в календарь, ни в напоминания.
  function offerTaskDates(projectId) {
    const pending = unplannedTasks(projectId);
    if (!pending.length) return;
    openDrawer('TRACK / ПЛАН', 'Сроки задач', `<form id="task-dates-form">
      <p class="drawer-note">У этих задач нет даты, поэтому в календаре их не видно. Поставьте сроки — хотя бы примерные, потом поправите.</p>
      ${pending.map((task) => `<label class="field"><span>${escapeHTML(task.title)}</span><input type="date" name="due:${task.id}"></label>`).join('')}
      <div class="drawer-actions">
        <button class="text-button" id="task-dates-skip" type="button">Позже</button>
        <button class="button button-primary" type="submit">Сохранить сроки</button>
      </div>
    </form>`);
    $('#task-dates-skip').addEventListener('click', () => {
      closeDrawer(true);
      toast('Хорошо. Секретарь напомнит о задачах без сроков.');
    });
    $('#task-dates-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = $('button[type="submit"]', event.currentTarget);
      const data = new FormData(event.currentTarget);
      const updates = [];
      pending.forEach((task) => {
        const value = String(data.get(`due:${task.id}`) || '');
        if (value) updates.push({ id: task.id, due_at: new Date(`${value}T12:00`).toISOString() });
      });
      if (!updates.length) return toast('Ни одной даты не выбрано.', 'error');
      setBusy(button, true, 'Сохраняем…');
      try {
        for (const update of updates) {
          const { error } = await db.from('project_tasks').update({ due_at: update.due_at }).eq('id', update.id).eq('artist_id', state.artist.id);
          if (error) throw error;
        }
        state.tasks = await safeQuery(db.from('project_tasks').select('*').eq('artist_id', state.artist.id).order('is_done').order('sort_order').order('due_at'));
        closeDrawer(true);
        toast(`Сроки расставлены: ${updates.length}.`);
        renderCalendar(); renderTasksView(); renderDashboard();
      } catch (error) { toast(error.message || 'Не удалось сохранить сроки.', 'error'); }
      finally { setBusy(button, false); }
    });
  }

  // Ненавязчивая полоска на дашборде: не модалка и не тост, закрывается на день.
  function renderUnplannedNotice() {
    const host = $('#dashboard-notice');
    if (!host) return;
    const pending = unplannedTasks();
    const hiddenUntil = localStorage.getItem('inmise-unplanned-hidden') || '';
    const todayKey = new Date().toISOString().slice(0, 10);
    if (!pending.length || hiddenUntil === todayKey) { host.hidden = true; host.innerHTML = ''; return; }
    host.hidden = false;
    host.innerHTML = `<span>У вас ${pending.length} ${plural(pending.length, 'задача', 'задачи', 'задач')} без срока — в календаре их не видно.</span>
      <span class="dashboard-notice-actions">
        <button class="text-button" data-notice-plan type="button">Расставить</button>
        <button class="text-button" data-notice-hide type="button" aria-label="Скрыть до завтра">×</button>
      </span>`;
    $('[data-notice-plan]', host).addEventListener('click', () => offerTaskDates(null));
    $('[data-notice-hide]', host).addEventListener('click', () => {
      try { localStorage.setItem('inmise-unplanned-hidden', todayKey); } catch { /* приватный режим */ }
      host.hidden = true;
    });
  }

  function openLyricsDrawer(id = null, initialProjectId = '') {
    const doc = state.lyrics.find((item) => item.id === id) || null;
    // Новый текст открываем уже с тем, что успели напечатать в панели трека.
    const draftBody = doc ? '' : lyricsDraft(initialProjectId);
    const selectedProjectId = doc?.project_id || initialProjectId;
    const projectOptions = ['<option value="">Не привязан к треку</option>', ...state.projects.map((project) => `<option value="${project.id}" ${selectedProjectId === project.id ? 'selected' : ''}>${escapeHTML(project.title)}</option>`)].join('');
    const selectedCategory = doc?.category || 'В работе';
    const categoryOptions = lyricsCategories().map((category) => `<option value="${escapeHTML(category)}" ${selectedCategory === category ? 'selected' : ''}>${escapeHTML(category)}</option>`).join('');
    openDrawer('TEXT / LYRICS', doc ? 'Редактирование текста' : 'Новый текст', `<form id="lyrics-drawer-form"><div class="form-grid two"><label class="field"><span>Название</span><input name="title" value="${escapeHTML(doc?.title || '')}" required></label><label class="field"><span>Статус</span><select name="document_status"><option value="draft" ${doc?.document_status === 'draft' ? 'selected' : ''}>Черновик</option><option value="ready" ${doc?.document_status === 'ready' ? 'selected' : ''}>Готов</option><option value="archived" ${doc?.document_status === 'archived' ? 'selected' : ''}>Архив</option></select></label></div><div class="form-grid two"><label class="field"><span>Трек</span><select name="project_id">${projectOptions}</select></label><label class="field"><span>Категория</span><select name="category">${categoryOptions}<option value="__custom__">+ Своя категория…</option></select></label></div><label class="field lyrics-custom-category" id="lyrics-drawer-custom-category" hidden><span>Название своей категории</span><input name="custom_category" maxlength="40" placeholder="Например: Второй альбом"></label><label class="field"><span>Текст</span><textarea class="lyrics-body lyrics-body-autogrow" name="body" placeholder="Начните писать…">${escapeHTML(doc?.body || draftBody)}</textarea></label><div class="drawer-actions">${doc ? '<button class="button button-danger" id="delete-lyrics-drawer" type="button">Удалить</button>' : '<span></span>'}<button class="button button-primary" type="submit">Сохранить текст</button></div></form>`);
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
      if (payload.project_id) clearLyricsDraft(payload.project_id);
      drawerDirty = false;
      closeDrawer();
      toast('Текст сохранён.');
      if (state.activeProjectId) await renderTrackWorkspace(state.activeProjectId);
    } catch (error) { toast(error.message || 'Не удалось сохранить текст.', 'error'); }
    finally { setBusy(button, false); }
  }

  async function deleteLyricsDrawer(doc) {
    if (!doc) return;
    if (!(await askYesNo(`Удалить текст «${doc.title}»?`, '', 'Удалить', true))) return;
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
  // Журнал «Секретаря». Событие — побочная запись: если она не легла, основное
  // действие всё равно считается успешным, поэтому ошибку только логируем.
  async function logEvent(kind, title, detail = '', target = {}) {
    if (!state.artist?.id) return;
    try {
      await db.from('artist_events').insert({
        artist_id: state.artist.id,
        kind,
        title,
        detail: String(detail || ''),
        target_view: target.view || null,
        target_id: target.id || null,
        project_id: target.project || null,
      });
      state.secretaryLoaded = false;
    } catch (error) {
      console.warn('event log skipped', error);
    }
  }

  // Отмеченные площадки берём из активного списка «Куда публикуем».
  const selectedPlatforms = () => $$('.autopost-dests:not([hidden]) input[name="platforms"]:checked').map((el) => el.value);
  const plural = (n, one, few, many) => {
    const mod100 = n % 100, mod10 = n % 10;
    if (mod100 >= 11 && mod100 <= 14) return many;
    if (mod10 === 1) return one;
    if (mod10 >= 2 && mod10 <= 4) return few;
    return many;
  };

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
    logEvent('platform', `Подключён ${label}`, data.account_name || '', { view: 'autopost' });
  }

  async function disconnectSocial(platform, button) {
    const label = SOCIAL_PLATFORM_LABEL[platform] || platform;
    if (!(await askYesNo(`Отключить ${label}?`, 'Публиковать туда не получится, пока не подключите заново.', 'Отключить', true))) return;
    setBusy(button, true, 'Отключаем…');
    const { data, error } = await db.functions.invoke('social-connect', { body: { action: 'disconnect', platform } });
    setBusy(button, false);
    if (error || data?.error) return toast(`Не удалось отключить ${label}.`, 'error');
    toast(`${label} отключён.`);
    logEvent('platform', `Отключён ${label}`, '', { view: 'autopost' });
    renderAutopost();
  }

  // Поповеры настроек площадок закрываются глобально: раньше обработчик
  // вешался при каждом рендере и держал ссылку на устаревший контейнер.
  function closeAllDestPopovers(except) {
    $$('.autopost-dest-pop').forEach((pop) => {
      if (pop === except) return;
      pop.closest('.autopost-dest')?.classList.remove('has-pop');
      pop.remove();
    });
    $$('[data-dest-settings]').forEach((button) => {
      if (!button.parentElement.querySelector('.autopost-dest-pop')) button.setAttribute('aria-expanded', 'false');
    });
  }

  async function renderAutopost() {
    const container = $('#autopost-panel');
    if (!state.artist) { container.innerHTML = `<p class="track-workspace-empty">${ARTIST_NOT_READY}</p>`; return; }
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
    // Одна строка на площадку: и выбор «публиковать сюда», и состояние, и настройки.
    // Раньше это были карточки сверху и отдельные галочки внизу — два места про одно.
    const destState = (platform, info) => {
      if (!info.connected) return { cls: 'is-off', text: 'не подключено' };
      if (platform === 'vk' && !info.has_community_token) return { cls: 'is-warn', text: 'лента недоступна' };
      return { cls: 'is-ok', text: 'подключено' };
    };
    const destRow = (platform, mode) => {
      const info = connections[platform] || { connected: false };
      const state = destState(platform, info);
      const sub = platform === 'vk' && mode === 'video'
        ? `<div class="autopost-dest-sub" id="autopost-clip-toggle" hidden><label><input type="checkbox" name="vk_clip"><span>Опубликовать вертикальным клипом</span></label></div>`
        : '';
      return `<div class="autopost-dest autopost-dest-${platform} ${state.cls}" data-dest="${platform}">
        <input type="checkbox" name="platforms" value="${platform}" ${info.connected ? 'checked' : 'disabled'} aria-label="Публиковать в ${SOCIAL_PLATFORM_LABEL[platform]}">
        <span class="autopost-dest-mark">${platformMark[platform]}</span>
        <span class="autopost-dest-acct">${info.connected ? escapeHTML(info.account_name || SOCIAL_PLATFORM_LABEL[platform]) : SOCIAL_PLATFORM_LABEL[platform]}</span>
        <span class="autopost-dest-state"><i aria-hidden="true"></i>${state.text}</span>
        <button class="autopost-dest-gear" type="button" data-dest-settings="${platform}" aria-expanded="false">${info.connected ? 'настройки' : 'подключить'}</button>
      </div>${sub}`;
    };
    const videoDests = SOCIAL_VIDEO_PLATFORMS.map((p) => destRow(p, 'video')).join('');
    const textDests = SOCIAL_TEXT_PLATFORMS.map((p) => destRow(p, 'text')).join('');

    const historyRows = (posts || []).map((post) => {
      const postTargets = (targets || []).filter((target) => target.post_id === post.id);
      const targetBadges = postTargets.map((target) => {
        const label = SOCIAL_PLATFORM_LABEL[target.platform] || target.platform;
        if (target.status === 'success') return `<a class="autopost-target-badge is-success" href="${escapeHTML(target.external_post_url || '#')}" target="_blank" rel="noopener">${label}: опубликовано</a>`;
        if (target.status === 'failed') return `<span class="autopost-target-badge is-failed" title="${escapeHTML(target.error_message || '')}">${label}: ошибка</span>`;
        return `<span class="autopost-target-badge">${label}: ${escapeHTML(target.status)}</span>`;
      }).join('');
      const failed = postTargets.filter((target) => target.status === 'failed');
      const canRetry = post.storage_path && failed.length;
      const retryLabel = failed.length === 1
        ? `Повторить ${SOCIAL_PLATFORM_LABEL[failed[0].platform] || failed[0].platform}`
        : 'Повторить';
      return `<tr>
        <td><span class="autopost-history-name">${escapeHTML(post.title || 'Без названия')}</span><small>${formatDate(post.created_at)}</small></td>
        <td><div class="autopost-target-badges">${targetBadges || '<span class="autopost-target-badge">нет площадок</span>'}</div></td>
        <td class="autopost-history-action">${canRetry ? `<button class="text-button" data-retry-post="${post.id}" type="button">${retryLabel}</button>` : ''}</td>
      </tr>`;
    }).join('');

    container.innerHTML = `
      <section class="panel autopost-dests-panel">
        <header class="panel-header">
          <div><span class="eyebrow">Шаг 1</span><h3>Куда публикуем</h3></div>
          <span class="autopost-dests-count" id="autopost-dests-count"></span>
        </header>
        <div class="autopost-dests" data-mode="video">${videoDests}</div>
        <div class="autopost-dests" data-mode="text" hidden>${textDests}</div>
      </section>
      <div class="autopost-help" id="ig-help" hidden>
        <ol class="autopost-help-steps">
          <li><strong>Нужен аккаунт Facebook.</strong> Именно с личного профиля Facebook создаётся Страница и выполняется вход при подключении. Нет аккаунта — сначала зарегистрируйтесь на facebook.com.</li>
          <li><strong>Сделайте Instagram бизнес-аккаунтом.</strong> В приложении Instagram: профиль → ☰ → «Настройки и конфиденциальность» → раздел «Для профессионалов» → «Тип аккаунта и инструменты» → выберите <strong>«Бизнес»</strong> (не «Автор»).</li>
          <li><strong>Создайте страницу Facebook и привяжите к ней Instagram.</strong> На facebook.com: Меню → «Страницы» → «Создать». Затем откройте <strong>Meta Business Suite</strong> → Настройки → «Аккаунты Instagram» → подключите свою инсту и свяжите со страницей.</li>
          <li><strong>Нажмите «Подключить».</strong> Войдите в Facebook и на экране согласия <strong>обязательно отметьте свою Страницу и Instagram</strong> — не снимайте разрешения.</li>
        </ol>
        <div class="autopost-help-foot"><button class="text-button" type="button" data-ig-help-close>Понятно</button></div>
      </div>
      <section class="panel autopost-composer">
        <header class="panel-header">
          <div><span class="eyebrow">Шаг 2</span><h3 id="autopost-composer-title">Видео и подпись</h3></div>
        </header>
        <form id="autopost-form" class="autopost-form autopost-form-video" data-mode="video">
          <div class="autopost-col-media">
          <label class="autopost-dropzone" id="autopost-dropzone">
            <video class="autopost-dropzone-video" id="autopost-dropzone-video" muted playsinline hidden></video>
            <span class="autopost-dropzone-empty" id="autopost-dropzone-empty"><span class="autopost-dropzone-icon">↥</span><strong>Перетащите видео сюда</strong><small>или нажмите, чтобы выбрать файл</small></span>
            <span class="autopost-orient-tag" id="autopost-orient-tag" hidden></span>
            <span class="autopost-file-badge" id="autopost-file-badge" hidden></span>
            <input type="file" name="video" accept="video/*" hidden required>
          </label>
          <div class="shorts-bar" id="shorts-bar" hidden>
            <button type="button" class="button shorts-open-btn" id="shorts-open">Обрезать и сделать вертикальным</button>
            <span class="shorts-hint" id="shorts-hint" hidden>Горизонтальное видео — для Shorts и Reels нужна вертикальная версия</span>
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
          </div>
          <div class="autopost-col-meta">
            <label class="field"><span>Название</span><input type="text" name="title" maxlength="120" placeholder="Название публикации" required></label>
            <label class="field"><span>Подпись / описание</span><textarea name="caption" rows="4" placeholder="Текст под видео…"></textarea></label>
            <button class="button button-primary autopost-publish-btn" type="submit" data-publish-btn>Опубликовать</button>
            <p class="autopost-publish-note" data-publish-note></p>
          </div>
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
          <div class="autopost-publish-row"><p class="autopost-publish-note" data-publish-note></p><button class="button button-primary autopost-publish-btn" type="submit" data-publish-btn>Опубликовать</button></div>
        </form>
      </section>
      <section class="panel autopost-history">
        <header class="panel-header"><div><span class="eyebrow">История</span><h3>Публикации</h3></div></header>
        ${historyRows
          ? `<div class="autopost-history-wrap"><table class="autopost-history-table">
              <thead><tr><th>Публикация</th><th>Площадки</th><th></th></tr></thead>
              <tbody>${historyRows}</tbody>
            </table></div>`
          : '<p class="track-workspace-empty">Публикаций пока нет.</p>'}
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
      composerTitle.textContent = mode === 'text' ? 'Текст и вложения' : 'Видео и подпись';
      syncDests();
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

    // Настройки открываются у своей строки — какую площадку нажал, ту и настраиваешь.
    const closeDestPopovers = closeAllDestPopovers;
    const connectPlatform = (platform, button) => {
      if (SOCIAL_TOKEN_PLATFORMS.includes(platform)) return openTokenConnectDrawer(platform);
      // Дальше уход на страницу площадки: кнопку не разблокируем, ждать нечего.
      setBusy(button, true, 'Открываем…');
      startSocialConnect(platform);
    };
    $$('[data-dest-settings]', container).forEach((button) => button.addEventListener('click', () => {
      const platform = button.dataset.destSettings;
      const row = button.closest('.autopost-dest');
      const existing = row.querySelector('.autopost-dest-pop');
      closeDestPopovers();
      if (existing) return;

      const info = connections[platform] || { connected: false };
      if (!info.connected && platform !== 'instagram') return connectPlatform(platform, button);

      const pop = document.createElement('div');
      pop.className = 'autopost-dest-pop';
      const igHelpLink = platform === 'instagram'
        ? '<div class="autopost-dest-pop-row"><span>Нужен бизнес-аккаунт и страница Facebook</span><button class="text-button" data-pop-action="ig-help" type="button">что нужно</button></div>'
        : '';

      if (!info.connected) {
        pop.innerHTML = `<strong>${SOCIAL_PLATFORM_LABEL[platform]}</strong>
          ${igHelpLink}
          <div class="autopost-dest-pop-actions">
            <span></span>
            <button class="text-button" data-pop-action="reconnect" type="button">Подключить</button>
          </div>`;
      } else {
        const vkRows = platform === 'vk'
          ? `<div class="autopost-dest-pop-row"><span>Загрузка видео</span><b class="is-ok">работает</b></div>
             <div class="autopost-dest-pop-row"><span>Лента и текстовые посты</span>${info.has_community_token
               ? '<button class="text-button" data-pop-action="vk-token" type="button">ключ добавлен · заменить</button>'
               : '<button class="text-button is-warn" data-pop-action="vk-token" type="button">добавить ключ</button>'}</div>`
          : '';
        pop.innerHTML = `<strong>${escapeHTML(info.account_name || SOCIAL_PLATFORM_LABEL[platform])}</strong>
          ${vkRows}${igHelpLink}
          <div class="autopost-dest-pop-actions">
            <button class="text-button" data-pop-action="reconnect" type="button">Переподключить</button>
            <button class="text-button is-danger" data-pop-action="disconnect" type="button">Отключить</button>
          </div>`;
      }
      row.appendChild(pop);
      row.classList.add('has-pop');
      button.setAttribute('aria-expanded', 'true');
      pop.addEventListener('click', (event) => {
        const action = event.target.dataset?.popAction;
        if (!action) return;
        closeDestPopovers();
        if (action === 'vk-token') openVkCommunityTokenDrawer();
        else if (action === 'reconnect') connectPlatform(platform, event.target);
        else if (action === 'disconnect') disconnectSocial(platform, event.target);
        else if (action === 'ig-help') {
          const help = $('#ig-help', container);
          help.hidden = false;
          help.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    }));

    // Счётчик и подпись кнопки: видно, куда именно уйдёт публикация.
    const destsCount = $('#autopost-dests-count', container);
    const syncDests = () => {
      const list = $('.autopost-dests:not([hidden])', container);
      if (!list) return;
      const boxes = $$('input[name="platforms"]', list);
      const chosen = boxes.filter((box) => box.checked);
      if (destsCount) destsCount.textContent = `Отмечено ${chosen.length} из ${boxes.length}`;
      const names = chosen.map((box) => SOCIAL_PLATFORM_LABEL[box.value] || box.value);
      $$('[data-publish-btn]', container).forEach((btn) => {
        btn.textContent = chosen.length ? `Опубликовать в ${chosen.length} ${plural(chosen.length, 'площадку', 'площадки', 'площадок')}` : 'Опубликовать';
      });
      $$('[data-publish-note]', container).forEach((note) => { note.textContent = names.join(', '); });
    };
    $$('.autopost-dests input[name="platforms"]', container).forEach((box) => box.addEventListener('change', syncDests));
    syncDests();

    const igHelpClose = $('[data-ig-help-close]', container);
    if (igHelpClose) igHelpClose.addEventListener('click', () => { $('#ig-help', container).hidden = true; });
    $$('[data-retry-post]', container).forEach((button) => button.addEventListener('click', () => retrySocialPost(button.dataset.retryPost, button)));
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
    // Площадки живут в списке «Куда публикуем», а не внутри формы.
    const platforms = selectedPlatforms();
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
      await publishSocialPost(post.id, platforms, { vk_clip: !!$('.autopost-dests:not([hidden]) input[name="vk_clip"]:checked') });
    } catch (error) {
      toast(error.message || 'Не удалось загрузить видео.', 'error');
    } finally {
      setBusy(button, false);
      hideBusy();
    }
  }

  async function retrySocialPost(postId, button) {
    setBusy(button, true, 'Повторяем…');
    const posts = await safeQuery(db.from('social_posts').select('*').eq('id', postId).limit(1));
    if (!posts[0]) return;
    const targets = await safeQuery(db.from('social_post_targets').select('*').eq('post_id', postId));
    const failedPlatforms = targets.filter((target) => target.status === 'failed').map((target) => target.platform);
    if (!failedPlatforms.length) return setBusy(button, false);
    await publishSocialPost(postId, failedPlatforms);
    setBusy(button, false);
  }

  async function publishSocialPost(postId, platforms, options = {}) {
    const labels = platforms.map((platform) => SOCIAL_PLATFORM_LABEL[platform] || platform).join(', ');
    showBusy(`Публикуем на площадках…`, labels ? `${labels} · это может занять минуту` : 'Это может занять минуту');
    try {
      const { data, error } = await db.functions.invoke('social-publish', { body: { post_id: postId, platforms, ...options } });
      if (error || data?.error) {
        toast(`Ошибка публикации: ${data?.detail || data?.error || error?.message || ''}`, 'error');
      } else {
        const targets = data?.targets || [];
        const failed = targets.filter((target) => target.status === 'failed');
        const done = targets.filter((target) => target.status === 'success').map((t) => SOCIAL_PLATFORM_LABEL[t.platform] || t.platform);
        // Показываем причину сразу: без неё приходится лезть в базу за error_message.
        if (failed.length) toast(`Не опубликовано — ${failed.map((target) => `${SOCIAL_PLATFORM_LABEL[target.platform] || target.platform}: ${socialErrorHint(target.platform, target.error_message || 'без деталей')}`).join('; ')}`, 'error');
        else toast('Опубликовано ✓');
        if (done.length) logEvent('publication', 'Опубликовано', done.join(', '), { view: 'autopost' });
        failed.forEach((target) => logEvent('publication', `${SOCIAL_PLATFORM_LABEL[target.platform] || target.platform}: публикация не прошла`, target.error_message || '', { view: 'autopost' }));
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
    const platforms = selectedPlatforms();
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
    logEvent('platform', `Подключён ${SOCIAL_PLATFORM_LABEL[platform]}`, data.account_name || '', { view: 'autopost' });
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
    if (!doc) return;
    if (!(await askYesNo(`Удалить текст «${doc.title}»?`, '', 'Удалить', true))) return;
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
    if (!(await askYesNo('Удалить эту ссылку?', '', 'Удалить', true))) return;
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
      const dayStages = (state.stages || []).filter((stage) => stage.day_offset !== 0 && stage.stage_date && localDateKey(stage.stage_date) === key);
      const today = new Date();
      const entries = [
        ...dayProjects.map((project) => `<button class="calendar-entry-${project.status}" data-open-project="${project.id}" data-project-drag="${project.id}" draggable="true" type="button">${escapeHTML(project.title)}</button>`),
        ...dayStages.map((stage) => `<button class="calendar-entry-${stage.is_done ? 'stage-done' : 'stage'}" data-open-stage="${stage.id}" type="button">${escapeHTML(stage.title)}</button>`),
        ...dayTasks.map((task) => `<button class="calendar-entry-${task.is_done ? 'task-done' : 'task'}" data-open-task="${task.id}" data-task-drag="${task.id}" draggable="true" type="button">${escapeHTML(task.title)}</button>`),
      ];
      days.push(`<div class="calendar-day ${current.getMonth() !== date.getMonth() ? 'is-muted' : ''} ${current.toDateString() === today.toDateString() ? 'is-today' : ''}" data-calendar-drop-date="${key}"><span>${current.getDate()}</span><div class="calendar-entry-stack">${entries.join('')}</div></div>`);
    }
    const grid = $('#calendar-grid');
    grid.innerHTML = weekdays + days.join('');
    bindStageButtons(grid);
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
        const path = `${state.artist.id}/avatar-${Date.now()}-${safeFileName(file.name)}`;
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
    $('#boot-error-screen').hidden = true;
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
      showBootFailure(error);
    } finally {
      state.booting = false;
    }
  }

  // Раньше на сорвавшейся загрузке показывали пустую оболочку кабинета: выглядит
  // как отвалившаяся база, кнопки жмутся и падают на state.artist, а единственный
  // выход — вслепую нажать F5. Теперь говорим, что случилось, и даём повторить.
  function showBootFailure(error) {
    const missing = error?.bootCode === 'artist-missing';
    setSystemStatus(missing ? 'Ошибка привязки' : 'Нет связи');
    $('#auth-loading-screen').hidden = true;
    $('#terminal-shell').hidden = true;
    $('#boot-error-screen').hidden = false;
    $('#boot-error-title').textContent = missing ? 'Карточка не привязана' : 'Кабинет не открылся';
    $('#boot-error-copy').textContent = error?.message || 'Не удалось открыть кабинет.';
    // Отсутствующую карточку повтор не принесёт — тут нужен владелец с инвайтом.
    $('#boot-error-retry').hidden = missing;
    console.error('[artist-terminal] boot failed', error);
  }

  async function retryBoot(button) {
    const user = state.user;
    if (!user) return showLogin();
    setBusy(button, true, 'Пробуем…');
    state.booted = false;
    try { await bootApp(user); }
    finally { setBusy(button, false); }
  }

  function showLogin(message = '') {
    $('#auth-loading-screen').hidden = true;
    $('#boot-error-screen').hidden = true;
    $('#auth-screen').hidden = false; $('#terminal-shell').hidden = true;
    $('#login-form').hidden = false; $('#recovery-form').hidden = true;
    $('#auth-title').textContent = 'Вход в кабинет'; $('#auth-copy').textContent = 'Доступ только для артистов INMISE.';
    setAuthMessage(message);
  }

  function showRecovery(message = 'Придумайте новый пароль для кабинета.') {
    $('#auth-loading-screen').hidden = true;
    $('#boot-error-screen').hidden = true;
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
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.autopost-dest')) closeAllDestPopovers();
    });
    $('#drawer-body').addEventListener('input', markDrawerDirty);
    // Отправка формы — намерение сохранить, значит предупреждать больше не о чем.
    $('#drawer-body').addEventListener('submit', () => { drawerDirty = false; });
    $('#drawer-close').addEventListener('click', () => closeDrawer()); $('#drawer-backdrop').addEventListener('click', () => closeDrawer());
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeDrawer(); });
    $('#dashboard-wheel-trigger').addEventListener('click', openWheel);
    $('#wheel-modal-close').addEventListener('click', closeWheel);
    $('#wheel-backdrop').addEventListener('click', closeWheel);
    $('#wheel-spin').addEventListener('click', spinWheel);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeWheel(); });
    $('#logout-button').addEventListener('click', () => db.auth.signOut());
    $('#boot-error-retry').addEventListener('click', (event) => retryBoot(event.currentTarget));
    $('#boot-error-logout').addEventListener('click', () => db.auth.signOut());
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
    $('#new-task').addEventListener('click', () => openTaskEditor());
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
    $('#dashboard-calendar-today').addEventListener('click', () => { state.dashboardDate = new Date(); renderDashboardCalendar(); });
    $$('.cal-badge').forEach((badge) => badge.addEventListener('click', (event) => {
      event.stopPropagation();
      const time = Number(badge.dataset.jump);
      if (!time) return;
      state.dashboardDate = new Date(time);
      renderDashboardCalendar();
    }));
    $('#dashboard-project-select').addEventListener('change', (event) => { state.dashboardProjectId = event.currentTarget.value; renderDashboard(); });
    $('#dashboard-new-task').addEventListener('click', () => openTaskEditor('idea', state.dashboardProjectId || ''));
    $$('[data-task-filter]').forEach((button) => button.addEventListener('click', () => {
      const next = button.dataset.taskFilter;
      state.dashboardTaskFilter = state.dashboardTaskFilter === next ? 'all' : next; // второй клик — снять фильтр
      renderDashboard();
    }));
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
