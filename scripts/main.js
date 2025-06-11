// Дожидаемся загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing sparks...');

    // Функция для создания искр
    function createSparks(button) {
        console.log('Creating sparks...');

        // Создаем несколько искр
        const sparkCount = Math.floor(Math.random() * 4) + 8; // 8-12 искр
        for (let i = 0; i < sparkCount; i++) {
            const spark = document.createElement('div');
            
            // Случайный тип искры
            const sparkType = Math.floor(Math.random() * 5) + 1;
            spark.className = `spark spark-${sparkType}`;
            
            // Случайное смещение от центра
            const randomOffset = (Math.random() - 0.5) * 20;
            spark.style.left = `calc(50% + ${randomOffset}px)`;
            
            // Случайные вариации размера и скорости
            const scaleVar = 0.8 + Math.random() * 0.4; // 0.8-1.2
            const speedVar = 0.8 + Math.random() * 0.4; // 0.8-1.2
            spark.style.setProperty('--scale-var', scaleVar);
            spark.style.setProperty('--speed-var', speedVar);
            
            // Добавляем небольшую задержку для каждой искры
            spark.style.animationDelay = `${Math.random() * 0.1}s`;
            
            button.appendChild(spark);
            console.log('Spark created');
            
            // Удаляем искру после анимации
            setTimeout(() => spark.remove(), 400);
        }
    }

    // Добавляем обработчики событий для кнопок
    const switches = document.querySelectorAll('.switch');
    console.log('Found switches:', switches.length);

    switches.forEach((button, index) => {
        if (index === 1) return; // Пропускаем среднюю кнопку

        let sparkInterval = null;
        let stopTimeout = null;

        button.addEventListener('mousedown', function() {
            console.log('Switch pressed:', index);
            // Очищаем предыдущий таймаут остановки, если он есть
            if (stopTimeout) {
                clearTimeout(stopTimeout);
                stopTimeout = null;
            }

            this.classList.add('pressed');
            createSparks(this);
            
            // Создаем искры при удержании
            sparkInterval = setInterval(() => {
                if (Math.random() < 0.7) { // 70% шанс создания искр
                    createSparks(this);
                }
            }, 100);
        });

        button.addEventListener('mouseup', function() {
            console.log('Switch released, continuing sparks for 1 second');
            
            // Продолжаем эффект еще секунду после отпускания
            stopTimeout = setTimeout(() => {
                console.log('Stopping sparks after delay');
                clearInterval(sparkInterval);
                this.classList.remove('pressed');
                sparkInterval = null;
            }, 1000);
        });

        // Очищаем интервалы при уходе мыши с кнопки
        button.addEventListener('mouseleave', function() {
            if (sparkInterval) {
                clearInterval(sparkInterval);
                sparkInterval = null;
            }
            if (stopTimeout) {
                clearTimeout(stopTimeout);
                stopTimeout = null;
            }
            this.classList.remove('pressed');
        });

        console.log('Added event listeners to switch:', index);
    });
}); 