(function () {
  const body = document.body;
  const video = document.getElementById('home-signal');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let glitchTimer;

  function revealTerminal() {
    window.setTimeout(() => {
      body.classList.remove('is-booting');
      if (!reduceMotion) scheduleGlitch();
    }, reduceMotion ? 0 : 420);
  }

  function scheduleGlitch() {
    const delay = 2600 + Math.random() * 4300;
    glitchTimer = window.setTimeout(() => {
      body.classList.add('is-glitching');
      window.setTimeout(() => {
        body.classList.remove('is-glitching');
        scheduleGlitch();
      }, 430);
    }, delay);
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

  window.addEventListener('pagehide', () => window.clearTimeout(glitchTimer), { once: true });
})();
