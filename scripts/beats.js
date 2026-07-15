(function(){
// Если Supabase сконфигурирован и нет принудительного фолбэка — не рендерим статический список
const hasSupabaseConfig = typeof window !== 'undefined' && window.supabase && typeof window.SUPABASE_URL === 'string' && window.SUPABASE_URL && typeof window.SUPABASE_ANON_KEY === 'string' && window.SUPABASE_ANON_KEY;
if (hasSupabaseConfig && !window.BEATS_FORCE_STATIC) return; // динамический рендер возьмёт на себя

const beats = [
    {
        title: 'Vetreno (134 bpm, F♯m)',
        seller: '@DopeTheProduce',
        price: '2000₽',
        audio: '@DopeTheProducer - Vetreno (134 bpm, F♯m).mp3',
        link: '#'
    },
    {
        title: 'Mi Vida (128 bpm, Bbm)',
        seller: '@DopeTheProduce',
        price: '2000₽',
        audio: '@DopeTheProducer - Mi Vida (128 bpm, Bbm).mp3',
        link: '#'
    },
    {
        title: 'long night (115 bpm, G♯m)',
        seller: '@DopeTheProduce',
        price: '2000₽',
        audio: '@DopeTheProducer - long night (115 bpm, G♯m).mp3',
        link: '#'
    },
    {
        title: 'rBilly [115bpm, D♯m]',
        seller: '@DopeTheProduce',
        price: '2000₽',
        audio: '@DopeTheProducer - rBilly [115bpm, D♯m].mp3',
        link: '#'
    },
    {
        title: 'So sad (85bpm, Gm)',
        seller: '@DopeTheProduce',
        price: '2000₽',
        audio: '@DopeTheProducer - So sad (85bpm, Gm).mp3',
        link: '#'
    },
    {
        title: 'Olivera (141 Fmin)',
        seller: '@SHIBVRI',
        price: '2000₽',
        audio: '@SHIBVRI - Olivera (141 Fmin).mp3',
        link: '#'
    },
    {
        title: 'Out the head (142bpm Amin)',
        seller: '@SHIBVRI',
        price: '2000₽',
        audio: '@SHIBVRI - Out the head (142bpm Amin).mp3'
    },
    {
        title: 'Yokai (142bpm Dmin)',
        seller: '@SHIBVRI',
        price: '2000₽',
        audio: '@SHIBVRI -  Yokai (142bpm Dmin).mp3'
    },
    {
        title: '2XL (110bpm F)',
        seller: '@SHIBVRI',
        price: '2000₽',
        audio: '@SHIBVRI- 2XL (110bpm F).mp3'
    },
    {
        title: 'All Girls Are The Same (164bpm, B)',
        seller: '@Namusorill',
        price: '2000₽',
        audio: '@Namusorill - All Girls Are The Same (164bpm B).mp3'
    },
    {
        title: 'Armed And Dangerous (130bpm, Am)',
        seller: '@Namusorill',
        price: '2000₽',
        audio: '@Namusorill - Armed And Dangerous (130bpm AM).mp3'
    },
    {
        title: "I'll Be Fine (160bpm, Dm)",
        seller: '@Namusorill',
        price: '2000₽',
        audio: "@Namusorill - I'll Be Fine (160bpm DM).mp3"
    },
    {
        title: 'Lean Wit Me (164bpm, Am)',
        seller: '@Namusorill',
        price: '2000₽',
        audio: '@Namusorill - Lean Wit Me (164bpm AM).mp3'
    },
    {
        title: 'Lucid Dreams (169bpm, C#m)',
        seller: '@Namusorill',
        price: '2000₽',
        audio: '@Namusorill - Lucid Dreams (169bpm C♯m).mp3'
    },
    {
        title: 'Wasted (146bpm, G)',
        seller: '@Namusorill',
        price: '2000₽',
        audio: '@Namusorill - Wasted (146bpm G).mp3'
    }
];

const sellerLinks = {
    '@DopeTheProduce': 'https://band.link/uUu9g',
    '@SHIBVRI': 'https://t.me/prod_shibvri',
    '@Namusorill': 'https://t.me/namusorill'
};

function renderBeats(selectedSellers) {
    const grid = document.querySelector('.beats-grid');
    grid.innerHTML = '';
    
    // Если ни один продавец не выбран, показываем все биты
    const beatsToShow = selectedSellers.length === 0 
        ? beats 
        : beats.filter(b => selectedSellers.includes(b.seller));
    
    beatsToShow.forEach(beat => {
        let audioPath = 'assets/beats/' + beat.audio;
        grid.innerHTML += `
            <div class="beat-card">
                <div class="beat-info">
                    <div class="beat-title">${beat.title}</div>
                    <div class="beat-seller">Продавец: ${beat.seller}</div>
                    <div class="beat-price">${beat.price}</div>
                </div>
                <audio class="beat-audio" controls controlslist="nodownload" preload="none" src="${audioPath}"></audio>
                <a class="beat-buy" href="${sellerLinks[beat.seller] || '#'}" target="_blank">Купить</a>
            </div>
        `;
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const checkboxes = document.querySelectorAll('.filter-checkbox');
    
    function updateFilter() {
        const selectedSellers = Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);
        renderBeats(selectedSellers);
    }
    
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', updateFilter);
    });
    
    // Изначально показываем все биты
    renderBeats([]);
}); 
})();
