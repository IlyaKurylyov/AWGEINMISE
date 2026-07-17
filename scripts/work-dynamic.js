(() => {
  'use strict';

  const SELLER_LINKS = {
    '@DopeTheProduce': 'https://t.me/DopeTheProducer',
    '@SHIBVRI': 'https://t.me/prod_shibvri',
    '@Namusorill': 'https://t.me/namusorill'
  };

  const SELLER_LABELS = {
    '@DopeTheProduce': '@DOPE THE PRODUCER',
    '@SHIBVRI': '@SHIBVRI',
    '@Namusorill': '@NAMUSORILL'
  };

  const FALLBACK_BEATS = [
    ['Vetreno (134 bpm, F♯m)', '@DopeTheProduce', '@DopeTheProducer - Vetreno (134 bpm, F♯m).mp3'],
    ['Mi Vida (128 bpm, Bbm)', '@DopeTheProduce', '@DopeTheProducer - Mi Vida (128 bpm, Bbm).mp3'],
    ['long night (115 bpm, G♯m)', '@DopeTheProduce', '@DopeTheProducer - long night (115 bpm, G♯m).mp3'],
    ['rBilly [115bpm, D♯m]', '@DopeTheProduce', '@DopeTheProducer - rBilly [115bpm, D♯m].mp3'],
    ['So sad (85bpm, Gm)', '@DopeTheProduce', '@DopeTheProducer - So sad (85bpm, Gm).mp3'],
    ['Olivera (141 Fmin)', '@SHIBVRI', '@SHIBVRI - Olivera (141 Fmin).mp3'],
    ['Out the head (142bpm Amin)', '@SHIBVRI', '@SHIBVRI - Out the head (142bpm Amin).mp3'],
    ['Yokai (142bpm Dmin)', '@SHIBVRI', '@SHIBVRI -  Yokai (142bpm Dmin).mp3'],
    ['2XL (110bpm F)', '@SHIBVRI', '@SHIBVRI- 2XL (110bpm F).mp3'],
    ['All Girls Are The Same (164bpm, B)', '@Namusorill', '@Namusorill - All Girls Are The Same (164bpm B).mp3'],
    ['Armed And Dangerous (130bpm, Am)', '@Namusorill', '@Namusorill - Armed And Dangerous (130bpm AM).mp3'],
    ["I'll Be Fine (160bpm, Dm)", '@Namusorill', "@Namusorill - I'll Be Fine (160bpm DM).mp3"],
    ['Lean Wit Me (164bpm, Am)', '@Namusorill', '@Namusorill - Lean Wit Me (164bpm AM).mp3'],
    ['Lucid Dreams (169bpm, C♯m)', '@Namusorill', '@Namusorill - Lucid Dreams (169bpm C♯m).mp3'],
    ['Wasted (146bpm, G)', '@Namusorill', '@Namusorill - Wasted (146bpm G).mp3']
  ].map(([title, seller, file], index) => ({
    id: `local-${index}`,
    title,
    seller,
    price: 2000,
    audio_url: `assets/beats/${encodeURIComponent(file).replace(/%2F/gi, '/')}`,
    seller_link: SELLER_LINKS[seller]
  }));

  const els = {};
  let beats = [];
  let visibleBeats = [];
  let activeIndex = -1;
  let activeProducers = new Set(['@Namusorill']);
  let vuFrame = 0;

  function normalizeSeller(value) {
    const compact = String(value || '').trim().replace(/[\s._-]+/g, '').toLowerCase();
    if (['@dopetheproducer','@dopetheproduce','dopetheproducer','dopetheproduce'].includes(compact)) return '@DopeTheProduce';
    if (['@prodshibvri','@shibvri','prodshibvri','shibvri'].includes(compact)) return '@SHIBVRI';
    if (compact === '@namusorill' || compact === 'namusorill') return '@Namusorill';
    return value;
  }

  function telegramLink(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (/^https?:\/\/(?:www\.)?(?:t\.me|telegram\.me)\//i.test(text)) return text;
    if (text.startsWith('@')) return `https://t.me/${text.slice(1)}`;
    return '';
  }

  function normalizeBeat(beat, index, artistsByOwner = new Map()) {
    const artist = artistsByOwner.get(beat.owner_user_id);
    const seller = normalizeSeller(beat.seller || artist?.name);
    const linkedTelegram = telegramLink(artist?.tg_url) || telegramLink(beat.seller_link);
    return {
      id: beat.id || `beat-${index}`,
      title: String(beat.title || 'UNTITLED TAPE'),
      seller,
      price: beat.price ?? 2000,
      audio_url: beat.audio_url || '',
      seller_link: linkedTelegram || SELLER_LINKS[seller] || '#'
    };
  }

  function splitTitle(value) {
    const title = String(value || '').trim();
    const match = title.match(/^(.*?)\s*(\([^)]*(?:bpm|BPM)[^)]*\)|\[[^\]]*(?:bpm|BPM)[^\]]*\])\s*$/);
    if (!match) return { name: title, meta: 'MASTER TAPE' };
    return {
      name: match[1].trim() || title,
      meta: match[2].replace(/[()[\]]/g, '').replace(/(\d)\s*bpm/i, '$1 BPM')
    };
  }

  function displayDuration(beat) {
    const hash = [...beat.title].reduce((total, character) => total + character.charCodeAt(0), 0);
    const seconds = 142 + (hash % 126);
    return `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
  }

  function displayPrice(value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return `${new Intl.NumberFormat('ru-RU',{ maximumFractionDigits: 0 }).format(numeric)} ₽`;
    const text = String(value || '').trim();
    return text || 'PRICE ON REQUEST';
  }

  function cacheElements() {
    els.rows = document.getElementById('tape-library-rows');
    els.status = document.getElementById('tape-library-status');
    els.producer = document.getElementById('selected-producer');
    els.price = document.getElementById('selected-price');
    els.buy = document.getElementById('buy-tape');
    els.audio = document.getElementById('tape-audio');
    els.counter = document.getElementById('tape-counter');
    els.waveform = document.getElementById('waveform-monitor');
    els.prev = document.getElementById('tape-prev');
    els.play = document.getElementById('tape-play');
    els.stop = document.getElementById('tape-stop');
    els.next = document.getElementById('tape-next');
    els.toggles = [...document.querySelectorAll('.producer-toggle input')];
    els.needles = [...document.querySelectorAll('.vu-needle')];
  }

  function createRow(beat, index) {
    const parsed = splitTitle(beat.title);
    const row = document.createElement('button');
    row.className = 'tape-row';
    row.type = 'button';
    row.dataset.index = String(index);
    row.setAttribute('aria-label', `Select ${beat.title}`);

    const channel = document.createElement('span');
    channel.className = 'tape-row__channel';
    channel.textContent = String(index + 1).padStart(2,'0');

    const identity = document.createElement('span');
    identity.className = 'tape-row__identity';
    const title = document.createElement('strong');
    title.className = 'tape-row__title';
    title.textContent = parsed.name;
    const meta = document.createElement('small');
    meta.className = 'tape-row__meta';
    meta.textContent = parsed.meta;
    const seller = document.createElement('small');
    seller.className = 'tape-row__seller';
    seller.textContent = SELLER_LABELS[beat.seller] || String(beat.seller || '').toUpperCase();
    identity.append(title,meta,seller);

    const wave = document.createElement('span');
    wave.className = 'tape-row__wave';
    wave.setAttribute('aria-hidden','true');

    const time = document.createElement('time');
    time.className = 'tape-row__time';
    time.textContent = displayDuration(beat);

    const price = document.createElement('span');
    price.className = 'tape-row__price';
    price.textContent = displayPrice(beat.price);

    row.append(channel,identity,wave,price,time);
    row.addEventListener('click',() => {
      selectBeat(index);
      if (window.matchMedia('(max-width: 700px) and (orientation: portrait)').matches) playSelected();
    });
    row.addEventListener('dblclick',() => playSelected());
    return row;
  }

  function renderRows() {
    const fragment = document.createDocumentFragment();
    visibleBeats.forEach((beat,index) => fragment.append(createRow(beat,index)));
    els.rows.replaceChildren(fragment);
    els.status.hidden = visibleBeats.length > 0;
    if (!visibleBeats.length) {
      els.status.textContent = 'NO TAPES ON THIS CHANNEL';
      setReadouts(null);
      return;
    }
    activeIndex = -1;
    stopPlayback();
    setReadouts(null);
  }

  function setReadouts(beat) {
    renderProducerReadout(beat);
    els.price.textContent = beat ? displayPrice(beat.price) : 'NO TAPE';
    els.buy.href = beat?.seller_link || '#';
    els.buy.setAttribute('aria-label',beat ? `Buy ${beat.title}` : 'No tape selected');
    els.buy.classList.toggle('is-disabled',!beat);
  }

  function renderProducerReadout(beat) {
    const label = beat ? (SELLER_LABELS[beat.seller] || String(beat.seller || '').toUpperCase()) : '';
    if (!label) {
      els.producer.replaceChildren();
      return;
    }
    const track = document.createElement('span');
    track.className = 'producer-readout__track';
    const item = document.createElement('span');
    item.className = 'producer-readout__item';
    item.textContent = label;
    track.appendChild(item);
    els.producer.replaceChildren(track);
  }

  function selectBeat(index, options = {}) {
    if (!visibleBeats.length) return;
    activeIndex = (index + visibleBeats.length) % visibleBeats.length;
    const selected = visibleBeats[activeIndex];
    if (!options.preservePlayback) stopPlayback();

    els.rows.querySelectorAll('.tape-row').forEach((row,rowIndex) => {
      const active = rowIndex === activeIndex;
      row.classList.toggle('is-active',active);
      row.setAttribute('aria-pressed',String(active));
    });
    els.rows.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    setReadouts(selected);
    els.audio.src = selected.audio_url;
    els.audio.load();
  }

  function updateProducerFilter() {
    activeProducers = new Set(els.toggles.filter((toggle) => toggle.checked).map((toggle) => toggle.value));
    activeIndex = -1;
    visibleBeats = beats.filter((beat) => activeProducers.has(beat.seller));
    renderRows();
  }

  function markPlaying(playing) {
    els.waveform.classList.toggle('is-playing',playing);
    els.play.classList.toggle('is-active',playing);
    els.rows.querySelectorAll('.tape-row').forEach((row,index) => row.classList.toggle('is-playing',playing && index === activeIndex));
    if (playing && !vuFrame) vuFrame = requestAnimationFrame(animateVu);
    if (!playing) {
      cancelAnimationFrame(vuFrame);
      vuFrame = 0;
      els.needles.forEach((needle,index) => needle.style.setProperty('--vu-angle',`${-23 + index * 4}deg`));
    }
  }

  async function playSelected() {
    if (!visibleBeats.length) return;
    if (activeIndex < 0) selectBeat(0);
    if (!els.audio.src) selectBeat(activeIndex);
    if (!els.audio.paused) {
      els.audio.pause();
      markPlaying(false);
      return;
    }
    try {
      await els.audio.play();
      markPlaying(true);
    } catch (error) {
      console.warn('[collaboration] Tape playback unavailable:',error.message || error);
      markPlaying(false);
    }
  }

  function stopPlayback() {
    els.audio.pause();
    try { els.audio.currentTime = 0; } catch (_) {}
    markPlaying(false);
    updateCounter();
  }

  function pulse(button) {
    clearTimeout(button._pressTimer);
    button.classList.remove('is-pressed');
    void button.offsetWidth;
    button.classList.add('is-pressed');
    button._pressTimer = setTimeout(() => button.classList.remove('is-pressed'),230);
  }

  function bindControls() {
    els.toggles.forEach((toggle) => toggle.addEventListener('change',() => {
      updateProducerFilter();
    }));

    [els.prev,els.play,els.stop,els.next].forEach((button) => {
      button.addEventListener('pointerdown',() => pulse(button));
      button.addEventListener('keydown',(event) => {
        if (event.key === 'Enter' || event.key === ' ') pulse(button);
      });
    });

    els.prev.addEventListener('click',async () => {
      selectBeat(activeIndex < 0 ? visibleBeats.length - 1 : activeIndex - 1);
      await playSelected();
    });
    els.play.addEventListener('click',playSelected);
    els.stop.addEventListener('click',stopPlayback);
    els.next.addEventListener('click',async () => {
      selectBeat(activeIndex < 0 ? 0 : activeIndex + 1);
      await playSelected();
    });
    els.audio.addEventListener('timeupdate',updateCounter);
    els.audio.addEventListener('ended',() => {
      markPlaying(false);
      if (visibleBeats.length > 1) {
        selectBeat(activeIndex + 1);
        playSelected();
      }
    });
    els.audio.addEventListener('pause',() => markPlaying(false));
    els.audio.addEventListener('playing',() => markPlaying(true));
    els.buy.addEventListener('click',(event) => {
      if (!visibleBeats.length) event.preventDefault();
    });
    els.buy.addEventListener('pointerdown',() => pulse(els.buy));
    els.buy.addEventListener('keydown',(event) => {
      if (event.key === 'Enter' || event.key === ' ') pulse(els.buy);
    });
  }

  function updateCounter() {
    const elapsed = Math.max(0,Number(els.audio.currentTime) || 0);
    const hours = Math.floor(elapsed / 3600) % 100;
    const minutes = Math.floor(elapsed / 60) % 60;
    const seconds = Math.floor(elapsed) % 60;
    const frames = Math.floor((elapsed % 1) * 25);
    els.counter.textContent = [hours,minutes,seconds,frames].map((value) => String(value).padStart(2,'0')).join(':');
  }

  function animateVu() {
    if (els.audio.paused) {
      vuFrame = 0;
      return;
    }
    const now = performance.now() / 140;
    els.needles.forEach((needle,index) => {
      const level = -16 + Math.sin(now + index * 1.7) * 11 + Math.sin(now * .43 + index) * 5;
      needle.style.setProperty('--vu-angle',`${level.toFixed(1)}deg`);
    });
    vuFrame = requestAnimationFrame(animateVu);
  }

  async function fetchBeats() {
    const configured = typeof window.SUPABASE_URL === 'string' && window.SUPABASE_URL
      && typeof window.SUPABASE_ANON_KEY === 'string' && window.SUPABASE_ANON_KEY;
    if (!window.supabase || !configured) return FALLBACK_BEATS;

    try {
      const client = window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY);
      const query = Promise.all([
        client.from('beats').select('id,title,price,seller,audio_url,seller_link,owner_user_id').order('created_at',{ ascending: false }),
        client.from('artists').select('name,owner_user_id,tg_url')
      ]);
      const timeout = new Promise((_,reject) => setTimeout(() => reject(new Error('tape library timeout')),3500));
      const [beatResult,artistResult] = await Promise.race([query,timeout]);
      if (beatResult.error) throw beatResult.error;
      if (artistResult.error) throw artistResult.error;
      if (!Array.isArray(beatResult.data) || !beatResult.data.length) return FALLBACK_BEATS;
      const artistsByOwner = new Map((artistResult.data || []).map((artist) => [artist.owner_user_id,artist]));
      return beatResult.data.map((beat,index) => normalizeBeat(beat,index,artistsByOwner)).filter((beat) => SELLER_LABELS[beat.seller]);
    } catch (error) {
      console.warn('[collaboration] Using local tape archive:',error.message || error);
      return FALLBACK_BEATS;
    }
  }

  async function init() {
    cacheElements();
    bindControls();
    beats = await fetchBeats();
    els.status.textContent = 'TAPE LIBRARY ONLINE';
    setTimeout(updateProducerFilter,220);
  }

  document.addEventListener('DOMContentLoaded',init,{ once: true });
})();
