/**
 * Bilingual exercise search: the catalog names are mostly English (Hevy, wger) while athletes
 * often type in French. Each name is indexed with the translation of the gym terms it contains,
 * in both directions, so "développé couché haltères" finds "Bench Press (Dumbbell)" and
 * "curl hammer" finds "Curl marteau".
 */

// [English terms, French terms]: any term found in a name adds all the terms of the other language.
const GLOSSARY: Array<[string[], string[]]> = [
  // Movements
  [['bench press'], ['developpe couche']],
  [['chest press'], ['developpe pectoraux', 'developpe machine']],
  [['incline'], ['incline']],
  [['decline'], ['decline']],
  [['shoulder press', 'overhead press', 'military press'], ['developpe militaire', 'developpe epaules']],
  [['arnold press'], ['developpe arnold']],
  [['press'], ['developpe', 'presse']],
  [['front squat'], ['squat avant']],
  [['split squat', 'bulgarian'], ['squat bulgare', 'fente bulgare']],
  [['squat'], ['squat']],
  [['romanian deadlift', 'rdl', 'stiff leg'], ['souleve de terre roumain', 'jambes tendues']],
  [['deadlift'], ['souleve de terre']],
  [['pull up', 'pullup'], ['traction']],
  [['chin up', 'chinup'], ['traction supination']],
  [['lat pulldown', 'pulldown'], ['tirage vertical', 'tirage poitrine', 'tirage nuque']],
  [['seated row', 'cable row'], ['tirage horizontal', 'rowing assis']],
  [['bent over row'], ['rowing buste penche', 'rowing barre']],
  [['upright row'], ['rowing menton']],
  [['row', 'rowing'], ['rowing', 'tirage']],
  [['leg press'], ['presse a cuisses', 'presse jambes']],
  [['leg extension'], ['extension des jambes', 'extension quadriceps', 'leg extension']],
  [['leg curl'], ['flexion des jambes', 'leg curl', 'ischio']],
  [['hammer curl'], ['curl marteau']],
  [['preacher curl'], ['curl pupitre']],
  [['wrist curl'], ['flexion poignets', 'curl poignets']],
  [['curl'], ['curl', 'flexion']],
  [['pushdown', 'push down'], ['extension poulie', 'pushdown']],
  [['skullcrusher', 'skull crusher', 'lying triceps extension'], ['barre au front']],
  [['extension'], ['extension']],
  [['dip'], ['dips']],
  [['push up', 'pushup'], ['pompe']],
  [['lateral raise', 'side raise'], ['elevation laterale', 'elevations laterales']],
  [['front raise'], ['elevation frontale', 'elevations frontales']],
  [['y raise'], ['elevation en y']],
  [['reverse fly', 'rear delt'], ['oiseau', 'deltoide posterieur', 'arriere epaule']],
  [['butterfly', 'pec deck'], ['pec deck', 'butterfly', 'ecarte machine']],
  [['fly', 'flye'], ['ecarte']],
  [['crossover'], ['ecarte poulie', 'vis a vis']],
  [['pullover'], ['pullover']],
  [['face pull'], ['face pull', 'tirage visage']],
  [['shrug'], ['haussement epaules', 'shrug']],
  [['calf raise', 'calf', 'calves'], ['mollet', 'extension mollets']],
  [['walking lunge'], ['fente marchee']],
  [['lunge'], ['fente']],
  [['step up'], ['montee sur banc', 'step up']],
  [['hip thrust'], ['hip thrust', 'pont fessier']],
  [['glute bridge'], ['pont fessier']],
  [['abduction'], ['abduction', 'abducteurs']],
  [['adduction'], ['adduction', 'adducteurs']],
  [['back extension', 'hyperextension'], ['extension lombaire', 'lombaires', 'hyperextension']],
  [['good morning'], ['good morning', 'bonjour']],
  [['crunch'], ['crunch', 'abdos']],
  [['sit up', 'situp'], ['relevement de buste', 'abdos']],
  [['plank'], ['gainage', 'planche']],
  [['leg raise'], ['releve de jambes', 'releves de jambes']],
  [['knee raise'], ['releve de genoux', 'releves de genoux']],
  [['ab wheel', 'ab roller'], ['roue abdominale', 'roulette abdos']],
  [['russian twist'], ['rotation russe', 'twist russe']],
  [['farmer'], ['marche du fermier']],
  // Equipment
  [['barbell'], ['barre']],
  [['ez bar'], ['barre ez']],
  [['dumbbell'], ['haltere']],
  [['cable', 'pulley'], ['poulie', 'cable']],
  [['smith machine', 'smith'], ['barre guidee', 'smith']],
  [['machine'], ['machine']],
  [['band'], ['elastique']],
  [['bodyweight'], ['poids du corps']],
  [['kettlebell'], ['kettlebell']],
  [['bench'], ['banc']],
  // Positions and grips
  [['seated'], ['assis']],
  [['standing'], ['debout']],
  [['lying'], ['allonge']],
  [['hanging'], ['suspendu']],
  [['parallel bars'], ['barres paralleles']],
  [['close grip', 'narrow grip'], ['prise serree']],
  [['wide grip'], ['prise large']],
  [['reverse grip', 'underhand'], ['prise inversee', 'supination']],
  [['single arm', 'one arm', 'single leg', 'one leg'], ['unilateral', 'un bras', 'une jambe']],
  [['assisted'], ['assiste']],
  [['weighted'], ['leste']],
  [['reverse'], ['inverse']],
  [['walking'], ['marche']],
  [['overhead'], ['au dessus de la tete', 'nuque']],
  // Muscles
  [['chest', 'pec'], ['pectoraux', 'pecs']],
  [['shoulder', 'delt', 'deltoid'], ['epaule', 'deltoide']],
  [['bicep'], ['biceps']],
  [['tricep'], ['triceps']],
  [['forearm', 'wrist'], ['avant bras', 'poignet']],
  [['back', 'lat'], ['dos', 'dorsaux']],
  [['trap'], ['trapezes']],
  [['abs', 'abdominal', 'core', 'oblique'], ['abdos', 'abdominaux', 'obliques']],
  [['leg'], ['jambes']],
  [['quad'], ['quadriceps']],
  [['hamstring'], ['ischios', 'ischio jambiers']],
  [['glute'], ['fessiers', 'fesses']],
  [['hip'], ['hanche']],
];

