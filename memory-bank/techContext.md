# TECH CONTEXT: AWGEINMISE WEBSITE

## ТЕХНИЧЕСКИЙ СТЕК

### Frontend Technologies
- **HTML5:** Семантическая разметка, медиа элементы
- **CSS3:** Flexbox, Grid, анимации, медиа запросы
- **JavaScript ES6+:** Модули, классы, async/await, DOM API
- **Web APIs:** Audio API, Intersection Observer, Local Storage

### Development Tools
- **Node.js:** Среда выполнения для инструментов сборки
- **npm:** Управление зависимостями
- **PowerShell:** Скрипты автоматизации и развертывания

### Media Technologies
- **HTML5 Audio/Video:** Нативные медиа элементы
- **MP3 Audio:** Формат аудиофайлов
- **MP4 Video:** Формат видеофайлов
- **SVG:** Векторные иконки
- **JPEG:** Растровые изображения

## АРХИТЕКТУРНЫЕ РЕШЕНИЯ

### Client-Side Architecture
```javascript
// Модульная архитектура без фреймворков
const App = {
  // Инициализация приложения
  init() {
    this.setupNavigation();
    this.setupMediaPlayers();
    this.setupResponsiveHandlers();
  },
  
  // Модули для каждой функциональности
  modules: {
    musicPlayer: new MusicPlayer(),
    artistGallery: new ArtistGallery(),
    videoBackground: new VideoBackground()
  }
};
```

### Static Site Generation
- **No Build System:** Прямая работа с файлами
- **Manual Optimization:** Ручная минификация при необходимости
- **Static Hosting:** Размещение на статическом хостинге

### File Organization Strategy
```
scripts/
├── main.js           # Основная логика приложения
├── music.js          # Музыкальный плеер
├── music-widget.js   # Виджет плеера
├── beats.js          # Обработка битов
├── app.js            # Общие функции приложения
├── logoRain.js       # Анимация логотипов
└── video.js          # Управление видео
```

## PERFORMANCE CONSIDERATIONS

### Resource Loading
```javascript
// Стратегия загрузки ресурсов
const ResourceLoader = {
  // Предварительная загрузка критичных ресурсов
  preloadCritical() {
    const criticalImages = [
      'assets/images/logo.svg',
      'assets/images/background.jpg'
    ];
    
    criticalImages.forEach(src => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = src;
      document.head.appendChild(link);
    });
  },
  
  // Ленивая загрузка медиа контента
  lazyLoadMedia() {
    const mediaElements = document.querySelectorAll('[data-lazy]');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const element = entry.target;
          element.src = element.dataset.lazy;
          observer.unobserve(element);
        }
      });
    });
    
    mediaElements.forEach(el => observer.observe(el));
  }
};
```

### Audio Optimization
```javascript
// Оптимизация аудио производительности
class AudioOptimizer {
  constructor() {
    this.audioCache = new Map();
    this.maxCacheSize = 10; // Максимум треков в кеше
  }
  
  // Кеширование аудио объектов
  getAudio(src) {
    if (this.audioCache.has(src)) {
      return this.audioCache.get(src);
    }
    
    const audio = new Audio(src);
    audio.preload = 'metadata';
    
    // Управление размером кеша
    if (this.audioCache.size >= this.maxCacheSize) {
      const firstKey = this.audioCache.keys().next().value;
      this.audioCache.delete(firstKey);
    }
    
    this.audioCache.set(src, audio);
    return audio;
  }
}
```

### Image Optimization
```css
/* Оптимизация изображений через CSS */
.optimized-image {
  /* Сжатие изображений */
  image-rendering: optimizeQuality;
  
  /* Responsive images */
  max-width: 100%;
  height: auto;
  
  /* Lazy loading через CSS */
  opacity: 0;
  transition: opacity 0.3s ease;
}

.optimized-image.loaded {
  opacity: 1;
}
```

## RESPONSIVE DESIGN IMPLEMENTATION

