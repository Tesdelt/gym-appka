// Předvyplněná data: posilovna, cviky z encyklopedie a šablony tréninků.
// Vloží se jen jednou, při prvním spuštění (meta.seeded).

import { count, putAll, setMeta, getMeta } from './db.js';

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
    muscles: { primary: ['široký sval zádový'], secondary: ['biceps', 'zadní ramena'] },
    instructions: 'Nadhmat o něco širší než ramena, začít z plného visu, stáhnout lopatky dolů a přitáhnout se bradou nad hrazdu, kontrolovaně spustit do plného visu.',
    tips: 'Nehoupat se a nekopat nohama, zátěž na opasku držet u těla, každé opakování začínat z plného visu.',
    image: null,
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
    muscles: { primary: ['biceps'], secondary: ['předloktí'] },
    instructions: 'Stoj čelem ke spodní kladce, podhmat, lokty u těla, zdvih k ramenům, pomalé spuštění do natažených paží.',
    tips: 'Lokty se nesmí posouvat dopředu, nezaklánět se, nahoře krátce zpevnit.',
    image: null,
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
    muscles: { primary: ['střední část zad', 'široký sval zádový'], secondary: ['zadní ramena', 'biceps'] },
    instructions: 'Sed na spodní kladce, nohy opřené, záda rovně, přitáhnout rukojeť k břichu, stáhnout lopatky k sobě, kontrolovaně vrátit.',
    tips: 'Netahat zády ani švihem, ramena držet dole, pohyb začínat lopatkami.',
    image: null,
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
    muscles: { primary: ['brachialis', 'brachioradialis'], secondary: ['biceps'] },
    instructions: 'Jednoručky neutrálním úchopem, ruce mírně vytočené šikmo, lokty u těla, zdvih k ramenům, pomalé spuštění.',
    tips: 'Nehoupat trupem, zápěstí držet pevně v jedné rovině s předloktím, spouštět pomaleji než zvedat.',
    image: null,
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
    muscles: { primary: ['prsa', 'triceps'], secondary: ['přední ramena'] },
    instructions: 'Vzpor na bradlech, ramena dole, spustit se do mírného předklonu, dokud nadloktí není zhruba vodorovně, vytlačit zpět do vzporu.',
    tips: 'Nepropadat se v ramenou, nechodit hlouběji, než ramena snesou, zátěž na opasku nesmí houpat.',
    image: null,
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
    muscles: { primary: ['přední ramena', 'střední ramena'], secondary: ['triceps'] },
    instructions: 'Sed s oporou zad, jednoručky u ramen, vytlačit nad hlavu, kontrolovaně spustit k ramenům.',
    tips: 'Neprohýbat se v bedrech, lokty mírně před tělem, nahoře nezamykat lokty prudce.',
    image: null,
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
    muscles: { primary: ['střední ramena'], secondary: [] },
    instructions: 'Stoj, jednoručky podél těla, upažit do výše ramen s mírně pokrčenými lokty, pomalu spustit.',
    tips: 'Vést pohyb lokty, ne rukama, nekrčit ramena k uším, u drop setu měnit váhu co nejrychleji.',
    image: null,
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
    muscles: { primary: ['ramena'], secondary: ['střed těla'] },
    instructions: '10× zvednout kotouč nad hlavu. Poté ze spodní pozice na jedné straně přenést kotouč obloukem přes hlavu na druhou stranu dolů, totéž opačným směrem.',
    tips: 'Zpevněný střed těla, neprohýbat se v bedrech, pohyb plynulý a kontrolovaný.',
    image: null,
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
    muscles: { primary: ['triceps'], secondary: [] },
    instructions: 'Stoj čelem k horní kladce, lokty u těla, propnout paže dolů, kontrolovaně vrátit do úhlu cca 90°.',
    tips: 'Lokty se nehýbou, nezapojovat ramena ani trup, dole krátce zpevnit.',
    image: null,
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

export const DEFAULT_GYM = { id: 'hlavni', name: 'Hlavní posilovna' };

export async function seedIfEmpty() {
  if (await getMeta('seeded')) return false;
  const now = new Date().toISOString();
  if ((await count('gyms')) === 0) {
    await putAll('gyms', [{ ...DEFAULT_GYM, createdAt: now }]);
  }
  if ((await count('exercises')) === 0) {
    await putAll('exercises', BUILTIN_EXERCISES.map((e) => ({ ...e, gymSteps: {}, source: 'builtin', createdAt: now })));
  }
  if ((await count('templates')) === 0) {
    await putAll('templates', BUILTIN_TEMPLATES.map((t) => ({ ...t, createdAt: now })));
  }
  await setMeta('seeded', now);
  await setMeta('lastGymId', DEFAULT_GYM.id);
  return true;
}
