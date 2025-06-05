// Конфигурация артистов и их треков
const artistTracks = {
    'Hahahap': {
        tracks: [
            {
                title: 'Название трека 1',
                year: '2024',
                cover: 'assets/images/releases/hahahap1.jpg',
                yandexMusicId: 'TRACK_ID_1'
            }
            // Добавьте больше треков
        ]
    },
    'Kodik': {
        tracks: []
        // Добавьте треки
    },
    'SHIBVRI': {
        tracks: []
        // Добавьте треки
    },
    'DOPE THE PRODUCER': {
        tracks: [
            {
                title: 'DOPE THE PRODUCER',
                year: '2024',
                cover: 'assets/images/releases/dope.jpg',
                yandexMusicId: '11748604',
                audioSrc: 'assets/audio/dope.mp3'  // Путь к MP3 файлу
            }
        ]
    },
    'XAN': {
        tracks: [
            {
                title: 'XAN',
                year: '2024',
                cover: 'assets/images/releases/xan.jpg',
                audioSrc: 'assets/audio/xan.mp3'  // Путь к MP3 файлу
            }
        ]
    },
    // Добавьте остальных артистов
};

// Инициализация Яндекс.Музыки
document.addEventListener('DOMContentLoaded', () => {
    // Инициализация API
    YandexMusic.init()
        .then(() => {
            console.log('Яндекс.Музыка API инициализирован');
            loadTracks();
        })
        .catch(error => {
            console.error('Ошибка инициализации API:', error);
        });
});

// Загрузка треков
function loadTracks() {
    Object.entries(artistTracks).forEach(([artistName, data]) => {
        const container = document.querySelector(`.artist-releases:has(.artist-name:contains("${artistName}")) .tracks-container`);
        if (!container) return;

        data.tracks.forEach(track => {
            const trackCard = createTrackCard(track);
            container.appendChild(trackCard);
        });
    });
}

// Создание карточки трека
function createTrackCard(track) {
    const card = document.createElement('div');
    card.className = 'track-card';
    card.innerHTML = `
        <div class="track-art">
            <img src="${track.cover}" alt="${track.title}">
            <div class="play-overlay">
                <div class="play-button"></div>
            </div>
        </div>
        <div class="track-info">
            <h3>${track.title}</h3>
            <p>${track.year}</p>
        </div>
        <div class="yandex-player" data-id="${track.yandexMusicId}"></div>
    `;

    // Обработчик клика для воспроизведения
    const playButton = card.querySelector('.play-button');
    playButton.addEventListener('click', () => {
        const player = card.querySelector('.yandex-player');
        YandexMusic.playTrack(track.yandexMusicId, player);
    });

    return card;
}

