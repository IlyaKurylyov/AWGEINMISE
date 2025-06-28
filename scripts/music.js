// Глобальные переменные
const audioPlayer = new Audio();
let currentTrackIndex = 0;
let isPlaying = false;
let isWebsitePlayback = false;
const statusText = document.createElement('div');
statusText.className = 'status-text';
statusText.textContent = 'READY';

// Добавляем в начало файла
let currentBlobUrl = null;

function cleanupAudioResources() {
    return new Promise((resolve) => {
        if (currentBlobUrl) {
            URL.revokeObjectURL(currentBlobUrl);
            currentBlobUrl = null;
        }
        
        if (audioPlayer.src) {
            audioPlayer.pause();
            audioPlayer.removeAttribute('src');
            audioPlayer.load();
            
            // Даем браузеру время на очистку ресурсов
            setTimeout(() => {
                resolve();
            }, 100);
        } else {
            resolve();
        }
    });
}

// Конфигурация артистов и их треков
const artistTracks = {
    'Hahahap': {
        tracks: [
            {
                title: 'Название трека 1',
                year: '2024',
                cover: 'assets/images/releases/hahahap1.jpg',
                yandexMusicId: '23224451'
            }
        ]
    },
    'Kodik': {
        tracks: [
            {
                title: 'Название трека 1',
                year: '2024',
                yandexMusicId: '13773076'
            }
        ]
    },
    'SHIBVRI': {
        tracks: [
            {
                title: 'Название трека 1',
                year: '2024',
                yandexMusicId: '22394975'
            }
        ]
    },
    'DOPE THE PRODUCER': {
        tracks: [
            {
                title: 'DOPE THE PRODUCER',
                year: '2024',
                cover: 'assets/images/releases/dope.jpg',
                yandexMusicId: '11748604'
            }
        ]
    },
    'XAN': {
        tracks: [
            {
                title: 'XAN',
                year: '2024',
                cover: 'assets/images/releases/xan.jpg',
                yandexMusicId: '22931926'
            }
        ]
    }
};

