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
  const counter = document.getElementById('tape-counter');
  const clipButton = document.getElementById('clip-button');
  const clipStage = document.getElementById('clip-stage');
  const clipVideo = document.getElementById('clip-video');
  const clipReturn = document.getElementById('clip-return');
  const volumeKnob = document.getElementById('volume-knob');
  const volumeValue = document.getElementById('volume-value');

  let timer;
  let clipIsOpen = false;
  function resetCounter() {
    clearInterval(timer);
    let seconds = 0;
    counter.textContent = '00:00:00';
    timer = setInterval(() => {
      seconds += 1;
      const hours = String(Math.floor(seconds / 3600)).padStart(2, '0');
      const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
      const rest = String(seconds % 60).padStart(2, '0');
      counter.textContent = `${hours}:${minutes}:${rest}`;
    }, 1000);
  }

  function loadArtist(artistKey) {
    const artist = artists[artistKey];
    clipIsOpen = false;
    clipStage.hidden = true;
    clipVideo.pause();
    clipButton.innerHTML = '<span>▶</span> PLAY CLIP';
    stage.innerHTML = '';
    stage.classList.remove('is-loaded');
    clearInterval(timer);
    counter.textContent = '00:00:00';
    if (!artist) {
      artistPicker.classList.remove('has-tape', 'is-inserting');
      cassetteArtistName.textContent = 'SELECT ARTIST';
      cassetteDoorLabel.textContent = 'SELECT ARTIST';
      message.hidden = false;
      artistVisual.hidden = true;
      artistVisual.removeAttribute('src');
      trackEmpty.hidden = false;
      loader.hidden = true;
      status.textContent = 'STANDBY';
      return;
    }

    message.hidden = true;
    const selectedArtistName = selector.options[selector.selectedIndex].text;
    cassetteArtistName.textContent = selectedArtistName;
    cassetteDoorLabel.textContent = `LOADED · ${selectedArtistName}`;
    artistPicker.classList.remove('is-inserting');
    void artistCassette.offsetWidth;
    artistPicker.classList.add('has-tape', 'is-inserting');
    setTimeout(() => artistPicker.classList.remove('is-inserting'), 1100);
    artistVisual.src = artist.visual;
    artistVisual.alt = `${selector.options[selector.selectedIndex].text} visual`;
    artistVisual.hidden = false;
    trackEmpty.hidden = true;
    loader.hidden = false;
    stage.classList.add('is-loading');
    status.textContent = 'LOADING';
    const frame = document.createElement('iframe');
    frame.className = 'yandex-music-widget';
    frame.title = 'Yandex Music artist releases';
    frame.allow = 'autoplay';
    frame.src = `https://music.yandex.ru/iframe/#artist/${artist.musicId}/tracks?visual-style=headerCompact`;
    frame.addEventListener('load', () => {
      loader.hidden = true;
      stage.classList.remove('is-loading');
      stage.classList.add('is-loaded');
      status.textContent = 'TAPE READY';
      resetCounter();
    }, { once: true });
    stage.appendChild(frame);
  }

  selector.addEventListener('change', () => loadArtist(selector.value));
  document.querySelectorAll('[data-deck-action]').forEach((button) => {
    button.addEventListener('click', () => {
      status.textContent = 'USE TAPE DISPLAY CONTROLS';
      setTimeout(() => { status.textContent = selector.value ? 'TAPE READY' : 'STANDBY'; }, 1600);
    });
  });

  async function openClip() {
    clipIsOpen = true;
    clearInterval(timer);
    message.hidden = true;
    artistVisual.hidden = true;
    clipStage.hidden = false;
    status.textContent = 'CLIP PLAYING';
    clipButton.innerHTML = '<span>■</span> EJECT CLIP';
    try { await clipVideo.play(); } catch (_) { /* Native controls remain available. */ }
  }
  function closeClip() {
    clipIsOpen = false;
    clipVideo.pause();
    clipVideo.currentTime = 0;
    clipStage.hidden = true;
    artistVisual.hidden = !selector.value;
    clipButton.innerHTML = '<span>▶</span> PLAY CLIP';
    status.textContent = selector.value ? 'TAPE READY' : 'STANDBY';
    if (selector.value) resetCounter();
  }
  clipButton.addEventListener('click', () => { if (clipIsOpen) closeClip(); else openClip(); });
  clipReturn.addEventListener('click', closeClip);
  clipVideo.addEventListener('ended', closeClip);

  let volume = 72;
  let dragStartY = 0;
  let dragStartVolume = volume;
  let draggingVolume = false;

  function setVolume(nextVolume) {
    volume = Math.max(0, Math.min(100, Math.round(nextVolume)));
    const angle = -135 + (volume / 100) * 270;
    volumeKnob.style.setProperty('--volume-angle', `${angle}deg`);
    volumeKnob.setAttribute('aria-valuenow', String(volume));
    volumeValue.textContent = String(volume).padStart(2, '0');
    clipVideo.volume = volume / 100;
  }

  volumeKnob.addEventListener('pointerdown', (event) => {
    draggingVolume = true;
    dragStartY = event.clientY;
    dragStartVolume = volume;
    volumeKnob.setPointerCapture(event.pointerId);
  });
  volumeKnob.addEventListener('pointermove', (event) => {
    if (!draggingVolume) return;
    setVolume(dragStartVolume + (dragStartY - event.clientY) * 0.85);
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
  setVolume(volume);
})();
