console.log('app.js загружен');

// Загрузочный экран
document.addEventListener('DOMContentLoaded', () => {
    const loadingScreen = document.querySelector('.loading-screen');
    if (loadingScreen) {
        loadingScreen.style.display = 'none';
    }

    // Предзагрузка видео
    const video = document.getElementById('bgVideo');
    if (video) {
        video.load();
    }

    // Функция для перемешивания карточек артистов
    const shuffleArtistCards = () => {
        const gridContainer = document.querySelector('.artists-grid');
        if (!gridContainer) {
            return; // Выходим, если это не страница артистов
        }

        const allCards = Array.from(gridContainer.children);
        const placeholderCard = allCards.find(card => card.classList.contains('artist-card-placeholder'));
        let artistCards = allCards.filter(card => card !== placeholderCard); // Отфильтровываем плейсхолдер

        // Алгоритм тасования Фишера-Йейтса
        for (let i = artistCards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [artistCards[i], artistCards[j]] = [artistCards[j], artistCards[i]]; // Меняем местами
        }

        // Очищаем грид от текущих карточек
        while (gridContainer.firstChild) {
            gridContainer.removeChild(gridContainer.firstChild);
        }

        // Добавляем перемешанные карточки артистов
        artistCards.forEach(card => gridContainer.appendChild(card));

        // Добавляем карточку-плейсхолдер в конец, если она существует
        if (placeholderCard) {
            gridContainer.appendChild(placeholderCard);
        }
    };

    // Делаем доступным глобально, чтобы вызывать после динамического рендера
    window.shuffleArtistCards = shuffleArtistCards;

    shuffleArtistCards(); // Вызываем функцию перемешивания

    // Делегирование клика для статики: рябь + раскрытие
    const gridContainer = document.querySelector('.artists-grid');
    if (!window.__ARTISTS_DYNAMIC && gridContainer) {
      gridContainer.addEventListener('click', (e) => {
        // Если активен динамический рендер (artists-public.js), не обрабатываем здесь,
        // чтобы избежать гонки состояний (двойной open/close и гашение канваса)
        if (window.__ARTISTS_DYNAMIC) return;
        const card = e.target.closest('.artist-card');
        if (!card || !gridContainer.contains(card)) return;
        // Добавим контейнер деталей если отсутствует
        if (!card.querySelector('.artist-details')) {
          const info = card.querySelector('.artist-info');
          // Не используем краткое описание в details
          const nameEl = info ? info.querySelector('.artist-name') : null;
          const artistName = nameEl ? nameEl.textContent.trim() : '';
          const vkText = info && info.querySelector('.artist-vk') ? info.querySelector('.artist-vk').textContent.trim() : '';
          const tgText = info && info.querySelector('.artist-tg') ? info.querySelector('.artist-tg').textContent.trim() : '';
          const details = document.createElement('div');
          details.className = 'artist-details';
          const vkLink = vkText ? `<a class="artist-link-chip" href="${vkText}" target="_blank" rel="noopener"><img src="assets/icons/vk.svg" alt="VK"/>VK</a>` : '';
          const tgLink = tgText ? `<a class="artist-link-chip" href="${tgText}" target="_blank" rel="noopener"><img src="assets/icons/telegram.svg" alt="TG"/>TG</a>` : '';
          const links = (vkLink || tgLink) ? `<div class="artist-links">${vkLink}${tgLink}</div>` : '';
          // целевая фраза для сборки дождя → текста
          const matrixText = (info?.dataset?.matrixText && info.dataset.matrixText.trim()) || '';
          const tgHandle = (() => {
            if (!tgText) return `@${artistName || 'inmise'}`;
            const t = tgText.trim();
            if (t.startsWith('@')) return t;
            const m = t.match(/t(?:elegram)?\.(?:me|dog)\/(?!joinchat)([A-Za-z0-9_]+)/i);
            if (m && m[1]) return `@${m[1]}`;
            try { const url = new URL(t); return `@${url.pathname.replace(/^\//,'')}`; } catch(_) { return t; }
          })();
          const finalPhrase = matrixText || `Группа TG - ${tgHandle}`;
          // контейнеры под матричную анимацию
          details.innerHTML = `${links}<div class="artist-details__desc" aria-hidden="true"><span class="matrix-typing" data-full="${finalPhrase.replace(/"/g, '&quot;')}"></span></div>`;
          const canvas = document.createElement('canvas');
          canvas.className = 'matrix-canvas';
          details.appendChild(canvas);
          // Размещаем детали как оверлей внутри контейнера изображения
          const imgContainer = card.querySelector('.artist-image-container');
          if (imgContainer) {
            imgContainer.appendChild(details);
          } else {
            card.appendChild(details);
          }
        }
        const isOpen = card.classList.contains('open');
        document.querySelectorAll('.artist-card.open').forEach(el => { if (el !== card) el.classList.remove('open'); el.classList.remove('image-hidden'); });
        if (!isOpen) {
          // подготовить: показать img заново
          card.classList.remove('image-hidden');
          const img = card.querySelector('.artist-image');
          if (img) img.style.display = '';
          // обнулим текст, если остался с предыдущего раза
          const typing = card.querySelector('.matrix-typing');
          if (typing) typing.textContent = '';
          if (card._typeTimer) { clearInterval(card._typeTimer); card._typeTimer = null; }

          // принудительно перезапускаем обе анимации (посл. порядок важен)
          const imgCont = card.querySelector('.artist-image-container');
          if (imgCont) {
            // Полный цикл: reset → run, чтобы гарантировать перезапуск шума
            imgCont.classList.remove('ripple-run');
            imgCont.classList.add('ripple-reset');
            void imgCont.offsetWidth;
            imgCont.classList.remove('ripple-reset');
            imgCont.classList.add('ripple-run');
          }
          // Очистка/скрытие канваса дождя до старта
          const canvas = card.querySelector('.matrix-canvas');
          if (canvas) {
            try { const c = canvas.getContext('2d'); if (c) c.clearRect(0,0,canvas.width,canvas.height); } catch(_){}
            canvas.style.opacity = '0';
          }
          // Старт ряби строго по классу image-ripple
          if (img) {
            img.classList.remove('image-ripple');
            void img.offsetWidth;
            img.classList.add('image-ripple');
          }
          // теперь открываем карточку (детали и пр.)
          card.classList.add('open');
          // Дождёмся завершения кейфрейма и только потом скроем фото и запустим матрицу
          const onRippleEnd = (ev) => {
            if (ev && ev.animationName && ev.animationName !== 'artistImageRippleOut') return;
            if (!card.classList.contains('open')) return;
            card.classList.add('image-hidden');
            if (canvas) canvas.style.opacity = '0.95';
            startMatrixTypingAndRain(card);
            img && img.classList.remove('image-ripple');
            imgCont && imgCont.classList.remove('ripple-run');
            img && img.removeEventListener('animationend', onRippleEnd);
            if (card._rippleTimer) { clearTimeout(card._rippleTimer); card._rippleTimer = null; }
          };
          img && img.addEventListener('animationend', onRippleEnd, { once: false });
          if (card._rippleTimer) clearTimeout(card._rippleTimer);
          card._rippleTimer = setTimeout(onRippleEnd, 900); // fallback
        } else {
          // закрытие: вернуть картинку и сбросить анимации
          card.classList.remove('image-hidden');
          const img = card.querySelector('.artist-image');
          if (img) img.style.display = '';
          if (card._rippleTimer) { clearTimeout(card._rippleTimer); card._rippleTimer = null; }
          // Скрыть/очистить канвас дождя, чтобы не висел статики
          const canvas = card.querySelector('.matrix-canvas');
          if (canvas) {
            canvas.style.opacity = '0';
            try { const c = canvas.getContext('2d'); if (c) c.clearRect(0,0,canvas.width,canvas.height); } catch(_){}
          }
          const typing = card.querySelector('.matrix-typing');
          if (typing) typing.textContent = '';
          if (card._typeTimer) { clearInterval(card._typeTimer); card._typeTimer = null; }
          card.classList.remove('open');
        }
      });
    }

    // (удалён лишний глобальный делегат, чтобы не было двойного клика)
  // Кликабельность всей плашки контактов: делегирование
  const contactsGrid = document.querySelector('.vhs-socials');
  if (contactsGrid) {
    contactsGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.vhs-card');
      if (!card || !contactsGrid.contains(card)) return;
      const btn = card.querySelector('.vhs-btn[href]');
      if (btn && btn.href) {
        window.open(btn.href, '_blank', 'noopener');
      }
    });
  }
});

