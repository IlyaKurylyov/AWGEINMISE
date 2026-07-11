# 🎨 CREATIVE PHASE: LIGHT BACK ARROW REDESIGN

**Дата:** 2025-07-01  
**Компонент:** Back Arrow (Lightweight)

---

🎨🎨🎨 **ENTERING CREATIVE PHASE – UI/UX**

## 1. Описание компонента
Лёгкая стрелка «назад» (Unicode ←) в шапке сайта.  Должна быть хорошо видна, соответствовать матричной эстетике (зелёный неон), но не создавать тяжёлых вычислений.

## 2. Требования & Ограничения
1. **Малый вес** – чистый CSS, без Canvas/JS-цикла.
2. **Читаемость** – символ должен быть чётко виден на любом фоне.
3. **Анимация** – медленное мигание (≈ 3 c) + редкий лёгкий «глитч».
4. **Доступность** – `prefers-reduced-motion` отключает анимации; focus-outline остаётся.
5. **Совместимость** – работает во всех современных браузерах.

## 3. Варианты дизайна

| # | Подход | Описание | Плюсы | Минусы |
|---|--------|----------|-------|--------|
| 1 | **Pure Blink** | Одно keyframes `opacity` (0.8→1) | Сверхпросто, нулевой overhead | Скучно, без «глитча» |
| 2 | **Blink + Glitch (CSS-steps)** | Два анимации: плавный blink + редкий steps() прыжок `transform: translate()` | Только CSS, добавляет Matrix-vibe | Немного сложнее, нужны keyframes |
| 3 | **Dual Shadow Flicker** | Создать ::after псевдоэлемент со сдвигом и цветом, случайно включать | Глубокий неоновый эффект | Shadow-двойник может размывать текст, сложнее оттенки |
| 4 | **JS Class Toggle** | JS таймер меняет класс, CSS содержит эффекты | Гибко, можно рандом | JS tick + таймер → лишний runtime |

## 4. Анализ
- **Перформанс:** Все CSS-подходы ≈0 cost. JS добавляет таймер → отрицательно.
- **Визуал:** Pure Blink слишком скромен. Dual Shadow Flicker даёт красивый эффект, но нужен лишний ::after.
- **Усложнение:** steps() glitch легко делается одной анимацией.

## 5. Рекомендуемый подход ⭐
**Вариант 2: Blink + Glitch (CSS-only)**

### Почему
- Целиком на CSS → нулевой JS overhead.
- Оптимально сочетает плавное мигание с краткими матричными «сбоями».
- Легко отключается через media-query.

## 6. Гайд по реализации
```css
/* Базовый стиль стрелки */
.nav-logo .back-arrow{
  font-family: "Courier New", monospace;
  font-size: 20px;
  color:#0f0;
  text-shadow:0 0 8px #0f0;
  animation:arrowBlink 3s ease-in-out infinite,
            arrowGlitch 8s steps(1,end) infinite;
}

@keyframes arrowBlink{
  0%,100%{opacity:0.8}
  50%{opacity:1}
}

/* Glitch даём один кадр сдвига */
@keyframes arrowGlitch{
  0%   {transform:none;filter:none}
  2%   {transform:translate(1px,-1px);filter:hue-rotate(20deg)}
  2.5% {transform:none;filter:none}
  100% {transform:none;filter:none}
}

/* Reduced motion */
@media(prefers-reduced-motion:reduce){
  .nav-logo .back-arrow{animation:none}
}
```

## 7. Verification Checklist
- [ ] FPS на странице «СОТРУДНИЧЕСТВО» ≥ 60.
- [ ] Lighthouse Perf Score не падает.
- [ ] Стрелка мигает каждые ~3 c, глитчит ~1 раз в 8 c.
- [ ] `prefers-reduced-motion` отключает анимации.
- [ ] Фокус-outline виден.

🎨🎨🎨 **EXITING CREATIVE PHASE** 