### Breakpoint System
```css
/* Система брейкпоинтов */
:root {
  --mobile-max: 767px;
  --tablet-min: 768px;
  --tablet-max: 1023px;
  --desktop-min: 1024px;
  --wide-min: 1400px;
}

/* Mobile First подход */
.container {
  width: 100%;
  padding: 1rem;
}

@media (min-width: 768px) {
  .container {
    padding: 2rem;
    max-width: 1200px;
    margin: 0 auto;
  }
}
```

### Touch and Mobile Optimization
```javascript
// Оптимизация для сенсорных устройств
const TouchOptimizer = {
  // Увеличенные области касания для мобильных
  setupTouchTargets() {
    const buttons = document.querySelectorAll('button, .clickable');
    buttons.forEach(button => {
      button.style.minHeight = '44px';
      button.style.minWidth = '44px';
    });
  },
  
  // Обработка свайпов для галереи
  setupSwipeGestures(element) {
    let startX, startY, distX, distY;
    
    element.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    });
    
    element.addEventListener('touchend', (e) => {
      distX = e.changedTouches[0].clientX - startX;
      distY = e.changedTouches[0].clientY - startY;
      
      if (Math.abs(distX) > Math.abs(distY) && Math.abs(distX) > 50) {
        if (distX > 0) {
          this.handleSwipeRight();
        } else {
          this.handleSwipeLeft();
        }
      }
    });
  }
};
```

## BROWSER COMPATIBILITY

### Supported Browsers
- **Chrome:** 70+
- **Firefox:** 65+
- **Safari:** 12+
- **Edge:** 79+
- **Mobile Safari:** 12+
- **Chrome Mobile:** 70+

### Polyfills and Fallbacks
```javascript
// Полифилы для старых браузеров
const PolyfillLoader = {
  // Проверка поддержки IntersectionObserver
  setupIntersectionObserver() {
    if (!window.IntersectionObserver) {
      // Fallback для старых браузеров
      const script = document.createElement('script');
      script.src = 'https://polyfill.io/v3/polyfill.min.js?features=IntersectionObserver';
      document.head.appendChild(script);
    }
  },
  
  // Fallback для CSS Grid
  setupGridFallback() {
    if (!CSS.supports('display', 'grid')) {
      document.body.classList.add('no-grid');
    }
  }
};
```

### Feature Detection
```javascript
// Определение возможностей браузера
const FeatureDetector = {
  hasAudioSupport: () => {
    const audio = document.createElement('audio');
    return !!(audio.canPlayType);
  },
  
  hasVideoSupport: () => {
    const video = document.createElement('video');
    return !!(video.canPlayType);
  },
  
  hasLocalStorageSupport: () => {
    try {
      localStorage.setItem('test', 'test');
      localStorage.removeItem('test');
      return true;
    } catch (e) {
      return false;
    }
  },
  
  isTouchDevice: () => {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }
};
```

## DEPLOYMENT INFRASTRUCTURE

### FTP Deployment
```powershell
# PowerShell скрипт для FTP развертывания
param(
    [string]$FtpServer = "ftp.awgeinmise.com",
    [string]$Username,
    [string]$Password,
    [string]$LocalPath = ".",
    [string]$RemotePath = "/public_html"
)

function Upload-FtpFile {
    param($LocalFile, $RemoteFile)
    
    $ftpRequest = [System.Net.FtpWebRequest]::Create("ftp://$FtpServer$RemoteFile")
    $ftpRequest.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile
    $ftpRequest.Credentials = New-Object System.Net.NetworkCredential($Username, $Password)
    
    $fileContent = [System.IO.File]::ReadAllBytes($LocalFile)
    $ftpRequest.ContentLength = $fileContent.Length
    
    $requestStream = $ftpRequest.GetRequestStream()
    $requestStream.Write($fileContent, 0, $fileContent.Length)
    $requestStream.Close()
}
```