// Words that carry no meaning in a query ("développé avec haltères", "curl à la poulie")
const STOP_WORDS = new Set(['a', 'au', 'aux', 'avec', 'd', 'de', 'des', 'du', 'en', 'et', 'l', 'la', 'le', 'les', 'sur', 'the', 'with', 'on', 'of', 'and']);

/** Lowercase, no accents, words separated by single spaces ("Pull-up (Barbell)" -> "pull up barbell"). */
export const normalizeText = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// A glossary term matches whole words, plural included ("curl" in "curls", but "lat" not in "lateral")
const containsWord = (paddedText: string, term: string) =>
  paddedText.includes(` ${term} `) || paddedText.includes(` ${term}s `) || paddedText.includes(` ${term}es `);

// A query word matches the start of a word, so "dev" already finds "développé"
const containsPrefix = (paddedText: string, word: string) => paddedText.includes(` ${word}`);

const indexCache = new Map<string, string>();

/** The name plus the translations of every gym term it contains, padded with spaces. */
const searchIndex = (name: string) => {
  const cached = indexCache.get(name);
  if (cached !== undefined) return cached;

  const padded = ` ${normalizeText(name)} `;
  const extra: string[] = [];
  for (const [english, french] of GLOSSARY) {
    if (english.some((term) => containsWord(padded, term))) extra.push(...french);
    if (french.some((term) => containsWord(padded, term))) extra.push(...english);
  }
  const index = `${padded}${extra.join(' ')} `;
  indexCache.set(name, index);
  return index;
};

// Plurals are dropped so "haltères", "tractions" or "curls" match the singular terms
const queryTokens = (query: string) =>
  normalizeText(query)
    .split(' ')
    .filter((word) => word && !STOP_WORDS.has(word))
    .map((word) => (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word));

export interface SearchableExercise {
  name: string;
  nameFr?: string | null;
  source?: string;
  isVariant?: boolean | null;
}

// How closely one name answers the query: exact name, then start of the name, then every word
// of the query starting a word of the name, then a match through the gym glossary only.
const closeness = (name: string, query: string, tokens: string[]): number | null => {
  const text = normalizeText(name);
  if (text === query) return 0;
  if (text.startsWith(query)) return 1;
  const padded = ` ${text} `;
  if (tokens.every((token) => containsPrefix(padded, token))) return 2;
  if (tokens.every((token) => containsPrefix(searchIndex(name), token))) return 3;
  return null;
};

/**
 * Exercises matching a French or English query, best answers first: the exact name and the start
 * of a name before partial matches, the app's own exercises before the imported ones, and the
 * variants after everything else. Null for an empty query.
 */
export function rankExercises<T extends SearchableExercise>(query: string, exercises: T[]): T[] | null {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return null;
  const normalized = normalizeText(query);

  const scored = exercises.flatMap((ex) => {
    const scores = [ex.nameFr, ex.name]
      .filter((name): name is string => !!name)
      .map((name) => closeness(name, normalized, tokens))
      .filter((score): score is number => score !== null);
    return scores.length > 0 ? [{ ex, score: Math.min(...scores) }] : [];
  });

  return scored
    .sort(
      (a, b) =>
        Number(!!a.ex.isVariant) - Number(!!b.ex.isVariant) ||
        a.score - b.score ||
        Number(a.ex.source === 'wger') - Number(b.ex.source === 'wger') ||
        (a.ex.nameFr || a.ex.name).length - (b.ex.nameFr || b.ex.name).length,
    )
    .map(({ ex }) => ex);
}