// Инициализация Яндекс.Музыки
document.addEventListener('DOMContentLoaded', () => {
    // Инициализация API
    Ya.Music.init()
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
    const artistSelector = document.getElementById('artist-selector');
    if (!artistSelector) return;

    // Очищаем текущие опции
    artistSelector.innerHTML = '<option value="">Выберите артиста</option>';

    // Добавляем артистов в селектор
    Object.keys(artistTracks).forEach(artistName => {
        const option = document.createElement('option');
        option.value = artistName.toLowerCase();
        option.textContent = artistName;
        artistSelector.appendChild(option);
    });

    // Обработчик выбора артиста
    artistSelector.addEventListener('change', function() {
        const selectedArtist = this.value;
        const artistData = artistTracks[selectedArtist.toUpperCase()];
        const display = document.querySelector('.vhs-display');

        if (!display) return;

        // Очищаем текущий контент
        display.innerHTML = '';

        if (artistData && artistData.tracks.length > 0) {
            const track = artistData.tracks[0]; // Берем первый трек
            
            // Создаем виджет Яндекс.Музыки
            const widget = document.createElement('iframe');
            widget.src = `https://music.yandex.ru/iframe/#artist/${track.yandexMusicId}/tracks`;
            widget.frameBorder = '0';
            widget.width = '100%';
            widget.height = '450';
            widget.allow = 'autoplay';
            widget.className = 'yandex-music-widget';
            
            display.appendChild(widget);
        } else {
            display.innerHTML = `
                <div class="track-info">
                    <div class="message">РЕЛИЗЫ НЕДОСТУПНЫ</div>
                </div>
            `;
        }
    });
}

// Вспомогательная функция для работы с API Яндекс.Музыки
const YandexMusic = {
    player: null,

    init() {
        return new Promise((resolve, reject) => {
            try {
                Ya.Music.ready(() => {
                    this.player = new Ya.Music.Player({
                        "type": "player",
                        "preload": true,
                        "autoplay": false,
                        "controls": true
                    });
                    resolve();
                });
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

const artistSelector = document.getElementById('artist-selector');
const trackDisplay = document.getElementById('track-display');
const playBtn = document.getElementById('play-btn');
const stopBtn = document.getElementById('stop-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const vhsIndicators = document.querySelector('.vhs-indicators');
const playIndicator = document.querySelector('.indicator[data-type="play"] .indicator-light');

// Включаем индикатор питания при загрузке
vhsIndicators.classList.add('active');

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

// Добавляем функцию обновления статуса
function updateStatus(text) {
    statusText.textContent = text;
    const display = document.querySelector('.vhs-display');
    const statusElement = display.querySelector('.status-text');
    
    if (!statusElement) {
        const statusContainer = document.createElement('div');
        statusContainer.className = 'status-container';
        statusContainer.appendChild(statusText);
        display.appendChild(statusContainer);
    }
}

// Обновляем функцию playWebsiteTrack
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

    console.log('Состояние до:', {
        paused: audioPlayer.paused,
        src: audioPlayer.src,
        isPlaying,
        currentTime: audioPlayer.currentTime
    });
    
    if (audioPlayer.paused) {
        const track = playlist[currentTrackIndex];
        console.log('Текущий трек:', track);
        
        if (!track || !track.file) {
            console.error('Трек не найден или отсутствует файл');
            showError('Трек не найден');
            return;
        }
        
        // Очищаем предыдущие ресурсы
        cleanupAudioResources().then(() => {
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
                        throw new Error(`Ошибка загрузки файла: ${response.status}`);
                    }
                    return response.blob();
                })
                .then(blob => {
                    return new Promise((resolve, reject) => {
                        const handleLoadedMetadata = () => {
                            audioPlayer.removeEventListener('loadedmetadata', handleLoadedMetadata);
                            audioPlayer.removeEventListener('error', handleError);
                            const totalTimeEl = display.querySelector('.time-total');
                            if (totalTimeEl) {
                                totalTimeEl.textContent = formatTime(audioPlayer.duration);
                            }
                            resolve();
                        };
                        
                        const handleError = (error) => {
                            audioPlayer.removeEventListener('loadedmetadata', handleLoadedMetadata);
                            audioPlayer.removeEventListener('error', handleError);
                            reject(error);
                        };
                        
                        audioPlayer.addEventListener('loadedmetadata', handleLoadedMetadata);
                        audioPlayer.addEventListener('error', handleError);
                        
                        currentBlobUrl = URL.createObjectURL(blob);
                        audioPlayer.src = currentBlobUrl;
                    });
                })
                .then(() => audioPlayer.play())
                .then(() => {
                    playBtn.textContent = '❚❚';
                    statusText.textContent = 'PLAYING';
                    updatePlayIndicator(true);
                    isPlaying = true;
                })
                .catch(error => {
                    console.error('Ошибка:', error);
                    showError(error.message || 'Ошибка воспроизведения');
                    playBtn.textContent = '►';
                    statusText.textContent = 'ERROR';
                    updatePlayIndicator(false);
                    isPlaying = false;
                    cleanupAudioResources();
                });
        });
    } else {
        console.log('Ставим на паузу');
        audioPlayer.pause();
        console.log('Состояние после паузы:', {
            paused: audioPlayer.paused,
            src: audioPlayer.src,
            isPlaying,
            currentTime: audioPlayer.currentTime
        });
        playBtn.textContent = '►';
        statusText.textContent = 'PAUSED';
        updatePlayIndicator(false);
        isPlaying = false;
    }
}

// Обновляем функцию stopTrack
function stopTrack() {
    if (!isWebsitePlayback) return;
    
    cleanupAudioResources().then(() => {
        playBtn.textContent = '►';
        statusText.textContent = 'STOPPED';
        updatePlayIndicator(false);
        isPlaying = false;
        trackDisplay.style.animation = 'none';
    });
}

// Обработчик для кнопки play
playBtn.addEventListener('click', () => {
    if (!isWebsitePlayback) return;
    playWebsiteTrack();
});

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
    
    // Останавливаем текущее воспроизведение
    audioPlayer.pause();
    
    // Очищаем ресурсы
    if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
    }
    
    currentTrackIndex = (currentTrackIndex + 1) % playlist.length;
    const track = playlist[currentTrackIndex];
    
    // Обновляем отображение
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
    
    // Добавляем эффект глитча
    display.style.animation = 'glitch 0.2s';
    setTimeout(() => {
        display.style.animation = 'none';
    }, 200);
    
    // Проверяем доступность файла
    fetch(track.file)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.blob();
        })
        .then(blob => {
            currentBlobUrl = URL.createObjectURL(blob);
            audioPlayer.src = currentBlobUrl;
            
            // Ждем загрузки метаданных
            return new Promise((resolve, reject) => {
                const handleLoadedMetadata = () => {
                    audioPlayer.removeEventListener('loadedmetadata', handleLoadedMetadata);
                    const totalTimeEl = display.querySelector('.time-total');
                    if (totalTimeEl) {
                        totalTimeEl.textContent = formatTime(audioPlayer.duration);
                    }
                    resolve();
                };
                
                audioPlayer.addEventListener('loadedmetadata', handleLoadedMetadata);
                audioPlayer.addEventListener('error', () => {
                    reject(new Error('Ошибка загрузки аудио'));
                });
            });
        })
        .then(() => audioPlayer.play())
        .then(() => {
            playBtn.textContent = '❚❚';
            statusText.textContent = 'PLAYING';
            updatePlayIndicator(true);
            isPlaying = true;
        })
        .catch(error => {
            console.error('Ошибка воспроизведения следующего трека:', error);
            statusText.textContent = 'ERROR';
            showError(error.message || 'Ошибка воспроизведения');
            
            // Очищаем ресурсы при ошибке
            if (currentBlobUrl) {
                URL.revokeObjectURL(currentBlobUrl);
                currentBlobUrl = null;
            }
        });
}

