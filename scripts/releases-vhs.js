(function () {
  const artists = {
    hahahap: { musicId: '23224451', visual: 'assets/images/artists/artist1.jpg' },
    kodik: { musicId: '13773076', visual: 'assets/images/artists/artist2.jpg' },
    shibvri: { musicId: '22394975', visual: 'assets/images/artists/artist3.jpg' },
    dope: { musicId: '11748604', visual: 'assets/images/artists/artist4.jpg' },
    xan: { musicId: '22931926', visual: 'assets/images/artists/artist5.jpg' },
    namusorill: { musicId: '11123653', visual: 'assets/images/artists/artist6.jpg' },
    febb: { musicId: '22838316', visual: 'assets/images/artists/artist7.jpg' }
  };
  const artistKeys = Object.keys(artists);

  const selector = document.getElementById('artist-selector');
  const artistPicker = selector.closest('.artist-picker');
  const artistCassette = document.getElementById('artist-cassette');
  const cassetteArtistName = document.getElementById('cassette-artist-name');
  const cassetteDoorLabel = document.getElementById('cassette-door-label');
  const stage = document.getElementById('widget-stage');
  const loader = document.getElementById('widget-loader');
  const message = document.getElementById('crt-message');
  const artistVisual = document.getElementById('artist-visual');
  const trackEmpty = document.getElementById('track-console-empty');
  const status = document.getElementById('deck-status');
  const tapeReadout = document.querySelector('.tape-readout');
  const signalModeLabel = document.getElementById('signal-mode');
  const signalCanvas = document.getElementById('signal-waveform');
  const counter = document.getElementById('tape-counter');
  const clipButton = document.getElementById('clip-button');
  const clipStage = document.getElementById('clip-stage');
  const clipVideo = document.getElementById('clip-video');
  const clipReturn = document.getElementById('clip-return');
  const volumeKnob = document.getElementById('volume-knob');
  const volumeValue = document.getElementById('volume-value');

  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const pulseMechanicalPress = (button) => {
    clearTimeout(button._pressTimer);
    button.classList.remove('is-pressed');
    void button.offsetWidth;
    button.classList.add('is-pressed');
    button._pressTimer = setTimeout(() => button.classList.remove('is-pressed'), 230);
  };
  const signalLabels = {
    standby: 'STANDBY',
    loading: 'LOADING',
    external: 'EXT SIGNAL',
    clip: 'CLIP'
  };

  let timer;
  let clipIsOpen = false;
  let loadSequence = 0;
  let signalMode = 'standby';

  function setSignalMode(mode) {
    signalMode = mode;
    tapeReadout.dataset.signal = mode;
    signalModeLabel.textContent = signalLabels[mode] || signalLabels.standby;
  }

  function formatTime(seconds) {
    const safeSeconds = Math.max(0, Math.floor(seconds || 0));
    const hours = String(Math.floor(safeSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((safeSeconds % 3600) / 60)).padStart(2, '0');
    const rest = String(safeSeconds % 60).padStart(2, '0');
    return `${hours}:${minutes}:${rest}`;
  }

  function resetCounter() {
    clearInterval(timer);
    let seconds = 0;
    counter.textContent = formatTime(0);
    timer = setInterval(() => {
      seconds += 1;
      counter.textContent = formatTime(seconds);
    }, 1000);
  }

  function resetClip() {
    clipIsOpen = false;
    clipStage.hidden = true;
    clipVideo.pause();
    clipVideo.currentTime = 0;
    clipButton.setAttribute('aria-label', 'Play clip');
  }

  function clearWidget() {
    stage.innerHTML = '';
    stage.classList.remove('is-loading', 'is-loaded');
    loader.hidden = true;
    trackEmpty.hidden = false;
    clearInterval(timer);
    counter.textContent = formatTime(0);
    setSignalMode('standby');
  }

  async function ejectCurrentTape(sequence) {
    if (!artistPicker.classList.contains('has-tape')) return true;
    artistPicker.classList.remove('is-inserting');
    artistPicker.classList.add('is-ejecting');
    status.textContent = 'EJECTING';
    await wait(480);
    if (sequence !== loadSequence) return false;
    artistPicker.classList.remove('has-tape', 'is-ejecting', 'is-placeholder');
    return true;
  }

  async function loadArtist(artistKey) {
    const sequence = ++loadSequence;
    const artist = artists[artistKey];
    selector.disabled = true;
    resetClip();
    clearWidget();

    if (!(await ejectCurrentTape(sequence))) return;

    if (!artist) {
      cassetteArtistName.textContent = 'SELECT ARTIST';
      cassetteDoorLabel.textContent = 'SELECT ARTIST';
      artistPicker.classList.add('has-tape', 'is-placeholder');
      message.hidden = false;
      artistVisual.hidden = true;
      artistVisual.removeAttribute('src');
      status.textContent = 'STANDBY';
      setSignalMode('standby');
      selector.disabled = false;
      return;
    }

    const selectedArtistName = selector.options[selector.selectedIndex].text;
    cassetteArtistName.textContent = selectedArtistName;
    artistPicker.classList.remove('is-placeholder');
    cassetteDoorLabel.textContent = `LOADING - ${selectedArtistName}`;
    artistPicker.classList.add('has-tape', 'is-inserting');
    status.textContent = 'INSERTING';
    setSignalMode('loading');
    message.hidden = true;

    artistVisual.src = artist.visual;
    artistVisual.alt = `${selectedArtistName} visual`;
    artistVisual.hidden = false;
    trackEmpty.hidden = true;
    loader.hidden = false;
    stage.classList.add('is-loading');

    let cassetteReady = false;
    let widgetReady = false;
    const showReadyState = () => {
      if (!cassetteReady || !widgetReady || sequence !== loadSequence) return;
      loader.hidden = true;
      stage.classList.remove('is-loading');
      stage.classList.add('is-loaded');
      status.textContent = 'TAPE READY';
      cassetteDoorLabel.textContent = `LOADED - ${selectedArtistName}`;
      setSignalMode('external');
      resetCounter();
    };

    const frame = document.createElement('iframe');
    frame.className = 'yandex-music-widget';
    frame.title = `${selectedArtistName} releases on Yandex Music`;
    frame.allow = 'autoplay';
    frame.scrolling = 'yes';
    frame.src = `https://music.yandex.ru/iframe/#artist/${artist.musicId}/tracks?visual-style=headerCompact`;
    frame.addEventListener('load', () => {
      widgetReady = true;
      showReadyState();
    }, { once: true });
    stage.appendChild(frame);

    await wait(1160);
    if (sequence !== loadSequence) return;
    artistPicker.classList.remove('is-inserting');
    cassetteReady = true;
    selector.disabled = false;
    status.textContent = widgetReady ? 'TAPE READY' : 'READING TAPE';
    showReadyState();
  }

  function selectArtist(artistKey) {
    if (!artistKey || !artists[artistKey]) return;
    selector.value = artistKey;
    void loadArtist(artistKey);
  }

  function adjacentArtistKey(direction) {
    const currentIndex = artistKeys.indexOf(selector.value);
    if (currentIndex < 0) return direction < 0 ? artistKeys.at(-1) : artistKeys[0];
    return artistKeys[(currentIndex + direction + artistKeys.length) % artistKeys.length];
  }

  function randomArtistKey() {
    const candidates = artistKeys.filter((artistKey) => artistKey !== selector.value);
    const pool = candidates.length ? candidates : artistKeys;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  selector.addEventListener('change', () => { void loadArtist(selector.value); });

  document.querySelectorAll('[data-deck-action]').forEach((button) => {
    button.addEventListener('pointerdown', () => pulseMechanicalPress(button));
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') pulseMechanicalPress(button);
    });
    button.addEventListener('click', () => {
      const action = button.dataset.deckAction;

      if (action === 'stop') {
        selector.value = '';
        void loadArtist('');
        return;
      }

      if (selector.disabled) return;
      if (action === 'rew') selectArtist(adjacentArtistKey(-1));
      else if (action === 'ff') selectArtist(adjacentArtistKey(1));
      else if (action === 'play') selectArtist(randomArtistKey());
    });
  });

  async function openClip() {
    clipIsOpen = true;
    clearInterval(timer);
    message.hidden = true;
    artistVisual.hidden = true;
    clipStage.hidden = false;
    status.textContent = 'CLIP PLAYING';
    setSignalMode('clip');
    counter.textContent = formatTime(clipVideo.currentTime);
    clipButton.setAttribute('aria-label', 'Eject clip');
    try {
      await clipVideo.play();
    } catch (_) {
      // Native controls remain available when autoplay is blocked.
    }
  }

  function closeClip() {
    clipIsOpen = false;
    clipVideo.pause();
    clipVideo.currentTime = 0;
    clipStage.hidden = true;
    artistVisual.hidden = !selector.value;
    clipButton.setAttribute('aria-label', 'Play clip');
    status.textContent = selector.value ? 'TAPE READY' : 'STANDBY';
    if (selector.value) {
      setSignalMode('external');
      resetCounter();
    } else {
      setSignalMode('standby');
      counter.textContent = formatTime(0);
    }
  }

  clipButton.addEventListener('pointerdown', () => pulseMechanicalPress(clipButton));
  clipButton.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') pulseMechanicalPress(clipButton);
  });
  clipButton.addEventListener('click', () => {
    if (clipIsOpen) closeClip();
    else void openClip();
  });
  clipReturn.addEventListener('click', closeClip);
  clipVideo.addEventListener('ended', closeClip);
  clipVideo.addEventListener('timeupdate', () => {
    if (clipIsOpen) counter.textContent = formatTime(clipVideo.currentTime);
  });

  let volume = 72;
  let dragStartY = 0;
  let dragStartVolume = volume;
  let draggingVolume = false;

  function setVolume(nextVolume) {
    volume = Math.max(0, Math.min(100, Math.round(nextVolume)));
    volumeKnob.setAttribute('aria-valuenow', String(volume));
    volumeValue.textContent = String(volume).padStart(2, '0');
    clipVideo.volume = volume / 100;
    volumeKnob.style.setProperty('--volume-angle', `${-135 + volume * 2.7}deg`);
  }

  volumeKnob.addEventListener('pointerdown', (event) => {
    draggingVolume = true;
    dragStartY = event.clientY;
    dragStartVolume = volume;
    volumeKnob.setPointerCapture(event.pointerId);
  });
  volumeKnob.addEventListener('pointermove', (event) => {
    if (!draggingVolume) return;
    setVolume(dragStartVolume + (dragStartY - event.clientY) * .85);
  });
  volumeKnob.addEventListener('pointerup', () => { draggingVolume = false; });
  volumeKnob.addEventListener('pointercancel', () => { draggingVolume = false; });
  volumeKnob.addEventListener('wheel', (event) => {
    event.preventDefault();
    setVolume(volume + (event.deltaY < 0 ? 3 : -3));
  }, { passive: false });
  volumeKnob.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') setVolume(volume + 3);
    else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') setVolume(volume - 3);
    else if (event.key === 'Home') setVolume(0);
    else if (event.key === 'End') setVolume(100);
    else return;
    event.preventDefault();
  });

  const signalContext = signalCanvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function sizeSignalCanvas() {
    const bounds = signalCanvas.getBoundingClientRect();
    const density = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(bounds.width * density));
    const height = Math.max(1, Math.round(bounds.height * density));
    if (signalCanvas.width !== width || signalCanvas.height !== height) {
      signalCanvas.width = width;
      signalCanvas.height = height;
    }
    return { width: bounds.width, height: bounds.height, density };
  }

  function drawSignal(timestamp) {
    const { width, height, density } = sizeSignalCanvas();
    signalContext.setTransform(density, 0, 0, density, 0, 0);
    signalContext.clearRect(0, 0, width, height);

    const settings = {
      standby: { amplitude: .018, speed: .0004, alpha: .36 },
      loading: { amplitude: .10, speed: .0012, alpha: .62 },
      external: { amplitude: .25, speed: .0022, alpha: .86 },
      clip: { amplitude: .34, speed: .0032, alpha: .98 }
    }[signalMode] || { amplitude: .018, speed: .0004, alpha: .36 };
    const motion = reduceMotion ? .12 : 1;
    const phase = timestamp * settings.speed * motion;
    const centerY = height * .61;
    const amplitude = height * settings.amplitude;

    signalContext.beginPath();
    for (let x = 0; x <= width; x += 2) {
      const normalizedX = x / Math.max(width, 1);
      const envelope = .28 + .72 * Math.pow(Math.sin(normalizedX * Math.PI * 8 + phase * .8), 2);
      const carrier =
        Math.sin(normalizedX * 96 + phase * 13) * .48 +
        Math.sin(normalizedX * 211 - phase * 8) * .29 +
        Math.sin(normalizedX * 347 + phase * 17) * .16;
      const y = centerY + carrier * envelope * amplitude;
      if (x === 0) signalContext.moveTo(x, y);
      else signalContext.lineTo(x, y);
    }

    signalContext.lineWidth = 1;
    signalContext.strokeStyle = `rgba(119, 225, 101, ${settings.alpha})`;
    signalContext.shadowColor = 'rgba(94, 224, 79, .52)';
    signalContext.shadowBlur = signalMode === 'standby' ? 2 : 5;
    signalContext.stroke();
    signalContext.shadowBlur = 0;

    requestAnimationFrame(drawSignal);
  }

  setSignalMode('standby');
  requestAnimationFrame(drawSignal);
  setVolume(volume);
})();