// Эффект наведения на навигацию
const navLinks = document.querySelectorAll('.nav-link');

navLinks.forEach(link => {
    link.addEventListener('mouseover', () => {
        navLinks.forEach(otherLink => {
            if (otherLink !== link) {
                otherLink.style.opacity = '0.3';
            }
        });
    });

    link.addEventListener('mouseout', () => {
        navLinks.forEach(otherLink => {
            otherLink.style.opacity = '1';
        });
    });
});

// Эффект глитча при движении мыши
document.addEventListener('mousemove', (e) => {
    const glitchElements = document.querySelectorAll('[data-text]');
    const mouseX = e.clientX / window.innerWidth;
    const mouseY = e.clientY / window.innerHeight;

    glitchElements.forEach(element => {
        const rect = element.getBoundingClientRect();
        const elementCenterX = rect.left + rect.width / 2;
        const elementCenterY = rect.top + rect.height / 2;
        
        const distanceX = Math.abs(e.clientX - elementCenterX) / window.innerWidth;
        const distanceY = Math.abs(e.clientY - elementCenterY) / window.innerHeight;
        const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);

        if (distance < 0.5) {
            element.style.transform = `translate(${(mouseX - 0.5) * 10}px, ${(mouseY - 0.5) * 10}px) skew(${(mouseX - 0.5) * 10}deg, ${(mouseY - 0.5) * 10}deg)`;
            element.classList.add('glitching');
        } else {
            element.style.transform = 'none';
            element.classList.remove('glitching');
        }
    });
});

