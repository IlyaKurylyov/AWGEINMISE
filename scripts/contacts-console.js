(() => {
  'use strict';

  const CHANNELS = {
    telegram: {
      label: 'TELEGRAM',
      service: 'TELEGRAM / DIRECT LINK',
      handle: '@INMISE',
      details: 'NEWS · RELEASES · DIRECT CONTACT',
      url: 'https://t.me/inmise'
    },
    vk: {
      label: 'VK',
      service: 'VK / COMMUNITY LINE',
      handle: 'VK.COM/INMISE',
      details: 'COMMUNITY · VIDEO · LABEL UPDATES',
      url: 'https://vk.com/inmise'
    },
    youtube: {
      label: 'YOUTUBE',
      service: 'YOUTUBE / VIDEO ARCHIVE',
      handle: '@INMISEOFFICIAL',
      details: 'CLIPS · PREMIERES · VIDEO ARCHIVE',
      url: 'https://www.youtube.com/@inmiseofficial'
    }
  };

  const CHANNEL_KEYS = Object.keys(CHANNELS);
  const CHANNEL_DIAL_ANGLES = {
    telegram: 76,
    vk: 138,
    youtube: 198
  };

  const consoleEl = document.querySelector('.contacts-console');
  const crt = document.getElementById('contact-crt');
  const status = document.getElementById('contact-status');
  const channelReadout = document.getElementById('contact-channel');
  const result = document.getElementById('contact-result');
  const service = document.getElementById('contact-service');
  const handle = document.getElementById('contact-handle');
  const details = document.getElementById('contact-details');
  const hint = document.getElementById('contact-hint');
  const dial = document.getElementById('rotary-dial');
  const dialRing = document.getElementById('dial-rotor');
  const pulseCounter = document.getElementById('pulse-counter');
  const signalNeedle = document.getElementById('signal-needle');
  const channelButtons = [...document.querySelectorAll('.dial-channel')];
  const stageElements = [...document.querySelectorAll('[data-stage]')];
  const lamps = Object.fromEntries([...document.querySelectorAll('[data-lamp]')].map((lamp) => [lamp.dataset.lamp,lamp]));
  const resetButton = document.getElementById('contact-reset');
  const holdButton = document.getElementById('contact-hold');
  const redialButton = document.getElementById('contact-redial');
  const connectButton = document.getElementById('contact-connect');

  if (!consoleEl || !crt || !dial || !dialRing) return;

  let selectedChannel = 'telegram';
  let connectedChannel = null;
  let dialAngle = 0;
  let dragStartAngle = 0;
  let dragging = false;
  let callToken = 0;
  let holdState = false;
  let needleTimer = 0;
  let dialAnimationFrame = 0;
  let dialSequenceToken = 0;

  document.querySelectorAll('.contact-wave i').forEach((bar, index) => {
    bar.style.setProperty('--wave-scale',String(.25 + ((index * 17) % 70) / 50));
  });

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve,ms));
  }

  function renderDialAngle(value) {
    dialAngle = Math.max(0,Math.min(210,value));
    dialRing.setAttribute('transform',`rotate(${dialAngle.toFixed(3)} 215 215)`);
    dial.setAttribute('aria-valuenow',String(Math.round(dialAngle)));
  }

  function animateDialTo(target,countPulses = false) {
    window.cancelAnimationFrame(dialAnimationFrame);
    const from = dialAngle;
    const to = Math.max(0,Math.min(210,target));
    const distance = Math.abs(to - from);
    if (distance < .1) {
      renderDialAngle(to);
      return;
    }
    const startedAt = performance.now();
    const duration = Math.max(180,Math.min(920,260 + distance * 3.15));
    if (countPulses) pulseCounter.value = '000';
    const tick = (now) => {
      const progress = Math.min(1,(now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress,3);
      const currentAngle = from + (to - from) * eased;
      renderDialAngle(currentAngle);
      if (countPulses) {
        const pulses = Math.max(0,Math.round(Math.abs(from - currentAngle) / 7));
        pulseCounter.value = String(pulses).padStart(3,'0');
      }
      if (progress < 1) dialAnimationFrame = window.requestAnimationFrame(tick);
    };
    dialAnimationFrame = window.requestAnimationFrame(tick);
  }

  function dialTravelDuration(from,to) {
    const distance = Math.abs(to - from);
    return distance < .1 ? 0 : Math.max(180,Math.min(920,260 + distance * 3.15));
  }

  function setDialAngle(value,animated = false,countPulses = false) {
    dial.classList.toggle('is-dragging',!animated && dragging);
    if (animated) animateDialTo(value,countPulses);
    else {
      window.cancelAnimationFrame(dialAnimationFrame);
      renderDialAngle(value);
    }
  }

  function pointerAngle(event) {
    const rect = dial.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    return Math.atan2(y,x) * 180 / Math.PI;
  }

  function normalizeDelta(value) {
    let angle = value;
    while (angle < 0) angle += 360;
    while (angle >= 360) angle -= 360;
    return angle;
  }

  function setLamp(name,on) {
    lamps[name]?.classList.toggle('is-on',Boolean(on));
  }

  function clearStages() {
    stageElements.forEach((stage) => stage.classList.remove('is-active','is-complete'));
  }

  function updateNeedle(mode = 'idle') {
    window.clearInterval(needleTimer);
    const settings = mode === 'calling'
      ? { base: 3,spread: 25,interval: 135 }
      : mode === 'open'
        ? { base: 8,spread: 5,interval: 420 }
        : { base: -24,spread: 2.5,interval: 720 };
    const moveNeedle = () => {
      const angle = settings.base + (Math.random() - .5) * settings.spread;
      signalNeedle?.style.setProperty('--needle-angle',`${angle.toFixed(1)}deg`);
    };
    moveNeedle();
    needleTimer = window.setInterval(() => {
      moveNeedle();
    },settings.interval);
  }

  function selectChannel(key) {
    if (!CHANNELS[key]) return;
    selectedChannel = key;
    connectedChannel = null;
    holdState = false;
    consoleEl.classList.remove('is-holding');
    channelButtons.forEach((button) => button.classList.toggle('is-selected',button.dataset.channel === key));
    channelReadout.textContent = CHANNELS[key].label;
    status.textContent = 'READY TO DIAL';
    result.hidden = true;
    hint.textContent = 'ROTATE THE DIAL TO PLACE CALL';
    crt.classList.remove('is-open','is-calling');
    clearStages();
    setLamp('dial',false);
    setLamp('link',false);
    setLamp('open',false);
    updateNeedle('idle');
  }

  async function autoDialChannel(key) {
    if (!CHANNELS[key]) return;
    const sequence = ++dialSequenceToken;
    callToken += 1;
    selectChannel(key);
    const targetAngle = CHANNEL_DIAL_ANGLES[key];
    status.textContent = 'DIALING...';
    hint.textContent = `DIALING ${CHANNELS[key].label}`;
    setLamp('dial',true);
    pulseCounter.value = '000';

    const outwardDuration = dialTravelDuration(dialAngle,targetAngle);
    setDialAngle(targetAngle,true);
    await wait(outwardDuration + 90);
    if (sequence !== dialSequenceToken) return;

    const returnDuration = dialTravelDuration(dialAngle,0);
    setDialAngle(0,true,true);
    await wait(returnDuration + 80);
    if (sequence !== dialSequenceToken) return;
    runCall();
  }

  async function runCall() {
    const token = ++callToken;
    const channel = CHANNELS[selectedChannel];
    connectedChannel = null;
    holdState = false;
    consoleEl.classList.remove('is-holding');
    result.hidden = true;
    crt.classList.remove('is-open');
    crt.classList.add('is-calling');
    clearStages();
    setLamp('dial',true);
    setLamp('link',false);
    setLamp('open',false);
    updateNeedle('calling');

    status.textContent = 'DIALING...';
    hint.textContent = `CALLING ${channel.label}`;
    stageElements[0]?.classList.add('is-active');
    await wait(680);
    if (token !== callToken) return;

    stageElements[0]?.classList.replace('is-active','is-complete');
    stageElements[1]?.classList.add('is-active');
    status.textContent = 'CONNECTING...';
    setLamp('link',true);
    await wait(760);
    if (token !== callToken) return;

    stageElements[1]?.classList.replace('is-active','is-complete');
    stageElements[2]?.classList.add('is-active');
    status.textContent = 'SIGNAL FOUND';
    await wait(520);
    if (token !== callToken) return;

    stageElements[2]?.classList.replace('is-active','is-complete');
    status.textContent = 'CHANNEL OPEN';
    service.textContent = channel.service;
    handle.textContent = channel.handle;
    details.textContent = channel.details;
    result.hidden = false;
    hint.textContent = 'PRESS CONNECT TO OPEN CHANNEL';
    connectedChannel = selectedChannel;
    crt.classList.remove('is-calling');
    crt.classList.add('is-open');
    setLamp('dial',false);
    setLamp('link',false);
    setLamp('open',true);
    updateNeedle('open');
  }

  function resetConsole() {
    callToken += 1;
    dialSequenceToken += 1;
    connectedChannel = null;
    holdState = false;
    consoleEl.classList.remove('is-holding');
    status.textContent = 'SELECT CHANNEL';
    channelReadout.textContent = CHANNELS[selectedChannel].label;
    result.hidden = true;
    hint.textContent = 'SELECT A CHANNEL · ROTATE THE DIAL';
    crt.classList.remove('is-open','is-calling');
    clearStages();
    setLamp('dial',false);
    setLamp('link',false);
    setLamp('open',false);
    updateNeedle('idle');
    dragging = false;
    dial.classList.remove('is-dragging');
    pulseCounter.value = '000';
    setDialAngle(0,true,false);
  }

  dial.addEventListener('pointerdown',(event) => {
    if (event.button !== 0) return;
    dragging = true;
    dialSequenceToken += 1;
    callToken += 1;
    window.cancelAnimationFrame(dialAnimationFrame);
    dial.classList.add('is-dragging');
    dragStartAngle = pointerAngle(event);
    dial.setPointerCapture(event.pointerId);
    status.textContent = 'DIALING...';
    hint.textContent = 'RELEASE TO CALL';
    setLamp('dial',true);
    pulseCounter.value = '000';
    event.preventDefault();
  });

  dial.addEventListener('pointermove',(event) => {
    if (!dragging) return;
    const delta = normalizeDelta(pointerAngle(event) - dragStartAngle);
    const clockwise = delta > 300 ? 0 : delta;
    setDialAngle(Math.min(210,clockwise));
  });

  function releaseDial(event) {
    if (!dragging) return;
    dragging = false;
    dial.classList.remove('is-dragging');
    if (dial.hasPointerCapture(event.pointerId)) dial.releasePointerCapture(event.pointerId);
    const releasedAngle = dialAngle;
    const shouldCall = releasedAngle >= 32;
    const sequence = ++dialSequenceToken;
    if (shouldCall) {
      const randomChannel = CHANNEL_KEYS[Math.floor(Math.random() * CHANNEL_KEYS.length)];
      selectChannel(randomChannel);
      status.textContent = `${CHANNELS[randomChannel].label} SELECTED`;
      hint.textContent = 'RETURNING DIAL · STANDBY';
    }
    const returnDuration = dialTravelDuration(releasedAngle,0);
    setDialAngle(0,true,true);
    window.setTimeout(() => {
      if (sequence !== dialSequenceToken) return;
      if (shouldCall) runCall();
      else {
        status.textContent = 'READY TO DIAL';
        hint.textContent = 'ROTATE FURTHER TO PLACE CALL';
        setLamp('dial',false);
      }
    },returnDuration + 90);
  }

  dial.addEventListener('pointerup',releaseDial);
  dial.addEventListener('pointercancel',releaseDial);

  dial.addEventListener('keydown',(event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const randomChannel = CHANNEL_KEYS[Math.floor(Math.random() * CHANNEL_KEYS.length)];
      autoDialChannel(randomChannel);
    }
  });

  channelButtons.forEach((button) => {
    button.addEventListener('click',() => autoDialChannel(button.dataset.channel));
  });

  resetButton.addEventListener('click',resetConsole);
  redialButton.addEventListener('click',() => autoDialChannel(selectedChannel));
  holdButton.addEventListener('click',() => {
    if (!connectedChannel) return;
    holdState = !holdState;
    consoleEl.classList.toggle('is-holding',holdState);
    status.textContent = holdState ? 'CHANNEL HOLD' : 'CHANNEL OPEN';
    hint.textContent = holdState ? 'PRESS HOLD TO RESUME' : 'PRESS CONNECT TO OPEN CHANNEL';
    setLamp('open',!holdState);
    setLamp('link',holdState);
  });

  connectButton.addEventListener('click',() => {
    if (connectedChannel === selectedChannel) {
      window.open(CHANNELS[selectedChannel].url,'_blank','noopener,noreferrer');
      return;
    }
    autoDialChannel(selectedChannel);
  });

  resetConsole();
})();
