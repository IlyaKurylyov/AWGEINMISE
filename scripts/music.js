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
let isWebsitePlayback = false;  // Новая переменная для отслеживания режима воспроизведения

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

// Воспроизведение трека в режиме website
function playWebsiteTrack() {
    console.log('playWebsiteTrack вызван');
    
    if (!isWebsitePlayback) {
        console.log('Не в режиме website');
        return;
    }

    if (!window.playlistInitialized) {
        console.log('Инициализация плейлиста');
        shufflePlaylist();
        window.playlistInitialized = true;
    }
    
    if (audioPlayer.paused) {
        const track = playlist[currentTrackIndex];
        console.log('Текущий трек:', track);
        
        if (!track || !track.file) {
            console.error('Трек не найден или отсутствует файл');
            return;
        }
        
        // Сразу обновляем отображение
        const [artist, title] = track.title.split(' - ');
        const display = document.querySelector('.vhs-display');
        display.innerHTML = `
            <div class="track-info">
                <div class="artist-name">${artist}</div>
                <div class="track-title">${title}</div>
                <div class="track-progress">
                    <div class="time-current">0:00</div>
                    <div class="progress-bar">
                        <div class="progress" style="width: 0%"></div>
                    </div>
                    <div class="time-total">0:00</div>
                </div>
            </div>
        `;
        
        // Добавляем эффект глитча только при смене трека
        display.style.animation = 'glitch 0.2s';
        setTimeout(() => {
            display.style.animation = 'none';
        }, 200);
        
        // Проверяем доступность файла перед воспроизведением
        fetch(track.file)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                console.log('Файл доступен:', track.file);
                return response.blob();
            })
            .then(blob => {
                console.log('Файл загружен, создаем URL');
                const audioUrl = URL.createObjectURL(blob);
                console.log('Audio URL создан:', audioUrl);
                
                audioPlayer.src = audioUrl;
                return audioPlayer.play();
            })
            .then(() => {
                console.log('Воспроизведение началось успешно');
                playBtn.textContent = '❚❚';
                statusText.textContent = 'PLAYING';
                playIndicator.classList.add('active');
                isPlaying = true;
            })
            .catch(error => {
                console.error('Ошибка:', error);
                statusText.textContent = 'ERROR';
                display.innerHTML = `
                    <div class="track-info">
                        <div class="error-message">ОШИБКА ВОСПРОИЗВЕДЕНИЯ</div>
                        <div class="error-details">${error.message}</div>
                    </div>
                `;
            });
    } else {
        console.log('Ставим на паузу');
        audioPlayer.pause();
        playBtn.textContent = '►';
        statusText.textContent = 'PAUSED';
        playIndicator.classList.remove('active');
        isPlaying = false;
    }
}

// Обработчик для кнопки play
playBtn.addEventListener('click', () => {
    console.log('Кнопка Play нажата');
    if (!isWebsitePlayback) {
        console.log('Не в режиме website, выходим');
        return;
    }
    playWebsiteTrack();
});

function stopTrack() {
    if (!isWebsitePlayback) return;  // Проверяем режим воспроизведения
    
    isPlaying = false;
    playIndicator.classList.remove('active');
    statusText.textContent = 'STOPPED';
    trackDisplay.style.animation = 'none';
}

function updateTrackDisplay(track) {
    const [artist, title] = track.title.split(' - ');
    const display = document.querySelector('.vhs-display');
    display.innerHTML = `
        <div class="track-info">
            <div class="artist-name">${artist}</div>
            <div class="track-title">${title}</div>
            <div class="track-progress">
                <div class="time-current">0:00</div>
                <div class="progress-bar">
                    <div class="progress" style="width: 0%"></div>
                </div>
                <div class="time-total">0:00</div>
            </div>
        </div>
    `;
    
    // Добавляем эффект глитча при смене трека
    display.style.animation = 'glitch 0.2s';
    setTimeout(() => {
        display.style.animation = 'none';
    }, 200);
}

function nextTrack() {
    if (!isWebsitePlayback) return;
    
    currentTrackIndex = (currentTrackIndex + 1) % playlist.length;
    const track = playlist[currentTrackIndex];
    
    // Обновляем отображение
    updateTrackDisplay(track);
    
    // Проверяем доступность файла и начинаем воспроизведение
    fetch(track.file)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.blob();
        })
        .then(blob => {
            const audioUrl = URL.createObjectURL(blob);
            audioPlayer.src = audioUrl;
            return audioPlayer.play();
        })
        .then(() => {
            playBtn.textContent = '❚❚';
            statusText.textContent = 'PLAYING';
            playIndicator.classList.add('active');
            isPlaying = true;
        })
        .catch(error => {
            console.error('Ошибка воспроизведения следующего трека:', error);
            statusText.textContent = 'ERROR';
            const display = document.querySelector('.vhs-display');
            display.innerHTML = `
                <div class="track-info">
                    <div class="error-message">ОШИБКА ВОСПРОИЗВЕДЕНИЯ</div>
                    <div class="error-details">${error.message}</div>
                </div>
            `;
        });
}

