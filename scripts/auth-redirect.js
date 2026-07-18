(function () {
  const currentPath = window.location.pathname.toLowerCase().replace(/\/+$/, '') || '/';
  if (currentPath === '/admin' || currentPath === '/admin.html') return;

  const hash = window.location.hash || '';
  const search = window.location.search || '';
  const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
  const searchParams = new URLSearchParams(search.replace(/^\?/, ''));
  const isRecovery = hashParams.get('type') === 'recovery'
    || searchParams.get('type') === 'recovery';

  if (!isRecovery) return;

  const adminUrl = new URL('/admin/', window.location.origin);
  adminUrl.search = search;
  adminUrl.hash = hash;
  window.location.replace(adminUrl.toString());
})();
