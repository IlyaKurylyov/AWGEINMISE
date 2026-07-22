(function () {
  const hasConfig = typeof window.SUPABASE_URL === 'string'
    && window.SUPABASE_URL
    && typeof window.SUPABASE_ANON_KEY === 'string'
    && window.SUPABASE_ANON_KEY;

  const states = {
    loading: document.getElementById('invite-loading'),
    invalid: document.getElementById('invite-invalid'),
    unavailable: document.getElementById('invite-unavailable'),
    form: document.getElementById('invite-form-state'),
    confirm: document.getElementById('invite-confirm-state'),
    success: document.getElementById('invite-success'),
  };

  function showState(name) {
    Object.entries(states).forEach(([key, element]) => {
      if (element) element.hidden = key !== name;
    });
  }

  if (!window.supabase || !hasConfig) {
    showState('unavailable');
    return;
  }

  const client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  const params = new URLSearchParams(window.location.search);
  const token = (params.get('token') || '').trim();
  const pendingInviteKey = 'inmise-pending-invite-token';
  const artistName = document.getElementById('invite-artist-name');
  const emailInput = document.getElementById('invite-email');
  const passwordInput = document.getElementById('invite-password');
  const passwordConfirm = document.getElementById('invite-password-confirm');
  const confirmRow = document.getElementById('invite-confirm-row');
  const form = document.getElementById('invite-form');
  const submit = document.getElementById('invite-submit');
  const modeButton = document.getElementById('invite-mode');
  const currentSessionButton = document.getElementById('invite-current-session');
  const message = document.getElementById('invite-message');
  const unavailableMessage = document.getElementById('invite-unavailable-message');
  const retryButton = document.getElementById('invite-retry');
  let invite = null;
  let mode = 'signup';
  let claiming = false;

  function rememberInviteToken() {
    if (token.length === 64) localStorage.setItem(pendingInviteKey, token);
  }

  function forgetInviteToken() {
    localStorage.removeItem(pendingInviteKey);
  }

  function withTimeout(promise, milliseconds = 12000) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error('invite_check_timeout')), milliseconds);
    });
    return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
  }

  function showUnavailable(error) {
    console.error('[invite] validation unavailable', error);
    if (unavailableMessage) {
      unavailableMessage.textContent = error?.message === 'invite_check_timeout'
        ? 'Сервер отвечает слишком долго. Повтори проверку — ссылка останется действительной.'
        : 'Не удалось связаться с сервером. Проверь интернет и повтори проверку — ссылка не была использована.';
    }
    showState('unavailable');
  }

  function setMessage(text) {
    if (message) message.textContent = text || '';
  }

  function goAdmin() {
    window.location.replace('/admin/');
  }

  async function redirectIfLinkedAccount() {
    const { data } = await client.auth.getSession();
    const user = data.session?.user;
    if (!user) return false;
    const { data: rows, error } = await client
      .from('artists')
      .select('id')
      .eq('owner_user_id', user.id)
      .limit(1);
    if (error || !rows?.length) return false;
    forgetInviteToken();
    showState('success');
    window.setTimeout(goAdmin, 500);
    return true;
  }

  function friendlyError(error) {
    const code = error?.context?.body?.error || error?.message || String(error || '');
    const known = {
      invalid_invite: 'Инвайт недействителен или уже использован.',
      email_mismatch: 'Этот аккаунт зарегистрирован на другой email.',
      account_already_linked: 'К этому аккаунту уже привязан другой артист.',
      authentication_required: 'Сначала войди или создай аккаунт.',
    };
    return known[code] || 'Не удалось подключить кабинет. Попробуй ещё раз.';
  }

  async function invoke(action, body) {
    const { data, error } = await client.functions.invoke('artist-invites', {
      body: { action, token, ...(body || {}) },
    });
    if (error) {
      try {
        const responseBody = await error.context?.json?.();
        if (responseBody?.error) error.context.body = responseBody;
      } catch (_) {}
      throw error;
    }
    return data;
  }

  async function claimInvite() {
    if (claiming) return;
    claiming = true;
    if (submit) submit.disabled = true;
    setMessage('Перепривязываем кабинет…');
    try {
      await invoke('claim');
      // Edge Function may have inherited the owner role from the old account.
      // Refresh the JWT before opening the cabinet so the new app_metadata is
      // available immediately and the invite panel does not require re-login.
      await client.auth.refreshSession();
      forgetInviteToken();
      showState('success');
      window.setTimeout(goAdmin, 700);
    } catch (error) {
      if (await redirectIfLinkedAccount()) return;
      setMessage(friendlyError(error));
      if (submit) submit.disabled = false;
      claiming = false;
    }
  }

  async function refreshSessionAction() {
    const { data } = await client.auth.getSession();
    const user = data.session?.user;
    const currentEmail = String(user?.email || '').toLowerCase();
    const intendedEmail = String(invite?.email || '').toLowerCase();
    if (currentSessionButton) currentSessionButton.hidden = !user || currentEmail !== intendedEmail;
    if (user && currentEmail === intendedEmail && params.get('claim') === '1') {
      await claimInvite();
    }
  }

  function setMode(nextMode) {
    mode = nextMode;
    const signingUp = mode === 'signup';
    if (confirmRow) confirmRow.hidden = !signingUp;
    if (submit) submit.textContent = signingUp ? 'Создать новый вход' : 'Войти и привязать кабинет';
    if (modeButton) modeButton.textContent = signingUp ? 'У меня уже есть аккаунт' : 'Создать новый аккаунт';
    if (passwordInput) passwordInput.autocomplete = signingUp ? 'new-password' : 'current-password';
    setMessage('');
  }

  async function loadInvite() {
    showState('loading');
    if (token.length !== 64) {
      showState('invalid');
      return;
    }
    try {
      const { data, error } = await withTimeout(client.rpc('validate_artist_invite', { p_token: token }));
      if (error) {
        error.inviteValidationRequest = true;
        throw error;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        if (await redirectIfLinkedAccount()) return;
        showState('invalid');
        return;
      }
      invite = {
        artist: { id: row.artist_id, name: row.artist_name },
        email: row.intended_email,
        expires_at: row.expires_at,
      };
      if (artistName) artistName.textContent = invite.artist?.name || 'Артист INMISE';
      if (emailInput) emailInput.value = invite.email || '';
      showState('form');
      await refreshSessionAction();
    } catch (error) {
      showUnavailable(error);
    }
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = String(invite?.email || '').trim().toLowerCase();
    const password = passwordInput?.value || '';
    const confirmation = passwordConfirm?.value || '';
    if (password.length < 8) return setMessage('Пароль должен содержать не меньше 8 символов.');
    if (mode === 'signup' && password !== confirmation) return setMessage('Пароли не совпадают.');

    submit.disabled = true;
    setMessage(mode === 'signup' ? 'Создаём вход…' : 'Входим…');
    try {
      const current = await client.auth.getSession();
      const currentEmail = String(current.data.session?.user?.email || '').toLowerCase();
      if (current.data.session && currentEmail !== email) await client.auth.signOut();

      if (mode === 'signup') {
        rememberInviteToken();
        const redirect = new URL(window.location.href);
        redirect.searchParams.set('claim', '1');
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirect.toString() },
        });
        if (error) throw error;
        if (data.session) {
          await claimInvite();
        } else {
          showState('confirm');
        }
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await claimInvite();
      }
    } catch (error) {
      setMessage(error?.message || friendlyError(error));
      submit.disabled = false;
    }
  });

  modeButton?.addEventListener('click', () => setMode(mode === 'signup' ? 'login' : 'signup'));
  currentSessionButton?.addEventListener('click', claimInvite);
  retryButton?.addEventListener('click', loadInvite);
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session?.user && invite) refreshSessionAction();
  });

  setMode('signup');
  loadInvite();
})();