// Случайные глитч-эффекты
setInterval(() => {
    const elements = document.querySelectorAll('[data-text]');
    if (elements.length > 0) {
        const randomElement = elements[Math.floor(Math.random() * elements.length)];
        
        randomElement.classList.add('glitch-burst');
        setTimeout(() => {
            randomElement.classList.remove('glitch-burst');
        }, 200);
    }
}, 3000);

// Эффект шума
const noiseOverlay = document.querySelector('.noise-overlay');
let noiseCanvas;

function createNoise() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 100;
    canvas.height = 100;
    
    const imageData = ctx.createImageData(100, 100);
    const pixels = imageData.data;
    
    for (let i = 0; i < pixels.length; i += 4) {
        const random = Math.floor(Math.random() * 255);
        pixels[i] = pixels[i + 1] = pixels[i + 2] = random;
        pixels[i + 3] = 15; // Прозрачность
    }
    
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL();
}

function updateNoise() {
    if (!noiseCanvas) {
        noiseCanvas = createNoise();
        noiseOverlay.style.backgroundImage = `url(${noiseCanvas})`;
    }
    
    requestAnimationFrame(updateNoise);
}

updateNoise();

// Эффект помех телевизора
function createTVNoise() {
    const noise = document.querySelector('.noise');
    const tvFrame = document.querySelector('.tv-frame');
    
    // Случайные сильные помехи
    setInterval(() => {
        const intensity = Math.random();
        if (intensity > 0.95) {
            noise.style.opacity = '0.3';
            tvFrame.style.borderColor = '#222';
            setTimeout(() => {
                noise.style.opacity = '0.05';
                tvFrame.style.borderColor = '#111';
            }, 100);
        }
    }, 2000);

    // Случайные искажения экрана
    setInterval(() => {
        if (Math.random() > 0.95) {
            document.body.style.transform = `scale(${1 + Math.random() * 0.002}) skew(${Math.random() * 0.5}deg)`;
            setTimeout(() => {
                document.body.style.transform = 'none';
            }, 100);
        }
    }, 1000);
}

