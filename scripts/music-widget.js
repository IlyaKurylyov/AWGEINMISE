class MusicWidget {
    constructor() {
        this.widgetContainer = document.createElement('div');
        this.widgetContainer.className = 'music-widget-container';
        
        this.controls = document.createElement('div');
        this.controls.className = 'music-controls';
        
        this.setupWidget();
        this.setupControls();
    }

    setupWidget() {
        const iframe = document.createElement('iframe');
        iframe.src = 'https://music.yandex.ru/iframe/#artist/23224451';
        iframe.allow = 'autoplay';
        this.widgetContainer.appendChild(iframe);
        document.body.appendChild(this.widgetContainer);
    }

    setupControls() {
        const playButton = document.createElement('button');
        playButton.innerHTML = '▶️';
        playButton.onclick = () => this.togglePlay();

        const nextButton = document.createElement('button');
        nextButton.innerHTML = '⏭️';
        nextButton.onclick = () => this.nextTrack();

        const prevButton = document.createElement('button');
        prevButton.innerHTML = '⏮️';
        prevButton.onclick = () => this.prevTrack();

        this.controls.appendChild(prevButton);
        this.controls.appendChild(playButton);
        this.controls.appendChild(nextButton);
        document.body.appendChild(this.controls);
    }

    togglePlay() {
        const iframe = this.widgetContainer.querySelector('iframe');
        iframe.contentWindow.postMessage('togglePlay', '*');
    }

    nextTrack() {
        const iframe = this.widgetContainer.querySelector('iframe');
        iframe.contentWindow.postMessage('nextTrack', '*');
    }

    prevTrack() {
        const iframe = this.widgetContainer.querySelector('iframe');
        iframe.contentWindow.postMessage('prevTrack', '*');
    }
}

// Инициализация виджета при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    new MusicWidget();
}); 