### Build Optimization
```json
{
  "scripts": {
    "optimize-images": "imagemin assets/images/*.jpg --out-dir=dist/images --plugin=imagemin-mozjpeg",
    "minify-css": "cleancss -o dist/styles/main.min.css styles/*.css",
    "minify-js": "terser scripts/*.js -o dist/scripts/main.min.js",
    "build": "npm run optimize-images && npm run minify-css && npm run minify-js",
    "deploy": "npm run build && powershell ./upload.ps1"
  }
}
```

## SECURITY MEASURES

### Content Security Policy
```html
<!-- Базовые CSP настройки -->
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; 
               script-src 'self' 'unsafe-inline'; 
               style-src 'self' 'unsafe-inline'; 
               media-src 'self' data: blob:; 
               img-src 'self' data: https:;">
```

### Input Validation
```javascript
// Валидация пользовательского ввода
const InputValidator = {
  sanitizeHtml: (input) => {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
  },
  
  validateUrl: (url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },
  
  sanitizeFilename: (filename) => {
    return filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  }
};
```

## MONITORING AND ANALYTICS

### Error Tracking
```javascript
// Простое отслеживание ошибок
class ErrorTracker {
  constructor() {
    this.setupGlobalErrorHandler();
    this.setupUnhandledRejectionHandler();
  }
  
  setupGlobalErrorHandler() {
    window.addEventListener('error', (event) => {
      this.logError({
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error?.stack
      });
    });
  }
  
  setupUnhandledRejectionHandler() {
    window.addEventListener('unhandledrejection', (event) => {
      this.logError({
        message: 'Unhandled Promise Rejection',
        reason: event.reason
      });
    });
  }
  
  logError(errorInfo) {
    console.error('Application Error:', errorInfo);
    
    // Отправка на сервер аналитики (если настроен)
    if (window.analyticsEndpoint) {
      fetch(window.analyticsEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'error',
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          url: window.location.href,
          error: errorInfo
        })
      }).catch(() => {
        // Тихий фэйл для аналитики
      });
    }
  }
}
```

### Performance Monitoring
```javascript
// Мониторинг производительности
const PerformanceMonitor = {
  // Измерение времени загрузки страницы
  measurePageLoad() {
    window.addEventListener('load', () => {
      const navigation = performance.getEntriesByType('navigation')[0];
      const loadTime = navigation.loadEventEnd - navigation.fetchStart;
      
      this.trackMetric('page_load_time', loadTime);
    });
  },
  
  // Измерение времени первого рендера
  measureFirstPaint() {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          this.trackMetric('first_contentful_paint', entry.startTime);
        }
      }
    });
    
    observer.observe({ entryTypes: ['paint'] });
  },
  
  trackMetric(name, value) {
    console.log(`Performance Metric - ${name}: ${value}ms`);
    
    // Отправка метрик на сервер аналитики
    if (window.analyticsEndpoint) {
      fetch(window.analyticsEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'performance',
          metric: name,
          value: value,
          timestamp: new Date().toISOString()
        })
      }).catch(() => {
        // Тихий фэйл для аналитики
      });
    }
  }
};
```

## DEVELOPMENT WORKFLOW

### Local Development Setup
```bash
# Установка зависимостей
npm install

# Запуск локального сервера для разработки
npx http-server . -p 3000 -c-1

# Оптимизация изображений
npm run optimize-images

# Минификация CSS/JS
npm run build
```

### Git Workflow
```bash
# Создание feature branch
git checkout -b feature/new-music-player

# Коммит изменений
git add .
git commit -m "feat: add new music player with playlist support"

# Merge в main
git checkout main
git merge feature/new-music-player

# Развертывание на продакшн
npm run deploy
```

### Code Quality Standards
```javascript
// ESLint конфигурация для качества кода
const codeStandards = {
  // Использование const/let вместо var
  variableDeclaration: 'const/let',
  
  // Точки с запятой обязательны
  semicolons: 'required',
  
  // Одинарные кавычки для строк
  quotes: 'single',
  
  // Максимальная длина строки
  maxLineLength: 100,
  
  // Именование в camelCase
  namingConvention: 'camelCase'
};
``` 