// Вспомогательная функция для работы с API Яндекс.Музыки
const YandexMusic = {
    player: null,

    init() {
        return new Promise((resolve, reject) => {
            try {
                this.player = new Ya.Music.Player({
                    "type": "player",
                    "preload": true,
                    "autoplay": false,
                    "controls": true
                });
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    },

    playTrack(trackId, container) {
        if (!this.player) return;

        // Останавливаем текущее воспроизведение
        this.player.stop();

        // Создаем новый плеер для трека
        this.player.setup(container).then(() => {
            this.player.load({ "trackId": trackId });
            this.player.play();
        });
    }
};

// Добавляем эффекты при скролле
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Применяем анимацию появления к карточкам артистов
document.querySelectorAll('.artist-releases').forEach(card => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    card.style.transition = 'all 0.6s ease-out';
    observer.observe(card);
});

const artistData = {
    hahahap: {
        name: "HAHAHAP",
        tracks: ["Трек 1", "Трек 2"]
    },
    kodik: {
        name: "KODIK",
        tracks: ["Трек 1"]
    },
    shibvri: {
        name: "SHIBVRI",
        tracks: ["Трек 1"]
    },
    dope: {
        name: "DOPE THE PRODUCER",
        tracks: ["Трек 1"]
    },
    xan: {
        name: "XAN",
        tracks: ["Трек 1"]
    },
    namusorill: {
        name: "NAMUSORILL",
        tracks: ["Трек 1"]
    },
    febb: {
        name: "FEBB TUFOE",
        tracks: ["Трек 1"]
    }
};

let currentArtist = null;
let isPlaying = false;

const artistSelector = document.getElementById('artist-selector');
const trackDisplay = document.getElementById('track-display');
const playBtn = document.getElementById('play-btn');
const stopBtn = document.getElementById('stop-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const statusText = document.querySelector('.status-text');
const powerIndicator = document.querySelector('.indicator:nth-child(1)');
const playIndicator = document.querySelector('.indicator:nth-child(2)');
const recIndicator = document.querySelector('.indicator:nth-child(3)');

// Включаем индикатор питания
powerIndicator.classList.add('active');

function updateDisplay() {
    if (!currentArtist) {
        trackDisplay.innerHTML = `
            <div class="no-selection-message">
                ВСТАВЬТЕ КАССЕТУ
                <div class="blink-cursor">_</div>
            </div>
        `;
        return;
    }

    const artist = artistData[currentArtist];
    const trackList = artist.tracks.map((track, index) => `
        <div class="track-item ${index === currentTrackIndex ? 'active' : ''}">
            ${index === currentTrackIndex ? '► ' : ''}${track}
        </div>
    `).join('');

    trackDisplay.innerHTML = `
        <div class="artist-name">${artist.name}</div>
        <div class="track-list">${trackList}</div>
    `;
}

function playTrack() {
    if (!currentArtist) return;
    
    isPlaying = !isPlaying;
    playBtn.textContent = isPlaying ? '❚❚' : '►';
    statusText.textContent = isPlaying ? 'PLAYING' : 'READY';
    playIndicator.classList.toggle('active', isPlaying);
    
    // Добавляем эффект глитча при воспроизведении
    if (isPlaying) {
        trackDisplay.style.animation = 'glitch 0.2s infinite';
    } else {
        trackDisplay.style.animation = 'none';
    }
}

function stopTrack() {
    isPlaying = false;
    playBtn.textContent = '►';
    statusText.textContent = 'READY';
    playIndicator.classList.remove('active');
    trackDisplay.style.animation = 'none';
}

function nextTrack() {
    if (!currentArtist) return;
    
    const tracks = artistData[currentArtist].tracks;
    currentTrackIndex = (currentTrackIndex + 1) % tracks.length;
    updateDisplay();
    
    if (isPlaying) {
        trackDisplay.style.animation = 'glitch 0.2s infinite';
    }
}

function prevTrack() {
    if (!currentArtist) return;
    
    const tracks = artistData[currentArtist].tracks;
    currentTrackIndex = (currentTrackIndex - 1 + tracks.length) % tracks.length;
    updateDisplay();
    
    if (isPlaying) {
        trackDisplay.style.animation = 'glitch 0.2s infinite';
    }
}

// События
artistSelector.addEventListener('change', (e) => {
    currentArtist = e.target.value;
    currentTrackIndex = 0;
    stopTrack();
    updateDisplay();
    // Эффект вставки кассеты
    trackDisplay.style.animation = 'glitch 0.5s';
    setTimeout(() => {
        trackDisplay.style.animation = 'none';
    }, 500);
});

// Список MP3 файлов
const playlist = [
    {
        title: "Febb Tufoe - Hyena",
        file: "assets/audio/Febb Tufoe - Hyena.mp3"
    },
    {
        title: "Febb Tufoe - Novocaine",
        file: "assets/audio/Febb Tufoe - Novocaine.mp3"
    },
    {
        title: "xxvnx - Огнем",
        file: "assets/audio/xxvnx - Огнем.mp3"
    },
    {
        title: "uwannadope - Не верю",
        file: "assets/audio/uwannadope - Не верю.mp3"
    },
    {
        title: "uwannadope - Она хочет",
        file: "assets/audio/uwannadope - Она хочет.mp3"
    },
    {
        title: "SHIBVRI - Помнит меня",
        file: "assets/audio/SHIBVRI - Помнит меня (prod.shibvri).mp3"
    },
    {
        title: "SHIBVRI - За стеной",
        file: "assets/audio/SHIBVRI - За стеной.mp3"
    },
    {
        title: "Kodik - ДРОП",
        file: "assets/audio/Kodik - ДРОП.mp3"
    },
    {
        title: "Kodik - Пустые карманы",
        file: "assets/audio/Kodik - Пустые карманы.mp3"
    },
    {
        title: "namusorill - Принятие питие",
        file: "assets/audio/namusorill - Принятие питие.mp3"
    },
    {
        title: "namusorill - Мягкая Посадка",
        file: "assets/audio/namusorill - Мягкая Посадка.mp3"
    },
    {
        title: "Hahahap - Disney",
        file: "assets/audio/Hahahap - Disney (Prod by dope, the producer).mp3"
    },
    {
        title: "Hahahap - Black Mercedes",
        file: "assets/audio/Hahahap - Black Mercedes.mp3"
    }
];

let currentTrackIndex = 0;
const audioPlayer = new Audio();

// Перемешивание плейлиста
function shufflePlaylist() {
    for (let i = playlist.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [playlist[i], playlist[j]] = [playlist[j], playlist[i]];
    }
}

// Воспроизведение текущего трека
function playCurrentTrack() {
    const track = playlist[currentTrackIndex];
    audioPlayer.src = track.file;
    audioPlayer.play()
        .then(() => {
            playBtn.textContent = '❚❚';
            statusText.textContent = 'PLAYING';
            playIndicator.classList.add('active');
            updateDisplay();
        })
        .catch(error => {
            console.error('Ошибка воспроизведения:', error);
            statusText.textContent = 'ERROR';
        });
}

// Обработчик для кнопки play
playBtn.addEventListener('click', () => {
    if (audioPlayer.paused) {
        if (!audioPlayer.src || audioPlayer.src === '') {
            // Перемешиваем плейлист при первом запуске
            shufflePlaylist();
            currentTrackIndex = 0;
            playCurrentTrack();
        } else {
            audioPlayer.play();
            playBtn.textContent = '❚❚';
            statusText.textContent = 'PLAYING';
            playIndicator.classList.add('active');
        }
    } else {
        audioPlayer.pause();
        playBtn.textContent = '►';
        statusText.textContent = 'PAUSED';
        playIndicator.classList.remove('active');
    }
});

// Следующий трек
function nextTrack() {
    currentTrackIndex = (currentTrackIndex + 1) % playlist.length;
    playCurrentTrack();
}

// Предыдущий трек
function prevTrack() {
    currentTrackIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length;
    playCurrentTrack();
}

// Остановка воспроизведения
function stopTrack() {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    playBtn.textContent = '►';
    statusText.textContent = 'STOPPED';
    playIndicator.classList.remove('active');
}

// Обновление дисплея
function updateDisplay() {
    const currentTrack = playlist[currentTrackIndex];
    trackDisplay.innerHTML = `
        <div class="track-info">
            <div class="track-title">${currentTrack.title}</div>
            <div class="track-progress">
                <div class="time-current">${formatTime(audioPlayer.currentTime)}</div>
                <div class="progress-bar">
                    <div class="progress" style="width: ${(audioPlayer.currentTime / audioPlayer.duration) * 100}%"></div>
                </div>
                <div class="time-total">${formatTime(audioPlayer.duration)}</div>
            </div>
        </div>
    `;
}

// Форматирование времени
function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Обработчики кнопок
stopBtn.addEventListener('click', stopTrack);
nextBtn.addEventListener('click', nextTrack);
prevBtn.addEventListener('click', prevTrack);

// Обновление прогресса воспроизведения
audioPlayer.addEventListener('timeupdate', updateDisplay);

// Автоматическое переключение на следующий трек
audioPlayer.addEventListener('ended', nextTrack);

// Эффекты глитча
audioPlayer.addEventListener('playing', () => {
    trackDisplay.style.animation = 'glitch 0.2s infinite';
});

audioPlayer.addEventListener('pause', () => {
    trackDisplay.style.animation = 'none';
});

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    updateDisplay();
});

// ID артистов в Яндекс.Музыке
const artistIds = {
    'hahahap': '23224451',
    'kodik': '13773076',
    'shibvri': '22394975',
    'dope': '11748604',
    'xan': '22931926',
    'namusorill': '11123653',
    'febb': '22838316'
};

document.addEventListener('DOMContentLoaded', function() {
    const artistSelector = document.getElementById('artist-selector');
    const trackDisplay = document.getElementById('track-display');
    const playBtn = document.getElementById('play-btn');
    const stopBtn = document.getElementById('stop-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    
    function createYandexMusicWidget(artistId) {
        const widget = document.createElement('iframe');
        widget.src = `https://music.yandex.ru/iframe/#artist/${artistId}/tracks?visual-style=headerCompact`;
        widget.width = '100%';
        widget.height = '350px';
        widget.frameBorder = '0';
        widget.allow = 'autoplay';
        widget.className = 'yandex-music-widget';
        
        // Добавляем эффект глитча при загрузке
        widget.addEventListener('load', () => {
            const display = document.querySelector('.vhs-display');
            display.style.animation = 'glitch 0.5s';
            setTimeout(() => {
                display.style.animation = 'none';
            }, 500);
        });
        
        return widget;
    }

    artistSelector.addEventListener('change', function() {
        const selectedArtist = this.value;
        const artistId = artistIds[selectedArtist];
        const display = document.querySelector('.vhs-display');
        
        if (artistId) {
            // Эффект загрузки
            display.innerHTML = `
                <div class="loading-message">
                    ЗАГРУЗКА РЕЛИЗОВ
                    <div class="blink-cursor">_</div>
                </div>
            `;
            
            // Добавляем эффект глитча
            display.style.animation = 'glitch 0.2s infinite';
            
            const widget = document.createElement('iframe');
            widget.src = `https://music.yandex.ru/iframe/#artist/${artistId}/tracks?visual-style=headerCompact`;
            widget.width = '100%';
            widget.height = '350px';
            widget.frameBorder = '0';
            widget.allow = 'autoplay';
            widget.className = 'yandex-music-widget';
            
            // Заменяем сообщение загрузки на виджет
            setTimeout(() => {
                display.innerHTML = '';
                display.appendChild(widget);
                display.style.animation = 'none';
                
                // Добавляем тряску виджету при появлении
                widget.style.animation = 'glitch 0.3s';
                setTimeout(() => {
                    widget.style.animation = 'none';
                }, 300);
            }, 1000);
        } else {
            display.innerHTML = `
                <div class="no-selection-message">
                    РЕЛИЗЫ НЕДОСТУПНЫ
                    <div class="blink-cursor">_</div>
                </div>
            `;
        }
    });

    // Обновляем индикаторы при взаимодействии
    playBtn.addEventListener('click', function() {
        document.querySelector('.indicator:nth-child(2) .indicator-light').classList.add('active');
    });

    stopBtn.addEventListener('click', function() {
        document.querySelector('.indicator:nth-child(2) .indicator-light').classList.remove('active');
    });
});