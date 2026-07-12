(function () {
  const body = document.body;
  const video = document.getElementById('home-signal');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function revealTerminal() {
    window.setTimeout(() => body.classList.remove('is-booting'), reduceMotion ? 0 : 420);
  }

  if (!video) {
    revealTerminal();
    return;
  }

  video.volume = 0;
  video.muted = true;

  if (reduceMotion) {
    video.addEventListener('loadeddata', () => {
      video.currentTime = Math.min(1.5, video.duration || 1.5);
      video.pause();
    }, { once: true });
  } else {
    video.play().catch(() => {
      video.controls = false;
    });
  }

  revealTerminal();
})();
