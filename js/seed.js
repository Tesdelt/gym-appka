// Předvyplněná data: posilovna, cviky z encyklopedie a šablony tréninků.
// Vloží se jen jednou, při prvním spuštění (meta.seeded).

import { count, putAll, setMeta, getMeta } from './db.js';
import { BUILTIN_IMAGES } from './builtinImages.js';

export const DEFAULT_WEIGHT_STEP = 2.5;

// Cvik:
//   type:      'weight' = opakování s váhou, 'time' = výdrž (s), 'reps' = opakování bez váhy
//   bodyweight: u typu weight je váha přidaná k vlastní váze (0 = jen tělo, záporná = guma)
//   equipment: 'cable' (kladka, hodnoty zvlášť pro každou posilovnu), 'dumbbell', 'plate', 'body', 'barbell', 'machine', 'other'
//   perGym:    hodnoty, rekordy a krok váhy zvlášť pro každou posilovnu
//   weightStep: výchozí krok váhy; gymSteps: { [gymId]: krok } pro kladky
export const BUILTIN_EXERCISES = [
  {
    id: 'shyb',
    name: 'Shyb',
    aliases: ['shyby', 'pull-up', 'shyby se zátěží'],
    type: 'weight',
    bodyweight: true,
    equipment: 'body',
    perGym: false,
    weightStep: DEFAULT_WEIGHT_STEP,
    muscles: { primary: ['lats'], secondary: ['mid-back', 'biceps-brachii', 'brachialis', 'delt-rear', 'grip'] },
    instructions: 'Nadhmat o něco širší než ramena, začít z plného visu, stáhnout lopatky dolů a přitáhnout se bradou nad hrazdu, kontrolovaně spustit do plného visu.',
    tips: 'Nehoupat se a nekopat nohama, zátěž na opasku držet u těla, každé opakování začínat z plného visu.',
  },
  {
    id: 'kladka-biceps-curls',
    name: 'Kladka biceps curls',
    aliases: ['bicepsový zdvih na kladce', 'bicáky kladka'],
    type: 'weight',
    bodyweight: false,
    equipment: 'cable',
    perGym: true,
    weightStep: DEFAULT_WEIGHT_STEP,
    muscles: { primary: ['biceps-brachii'], secondary: ['brachialis', 'wrist-flexors'] },
    instructions: 'Stoj čelem ke spodní kladce, podhmat, lokty u těla, zdvih k ramenům, pomalé spuštění do natažených paží.',
    tips: 'Lokty se nesmí posouvat dopředu, nezaklánět se, nahoře krátce zpevnit.',
  },
  {
    id: 'kladka-pull-row',
    name: 'Kladka pull row',
    aliases: ['veslování na kladce', 'přítahy vsedě'],
    type: 'weight',
    bodyweight: false,
    equipment: 'cable',
    perGym: true,
    weightStep: DEFAULT_WEIGHT_STEP,
    muscles: { primary: ['mid-back', 'lats'], secondary: ['delt-rear', 'biceps-brachii', 'lower-back'] },
    instructions: 'Sed na spodní kladce, nohy opřené, záda rovně, přitáhnout rukojeť k břichu, stáhnout lopatky k sobě, kontrolovaně vrátit.',
    tips: 'Netahat zády ani švihem, ramena držet dole, pohyb začínat lopatkami.',
  },
  {
    id: 'dumbbell-brachialis-curls',
    name: 'Dumbell brachialis curls (slant hammer)',
    aliases: ['kladiva', 'kladivový zdvih', 'slant hammer'],
    type: 'weight',
    bodyweight: false,
    equipment: 'dumbbell',
    perGym: false,
    weightStep: DEFAULT_WEIGHT_STEP,
    muscles: { primary: ['brachialis', 'brachioradialis'], secondary: ['biceps-brachii'] },
    instructions: 'Jednoručky neutrálním úchopem, ruce mírně vytočené šikmo, lokty u těla, zdvih k ramenům, pomalé spuštění.',
    tips: 'Nehoupat trupem, zápěstí držet pevně v jedné rovině s předloktím, spouštět pomaleji než zvedat.',
  },
  {
    id: 'dip',
    name: 'Dip',
    aliases: ['bradla', 'dipy', 'kliky na bradlech'],
    type: 'weight',
    bodyweight: true,
    equipment: 'body',
    perGym: false,
    weightStep: DEFAULT_WEIGHT_STEP,
    muscles: { primary: ['chest-lower', 'triceps-lateral'], secondary: ['delt-front', 'chest-mid'] },
    instructions: 'Vzpor na bradlech, ramena dole, spustit se do mírného předklonu, dokud nadloktí není zhruba vodorovně, vytlačit zpět do vzporu.',
    tips: 'Nepropadat se v ramenou, nechodit hlouběji, než ramena snesou, zátěž na opasku nesmí houpat.',
  },
  {
    id: 'shoulder-press-dumbbell',
    name: 'Shoulder press dumbell',
    aliases: ['tlaky na ramena', 'military s jednoručkami'],
    type: 'weight',
    bodyweight: false,
    equipment: 'dumbbell',
    perGym: false,
    weightStep: DEFAULT_WEIGHT_STEP,
    muscles: { primary: ['delt-front', 'delt-side'], secondary: ['triceps-lateral', 'traps'] },
    instructions: 'Sed s oporou zad, jednoručky u ramen, vytlačit nad hlavu, kontrolovaně spustit k ramenům.',
    tips: 'Neprohýbat se v bedrech, lokty mírně před tělem, nahoře nezamykat lokty prudce.',
  },
  {
    id: 'shoulder-lateral-raise',
    name: 'Shoulder lateral raise',
    aliases: ['upažování', 'lateral raise', 'drop set ramena'],
    type: 'weight',
    bodyweight: false,
    equipment: 'dumbbell',
    perGym: false,
    weightStep: DEFAULT_WEIGHT_STEP,
    muscles: { primary: ['delt-side'], secondary: ['traps'] },
    instructions: 'Stoj, jednoručky podél těla, upažit do výše ramen s mírně pokrčenými lokty, pomalu spustit.',
    tips: 'Vést pohyb lokty, ne rukama, nekrčit ramena k uším, u drop setu měnit váhu co nejrychleji.',
  },
  {
    id: 'overhead-around-wheel-lift',
    name: 'Overhead + around wheel lift',
    aliases: ['kotouč nad hlavu', 'around the world'],
    type: 'weight',
    bodyweight: false,
    equipment: 'plate',
    perGym: false,
    weightStep: DEFAULT_WEIGHT_STEP,
    muscles: { primary: ['delt-front', 'delt-side'], secondary: ['core-deep', 'obliques', 'traps'] },
    instructions: '10× zvednout kotouč nad hlavu. Poté ze spodní pozice na jedné straně přenést kotouč obloukem přes hlavu na druhou stranu dolů, totéž opačným směrem.',
    tips: 'Zpevněný střed těla, neprohýbat se v bedrech, pohyb plynulý a kontrolovaný.',
  },
  {
    id: 'kladka-triceps-extension',
    name: 'Kladka triceps extension/pulldown',
    aliases: ['stahování tricepsu', 'triceps kladka'],
    type: 'weight',
    bodyweight: false,
    equipment: 'cable',
    perGym: true,
    weightStep: DEFAULT_WEIGHT_STEP,
    muscles: { primary: ['triceps-lateral'], secondary: ['triceps-long'] },
    instructions: 'Stoj čelem k horní kladce, lokty u těla, propnout paže dolů, kontrolovaně vrátit do úhlu cca 90°.',
    tips: 'Lokty se nehýbou, nezapojovat ramena ani trup, dole krátce zpevnit.',
  },
];

