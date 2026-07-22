(function () {
  const pendingInviteToken = localStorage.getItem('inmise-pending-invite-token');
  if (pendingInviteToken && /^[a-f0-9]{64}$/i.test(pendingInviteToken)) {
    const inviteUrl = new URL('/invite/', window.location.origin);
    inviteUrl.searchParams.set('token', pendingInviteToken);
    inviteUrl.searchParams.set('claim', '1');
    window.location.replace(inviteUrl.toString() + window.location.hash);
    return;
  }

  const body = document.body;
  const video = document.getElementById('home-signal');
  const railWave = document.getElementById('rail-wave');
  const logoLetters = [...document.querySelectorAll('.logo-letter[data-echo]')];
  const acronymEchoes = new Map(
    [...document.querySelectorAll('.acronym-echo[data-echo-id]')]
      .map((echo) => [echo.dataset.echoId,echo])
  );
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let glitchTimer;
  let waveFrame;
  let activeLetter = null;

  function revealAcronym(letter) {
    const echo = acronymEchoes.get(letter.dataset.echo);
    if (!echo) return;
    if (activeLetter && activeLetter !== letter) concealAcronym(activeLetter);
    activeLetter = letter;
    letter.classList.add('is-decoding');
    echo.classList.remove('is-visible');
    void echo.offsetWidth;
    echo.classList.add('is-visible');
  }

  function concealAcronym(letter) {
    const echo = acronymEchoes.get(letter.dataset.echo);
    letter.classList.remove('is-decoding');
    echo?.classList.remove('is-visible');
    if (activeLetter === letter) activeLetter = null;
  }

  logoLetters.forEach((letter) => {
    letter.addEventListener('pointerenter',() => revealAcronym(letter));
    letter.addEventListener('pointerleave',() => concealAcronym(letter));
    letter.addEventListener('focus',() => revealAcronym(letter));
    letter.addEventListener('blur',() => concealAcronym(letter));
  });

  function startRailWave() {
    if (!railWave) return;

    const context = railWave.getContext('2d');
    let width = 0;
    let height = 0;
    let lastPaint = 0;

    function resizeWave() {
      const rect = railWave.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      railWave.width = Math.round(width * ratio);
      railWave.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function drawWave(time) {
      const phase = time * 0.001;
      const middle = height * 0.5;

      context.clearRect(0, 0, width, height);
      context.beginPath();
      context.lineWidth = 1;
      context.strokeStyle = 'rgba(128, 151, 113, .72)';
      context.shadowColor = 'rgba(113, 139, 99, .28)';
      context.shadowBlur = 3;

      for (let x = 0; x <= width; x += 1.5) {
        const progress = x / width;
        const carrier = Math.sin(x * 0.078 + phase * 2.3) * 0.55;
        const hiss = Math.sin(x * 0.31 - phase * 3.1) * Math.sin(x * 0.047 + phase) * 0.8;
        const burstA = Math.exp(-Math.pow((progress - 0.18) / 0.035, 2)) * Math.sin(x * 0.62 + phase * 4.2) * 3.2;
        const burstB = Math.exp(-Math.pow((progress - 0.47) / 0.025, 2)) * Math.sin(x * 0.84 - phase * 3.4) * 2.4;
        const burstC = Math.exp(-Math.pow((progress - 0.76) / 0.045, 2)) * Math.sin(x * 0.55 + phase * 2.8) * 2.8;
        const drift = Math.sin(progress * Math.PI * 8 + phase * 0.7) * 0.5;
        const y = middle + carrier + hiss + burstA + burstB + burstC + drift;

        if (x === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }

      context.stroke();
      context.shadowBlur = 0;
    }

    function animateWave(time) {
      if (time - lastPaint > 45) {
        drawWave(time);
        lastPaint = time;
      }
      waveFrame = window.requestAnimationFrame(animateWave);
    }

    resizeWave();
    window.addEventListener('resize', resizeWave, { passive: true });

    if (reduceMotion) drawWave(0);
    else waveFrame = window.requestAnimationFrame(animateWave);
  }

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

  startRailWave();

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

  window.addEventListener('pagehide', () => {
    window.clearTimeout(glitchTimer);
    window.cancelAnimationFrame(waveFrame);
  }, { once: true });
})();