createTVNoise();

// Интерактивность переключателей
document.querySelectorAll('.switch').forEach((switch_, index) => {
    // Обрабатываем только центральную кнопку
    if (index !== 1) return;

    const video = document.getElementById('bgVideo');
    const videoContainer = document.querySelector('.video-background');
    let isPressed = false;

    // Создаем звук щелчка
    function createClickSound() {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(100, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.1);
    }

    async function handleVideoPlayback() {
        if (!isPressed) {
            // Включаем видео
            try {
                video.currentTime = 3;
                await video.play();
                videoContainer.classList.add('active');
                switch_.classList.add('pressed');
                isPressed = true;
            } catch (error) {
                console.error("Ошибка воспроизведения:", error);
                switch_.classList.remove('pressed');
                isPressed = false;
            }
        } else {
            // Выключаем видео
            video.pause();
            videoContainer.classList.remove('active');
            switch_.classList.remove('pressed');
            isPressed = false;
        }
    }

    function handleClick() {
        createClickSound();

        // Эффекты при нажатии
        const noise = document.querySelector('.noise-overlay');
        noise.style.opacity = '0.8';
        document.body.style.transform = `scale(${1 + Math.random() * 0.005}) skew(${Math.random() * 1}deg)`;

        handleVideoPlayback();

        // Сброс эффектов
        setTimeout(() => {
            noise.style.opacity = '0.2';
            document.body.style.transform = 'none';
        }, 150);
    }

    // Обработка кликов
    switch_.addEventListener('click', handleClick);

    // Обработка касаний
    switch_.addEventListener('touchend', (e) => {
        e.preventDefault();
        handleClick();
    });

    // Сброс состояния при ошибках видео
    video.addEventListener('error', () => {
        isPressed = false;
        switch_.classList.remove('pressed');
        videoContainer.classList.remove('active');
    });
});

window.addEventListener('DOMContentLoaded', function() {
  var switchBtn = document.getElementById('home-switch-btn');
  if (!switchBtn) return;
  switchBtn.addEventListener('click', function(e) {
    e.preventDefault();
    if (switchBtn.classList.contains('switch-animating')) { return; }
    switchBtn.classList.add('switch-animating');
    
    // Создаем эффект ряби
    var staticOverlay = document.createElement('div');
    staticOverlay.className = 'screen-static';
    document.body.appendChild(staticOverlay);
    
    // Задержка перед переходом на главную
    setTimeout(function() {
      window.location.href = 'index.html';
    }, 800);
  });
}); 

const homeSwitchBtn = document.getElementById('home-switch-btn');
const tvStaticOverlay = document.querySelector('.tv-static-overlay');
if (homeSwitchBtn && tvStaticOverlay) {
  homeSwitchBtn.addEventListener('click', () => {
    tvStaticOverlay.classList.add('active');
    setTimeout(() => {
      tvStaticOverlay.classList.remove('active');
    }, 1200);
  });
} 

// === Dynamic layout for work page (nav + filter) ===
function adjustWorkLayout() {
  /* CSS sticky + --glowPad теперь управляют макетом, JS больше не нужен */
}

// Мгновенный вызов – до события load
adjustWorkLayout();

window.addEventListener('DOMContentLoaded', adjustWorkLayout);
window.addEventListener('load', adjustWorkLayout);
window.addEventListener('resize', adjustWorkLayout); 