// Pomocníci pro zápis šablon
const min = (m) => m * 60;
const sets = (n, weight, reps, rest) => Array.from({ length: n }, () => ({ weight, reps, rest }));

// Položka šablony:
//   mode 'sets':    sets: [{ weight, reps | seconds, rest }]
//   mode 'dropset': rounds, steps: [{ weight, reps }], rest (pauza mezi koly)
//   repRange: { min, max } nebo null = výchozí (opakování ze šablony až +2)
//   weightStep: null = krok podle cviku
export const BUILTIN_TEMPLATES = [
  {
    id: 'hrazda',
    name: 'Hrazda',
    subtitle: 'záda, biceps',
    order: 1,
    exercises: [
      { exerciseId: 'shyb', mode: 'sets', sets: sets(3, 15, 8, min(5)), repRange: null, weightStep: null },
      { exerciseId: 'kladka-biceps-curls', mode: 'sets', sets: sets(3, 9, 10, min(4)), repRange: null, weightStep: null },
      { exerciseId: 'kladka-pull-row', mode: 'sets', sets: sets(3, 43, 12, min(3)), repRange: null, weightStep: null },
      { exerciseId: 'dumbbell-brachialis-curls', mode: 'sets', sets: sets(3, 10, 10, min(4)), repRange: null, weightStep: null },
    ],
  },
  {
    id: 'bradla',
    name: 'Bradla',
    subtitle: 'ramena, triceps, prsa',
    order: 2,
    exercises: [
      { exerciseId: 'dip', mode: 'sets', sets: sets(3, 35, 10, min(5)), repRange: null, weightStep: null },
      { exerciseId: 'shoulder-press-dumbbell', mode: 'sets', sets: sets(3, 15, 8, min(4)), repRange: null, weightStep: null },
      {
        exerciseId: 'shoulder-lateral-raise',
        mode: 'dropset',
        rounds: 2,
        steps: [{ weight: 7.5, reps: 10 }, { weight: 5, reps: 10 }, { weight: 2.5, reps: 10 }],
        rest: min(3),
        repRange: null,
        weightStep: null,
      },
      { exerciseId: 'overhead-around-wheel-lift', mode: 'sets', sets: sets(2, 5, 10, min(4)), repRange: null, weightStep: null },
      { exerciseId: 'kladka-triceps-extension', mode: 'sets', sets: sets(3, 22.75, 10, min(3)), repRange: null, weightStep: null },
    ],
  },
  {
    id: 'core',
    name: 'Core',
    subtitle: 'střed těla',
    order: 3,
    exercises: [],
  },
];

