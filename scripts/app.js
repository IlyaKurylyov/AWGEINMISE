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

    shuffleArtistCards(); // Вызываем функцию перемешивания
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