function prevTrack() {
    if (!isWebsitePlayback) return;
    
    currentTrackIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length;
    const track = playlist[currentTrackIndex];
    
    // Обновляем отображение
    updateTrackDisplay(track);
    
    // Проверяем доступность файла и начинаем воспроизведение
    fetch(track.file)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.blob();
        })
        .then(blob => {
            const audioUrl = URL.createObjectURL(blob);
            audioPlayer.src = audioUrl;
            return audioPlayer.play();
        })
        .then(() => {
            playBtn.textContent = '❚❚';
            statusText.textContent = 'PLAYING';
            playIndicator.classList.add('active');
            isPlaying = true;
        })
        .catch(error => {
            console.error('Ошибка воспроизведения предыдущего трека:', error);
            statusText.textContent = 'ERROR';
            const display = document.querySelector('.vhs-display');
            display.innerHTML = `
                <div class="track-info">
                    <div class="error-message">ОШИБКА ВОСПРОИЗВЕДЕНИЯ</div>
                    <div class="error-details">${error.message}</div>
                </div>
            `;
        });
}

// Обработчик изменения выбранного артиста
artistSelector.addEventListener('change', function() {
    const selectedArtist = this.value;
    const artistId = artistIds[selectedArtist];
    const display = document.querySelector('.vhs-display');
    
    // Останавливаем текущее воспроизведение
    if (audioPlayer) {
        audioPlayer.pause();
        audioPlayer.src = '';
        audioPlayer.currentTime = 0;
        isPlaying = false;
        playBtn.textContent = '►';
        statusText.textContent = 'STOPPED';
        playIndicator.classList.remove('active');
    }
    
    // Удаляем существующий виджет, если он есть
    const existingWidget = display.querySelector('.yandex-music-widget');
    if (existingWidget) {
        existingWidget.remove();
    }
    
    if (selectedArtist === 'website') {
        display.innerHTML = `
            <div class="track-info">
                <div class="message">НАЖМИТЕ PLAY ДЛЯ СЛУЧАЙНОГО ТРЕКА</div>
                <div class="track-progress">
                    <div class="time-current">0:00</div>
                    <div class="progress-bar">
                        <div class="progress" style="width: 0%"></div>
                    </div>
                    <div class="time-total">0:00</div>
                </div>
            </div>
        `;
        
        // Включаем кнопки управления для режима website
        playBtn.disabled = false;
        stopBtn.disabled = false;
        prevBtn.disabled = false;
        nextBtn.disabled = false;
        
        [playBtn, stopBtn, prevBtn, nextBtn].forEach(btn => {
            btn.classList.remove('disabled');
        });
        
        // Устанавливаем режим воспроизведения
        isWebsitePlayback = true;
        if (!window.playlistInitialized) {
            shufflePlaylist();
            window.playlistInitialized = true;
        }
    } else if (artistId) {
        // Отключаем кнопки управления для режима Яндекс.Музыки
        playBtn.disabled = true;
        stopBtn.disabled = true;
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        
        [playBtn, stopBtn, prevBtn, nextBtn].forEach(btn => {
            btn.classList.add('disabled');
        });
        
        // Создаем и добавляем виджет Яндекс.Музыки
        const widget = createYandexMusicWidget(artistId);
        display.innerHTML = '';
        display.appendChild(widget);
        
        // Отключаем режим воспроизведения сайта
        isWebsitePlayback = false;
    } else {
        display.innerHTML = `
            <div class="track-info">
                <div class="message">РЕЛИЗЫ НЕДОСТУПНЫ</div>
            </div>
        `;
    }
    
    // Эффект глитча при смене режима
    display.style.animation = 'glitch 0.5s';
    setTimeout(() => {
        display.style.animation = 'none';
    }, 500);
});

// Функция обновления состояния кнопок
function updateButtonStates() {
    const buttonsEnabled = isWebsitePlayback;
    playBtn.disabled = !buttonsEnabled;
    stopBtn.disabled = !buttonsEnabled;
    prevBtn.disabled = !buttonsEnabled;
    nextBtn.disabled = !buttonsEnabled;
    
    // Добавляем/убираем класс для визуального отображения состояния
    [playBtn, stopBtn, prevBtn, nextBtn].forEach(btn => {
        btn.classList.toggle('disabled', !buttonsEnabled);
    });
}

// Вызываем updateButtonStates при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    updateButtonStates();
});

