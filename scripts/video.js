// Данные о видео (в реальном приложении это будет приходить с сервера)
const videos = [
    {
        title: "ВИДЕО 1",
        thumbnail: "assets/images/video1.jpg",
        url: "https://cdn.jsdelivr.net/gh/IlyaKurylyov/AWGEINMISE@main/assets/videos/video1.mp4",
        date: "2024",
        type: "Официальный клип"
    }
    // Добавьте больше видео здесь
];

// Элементы управления
const modal = document.querySelector('.video-modal');
const videoPlayer = modal.querySelector('video');
const closeBtn = modal.querySelector('.close-modal');
const videoItems = document.querySelectorAll('.video-item');

console.log('Элементы управления:', {
    modal: modal,
    videoPlayer: videoPlayer,
    closeBtn: closeBtn,
    videoItems: videoItems
});

// Открытие модального окна с видео
async function openVideoModal(videoUrl) {
    console.log('Открытие видео:', videoUrl);
    try {
        videoPlayer.src = videoUrl;
        modal.style.display = 'flex';
        modal.classList.add('active');
        const playPromise = videoPlayer.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.error('Ошибка воспроизведения:', error);
            });
        }
    } catch (error) {
        console.error('Ошибка при открытии видео:', error);
    }
}

// Закрытие модального окна
function closeVideoModal() {
    console.log('Закрытие видео');
    videoPlayer.pause();
    videoPlayer.src = '';
    modal.style.display = 'none';
    modal.classList.remove('active');
}

// Обработчики событий
videoItems.forEach((item, index) => {
    item.addEventListener('click', () => {
        console.log('Клик по видео:', index);
        openVideoModal(videos[index].url);
    });
});

closeBtn.addEventListener('click', closeVideoModal);

// Закрытие по клику вне видео
modal.addEventListener('click', (e) => {
    if (e.target === modal) {
        closeVideoModal();
    }
});

// Закрытие по Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
        closeVideoModal();
    }
});

// Обработка ошибок видео
videoPlayer.addEventListener('error', (e) => {
    console.error('Ошибка видео:', videoPlayer.error);
});

// Отслеживание состояния видео
videoPlayer.addEventListener('loadstart', () => console.log('Начало загрузки видео'));
videoPlayer.addEventListener('loadeddata', () => console.log('Видео загружено'));
videoPlayer.addEventListener('playing', () => console.log('Видео воспроизводится'));
videoPlayer.addEventListener('pause', () => console.log('Видео на паузе')); 