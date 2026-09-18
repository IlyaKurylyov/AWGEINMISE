// Собирает словарь ударений для кабинета из базы openrussian.org
// (github.com/Badestrand/russian-dictionary, CC BY-SA 4.0).
//
//   node tools/build-stress-dict.js <папка с nouns.csv adjectives.csv verbs.csv others.csv> [--limit 20000,8000,8000]
//
// На выходе assets/stress/ru-stress.txt.gz: отсортированный список форм слов,
// одна строка — одна форма. Чтобы файл был маленьким, строка хранит не слово
// целиком, а сколько первых букв совпало с предыдущей строкой (одна цифра
// в 36-ричной записи), хвост и номера ударных гласных (тоже 36-ричные,
// несколько — у омографов вроде «де́ла / дела́»):
//   0дела01     → «дела», ударение на 1-й или 2-й гласной
//   3ть0        → «дел» + «ать» = «делать», ударение на 1-й
// ё в ключе заменена на е — в кабинете так же печатают.

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const [, , dir, ...rest] = process.argv;
if (!dir) { console.error('Укажите папку с CSV.'); process.exit(1); }
const limitArg = rest.indexOf('--limit') >= 0 ? rest[rest.indexOf('--limit') + 1].split(',').map(Number) : [];
const TABLES = [
  { file: 'others.csv', limit: limitArg[3] || Infinity },
  { file: 'nouns.csv', limit: limitArg[0] || Infinity },
  { file: 'adjectives.csv', limit: limitArg[1] || Infinity },
  { file: 'verbs.csv', limit: limitArg[2] || Infinity },
];
const SKIP_COLUMNS = new Set(['bare', 'translations_en', 'translations_de', 'gender', 'partner', 'animate', 'indeclinable', 'sg_only', 'pl_only', 'aspect']);
const VOWELS = /[аеёиоуыэюя]/;

const dict = new Map(); // слово (ё→е) → набор номеров ударной гласной
let seen = 0;

// Частые формы, которых в базе нет (у «быть» будущее время не заполнено,
// у местоимений и «один» часть форм отсутствует).
const SUPPLEMENT = "бу'ду бу'дешь бу'дет бу'дем бу'дете бу'дут него' неё них ему' ей им одна' одно' одни' одного' одному' одни'м одно'й одну' одни'х одни'ми".split(' ');

function add(form) {
  const entry = stressOf(form);
  if (!entry || entry.ordinal > 35) return;
  if (!dict.has(entry.word)) dict.set(entry.word, new Set());
  dict.get(entry.word).add(entry.ordinal);
}

function stressOf(form) {
  // Ударение — гласная перед последним апострофом. Без апострофа: ё всегда
  // ударная, у односложных слов выбора нет. Иначе — не знаем, пропускаем.
  const marks = [];
  let clean = '';
  for (const ch of form) {
    if (ch === "'") marks.push(clean.length - 1);
    else clean += ch;
  }
  let stressed = marks.length ? marks[marks.length - 1] : -1;
  if (stressed < 0) {
    const vowels = [...clean].map((ch, i) => (VOWELS.test(ch) ? i : -1)).filter((i) => i >= 0);
    if (clean.includes('ё')) stressed = clean.indexOf('ё');
    else if (vowels.length === 1) stressed = vowels[0];
    else return null;
  }
  if (!VOWELS.test(clean[stressed])) return null;
  let ordinal = 0;
  for (let i = 0; i < stressed; i += 1) if (VOWELS.test(clean[i])) ordinal += 1;
  return { word: clean.replace(/ё/g, 'е'), ordinal };
}

for (const { file, limit } of TABLES) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  const lines = text.split(/\r?\n/);
  const header = lines[0].split('\t');
  let rows = 0;
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    if (rows >= limit) break;
    rows += 1;
    const cells = line.split('\t');
    cells.forEach((cell, index) => {
      if (SKIP_COLUMNS.has(header[index]) || !cell) return;
      cell.split(/[,;\/]\s*/).forEach((variant) => {
        const form = variant.trim().toLowerCase();
        if (!/^[а-яё']+$/.test(form) || form.length < 2) return;
        seen += 1;
        add(form);
      });
    });
  }
  console.log(`${file}: строк ${rows}, форм в словаре пока ${dict.size}`);
}

SUPPLEMENT.forEach(add);
const words = [...dict.keys()].sort();
let prev = '';
const out = words.map((word) => {
  let shared = 0;
  while (shared < prev.length && shared < word.length && shared < 35 && prev[shared] === word[shared]) shared += 1;
  prev = word;
  return shared.toString(36) + word.slice(shared) + [...dict.get(word)].sort((a, b) => a - b).map((n) => n.toString(36)).join('');
}).join('\n');

const target = path.join(__dirname, '..', 'assets', 'stress');
fs.mkdirSync(target, { recursive: true });
const gz = zlib.gzipSync(Buffer.from(out, 'utf8'), { level: 9 });
fs.writeFileSync(path.join(target, 'ru-stress.txt.gz'), gz);
const homographs = words.filter((word) => dict.get(word).size > 1).length;
console.log(`форм просмотрено ${seen}, в словаре ${words.length} (с двумя ударениями ${homographs}), текст ${(out.length / 1024 / 1024).toFixed(2)} МБ, gz ${(gz.length / 1024).toFixed(0)} КБ`);
