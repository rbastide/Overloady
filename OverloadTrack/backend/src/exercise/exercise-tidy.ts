/**
 * Rules that keep the exercise list tidy: which wger entries are obscure, which ones repeat a
 * movement already listed, and which wger categories are plainly wrong. Pure functions, so the
 * sorting rule can be read and tested without the database.
 */

// Abbreviations and spellings that name the same thing
const SYNONYMS: Record<string, string> = {
  bb: 'barbell',
  db: 'dumbbell',
  dumbell: 'dumbbell',
  sz: 'ez',
  benchpress: 'bench press',
  pullup: 'pull up',
  chinup: 'chin up',
  pushup: 'push up',
  pulldown: 'pull down',
  halteres: 'haltere',
};

// Words that do not change the movement
const FILLER = new Set(['a', 'an', 'and', 'the', 'with', 'on', 'of', 'using', 'au', 'aux', 'avec', 'de', 'des', 'du', 'en', 'la', 'le', 'les', 'sur']);

// Equipment words: a name without them is the generic form of the movement
const EQUIPMENT = new Set(['barbell', 'dumbbell', 'cable', 'machine', 'smith', 'band', 'ez', 'bar', 'barre', 'haltere', 'poulie', 'guidee']);

// "presses" -> "press", "curls" -> "curl", but "press" stays whole
const singular = (word: string) => {
  if (word.endsWith('sses')) return word.slice(0, -2);
  return word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
};

const words = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .flatMap((word) => (SYNONYMS[word] ?? word).split(' '))
    .map(singular)
    .filter((word) => word && !FILLER.has(word));

/** Order-free key of a movement: "Leg Press (Machine)" and "Machine leg presses" share it. */
export const movementKey = (name: string) => [...new Set(words(name))].sort().join(' ');

const genericKey = (name: string) => [...new Set(words(name).filter((word) => !EQUIPMENT.has(word)))].sort().join(' ');

/** Keys a built-in exercise claims: its exact movement and its generic form, in both languages. */
export function catalogKeys(exercises: Array<{ name: string; nameFr: string }>): Set<string> {
  const keys = new Set<string>();
  for (const ex of exercises) {
    for (const name of [ex.name, ex.nameFr]) {
      keys.add(movementKey(name));
      const generic = genericKey(name);
      if (generic) keys.add(generic);
    }
  }
  return keys;
}

// Names no athlete would look for first: numbered entries, brand or method names, one-sided
// copies, stretches and foam rolling, and names left in another language
const OBSCURE_PATTERNS = [
  /^\d/,
  /\b(legend|pin|mentzer|hammerstrength|nb|hackenschmidt)\b/i,
  /\b(left|right|gauche|droite)\s*$/i,
  /\b(stretch|stretching|foam roll(er)?|blackroll|mobility)\b/i,
  /\b(mit|con|maquina|agarre|muneca|muñeca)\b/i,
];

export const isObscureName = (name: string) => OBSCURE_PATTERNS.some((pattern) => pattern.test(name));

// Movements whose muscle group the name makes certain, whatever wger filed them under
const CATEGORY_BY_NAME: Array<[RegExp, string]> = [
  [/\b(pull ?-?downs?|pull ?-?ups?|chin ?-?ups?)\b/i, 'Dos'],
  [/\b(arm|biceps?|triceps?|forearms?|wrists?)\b/i, 'Bras'],
  [/\b(neck|shoulders?|delts?)\b/i, 'Épaules'],
  [/\b(hamstrings?|quads?|quadriceps|calf|calves|hips?|glutes?|legs?|knees?)\b/i, 'Jambes'],
  [/\b(chest|pecs?)\b/i, 'Pectoraux'],
];

/**
 * wger's category, unless it is plainly wrong: a pulldown is back work whatever its name says
 * ("Mentzer Pulldown" filed under arms), and a stretch belongs to the body part it names
 * ("Arm and neck stretch" filed under abs).
 */
export function correctCategory(name: string, category: string): string {
  const [pulls, ...bodyParts] = CATEGORY_BY_NAME;
  // Not when the bar is only a prop (a leg raise or a hold hanging from it) or the arm is the target
  // ("Triceps pull-down" is a pushdown), nor for stretches
  const barOnly = /\b(raises?|holds?|flexors?|triceps?|stretch\w*)\b/i.test(name);
  if (pulls[0].test(name) && !barOnly) return pulls[1];
  if (/\bstretch/i.test(name)) {
    const match = bodyParts.find(([pattern]) => pattern.test(name));
    if (match) return match[1];
  }
  return category;
}
