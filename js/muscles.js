// Rozdělení svalových partií pro filtry katalogu (2 úrovně).
//
// Skupina (základní filtr) najde vše, co partii zapojuje, i vedlejšně.
// Podrobný sval (izolovaný filtr) najde jen cviky, které ho cíleně zatěžují
// (je mezi hlavními svaly cviku).
//
// Cvik: muscles = { primary: [klíče podrobných svalů], secondary: [klíče] }

export const MUSCLE_GROUPS = [
  { key: 'chest', cs: 'Prsa', en: 'Chest', parts: [
    { key: 'chest-upper', cs: 'Horní prsa', en: 'Upper chest' },
    { key: 'chest-mid', cs: 'Střední prsa', en: 'Mid chest' },
    { key: 'chest-lower', cs: 'Dolní prsa', en: 'Lower chest' },
  ] },
  { key: 'back', cs: 'Záda', en: 'Back', parts: [
    { key: 'lats', cs: 'Široký sval zádový', en: 'Lats' },
    { key: 'mid-back', cs: 'Střední záda', en: 'Middle back' },
    { key: 'traps', cs: 'Trapézy', en: 'Traps' },
    { key: 'lower-back', cs: 'Spodní záda', en: 'Lower back' },
  ] },
  { key: 'shoulders', cs: 'Ramena', en: 'Shoulders', parts: [
    { key: 'delt-front', cs: 'Přední ramena', en: 'Front delts' },
    { key: 'delt-side', cs: 'Střední ramena', en: 'Side delts' },
    { key: 'delt-rear', cs: 'Zadní ramena', en: 'Rear delts' },
    { key: 'rotator-cuff', cs: 'Rotátorová manžeta', en: 'Rotator cuff' },
  ] },
  { key: 'biceps', cs: 'Biceps', en: 'Biceps', parts: [
    { key: 'biceps-brachii', cs: 'Dvojhlavý sval pažní', en: 'Biceps brachii' },
    { key: 'brachialis', cs: 'Brachialis', en: 'Brachialis' },
    { key: 'brachioradialis', cs: 'Brachioradialis', en: 'Brachioradialis' },
  ] },
  { key: 'triceps', cs: 'Triceps', en: 'Triceps', parts: [
    { key: 'triceps-long', cs: 'Dlouhá hlava tricepsu', en: 'Triceps long head' },
    { key: 'triceps-lateral', cs: 'Boční a vnitřní hlava tricepsu', en: 'Triceps lateral & medial head' },
  ] },
  { key: 'forearms', cs: 'Předloktí', en: 'Forearms', parts: [
    { key: 'wrist-flexors', cs: 'Ohybače zápěstí', en: 'Wrist flexors' },
    { key: 'wrist-extensors', cs: 'Natahovače zápěstí', en: 'Wrist extensors' },
    { key: 'grip', cs: 'Úchop', en: 'Grip' },
  ] },
  { key: 'abs', cs: 'Břicho', en: 'Abs', parts: [
    { key: 'abs-rectus', cs: 'Přímý sval břišní', en: 'Rectus abdominis' },
    { key: 'obliques', cs: 'Šikmé svaly břišní', en: 'Obliques' },
    { key: 'core-deep', cs: 'Hluboký stabilizační systém', en: 'Deep core' },
  ] },
  { key: 'glutes', cs: 'Hýždě', en: 'Glutes', parts: [
    { key: 'glute-max', cs: 'Velký hýžďový sval', en: 'Gluteus maximus' },
    { key: 'glute-med', cs: 'Střední hýžďový sval', en: 'Gluteus medius' },
  ] },
  { key: 'thighs', cs: 'Stehna', en: 'Thighs', parts: [
    { key: 'quads', cs: 'Přední stehna', en: 'Quads' },
    { key: 'hamstrings', cs: 'Zadní stehna', en: 'Hamstrings' },
    { key: 'adductors', cs: 'Vnitřní stehna (adduktory)', en: 'Adductors' },
    { key: 'abductors', cs: 'Vnější stehna (abduktory)', en: 'Abductors' },
  ] },
  { key: 'calves', cs: 'Lýtka', en: 'Calves', parts: [
    { key: 'gastrocnemius', cs: 'Dvojhlavý sval lýtkový', en: 'Gastrocnemius' },
    { key: 'soleus', cs: 'Šikmý sval lýtkový', en: 'Soleus' },
  ] },
  { key: 'neck', cs: 'Krk', en: 'Neck', parts: [
    { key: 'neck-muscles', cs: 'Svaly krku', en: 'Neck muscles' },
  ] },
];

const PART_TO_GROUP = new Map();
const PART_INFO = new Map();
for (const g of MUSCLE_GROUPS) {
  for (const p of g.parts) {
    PART_TO_GROUP.set(p.key, g.key);
    PART_INFO.set(p.key, p);
  }
}

export const MUSCLE_PART_KEYS = [...PART_INFO.keys()];

export function groupOf(partKey) {
  return PART_TO_GROUP.get(partKey) ?? null;
}

export function partLabel(key, lang = 'cs') {
  return PART_INFO.get(key)?.[lang] ?? MUSCLE_GROUPS.find((g) => g.key === key)?.[lang] ?? key;
}

// Skupiny, které cvik zapojuje (hlavně i vedlejšně)
export function groupsOf(muscles) {
  const out = new Set();
  for (const k of [...(muscles?.primary ?? []), ...(muscles?.secondary ?? [])]) {
    const g = groupOf(k);
    if (g) out.add(g);
  }
  return out;
}

// Odpovídá cvik vybraným filtrům? Vybrané filtry se sčítají (stačí shoda s jedním).
// groups = vybrané základní skupiny, parts = vybrané podrobné svaly.
export function matchesFilters(muscles, groups, parts) {
  if (!groups.size && !parts.size) return true;
  const primary = muscles?.primary ?? [];
  if (primary.some((k) => parts.has(k))) return true;
  const g = groupsOf(muscles);
  for (const key of groups) if (g.has(key)) return true;
  return false;
}
