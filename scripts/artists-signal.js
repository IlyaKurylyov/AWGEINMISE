(() => {
  'use strict';

  const FALLBACK_ARTISTS = [
    {
      key: 'hahahap',
      name: 'Hahahap',
      description: 'Music therapy',
      image_url: 'assets/images/artists/artist1.jpg',
      heroPosition: 'center 29%',
      stripPosition: 'center 28%'
    },
    {
      key: 'kodik',
      name: 'Kodik',
      description: 'INMISE artist channel',
      image_url: 'assets/images/artists/artist2.jpg',
      heroPosition: 'center 30%',
      stripPosition: 'center 23%'
    },
    {
      key: 'shibvri',
      name: 'SHIBVRI',
      description: 'A mirror refracting rhythmic patterns in Trap / Drill',
      image_url: 'assets/images/artists/artist3.jpg',
      heroPosition: 'center 27%',
      stripPosition: 'center 24%'
    },
    {
      key: 'dope',
      name: 'Dope the producer',
      description: 'Yes, I am definitely a producer',
      image_url: 'assets/images/artists/artist4.jpg',
      heroPosition: 'center 42%',
      stripPosition: 'center 38%'
    },
    {
      key: 'xan',
      name: 'Xan',
      description: 'R&B / POP artist. Music in the blood',
      image_url: 'assets/images/artists/artist5.jpg',
      heroPosition: 'center 30%',
      stripPosition: 'center 26%'
    },
    {
      key: 'namusorill',
      name: 'Namusorill',
      description: 'The mad spark that sets everything alight',
      image_url: 'assets/images/artists/artist6.jpg',
      heroPosition: 'center 32%',
      stripPosition: 'center 24%'
    },
    {
      key: 'febb',
      name: 'Febb Tufoe',
      description: 'Multi-genre music producer and devotee of soulless electronics',
      image_url: 'assets/images/artists/artist7.jpg',
      heroPosition: 'center 28%',
      stripPosition: 'center 24%'
    }
  ];

  const els = {};
  let roster = [];
  let activeIndex = -1;
  let switchTimer = 0;
  let timecodeStart = performance.now();

  function normalizeName(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/theproducer/g, 'dope')
      .replace(/[^a-zа-яё0-9]+/gi, '');
  }

  function fallbackFor(artist) {
    const normalized = normalizeName(artist?.name);
    return FALLBACK_ARTISTS.find((candidate) => {
      const candidateName = normalizeName(candidate.name);
      return normalized === candidateName || normalized.includes(candidate.key) || candidateName.includes(normalized);
    });
  }

  function mergeArtist(artist, index) {
    const matchedFallback = fallbackFor(artist);
    const fallback = matchedFallback || FALLBACK_ARTISTS[index % FALLBACK_ARTISTS.length];
    return {
      ...fallback,
      ...artist,
      key: artist?.id || fallback.key,
      name: artist?.name || fallback.name,
      description: matchedFallback?.description || artist?.description || fallback.description,
      image_url: artist?.image_url || fallback.image_url,
      heroPosition: fallback.heroPosition,
      stripPosition: fallback.stripPosition
    };
  }

  function randomUnit() {
    if (window.crypto?.getRandomValues) {
      const value = new Uint32Array(1);
      window.crypto.getRandomValues(value);
      return value[0] / 4294967296;
    }
    return Math.random();
  }

  function shuffle(input) {
    const output = [...input];
    for (let index = output.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(randomUnit() * (index + 1));
      [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
    }
    return output;
  }

  function randomIndex(excluded = -1) {
    if (roster.length < 2) return 0;
    let next = Math.floor(randomUnit() * roster.length);
    if (next === excluded) next = (next + 1 + Math.floor(randomUnit() * (roster.length - 1))) % roster.length;
    return next;
  }

  function cacheElements() {
    els.strip = document.getElementById('artist-contact-strip');
    els.monitor = document.querySelector('.artist-monitor');
    els.hero = document.getElementById('artist-hero');
    els.heroBack = document.getElementById('artist-hero-back');
    els.name = document.getElementById('artist-name');
    els.channel = document.getElementById('artist-channel');
    els.description = document.getElementById('artist-description');
    els.meters = document.getElementById('signal-meters');
    els.socials = document.getElementById('artist-socials');
    els.readout = document.getElementById('channel-readout');
    els.status = document.getElementById('artist-load-status');
    els.timecode = document.getElementById('signal-timecode');
    els.prev = document.getElementById('artist-prev');
    els.scan = document.getElementById('artist-scan');
    els.random = document.getElementById('artist-random');
    els.next = document.getElementById('artist-next');
  }

  function createMeter(index) {
    const meter = document.createElement('i');
    meter.className = 'signal-meter';
    meter.dataset.channel = String(index);
    meter.style.setProperty('--meter-level', `${22 + Math.round(randomUnit() * 42)}%`);
    meter.style.setProperty('--meter-active-level', `${65 + Math.round(randomUnit() * 28)}%`);
    return meter;
  }

  function renderMeters() {
    const fragment = document.createDocumentFragment();
    roster.forEach((_, index) => fragment.appendChild(createMeter(index)));
    els.meters.replaceChildren(fragment);
  }

  function renderStrip() {
    const fragment = document.createDocumentFragment();
    roster.forEach((artist, index) => {
      const button = document.createElement('button');
      button.className = 'contact-frame';
      button.type = 'button';
      button.dataset.index = String(index);
      button.setAttribute('aria-label', `Канал ${String(index + 1).padStart(2, '0')}: ${artist.name}`);
      button.style.setProperty('--strip-position', artist.stripPosition);

      const image = document.createElement('img');
      image.className = 'contact-frame__image';
      image.src = artist.image_url;
      image.alt = '';
      image.loading = 'eager';
      image.decoding = 'async';
      image.addEventListener('error', () => {
        const fallback = fallbackFor(artist);
        if (fallback && image.src !== new URL(fallback.image_url, document.baseURI).href) image.src = fallback.image_url;
      }, { once: true });

      const label = document.createElement('span');
      label.className = 'contact-frame__label';
      label.textContent = artist.name;

      button.append(image, label);
      button.addEventListener('click', () => selectArtist(index));
      fragment.appendChild(button);
    });
    els.strip.replaceChildren(fragment);
  }

  function updateSocialLink(selector, url) {
    const link = els.socials.querySelector(selector);
    if (!link) return;
    if (!url) {
      link.hidden = true;
      link.removeAttribute('href');
      link.removeAttribute('target');
      link.removeAttribute('rel');
      return;
    }
    link.hidden = false;
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }

  function updateActiveState(index) {
    els.strip.querySelectorAll('.contact-frame').forEach((frame, frameIndex) => {
      const active = frameIndex === index;
      frame.classList.toggle('is-active', active);
      frame.setAttribute('aria-pressed', String(active));
    });
    els.meters.querySelectorAll('.signal-meter').forEach((meter, meterIndex) => {
      meter.classList.toggle('is-active', meterIndex === index);
    });
  }

  function setHeroSource(artist) {
    const fallback = fallbackFor(artist);
    const onError = (event) => {
      if (fallback && event.currentTarget.src !== new URL(fallback.image_url, document.baseURI).href) {
        event.currentTarget.src = fallback.image_url;
      }
    };
    els.hero.onerror = onError;
    els.heroBack.onerror = onError;
    els.hero.src = artist.image_url;
    els.heroBack.src = artist.image_url;
    els.hero.alt = `${artist.name} — INMISE artist`;
    els.heroBack.alt = '';
  }

  function selectArtist(index, options = {}) {
    if (!roster.length) return;
    const normalizedIndex = (index + roster.length) % roster.length;
    const artist = roster[normalizedIndex];
    activeIndex = normalizedIndex;

    window.clearTimeout(switchTimer);
    els.monitor.classList.remove('is-switching');
    void els.monitor.offsetWidth;
    els.monitor.classList.add('is-switching');
    els.monitor.style.setProperty('--hero-position', artist.heroPosition);
    setHeroSource(artist);

    els.name.textContent = artist.name;
    els.channel.textContent = `CHANNEL ${String(normalizedIndex + 1).padStart(2, '0')}`;
    els.description.textContent = artist.description || artist.matrix_text || 'INMISE ARTIST CHANNEL';
    els.readout.value = String(normalizedIndex + 1).padStart(2, '0');
    els.readout.textContent = String(normalizedIndex + 1).padStart(2, '0');
    updateSocialLink('.artist-social--vk', artist.vk_url);
    updateSocialLink('.artist-social--tg', artist.tg_url);
    updateSocialLink('.artist-social--inst', artist.inst_url);
    updateActiveState(normalizedIndex);

    switchTimer = window.setTimeout(() => els.monitor.classList.remove('is-switching'), 260);
    els.monitor.classList.add('is-ready');
    timecodeStart = performance.now();

    if (options.focus) {
      els.strip.querySelector(`[data-index="${normalizedIndex}"]`)?.focus({ preventScroll: true });
    }
  }

  function shuffleRoster() {
    const currentKey = roster[activeIndex]?.key;
    roster = shuffle(roster);
    renderStrip();
    renderMeters();
    const sameArtistIndex = roster.findIndex((artist) => artist.key === currentKey);
    const nextIndex = randomIndex(sameArtistIndex);
    selectArtist(nextIndex);
  }

  function bindControls() {
    const pulsePress = (button) => {
      window.clearTimeout(button._pressTimer);
      button.classList.remove('is-pressed');
      void button.offsetWidth;
      button.classList.add('is-pressed');
      button._pressTimer = window.setTimeout(() => button.classList.remove('is-pressed'), 220);
    };

    [els.prev, els.scan, els.random, els.next].forEach((button) => {
      button.addEventListener('pointerdown', () => pulsePress(button));
      button.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') pulsePress(button);
      });
    });

    els.prev.addEventListener('click', () => selectArtist(activeIndex - 1));
    els.next.addEventListener('click', () => selectArtist(activeIndex + 1));
    els.random.addEventListener('click', () => selectArtist(randomIndex(activeIndex)));
    els.scan.addEventListener('click', shuffleRoster);
    document.addEventListener('keydown', (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowLeft') selectArtist(activeIndex - 1, { focus: true });
      if (event.key === 'ArrowRight') selectArtist(activeIndex + 1, { focus: true });
    });
  }

  async function fetchArtists() {
    const configured = typeof window.SUPABASE_URL === 'string' && window.SUPABASE_URL
      && typeof window.SUPABASE_ANON_KEY === 'string' && window.SUPABASE_ANON_KEY;
    if (!window.supabase || !configured) return FALLBACK_ARTISTS;

    try {
      const client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      const query = client.from('artists').select('*');
      const timeout = new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error('artist archive timeout')), 3200);
      });
      const { data, error } = await Promise.race([query, timeout]);
      if (error) throw error;
      if (!Array.isArray(data) || !data.length) return FALLBACK_ARTISTS;
      return data.slice(0, 7).map(mergeArtist);
    } catch (error) {
      console.warn('[artists-signal] using local archive:', error.message || error);
      return FALLBACK_ARTISTS;
    }
  }

  function updateTimecode(now) {
    const elapsed = Math.max(0, now - timecodeStart);
    const totalSeconds = Math.floor(elapsed / 1000);
    const hours = Math.floor(totalSeconds / 3600) % 100;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const seconds = totalSeconds % 60;
    const frames = Math.floor((elapsed % 1000) / (1000 / 25));
    els.timecode.textContent = [hours, minutes, seconds, frames]
      .map((value) => String(value).padStart(2, '0'))
      .join(':');
    window.requestAnimationFrame(updateTimecode);
  }

  async function init() {
    cacheElements();
    bindControls();
    const artists = await fetchArtists();
    roster = shuffle(artists.map(mergeArtist));
    renderStrip();
    renderMeters();
    selectArtist(randomIndex());
    els.status.textContent = 'SIGNAL ONLINE';
    window.setTimeout(() => els.status.classList.add('is-hidden'), 900);
    window.requestAnimationFrame(updateTimecode);
  }

  document.addEventListener('DOMContentLoaded', init, { once: true });
})();
