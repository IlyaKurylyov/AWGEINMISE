const beats = [
    {
        title: 'Vetreno (134 bpm, F♯m)',
        seller: '@DopeTheProduce',
        price: '2000₽',
        audio: '@DopeTheProduce - Vetreno (134 bpm, F♯m).mp3',
        link: '#'
    },
    {
        title: 'Mi Vida (128 bpm, Bbm)',
        seller: '@DopeTheProduce',
        price: '2000₽',
        audio: '@DopeTheProduce - Mi Vida (128 bpm, Bbm).mp3',
        link: '#'
    },
    {
        title: 'long night (115 bpm, G♯m)',
        seller: '@DopeTheProduce',
        price: '2000₽',
        audio: '@DopeTheProduce - long night (115 bpm, G♯m).mp3',
        link: '#'
    },
    {
        title: 'rBilly [115bpm, D♯m]',
        seller: '@DopeTheProduce',
        price: '2000₽',
        audio: '@DopeTheProduce - rBilly [115bpm, D♯m].mp3',
        link: '#'
    },
    {
        title: 'So sad (85bpm, Gm)',
        seller: '@DopeTheProduce',
        price: '2000₽',
        audio: '@DopeTheProduce - So sad (85bpm, Gm).mp3',
        link: '#'
    },
    {
        title: 'Olivera (141 Fmin)',
        seller: '@prod.shibvri',
        price: '2000₽',
        audio: '@prod.shibvri - Olivera (141 Fmin).mp3',
        link: '#'
    },
    {
        title: '142 Amin Out the head',
        seller: '@prod.shibvri',
        price: '2000₽',
        audio: '@prod.shibvri - 142 Amin Out the head.mp3',
        link: '#'
    },
    {
        title: 'Yokai_142_ Dmin',
        seller: '@prod.shibvri',
        price: '2000₽',
        audio: '@prod.shibvri - Yokai_142_ Dmin.mp3',
        link: '#'
    },
    {
        title: '2XL F 110',
        seller: '@prod.shibvri',
        price: '2000₽',
        audio: '@prod.shibvri- 2XL F 110.mp3',
        link: '#'
    }
];

function renderBeats(filter) {
    const grid = document.querySelector('.beats-grid');
    grid.innerHTML = '';
    beats.filter(b => filter === 'all' || b.seller === filter).forEach(beat => {
        let audioPath = 'assets/beats/' + beat.audio;
        grid.innerHTML += `
            <div class="beat-card">
                <div class="beat-title">${beat.title}</div>
                <div class="beat-seller">Продавец: ${beat.seller}</div>
                <div class="beat-price">${beat.price}</div>
                <audio class="beat-audio" controls controlslist="nodownload" src="${audioPath}"></audio>
                <a class="beat-buy" href="${beat.link}" target="_blank">Купить</a>
            </div>
        `;
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const filter = document.getElementById('seller-filter');
    renderBeats('all');
    filter.addEventListener('change', e => {
        renderBeats(e.target.value);
    });
}); 