// Список MP3 файлов
const playlist = [
    {
        title: "Febb Tufoe - Hyena",
        file: "/assets/audio/Febb Tufoe - Hyena.mp3"
    },
    {
        title: "Febb Tufoe - Novocaine",
        file: "/assets/audio/Febb Tufoe - Novocaine.mp3"
    },
    {
        title: "xxvnx - Огнем",
        file: "/assets/audio/xxvnx - Огнем.mp3"
    },
    {
        title: "uwannadope - Не верю",
        file: "/assets/audio/uwannadope - Не верю.mp3"
    },
    {
        title: "uwannadope - Она хочет",
        file: "/assets/audio/uwannadope - Она хочет.mp3"
    },
    {
        title: "SHIBVRI - Помнит меня",
        file: "/assets/audio/SHIBVRI - Помнит меня (prod.shibvri).mp3"
    },
    {
        title: "SHIBVRI - За стеной",
        file: "/assets/audio/SHIBVRI - За стеной.mp3"
    },
    {
        title: "Kodik - ДРОП",
        file: "/assets/audio/Kodik - ДРОП.mp3"
    },
    {
        title: "Kodik - Пустые карманы",
        file: "/assets/audio/Kodik - Пустые карманы.mp3"
    },
    {
        title: "namusorill - Принятие питие",
        file: "/assets/audio/namusorill - Принятие питие.mp3"
    },
    {
        title: "namusorill - Мягкая Посадка",
        file: "/assets/audio/namusorill - Мягкая Посадка.mp3"
    },
    {
        title: "Hahahap - Disney",
        file: "/assets/audio/Hahahap - Disney (Prod by dope, the producer).mp3"
    },
    {
        title: "Hahahap - Black Mercedes",
        file: "/assets/audio/Hahahap - Black Mercedes.mp3"
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
    if (!track || !track.file) {
        console.error('Трек не найден или отсутствует файл');
        return;
    }

    // Устанавливаем источник аудио
    audioPlayer.src = track.file;
    
    // Сразу обновляем информацию о треке
    const [artist, title] = track.title.split(' - ');
    trackDisplay.innerHTML = `
        <div class="now-playing">
            <div class="artist-name">${artist}</div>
            <div class="track-name">${title}</div>
            <div class="track-progress">
                <div class="time-current">0:00</div>
                <div class="progress-bar">
                    <div class="progress" style="width: 0%"></div>
                </div>
                <div class="time-total">0:00</div>
            </div>
        </div>
    `;

    // Добавляем эффект глитча
    trackDisplay.style.animation = 'glitch 0.2s';
    
    // Воспроизводим
    audioPlayer.play()
        .then(() => {
            playBtn.textContent = '❚❚';
            statusText.textContent = 'PLAYING';
            playIndicator.classList.add('active');
            
            setTimeout(() => {
                trackDisplay.style.animation = 'glitch 0.2s infinite';
            }, 200);
        })
        .catch(error => {
            console.error('Ошибка воспроизведения:', error);
            statusText.textContent = 'ERROR';
            // Показываем ошибку на дисплее
            trackDisplay.innerHTML = `
                <div class="now-playing">
                    <div class="message">ОШИБКА ВОСПРОИЗВЕДЕНИЯ</div>
                </div>
            `;
        });

    isPlaying = true;
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
audioPlayer.addEventListener('timeupdate', () => {
    const currentTime = document.querySelector('.time-current');
    const progress = document.querySelector('.progress');
    const totalTime = document.querySelector('.time-total');
    
    if (currentTime && progress && totalTime) {
        currentTime.textContent = formatTime(audioPlayer.currentTime);
        totalTime.textContent = formatTime(audioPlayer.duration);
        const progressWidth = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        progress.style.width = `${progressWidth}%`;
    }
});

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
        return widget;
    }

    artistSelector.addEventListener('change', function() {
        const selectedArtist = this.value;
        const artistId = artistIds[selectedArtist];
        const display = document.querySelector('.vhs-display');
        
        // Останавливаем текущее воспроизведение
        if (audioPlayer) {
            audioPlayer.pause();
            audioPlayer.src = '';
            audioPlayer.currentTime = 0;
            isPlaying = false;
            playBtn.textContent = '►';
            statusText.textContent = 'STOPPED';
            playIndicator.classList.remove('active');
        }
        
        // Удаляем существующий виджет, если он есть
        const existingWidget = display.querySelector('.yandex-music-widget');
        if (existingWidget) {
            existingWidget.remove();
        }
        
        if (selectedArtist === 'website') {
            display.innerHTML = `
                <div class="track-info">
                    <div class="message">НАЖМИТЕ PLAY ДЛЯ СЛУЧАЙНОГО ТРЕКА</div>
                    <div class="track-progress">
                        <div class="time-current">0:00</div>
                        <div class="progress-bar">
                            <div class="progress" style="width: 0%"></div>
                        </div>
                        <div class="time-total">0:00</div>
                    </div>
                </div>
            `;
            
            // Включаем кнопки управления для режима website
            playBtn.disabled = false;
            stopBtn.disabled = false;
            prevBtn.disabled = false;
            nextBtn.disabled = false;
            
            [playBtn, stopBtn, prevBtn, nextBtn].forEach(btn => {
                btn.classList.remove('disabled');
            });
            
            // Устанавливаем режим воспроизведения
            isWebsitePlayback = true;
            shufflePlaylist();
        } else if (artistId) {
            // Отключаем кнопки управления для режима Яндекс.Музыки
            playBtn.disabled = true;
            stopBtn.disabled = true;
            prevBtn.disabled = true;
            nextBtn.disabled = true;
            
            [playBtn, stopBtn, prevBtn, nextBtn].forEach(btn => {
                btn.classList.add('disabled');
            });
            
            // Создаем и добавляем виджет Яндекс.Музыки
            const widget = createYandexMusicWidget(artistId);
            display.innerHTML = '';
            display.appendChild(widget);
            
            // Отключаем режим воспроизведения сайта
            isWebsitePlayback = false;
        } else {
            display.innerHTML = `
                <div class="track-info">
                    <div class="message">РЕЛИЗЫ НЕДОСТУПНЫ</div>
                </div>
            `;
        }
        
        // Эффект глитча при смене режима
        display.style.animation = 'glitch 0.5s';
        setTimeout(() => {
            display.style.animation = 'none';
        }, 500);
    });
});