// === Matrix typing + rain ===
function startMatrixTypingAndRain(card){
  const details = card.querySelector('.artist-details');
  if (!details) return;
  const typingEl = details.querySelector('.matrix-typing');
  const canvas = details.querySelector('canvas.matrix-canvas');
  if (!typingEl || !canvas) return;

  let full = typingEl.getAttribute('data-full') || '';
  typingEl.textContent = '';

  // Печать синхронизируется с фиксацией букв (см. recomputeTypingFromFixed)

  // Дождь матрицы на canvas
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const resize = () => {
    const rect = details.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
  };
  resize();

  const glyphs = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const fontSize = 14 * dpr;
  // Настройка контекста для корректного измерения ширины символов (кириллица/латиница)
  ctx.font = `${fontSize}px monospace`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  // Реальная «шаговая» ширина символа по метрике текста
  const charAdvance = Math.max(1, Math.ceil((ctx.measureText('Я').width || ctx.measureText('W').width || fontSize)));
  // Добавим интерлиньяж ~20% от размера шрифта, чтобы строки не слипались
  const lineGap = Math.ceil(fontSize * 0.26);
  const lineHeight = Math.ceil(fontSize + lineGap);
  const innerSidePad = Math.round(10 * dpr);
  const innerTopPad = Math.round(10 * dpr);
  const usableWidth = Math.max(charAdvance, canvas.width - innerSidePad * 2);
  const columns = Math.max(1, Math.floor(usableWidth / charAdvance));

  // Ограничим текст по области и переносим по слогам (ru hyphenation)
  const usableHeight = Math.max(lineHeight, canvas.height - innerTopPad);
  const maxLines = Math.max(1, Math.floor(usableHeight / lineHeight));
  const maxCapacity = Math.max(1, columns * maxLines);

  const RU_VOWEL_RE = /[аеёиоуыэюяАЕЁИОУЫЭЮЯ]/;
  function hyphenPointsRu(word) {
    const letters = Array.from(word);
    const points = [];
    for (let i = 0; i < letters.length - 1; i++) {
      if (RU_VOWEL_RE.test(letters[i])) {
        const leftLen = i + 1;
        const rightLen = letters.length - (i + 1);
        if (leftLen >= 2 && rightLen >= 2) points.push(i + 1); // перенос после гласной
      }
    }
    return points;
  }
  function firstSyllableLen(word) {
    const pts = hyphenPointsRu(word);
    if (pts.length) return pts[0];
    // иначе минимальный слог — весь word (если без внутренних гласных)
    // но чтобы не зависнуть, вернём хотя бы 2 при наличии длины
    return Math.min(Math.max(2, word.length), word.length);
  }
  function wrapToGridRu(text, cols, linesLimit) {
    const outLines = [];
    let current = '';
    const tokens = text.split(/(\s+)/);
    const pushLine = (line) => { outLines.push(line.padEnd(cols, ' ')); };
    for (let t of tokens) {
      if (outLines.length >= linesLimit) break;
      if (/^\s+$/.test(t)) { // пробелы
        // не добавляем пробел, если он приведёт к недопустимому «висящему» слогу
        if (current.length === 0) continue;
        if (current.length < cols) current += ' ';
        continue;
      }
      // слово/символы
      let w = t;
      while (w.length) {
        const remain = cols - current.length;
        if (remain <= 0) { pushLine(current); current = ''; if (outLines.length >= linesLimit) break; continue; }
        // если слово полностью влезает — кладём целиком
        if (w.length <= remain) { current += w; w = ''; break; }
        // не влезает
        const points = hyphenPointsRu(w);
        // выбираем наибольшую точку переноса, которая помещается в текущую строку
        let cut = -1;
        for (let p of points) { if (p <= remain) cut = Math.max(cut, p); }
        if (cut > 0) {
          // перенос по слогу без дефиса
          current += w.slice(0, cut);
          w = w.slice(cut);
          pushLine(current);
          current = '';
        } else {
          // ни одной валидной точки — не кладём «висящий» кусок без гласной
          // если строка пустая, попробуем поместить минимальный слог целиком
          if (current.length === 0) {
            let sl = firstSyllableLen(w);
            sl = Math.min(sl, cols);
            current = w.slice(0, sl);
            w = w.slice(sl);
            pushLine(current);
            current = '';
          } else {
            // переносим слово полностью на следующую строку
            pushLine(current);
            current = '';
          }
        }
      }
    }
    if (outLines.length < linesLimit && current) pushLine(current);
    // обрежем по лимиту линий; последнюю строку закончим многоточием, если есть лишний текст
    if (outLines.length > linesLimit) outLines.length = linesLimit;
    // Если исходный текст не поместился полностью — ставим многоточие в конец сетки
    const flattened = outLines.join('');
    if (flattened.length < Math.min(maxCapacity, text.length)) {
      // подстрахуемся: заменим последний символ на …
      const lastLineIdx = outLines.length - 1;
      if (lastLineIdx >= 0) {
        let line = outLines[lastLineIdx];
        if (line.length >= 1) {
          line = line.slice(0, cols - 1) + '…';
          outLines[lastLineIdx] = line;
        }
      }
    }
    // добьём до точной ёмкости
    while (outLines.length < linesLimit) outLines.push(''.padEnd(cols, ' '));
    return outLines.slice(0, linesLimit).join('').slice(0, cols * linesLimit);
  }

  full = wrapToGridRu(full, columns, maxLines);
  // Экспорт вместимости для отладки/подсказок
  try {
    card.dataset.matrixCapacity = String(maxCapacity);
    if (details) {
      details.setAttribute('data-matrix-capacity', String(maxCapacity));
      const title = details.getAttribute('title') || '';
      const capMsg = `Вместимость текста: ${maxCapacity} символов`;
      details.setAttribute('title', title ? title + '\n' + capMsg : capMsg);
    }
  } catch(_) {}

  // Параметры скорости (динамика под длину текста)
  const bgRainSpeed = 2.0;     // фоновые капли
  const mainRainSpeed = 2.6;   // капли с целевыми буквами (чуть быстрее)
  const idleRainSpeed = 1.2;   // капли в колонке без целевых букв
  const bgRainAlpha = 0.28;    // прозрачность фонового дождя

  // Спавн целевых капель с динамическим тактом
  const desiredTotalMs = 2200; // примерное время сборки (не жёстко)
  const spawnRefillAmount = Math.max(1, Math.min(3, Math.ceil(columns / 6)));
  const estimatedTicks = Math.max(1, Math.ceil((full.length || 1) / spawnRefillAmount));
  const spawnRefillIntervalMs = Math.max(40, Math.floor(desiredTotalMs / estimatedTicks));
  const spawnMaxAllowance = spawnRefillAmount;
  let spawnAllowance = 0;
  let lastRefillTs = performance.now();

  // Целевая фраза и сетка (после clamp по вместимости)
  const target = full.split('');
  const buildLines = Math.max(1, Math.ceil(target.length / columns));
  const buildBuffer = new Array(columns * buildLines).fill('');
  const fixed = new Array(target.length).fill(false);

  // Разложим индексы целевой строки по колонкам (чтобы падали именно «свои» буквы)
  const indicesPerColumn = Array.from({ length: columns }, () => []);
  for (let idx = 0; idx < target.length; idx++) {
    indicesPerColumn[idx % columns].push(idx);
  }

  // Для каждой колонки: текущий падающий символ (индекс целевой строки) и его Y
  const queuePtr = new Array(columns).fill(0);
  const dropY = new Array(columns).fill(0).map(() => -Math.floor(Math.random() * 10));
  // Фоновый дождь: независимые капли в каждой колонке
  const bgDropY = new Array(columns).fill(0).map(() => -Math.floor(Math.random() * 20));
  // Активность целевых капель по колонкам
  const active = new Array(columns).fill(false);

  // Таймер: хотим, чтобы весь текст успел проявиться за ~2 секунды
  const totalDurationMs = 2000;
  const startedAt = performance.now();
  function countFixed() {
    let n = 0; for (let i = 0; i < fixed.length; i++) if (fixed[i]) n++; return n;
  }
  function enforceTimeBudget() {
    const total = target.length || 0; if (total === 0) return;
    const elapsed = performance.now() - startedAt;
    const shouldFixed = Math.min(total, Math.floor((elapsed / totalDurationMs) * total));
    const already = countFixed();
    let need = shouldFixed - already;
    if (need > 0) {
      // Вместо мгновенной фиксации — агрессивно активируем падения в случайных колонках
      // столько раз, сколько нужно приблизительно для достижения прогресса
      const candidateCols = [];
      for (let col = 0; col < columns; col++) {
        if (!active[col]) {
          const list = indicesPerColumn[col];
          if (queuePtr[col] < list.length) candidateCols.push(col);
        }
      }
      for (let i = candidateCols.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidateCols[i], candidateCols[j]] = [candidateCols[j], candidateCols[i]];
      }
      const toActivate = Math.min(candidateCols.length, Math.max(1, Math.ceil(need / Math.max(1, buildLines))));
      for (let i = 0; i < toActivate; i++) {
        const col = candidateCols[i];
        if (col == null) break;
        active[col] = true;
        dropY[col] = -Math.floor(Math.random() * 12) - 6; // старт повыше
      }
    }
    // Жёсткий дедлайн: к окончанию интервала зафиксировать оставшееся
    if (elapsed >= totalDurationMs) {
      for (let idx = 0; idx < total; idx++) {
        if (!fixed[idx]) {
          fixed[idx] = true;
          const row = Math.floor(idx / columns); const col = idx % columns;
          buildBuffer[row * columns + col] = target[idx];
        }
      }
      for (let col = 0; col < columns; col++) {
        while (queuePtr[col] < indicesPerColumn[col].length && fixed[indicesPerColumn[col][queuePtr[col]]]) {
          queuePtr[col]++;
          active[col] = false;
        }
      }
      recomputeTypingFromFixed();
    }
  }


  function targetYForIndex(idx) {
    const row = Math.floor(idx / columns); // 0..buildLines-1 (сверху вниз в сетке)
    // Рендерим текст СНИЗУ вверх (классический дождь) с внутренним верхним отступом
    return innerTopPad + (usableHeight - (buildLines - row) * lineHeight);
  }

  function recomputeTypingFromFixed() {
    // продвинем «префикс» уже зафиксированных индексов
    let p = 0;
    while (p < target.length && fixed[p]) p++;
    typingEl.textContent = full.slice(0, p);
  }

  function draw() {
    if (!card.classList.contains('open')) return;
    // Поддерживаем целевой прогресс по таймеру (хаотичная фиксация)
    enforceTimeBudget();
    // Пополнение «разрешений» на спавн целевых капель
    const now = performance.now();
    if (now - lastRefillTs >= spawnRefillIntervalMs) {
      const steps = Math.floor((now - lastRefillTs) / spawnRefillIntervalMs);
      spawnAllowance = Math.min(spawnMaxAllowance, spawnAllowance + steps * spawnRefillAmount);
      lastRefillTs += steps * spawnRefillIntervalMs;
    }

    // Активация до 1–2 новых целевых капель случайно по колонкам
    if (spawnAllowance > 0) {
      const candidates = [];
      for (let col = 0; col < columns; col++) {
        if (!active[col]) {
          const list = indicesPerColumn[col];
          if (queuePtr[col] < list.length) candidates.push(col);
        }
      }
      // перемешаем кандидатов
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      for (const col of candidates) {
        if (spawnAllowance <= 0) break;
        active[col] = true;
        dropY[col] = -Math.floor(Math.random() * 10) - 12; // стартуем повыше
        spawnAllowance--;
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${fontSize}px monospace`;

    // Фоновый дождь: быстрые бледные капли на всех колонках
    ctx.save();
    ctx.fillStyle = '#00ff6a';
    ctx.globalAlpha = bgRainAlpha;
    for (let col = 0; col < columns; col++) {
      const x = innerSidePad + col * charAdvance;
      const y = innerTopPad + (bgDropY[col] * lineHeight);
      const g = glyphs[Math.floor(Math.random() * glyphs.length)];
      ctx.fillText(g, x, y);
      bgDropY[col] += bgRainSpeed;
      if (bgDropY[col] * lineHeight > canvas.height) bgDropY[col] = -10 - Math.random() * 10;
    }
    ctx.restore();

    // Основные капли (сборка целевой строки): рендерим только активные
    ctx.fillStyle = '#00ff6a';

    // Падающие «свои» буквы
    for (let col = 0; col < columns; col++) {
      const list = indicesPerColumn[col];
      const ptr = queuePtr[col];
      if (ptr >= list.length) {
        // нет больше целевых букв: можно рисовать редкие шумовые символы
        if (Math.random() < 0.12) {
          const x = innerSidePad + col * charAdvance;
          const y = innerTopPad + (dropY[col] * lineHeight);
          ctx.fillText(glyphs[Math.floor(Math.random() * glyphs.length)], x, y);
        }
        // медленный дрейф базовой капли
        dropY[col] += idleRainSpeed;
        if (dropY[col] * lineHeight > canvas.height) dropY[col] = -10;
        continue;
      }

      if (!active[col]) {
        // колонка пока не активна — не рисуем целевой символ
        continue;
      }

      const idx = list[ptr];
      const ch = target[idx] === ' ' ? '·' : target[idx]; // пробел визуализируем точкой
      const x = innerSidePad + col * charAdvance;
      const y = innerTopPad + (dropY[col] * lineHeight);
      ctx.fillText(ch, x, y);

      const ty = targetYForIndex(idx);
      if (y >= ty) {
        // фиксируем букву в целевой позиции
        const row = Math.floor(idx / columns);
        buildBuffer[row * columns + col] = target[idx];
        fixed[idx] = true;
        queuePtr[col]++;
        active[col] = false; // колонка освобождена
        // перезапускаем каплю выше
        dropY[col] = -Math.floor(Math.random() * 10) - 5;
        recomputeTypingFromFixed();
      } else {
        // двигаем каплю вниз
        dropY[col] += mainRainSpeed; // скорость
      }
    }

    // Отрисуем зафиксированные символы (финальная надпись), снизу-вверх
    ctx.save();
    ctx.shadowColor = 'rgba(0,255,106,0.4)';
    ctx.shadowBlur = 8 * dpr;
    for (let r = 0; r < buildLines; r++) {
      for (let c = 0; c < columns; c++) {
        const ch = buildBuffer[r * columns + c] || '';
        if (!ch) continue;
        const x = innerSidePad + c * charAdvance;
        const y = innerTopPad + (usableHeight - (buildLines - r) * lineHeight);
        ctx.fillText(ch, x, y);
      }
    }
    ctx.restore();

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  // Следим за ресайзом
  const onResize = () => { resize(); };
  window.addEventListener('resize', onResize, { passive: true });
  const cleanup = () => { window.removeEventListener('resize', onResize); };
  // почистим при закрытии
  const observer = new MutationObserver(() => {
    if (!card.classList.contains('open')) {
      cleanup();
      observer.disconnect();
    }
  });
  observer.observe(card, { attributes: true, attributeFilter: ['class'] });
}

// Экспорт в глобальную область, чтобы вызывать из других скриптов
if (typeof window !== 'undefined') {
  window.startMatrixTypingAndRain = startMatrixTypingAndRain;
}