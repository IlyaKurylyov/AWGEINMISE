# Если сборка dist/ не помогла

## Вариант 1: Прямой деплой исходников

1. Загрузи на хост БЕЗ сборки:
```
www/
├── music.html (исходный, НЕ из dist/)
├── styles/
│   ├── main.css
│   ├── music.css (с импортами @import)
│   ├── responsive.css
│   └── desktop-protection.css
├── scripts/ (все JS)
└── assets/ (медиа)
```

2. В music.html убедись что подключены все CSS:
```html
<link rel="stylesheet" href="styles/main.css">
<link rel="stylesheet" href="styles/music.css">
<link rel="stylesheet" href="styles/responsive.css">
<link rel="stylesheet" href="styles/desktop-protection.css">
```

## Вариант 2: Inline критичные стили

Добавь прямо в `<head>` music.html:

```html
<style>
.indicator span {
    font-family: 'VT323', monospace !important;
    font-size: 14px !important;
    color: #888 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.5px !important;
    white-space: nowrap !important;
    line-height: 18px !important;
    margin: 0 !important;
    padding: 0 !important;
    display: inline-block !important;
    flex-shrink: 0 !important;
    order: 2 !important;
    opacity: 1 !important;
    visibility: visible !important;
}

.vhs-indicators .indicator,
div.indicator,
.indicator {
    display: inline-flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 4px !important;
}
</style>
```

## Вариант 3: Отключить кэш на сервере

Добавь в .htaccess:
```
<Files "*.css">
    Header set Cache-Control "no-cache, must-revalidate"
</Files>
```

## Проверка на хосте через SSH

Если есть доступ по SSH:
```bash
cd /path/to/www
ls -lh assets/*.css  # Проверь размеры файлов
cat music.html | grep stylesheet  # Проверь какие CSS подключены
```