function prevTrack() {
    if (!isWebsitePlayback) return;
    
    // Останавливаем текущее воспроизведение
    audioPlayer.pause();
    
    // Очищаем ресурсы
    if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
    }
    
    currentTrackIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length;
    const track = playlist[currentTrackIndex];
    
    // Обновляем отображение
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
    
    // Добавляем эффект глитча
    display.style.animation = 'glitch 0.2s';
    setTimeout(() => {
        display.style.animation = 'none';
    }, 200);
    
    // Проверяем доступность файла
    fetch(track.file)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.blob();
        })
        .then(blob => {
            currentBlobUrl = URL.createObjectURL(blob);
            audioPlayer.src = currentBlobUrl;
            
            // Ждем загрузки метаданных
            return new Promise((resolve, reject) => {
                const handleLoadedMetadata = () => {
                    audioPlayer.removeEventListener('loadedmetadata', handleLoadedMetadata);
                    const totalTimeEl = display.querySelector('.time-total');
                    if (totalTimeEl) {
                        totalTimeEl.textContent = formatTime(audioPlayer.duration);
                    }
                    resolve();
                };
                
                audioPlayer.addEventListener('loadedmetadata', handleLoadedMetadata);
                audioPlayer.addEventListener('error', () => {
                    reject(new Error('Ошибка загрузки аудио'));
                });
            });
        })
        .then(() => audioPlayer.play())
        .then(() => {
            playBtn.textContent = '❚❚';
            statusText.textContent = 'PLAYING';
            updatePlayIndicator(true);
            isPlaying = true;
        })
        .catch(error => {
            console.error('Ошибка воспроизведения предыдущего трека:', error);
            statusText.textContent = 'ERROR';
            showError(error.message || 'Ошибка воспроизведения');
            
            // Очищаем ресурсы при ошибке
            if (currentBlobUrl) {
                URL.revokeObjectURL(currentBlobUrl);
                currentBlobUrl = null;
            }
        });
}

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

// Создание виджета Яндекс.Музыки
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

