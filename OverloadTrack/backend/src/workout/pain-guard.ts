// Movements to avoid, or to do with care, when the athlete reports a sensitive area. Used on the
// sessions Atlas proposes (checked after generation, without asking the AI again) and by the
// local engine, so both follow the same table. Pure functions, tested without a database.

import { PAIN_AREAS } from '../user/athlete-profile';
import { Equipment, detectEquipment, roundLoad } from './progression';

export type PainArea = Exclude<(typeof PAIN_AREAS)[number], 'OTHER'>;

const normalize = (text: string) =>
  (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const hasAny = (name: string, words: string[]) => words.some((w) => name.includes(w));

interface MovementFamily {
  /** Said to the athlete: "Pas de fente : tu as signalé ton genou." */
  label: string;
  matches: (name: string) => boolean;
}

const family = (label: string, words: string[]): MovementFamily => ({ label, matches: (name) => hasAny(name, words) });

const isBarbell = (name: string) => detectEquipment(name) === 'barbell';
const isCurl = (name: string) =>
  name.includes('curl') && !hasAny(name, ['leg curl', 'hamstring', 'ischio', 'nordic', 'wrist', 'poignet']);

const LUNGE = family('fente', ['lunge', 'fente', 'split squat', 'step up', 'step-up']);
const SQUAT = family('squat', ['squat']);
const DIPS = family('dips', ['dip']);
const SKULLCRUSHER = family('barre au front', ['skullcrusher', 'skull crusher', 'barre au front', 'lying triceps extension']);

interface PainRule {
  /** "ton genou", "ta hanche": the area as the coach names it. */
  yours: string;
  /** Where the athlete reads the caution: "Genou sensible". */
  title: string;
  avoid: MovementFamily[];
  /** Single-joint movements around the area: kept, lighter and controlled. */
  caution: Array<(name: string) => boolean>;
}

export const PAIN_RULES: Record<PainArea, PainRule> = {
  KNEE: {
    yours: 'ton genou',
    title: 'Genou sensible',
    avoid: [
      LUNGE,
      SQUAT,
      family('saut', ['jump', 'saut', 'box jump', 'burpee', 'plyo']),
      family('presse à cuisses', ['leg press', 'presse a cuisse', 'presse a cuisses']),
    ],
    caution: [(n) => hasAny(n, ['leg extension', 'leg curl', 'extension de jambe', 'leg ext'])],
  },
  BACK: {
    yours: 'ton dos',
    title: 'Dos sensible',
    avoid: [
      { label: 'soulevé de terre', matches: (n) => hasAny(n, ['deadlift', 'souleve de terre']) || /\brdl\b/.test(n) },
      family('rowing barre penché', ['bent over row', 'barbell row', 'rowing barre', 'pendlay', 't-bar row', 't bar row']),
      { label: 'squat à la barre', matches: (n) => n.includes('squat') && isBarbell(n) },
      { label: 'fente à la barre', matches: (n) => LUNGE.matches(n) && isBarbell(n) },
      family('extension du dos', ['hyperextension', 'back extension', 'extension lombaire']),
      family('good morning', ['good morning']),
      family('roue abdominale', ['ab wheel', 'roue abdo', 'rollout']),
    ],
    caution: [],
  },
  SHOULDER: {
    yours: 'ton épaule',
    title: 'Épaule sensible',
    avoid: [
      family('développé au-dessus de la tête', [
        'overhead press', 'shoulder press', 'military', 'arnold', 'developpe militaire', 'push press',
      ]),
      DIPS,
      family('pullover', ['pullover', 'pull over']),
      family('élévation en Y', ['y raise']),
      family('travail derrière la nuque', ['behind the neck', 'behind neck', 'nuque']),
      family('rowing menton', ['upright row', 'rowing menton']),
    ],
    caution: [(n) => hasAny(n, ['lateral raise', 'elevation laterale', 'reverse fly', 'rear delt', 'oiseau', 'face pull', 'front raise'])],
  },
  WRIST: {
    yours: 'ton poignet',
    title: 'Poignet sensible',
    avoid: [
      family('travail des poignets', ['wrist', 'poignet']),
      { label: 'curl à la barre', matches: (n) => isCurl(n) && isBarbell(n) && !hasAny(n, ['ez bar', 'ez-bar']) },
      SKULLCRUSHER,
      DIPS,
      family('pompes', ['push up', 'push-up', 'pushup', 'pompe']),
    ],
    caution: [isCurl],
  },
  ELBOW: {
    yours: 'ton coude',
    title: 'Coude sensible',
    avoid: [
      SKULLCRUSHER,
      family('extension triceps au-dessus de la tête', ['overhead triceps', 'overhead tricep', 'french press']),
      DIPS,
      family('développé couché prise serrée', ['close grip bench', 'bench press - close grip', 'prise serree']),
      family('curl inversé', ['reverse curl', 'curl inverse']),
    ],
    caution: [isCurl, (n) => hasAny(n, ['pushdown', 'triceps extension', 'tricep extension'])],
  },
  HIP: {
    yours: 'ta hanche',
    title: 'Hanche sensible',
    avoid: [
      SQUAT,
      LUNGE,
      family('abduction ou adduction', ['abduction', 'adduction', 'abducteur', 'adducteur']),
      family('relevé de jambes', ['leg raise', 'knee raise', 'releve de jambes', 'releve de genoux']),
    ],
    caution: [],
  },
};

const isPainArea = (area: string): area is PainArea => area in PAIN_RULES;

/** The areas of the table among those stored on the profile ("KNEE,BACK"); OTHER has no list. */
export const tableAreas = (areas: string[]): PainArea[] => areas.filter(isPainArea);

export type MovementCheck =
  | { status: 'ok' }
  | { status: 'avoid'; area: PainArea; label: string }
  | { status: 'caution'; area: PainArea };

/** Whether a movement is fine, to avoid, or to do with care for these areas. Avoid wins. */
export function checkMovement(exerciseName: string, areas: PainArea[]): MovementCheck {
  const name = normalize(exerciseName);
  for (const area of areas) {
    const avoided = PAIN_RULES[area].avoid.find((f) => f.matches(name));
    if (avoided) return { status: 'avoid', area, label: avoided.label };
  }
  const careful = areas.find((area) => PAIN_RULES[area].caution.some((matches) => matches(name)));
  return careful ? { status: 'caution', area: careful } : { status: 'ok' };
}

/** The movements of each area, written for the AI prompt. */
export function avoidListForPrompt(areas: PainArea[]): string {
  return areas
    .map((area) => `${PAIN_RULES[area].yours.replace(/^(ton|ta) /, '')} : ${PAIN_RULES[area].avoid.map((f) => f.label).join(', ')}`)
    .join(' ; ');
}

/** "de fente", "d'extension du dos". */
const ofLabel = (label: string) => (/^[aeiouyéèh]/i.test(label) ? `d'${label}` : `de ${label}`);

/** Labels said for one area: two at most, so the note stays one short sentence. */
const NOTE_LABELS = 2;

/** "Pas de squat ni de fente : tu as signalé ton genou." */
export function avoidedNote(labels: string[], area: PainArea): string {
  const said = labels.slice(0, NOTE_LABELS).map(ofLabel).join(' ni ');
  return `Pas ${said} : tu as signalé ${PAIN_RULES[area].yours}.`;
}

export const CAUTION_ADVICE = 'Charge allégée, mouvement lent et contrôlé. Arrête si tu as mal.';

/** The prevention message of a session holding careful movements. */
export function preventionNote(areas: PainArea[]): string {
  const titles = areas.map((area) => PAIN_RULES[area].title);
  return `${titles.join(', ')} : les mouvements qui sollicitent cette zone sont allégés. Va lentement, et arrête la série dès que tu as mal.`;
}

/** Share of the planned load kept on a careful movement. */
const CAUTION_LOAD = 0.8;

/** A lighter load for a careful movement: about 20 % off, on the equipment's steps, never heavier. */
export function cautionLoad(weight: number, exerciseName: string): number {
  if (!weight || weight <= 0) return 0;
  const equipment: Equipment = detectEquipment(exerciseName);
  return Math.min(weight, roundLoad(weight * CAUTION_LOAD, equipment));
}

// Areas named in a message: "j'ai mal au genou gauche", "mon épaule me fait mal", "hernie discale".
// An area counts only next to a pain word, with nothing but small words between them, so that
// "séance dos, et j'ai mal à l'épaule" reads a sensitive shoulder, not a sensitive back.

const AREA_WORDS: Record<PainArea, string[]> = {
  KNEE: ['genou', 'genoux', 'rotule', 'rotules'],
  BACK: ['dos', 'lombaire', 'lombaires', 'colonne', 'vertebre', 'vertebres'],
  SHOULDER: ['epaule', 'epaules', 'coiffe'],
  WRIST: ['poignet', 'poignets'],
  ELBOW: ['coude', 'coudes'],
  HIP: ['hanche', 'hanches'],
};

/** Words that name a sore area on their own. */
const SELF_EVIDENT: Record<string, PainArea> = {
  menisque: 'KNEE',
  menisques: 'KNEE',
  hernie: 'BACK',
  sciatique: 'BACK',
  lumbago: 'BACK',
  epicondylite: 'ELBOW',
};

const PAIN_WORDS = new Set([
  'mal', 'douleur', 'douleurs', 'douloureux', 'douloureuse', 'douloureuses', 'blesse', 'blessee', 'blessure', 'blessures',
  'tendinite', 'tendinites', 'gene', 'genant', 'sensible', 'sensibles', 'opere', 'operee', 'operation', 'entorse',
  'fragile', 'fragiles', 'souffre', 'arthrose', 'luxation', 'vrac', 'abime', 'abimee', 'coince', 'coincee', 'pete', 'claque',
]);

/** "pas mal au genou", "plus mal au dos", "sans douleur": the pain is denied. */
const NEGATIONS = new Set(['pas', 'plus', 'jamais', 'sans', 'aucun', 'aucune', 'ni']);

const FILLERS = new Set([
  'a', 'au', 'aux', 'la', 'le', 'les', 'l', 'du', 'de', 'des', 'd', 'dans', 'mon', 'ma', 'mes', 'son', 'sa', 'ses',
  'niveau', 'gauche', 'droit', 'droite', 'deux', 'un', 'une', 'peu', 'tres', 'assez', 'qui', 'me', 'm', 'fait', 'font',
  'est', 'sont', 'en', 'encore', 'toujours', 'vers', 'cote', 'bas', 'haut',
]);

/** Sensitive areas the athlete wrote in a message. */
export function painAreasInText(text: string | undefined | null): PainArea[] {
  if (!text) return [];
  const found = new Set<PainArea>();
  for (const clause of normalize(text).split(/[.,;:!?\n()]+/)) {
    const tokens = clause.split(/[^a-z0-9]+/).filter(Boolean);
    tokens.forEach((token, i) => {
      if (SELF_EVIDENT[token]) found.add(SELF_EVIDENT[token]);
      const area = (Object.keys(AREA_WORDS) as PainArea[]).find((a) => AREA_WORDS[a].includes(token));
      if (!area) return;
      // Look both ways for a pain word, crossing only small words
      for (const step of [-1, 1]) {
        for (let j = i + step; j >= 0 && j < tokens.length; j += step) {
          if (PAIN_WORDS.has(tokens[j])) {
            if (!NEGATIONS.has(tokens[j - 1])) found.add(area);
            return;
          }
          if (!FILLERS.has(tokens[j])) break;
        }
      }
    });
  }
  return (Object.keys(PAIN_RULES) as PainArea[]).filter((a) => found.has(a));
}

/** Profile areas and those of the message, without duplicates, in the table's order. */
export function sensitiveAreas(profileAreas: string[], ...texts: Array<string | undefined | null>): PainArea[] {
  const all = new Set<string>([...profileAreas, ...texts.flatMap((t) => painAreasInText(t))]);
  return (Object.keys(PAIN_RULES) as PainArea[]).filter((a) => all.has(a));
}

export interface PoolExercise {
  id: string;
  name: string;
  category?: string | null;
}

/**
 * A safe stand-in from the catalogue for an avoided movement: same muscle group, not avoided,
 * not already in the session; the same equipment, then a movement with no caution, come first.
 */
export function safeReplacement<T extends PoolExercise>(
  avoidedName: string,
  category: string | null | undefined,
  pool: T[],
  areas: PainArea[],
  usedIds: Set<string>,
): T | null {
  const group = (category || '').toLowerCase();
  const equipment = detectEquipment(avoidedName);
  const candidates = pool
    .filter((e) => !usedIds.has(e.id) && (e.category || '').toLowerCase() === group)
    .map((e) => ({ e, check: checkMovement(e.name, areas) }))
    .filter(({ check }) => check.status !== 'avoid');
  const score = ({ e, check }: { e: T; check: MovementCheck }) =>
    (detectEquipment(e.name) === equipment ? 0 : 2) + (check.status === 'caution' ? 1 : 0);
  // A stable sort keeps the catalogue's order between equals: its classics come first
  return candidates.sort((a, b) => score(a) - score(b))[0]?.e || null;
}

/**
 * The movement a session keeps for a sensitive athlete: itself, or a safe stand-in when the table
 * rules it out (null when its group has none left). "careful" asks for a lighter, controlled load.
 * The report collects what the session says about it.
 */
export function screenMovement<T extends PoolExercise>(
  exercise: T,
  areas: PainArea[],
  pool: T[],
  usedIds: Set<string>,
  report: PainReportBuilder,
): { exercise: T; careful: boolean } | null {
  let kept = exercise;
  let check = checkMovement(exercise.name, areas);
  if (check.status === 'avoid') {
    report.noteAvoided(check.label, check.area);
    const swap = safeReplacement(exercise.name, exercise.category, pool, areas, usedIds);
    if (!swap) return null;
    kept = swap;
    check = checkMovement(kept.name, areas);
  }
  if (check.status === 'caution') report.noteCaution(check.area);
  return { exercise: kept, careful: check.status === 'caution' };
}

/**
 * A calibration movement for a sensitive athlete. The protocol keeps its movements, since the
 * measures rest on them: one the table would avoid or lighten is done lighter and controlled,
 * with the prevention line.
 */
export function protocolMovement(
  exerciseName: string,
  weight: number,
  areas: PainArea[],
  report: PainReportBuilder,
): { weight: number; careful: boolean } {
  const check = checkMovement(exerciseName, areas);
  if (check.status === 'ok') return { weight, careful: false };
  report.noteCaution(check.area);
  return { weight: cautionLoad(weight, exerciseName), careful: true };
}

/** What the session tells the athlete: the movements left out, and a prevention line. */
export interface PainReport {
  avoided: string[];
  prevention: string | null;
}

/**
 * Collects the notes of a session as its movements are checked. The server writes them itself:
 * Atlas mostly leaves the movements out on its own, and the free models cannot say it briefly.
 */
export class PainReportBuilder {
  private readonly avoided = new Map<PainArea, Set<string>>();
  private readonly careful = new Set<PainArea>();

  private readonly swapped = new Set<string>();

  /** A movement of the session was swapped or left out: said first. */
  noteAvoided(label: string, area: PainArea) {
    this.swapped.add(label);
    this.addLabel(label, area);
  }

  private addLabel(label: string, area: PainArea) {
    if (!this.avoided.has(area)) this.avoided.set(area, new Set());
    this.avoided.get(area)!.add(label);
  }

  noteCaution(area: PainArea) {
    this.careful.add(area);
  }

  /**
   * The movements the table rules out for the muscle groups the session works, among those the
   * catalogue offers: what the athlete would otherwise have expected ("séance jambes": squat, fente).
   */
  noteRuledOut(categories: Array<string | null | undefined>, pool: PoolExercise[], areas: PainArea[]) {
    const groups = new Set(categories.map((c) => (c || '').toLowerCase()).filter(Boolean));
    for (const exercise of pool) {
      if (!groups.has((exercise.category || '').toLowerCase())) continue;
      const check = checkMovement(exercise.name, areas);
      if (check.status === 'avoid') this.addLabel(check.label, check.area);
    }
  }

  build(): PainReport {
    // Swapped movements first (noted before the others), then the table's order: the main ones lead
    const rank = (area: PainArea, label: string) => PAIN_RULES[area].avoid.findIndex((f) => f.label === label);
    return {
      avoided: [...this.avoided].map(([area, labels]) => {
        const [swapped, ruledOut] = [[...labels].filter((l) => this.swapped.has(l)), [...labels].filter((l) => !this.swapped.has(l))];
        return avoidedNote([...swapped, ...ruledOut.sort((x, y) => rank(area, x) - rank(area, y))], area);
      }),
      prevention: this.careful.size > 0 ? preventionNote([...this.careful]) : null,
    };
  }
}
