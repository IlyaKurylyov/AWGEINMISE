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
let currentTrackIndex = 0;
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

playBtn.addEventListener('click', playTrack);
stopBtn.addEventListener('click', stopTrack);
nextBtn.addEventListener('click', nextTrack);
prevBtn.addEventListener('click', prevTrack);

// Добавляем немного случайных глитчей
setInterval(() => {
    if (isPlaying && Math.random() < 0.1) {
        trackDisplay.style.animation = 'glitch 0.2s';
        setTimeout(() => {
            if (isPlaying) {
                trackDisplay.style.animation = 'glitch 0.2s infinite';
            }
        }, 200);
    }
}, 2000);

// Инициализация
updateDisplay();

document.addEventListener('DOMContentLoaded', function() {
    const artistSelector = document.getElementById('artist-selector');
    const trackDisplay = document.getElementById('track-display');
    const playBtn = document.getElementById('play-btn');
    const stopBtn = document.getElementById('stop-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    
    // ID артистов в Яндекс.Музыке
    const artistIds = {
        'hahahap': '23224451',
        'kodik': '13773076',
        'shibvri': '22394975',
        'dope': '',
        'xan': '',
        'namusorill': '11123653',
        'febb': '22838316'
    };

    function createYandexMusicWidget(artistId) {
        const widget = document.createElement('iframe');
        widget.src = `https://music.yandex.ru/iframe/#artist/${artistId}`;
        widget.width = '100%';
        widget.height = '400';
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
        
        // Проверяем, находимся ли мы на странице релизов
        if (window.location.pathname.includes('music.html')) {
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
                
                setTimeout(() => {
                    display.innerHTML = '';
                    const widget = createYandexMusicWidget(artistId);
                    display.appendChild(widget);
                    display.style.animation = 'none';
                }, 1000);
            } else {
                display.innerHTML = `
                    <div class="no-selection-message">
                        РЕЛИЗЫ НЕДОСТУПНЫ
                        <div class="blink-cursor">_</div>
                    </div>
                `;
            }
        } else {
            display.innerHTML = `
                <div class="no-selection-message">
                    ПЕРЕЙДИТЕ НА СТРАНИЦУ РЕЛИЗОВ
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