// Anglické texty vestavěných cviků
export const BUILTIN_EN = {
  'shyb': {
    name: 'Pull-up',
    instructions: 'Overhand grip slightly wider than shoulders, start from a dead hang, pull the shoulder blades down and pull yourself up until your chin clears the bar, lower under control to a full hang.',
    tips: 'Do not swing or kick, keep the belt weight close to the body, start every rep from a full hang.',
  },
  'kladka-biceps-curls': {
    name: 'Cable biceps curl',
    instructions: 'Stand facing the low pulley, underhand grip, elbows at your sides, curl to the shoulders, lower slowly to straight arms.',
    tips: 'Do not let the elbows drift forward, do not lean back, squeeze briefly at the top.',
  },
  'kladka-pull-row': {
    name: 'Seated cable row',
    instructions: 'Sit at the low pulley with feet braced and a straight back, pull the handle to your stomach, squeeze the shoulder blades together, return under control.',
    tips: 'Do not pull with your back or momentum, keep the shoulders down, start the movement with the shoulder blades.',
  },
  'dumbbell-brachialis-curls': {
    name: 'Slant hammer curl',
    instructions: 'Dumbbells in a neutral grip, hands turned slightly at an angle, elbows at your sides, curl to the shoulders, lower slowly.',
    tips: 'Do not swing the torso, keep the wrists firm and in line with the forearms, lower slower than you lift.',
  },
  'dip': {
    name: 'Dip',
    instructions: 'Support yourself on the parallel bars with shoulders down, lower with a slight forward lean until the upper arms are roughly horizontal, press back up to support.',
    tips: 'Do not let the shoulders sag, do not go deeper than your shoulders tolerate, the belt weight must not swing.',
  },
  'shoulder-press-dumbbell': {
    name: 'Seated dumbbell shoulder press',
    instructions: 'Sit with back support, dumbbells at shoulder height, press overhead, lower under control back to the shoulders.',
    tips: 'Do not arch the lower back, keep the elbows slightly in front of the body, do not lock out the elbows hard at the top.',
  },
  'shoulder-lateral-raise': {
    name: 'Lateral raise',
    instructions: 'Stand with dumbbells at your sides, raise the arms out to shoulder height with slightly bent elbows, lower slowly.',
    tips: 'Lead with the elbows, not the hands, do not shrug the shoulders, change weights as fast as possible in a drop set.',
  },
  'overhead-around-wheel-lift': {
    name: 'Plate overhead + around the world',
    instructions: 'Lift the plate overhead 10 times. Then from the low position on one side carry the plate in an arc over your head down to the other side, and repeat in the opposite direction.',
    tips: 'Brace the core, do not arch the lower back, keep the movement smooth and controlled.',
  },
  'kladka-triceps-extension': {
    name: 'Cable triceps pushdown',
    instructions: 'Stand facing the high pulley, elbows at your sides, straighten the arms down, return under control to about 90 degrees.',
    tips: 'The elbows stay still, do not use the shoulders or torso, squeeze briefly at the bottom.',
  },
};

export const DEFAULT_GYM = { id: 'hlavni', name: 'Hlavní posilovna' };

// Cviky přidané z databáze dřív (s anglickým postupem) dostanou český postup
// a český název, pokud si ho uživatel nezměnil.
export async function translateDbExercises() {
  if (await getMeta('dbCzech')) return;
  const [{ loadDbCzech, loadDbIndex }, { getAll }, { saveExercise }] = await Promise.all([import('./images.js'), import('./db.js'), import('./data.js')]);
  const [cs, index] = await Promise.all([loadDbCzech(), loadDbIndex().catch(() => [])]);
  if (!Object.keys(cs).length) return; // soubor zatím nedostupný, zkusí se příště
  const looksEnglish = (t) => /\b(the|your|and|with|until|slowly)\b/i.test(t ?? '');
  for (const ex of await getAll('exercises')) {
    if (ex.source !== 'free-exercise-db' || !ex.dbId || !cs[ex.dbId]) continue;
    let changed = false;
    if (!ex.instructions || looksEnglish(ex.instructions)) { ex.instructions = cs[ex.dbId].join('\n'); changed = true; }
    const meta = index.find((e) => e.id === ex.dbId);
    if (meta?.nc && ex.name === meta.n) { ex.name = meta.nc; changed = true; }
    if (changed) await saveExercise(ex); // přejmenování se propíše i do historie
  }
  await setMeta('dbCzech', new Date().toISOString());
}