document.addEventListener('DOMContentLoaded', function() {
    // Обработчик ошибок аудиоплеера
    audioPlayer.addEventListener('error', (e) => {
        if (e.target.error && e.target.error.code === 4) {
            // Игнорируем ошибку пустого src при инициализации
            if (!isWebsitePlayback) return;
        }
        // Проверяем, действительно ли это ошибка
        if (audioPlayer.src && !audioPlayer.paused) {
            console.error('Ошибка аудиоплеера:', e.target.error);
            showError(e.target.error.message || 'Ошибка воспроизведения');
        }
    });

    const artistSelector = document.getElementById('artist-selector');
    const trackDisplay = document.getElementById('track-display');
    const playBtn = document.getElementById('play-btn');
    const stopBtn = document.getElementById('stop-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const vhsIndicators = document.querySelector('.vhs-indicators');
    const playIndicator = document.querySelector('.indicator[data-type="play"] .indicator-light');
    
    // Обработчик изменения выбранного артиста
    artistSelector.addEventListener('change', function() {
        const selectedArtist = this.value;
        const artistId = artistIds[selectedArtist];
        const display = document.querySelector('.vhs-display');
        
        // Останавливаем текущее воспроизведение
        if (audioPlayer.src) {
            audioPlayer.pause();
            audioPlayer.src = '';
            audioPlayer.currentTime = 0;
            updatePlayIndicator(false);
            isPlaying = false;
            playBtn.textContent = '►';
        }
        
        // Удаляем существующий виджет, если он есть
        const existingWidget = display.querySelector('.yandex-music-widget');
        if (existingWidget) {
            existingWidget.remove();
        }
        
        // Отключаем кнопки управления для всех режимов кроме 'website'
        [playBtn, stopBtn, prevBtn, nextBtn].forEach(btn => {
            if (selectedArtist !== 'website') {
                btn.disabled = true;
                btn.classList.add('disabled');
            } else {
                btn.disabled = false;
                btn.classList.remove('disabled');
            }
        });

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
            
            // Устанавливаем режим воспроизведения
            isWebsitePlayback = true;
            if (!window.playlistInitialized) {
                shufflePlaylist();
                window.playlistInitialized = true;
            }
        } else if (artistId) {
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
    
    // Включаем индикатор питания при загрузке
    vhsIndicators.querySelector('.indicator:nth-child(1) .indicator-light').classList.add('active');
    
    // Обработчики для кнопок next и prev
    nextBtn.addEventListener('click', nextTrack);
    prevBtn.addEventListener('click', prevTrack);

    // Обработчик для кнопки stop
    stopBtn.addEventListener('click', () => {
        if (!isWebsitePlayback) return;
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
        updatePlayIndicator(false);
        isPlaying = false;
        playBtn.textContent = '►';
    });

    // Автоматическое переключение на следующий трек
    audioPlayer.addEventListener('ended', () => {
        if (!isWebsitePlayback) return;
        nextTrack();
    });

    // Сброс анимации при паузе
    audioPlayer.addEventListener('pause', () => {
        const display = document.querySelector('.vhs-display');
        if (display) {
            display.style.animation = 'none';
        }
    });
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
            updatePlayIndicator(true);
            
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
    updatePlayIndicator(false);
    playBtn.textContent = '►';
    statusText.textContent = 'STOPPED';
    trackDisplay.style.animation = 'none';
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

function playTrack() {
    if (!isWebsitePlayback) return;
    
    isPlaying = true;
    vhsIndicators.classList.add('active');
    statusText.textContent = 'PLAYING';
    trackDisplay.style.animation = 'glitch 0.2s infinite';
}

function stopTrack() {
    if (!isWebsitePlayback) return;
    
    isPlaying = false;
    vhsIndicators.classList.remove('active');
    statusText.textContent = 'STOPPED';
    trackDisplay.style.animation = 'none';
}

function updatePlayerControls() {
    const selectedValue = artistSelector.value;
    const isDisabled = !selectedValue || selectedValue === '';
    
    playBtn.classList.toggle('disabled', isDisabled);
    stopBtn.classList.toggle('disabled', isDisabled);
    prevBtn.classList.toggle('disabled', isDisabled);
    nextBtn.classList.toggle('disabled', isDisabled);
    
    playBtn.disabled = isDisabled;
    stopBtn.disabled = isDisabled;
    prevBtn.disabled = isDisabled;
    nextBtn.disabled = isDisabled;
}

artistSelector.addEventListener('change', () => {
    updatePlayerControls();
    // ... existing code ...
});

// Вызываем при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    updatePlayerControls();
    // ... existing code ...
});

function updatePlayIndicator(isPlaying) {
    playIndicator.classList.toggle('active', isPlaying);
}

audioPlayer.addEventListener('play', () => {
    updatePlayIndicator(true);
});

audioPlayer.addEventListener('pause', () => {
    updatePlayIndicator(false);
});

audioPlayer.addEventListener('ended', () => {
    updatePlayIndicator(false);
});

// Обновляем индикатор при остановке
function stopTrack() {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    updatePlayIndicator(false);
    // ... existing code ...
}

// Обновляем индикатор при воспроизведении
function togglePlay() {
    if (audioPlayer.paused) {
        audioPlayer.play();
        updatePlayIndicator(true);
    } else {
        audioPlayer.pause();
        updatePlayIndicator(false);
    }
}

function showError(message) {
    const display = document.querySelector('.vhs-display');
    display.innerHTML = `
        <div class="track-info">
            <div class="error-message">ОШИБКА ВОСПРОИЗВЕДЕНИЯ</div>
            <div class="error-details">${message}</div>
        </div>
    `;
    
    // Добавляем эффект глитча при ошибке
    display.style.animation = 'glitch 0.2s';
    setTimeout(() => {
        display.style.animation = 'none';
    }, 200);
}

// Добавляем очистку ресурсов при выгрузке страницы
window.addEventListener('beforeunload', cleanupAudioResources);