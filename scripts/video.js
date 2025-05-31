// Данные о видео (в реальном приложении это будет приходить с сервера)
const videos = [
    {
        title: "ВИДЕО 1",
        thumbnail: "assets/images/video1.jpg",
        url: "assets/videos/video1.mp4",
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

// Открытие модального окна с видео
function openVideoModal(videoUrl) {
    videoPlayer.src = videoUrl;
    modal.classList.add('active');
    videoPlayer.play();
}

// Закрытие модального окна
function closeVideoModal() {
    videoPlayer.pause();
    videoPlayer.src = '';
    modal.classList.remove('active');
}

// Обработчики событий
videoItems.forEach((item, index) => {
    item.addEventListener('click', () => {
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