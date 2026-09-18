-- Артист пишет текст под бит и хочет видеть номер такта. Такт считается
-- от темпа, а темпа у бита в базе не было. Колонка необязательная: старые
-- биты остаются без BPM, кабинет тогда показывает только время.

alter table public.beats
  add column if not exists bpm smallint
  check (bpm is null or (bpm >= 40 and bpm <= 300));

comment on column public.beats.bpm is 'Темп бита, ударов в минуту. Нужен для счётчика тактов в кабинете.';