// Обновляем стили
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    .track-info {
        text-align: center;
        padding: 15px;
        color: #fff;
        font-family: 'Courier New', monospace;
    }
    
    .message {
        font-size: 18px;
        margin-bottom: 15px;
        color: #fff;
        text-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
        animation: blink 2s infinite;
        letter-spacing: 1px;
    }
    
    .artist-name {
        font-size: 18px;
        margin-bottom: 10px;
        text-transform: uppercase;
        color: #00ff00;
        text-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
        letter-spacing: 1px;
    }
    
    .track-title {
        font-size: 16px;
        margin-bottom: 15px;
        color: #fff;
        opacity: 0.8;
    }
    
    .track-progress {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        margin-top: 15px;
    }
    
    .time-current, .time-total {
        font-size: 14px;
        min-width: 45px;
        color: #00ff00;
        opacity: 0.8;
    }
    
    .progress-bar {
        flex-grow: 1;
        height: 2px;
        background: rgba(0, 255, 0, 0.2);
        position: relative;
        max-width: 200px;
    }
    
    .progress {
        position: absolute;
        left: 0;
        top: 0;
        height: 100%;
        background: #00ff00;
        box-shadow: 0 0 5px rgba(0, 255, 0, 0.3);
        transition: width 0.1s linear;
    }
    
    .error-message {
        color: #ff0000;
        font-size: 18px;
        margin-bottom: 10px;
        text-shadow: 0 0 10px rgba(255, 0, 0, 0.3);
    }
    
    .error-details {
        color: #ff0000;
        font-size: 14px;
        opacity: 0.7;
    }
    
    @keyframes blink {
        0% { opacity: 1; }
        50% { opacity: 0.3; }
        100% { opacity: 1; }
    }
    
    @keyframes glitch {
        0% { transform: translate(0); }
        20% { transform: translate(-2px, 2px); }
        40% { transform: translate(-2px, -2px); }
        60% { transform: translate(2px, 2px); }
        80% { transform: translate(2px, -2px); }
        100% { transform: translate(0); }
    }
`;
document.head.appendChild(styleSheet);

// Добавляем обработчики событий для аудиоплеера
audioPlayer.addEventListener('error', (e) => {
    console.error('Ошибка аудиоплеера:', e.target.error);
});

// Проверка загрузки аудио
audioPlayer.addEventListener('loadeddata', () => {
    console.log('Аудио загружено:', audioPlayer.src);
});

// Проверяем плейлист при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    console.log('Проверка плейлиста при загрузке:', playlist);
    // Проверяем каждый трек
    playlist.forEach((track, index) => {
        if (!track.file) {
            console.error(`Отсутствует файл для трека ${index}:`, track);
        } else {
            // Проверяем существование файла
            fetch(track.file)
                .then(response => {
                    if (!response.ok) {
                        console.error(`Файл ${track.file} недоступен:`, response.status);
                    } else {
                        console.log(`Файл ${track.file} доступен`);
                    }
                })
                .catch(error => {
                    console.error(`Ошибка проверки файла ${track.file}:`, error);
                });
        }
    });
});

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    // Сбрасываем флаг инициализации плейлиста
    window.playlistInitialized = false;
    
    // Очищаем источник аудио
    audioPlayer.src = '';
    currentTrackIndex = 0;
});