export async function seedIfEmpty() {
  if (await getMeta('seeded')) return false;
  const now = new Date().toISOString();
  if ((await count('gyms')) === 0) {
    await putAll('gyms', [{ ...DEFAULT_GYM, createdAt: now }]);
  }
  if ((await count('exercises')) === 0) {
    await putAll('exercises', BUILTIN_EXERCISES.map((e) => ({
      ...e, nameEn: BUILTIN_EN[e.id]?.name, instructionsEn: BUILTIN_EN[e.id]?.instructions, tipsEn: BUILTIN_EN[e.id]?.tips,
      images: BUILTIN_IMAGES[e.id] ?? [], photoId: null, gymSteps: {}, source: 'builtin', createdAt: now,
    })));
  }
  if ((await count('templates')) === 0) {
    await putAll('templates', BUILTIN_TEMPLATES.map((t) => ({ ...t, createdAt: now })));
  }
  await setMeta('seeded', now);
  await setMeta('exDataV2', now);
  await setMeta('lastGymId', DEFAULT_GYM.id);
  return true;
}

// Starší záznam partií (volný český text) → klíče z muscles.js
const TEXT_TO_KEY = {
  'široký sval zádový': 'lats', 'biceps': 'biceps-brachii', 'zadní ramena': 'delt-rear', 'předloktí': 'wrist-flexors',
  'střední část zad': 'mid-back', 'brachialis': 'brachialis', 'brachioradialis': 'brachioradialis', 'prsa': 'chest-mid',
  'triceps': 'triceps-lateral', 'přední ramena': 'delt-front', 'střední ramena': 'delt-side', 'ramena': 'delt-side',
  'střed těla': 'core-deep', 'břicho': 'abs-rectus', 'abduktory': 'abductors', 'adduktory': 'adductors', 'lýtka': 'gastrocnemius',
  'hýždě': 'glute-max', 'zadní stehna': 'hamstrings', 'spodní záda': 'lower-back', 'krk': 'neck-muscles',
  'přední stehna': 'quads', 'trapézy': 'traps',
};

// Jednorázové doplnění dat cviků pro katalog a angličtinu:
// partie jako klíče, anglické texty u vestavěných cviků a cviků z databáze.
export async function upgradeExerciseData() {
  if (await getMeta('exDataV2')) return;
  const [{ getAll, put }, { loadDbIndex }, { MUSCLE_PART_KEYS }] = await Promise.all([
    import('./db.js'), import('./images.js'), import('./muscles.js'),
  ]);
  const catalog = await loadDbIndex().catch(() => []);
  const en = await fetch('data/free-exercise-db-en.json').then((r) => r.json()).catch(() => ({}));
  const known = new Set(MUSCLE_PART_KEYS);
  const builtin = new Map(BUILTIN_EXERCISES.map((e) => [e.id, e]));
  const toKeys = (list) => [...new Set((list ?? []).map((x) => (known.has(x) ? x : TEXT_TO_KEY[String(x).toLowerCase().trim()])).filter(Boolean))];

  for (const ex of await getAll('exercises')) {
    const meta = ex.dbId ? catalog.find((m) => m.id === ex.dbId) : null;
    if (builtin.has(ex.id)) {
      ex.muscles = structuredClone(builtin.get(ex.id).muscles);
      ex.nameEn ??= BUILTIN_EN[ex.id]?.name;
      ex.instructionsEn ??= BUILTIN_EN[ex.id]?.instructions;
      ex.tipsEn ??= BUILTIN_EN[ex.id]?.tips;
    } else if (meta) {
      ex.muscles = { primary: [...meta.p], secondary: [...meta.s] };
      ex.nameEn ??= meta.n;
      ex.instructionsEn ??= (en[ex.dbId] ?? []).join('\n');
    } else {
      const primary = toKeys(ex.muscles?.primary);
      ex.muscles = { primary, secondary: toKeys(ex.muscles?.secondary).filter((k) => !primary.includes(k)) };
    }
    await put('exercises', ex);
  }
  await setMeta('exDataV2', new Date().toISOString());
}
