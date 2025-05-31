// Данные о треках (в реальном приложении это будет приходить с сервера)
const tracks = [
    {
        title: "ТРЕК 1",
        artist: "INMISE",
        cover: "assets/images/album1.jpg",
        audio: "assets/audio/track1.mp3"
    }
    // Добавьте больше треков здесь
];

let currentTrackIndex = 0;
let isPlaying = false;
const audio = new Audio();

// Элементы управления
const playPauseBtn = document.querySelector('.play-pause');
const prevBtn = document.querySelector('.prev-track');
const nextBtn = document.querySelector('.next-track');
const progressBar = document.querySelector('.progress');
const progressContainer = document.querySelector('.progress-bar');

// Обновление информации о треке
function updateTrackInfo() {
    const track = tracks[currentTrackIndex];
    document.querySelector('.track-info h4').textContent = track.title;
    document.querySelector('.track-info p').textContent = track.artist;
    document.querySelector('.current-track-image').src = track.cover;
    audio.src = track.audio;
}

// Управление воспроизведением
playPauseBtn.addEventListener('click', () => {
    if (isPlaying) {
        audio.pause();
        playPauseBtn.textContent = '▶';
    } else {
        audio.play();
        playPauseBtn.textContent = '⏸';
    }
    isPlaying = !isPlaying;
});

// Предыдущий трек
prevBtn.addEventListener('click', () => {
    currentTrackIndex = (currentTrackIndex - 1 + tracks.length) % tracks.length;
    updateTrackInfo();
    if (isPlaying) audio.play();
});

// Следующий трек
nextBtn.addEventListener('click', () => {
    currentTrackIndex = (currentTrackIndex + 1) % tracks.length;
    updateTrackInfo();
    if (isPlaying) audio.play();
});

// Обновление прогресс-бара
audio.addEventListener('timeupdate', () => {
    const progress = (audio.currentTime / audio.duration) * 100;
    progressBar.style.width = `${progress}%`;
});

// Перемотка по клику на прогресс-бар
progressContainer.addEventListener('click', (e) => {
    const clickPosition = e.offsetX / progressContainer.offsetWidth;
    audio.currentTime = clickPosition * audio.duration;
});

// Автопереключение на следующий трек
audio.addEventListener('ended', () => {
    currentTrackIndex = (currentTrackIndex + 1) % tracks.length;
    updateTrackInfo();
    audio.play();
});

// Инициализация первого трека
updateTrackInfo(); 