// Athlete profile used to calibrate the test week and to brief the AI coach:
// body weight, training experience and (optional) body fat.

export const EXPERIENCE_LEVELS = ['NONE', 'BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  NONE: 'jamais fait de musculation',
  BEGINNER: 'débutant (moins d’1 an)',
  INTERMEDIATE: 'intermédiaire (1 à 3 ans)',
  ADVANCED: 'confirmé (plus de 3 ans)',
};

// Share of the reference loads (written for an intermediate lifter) a level can start with.
const EXPERIENCE_FACTORS: Record<ExperienceLevel, number> = {
  NONE: 0.5,
  BEGINNER: 0.7,
  INTERMEDIATE: 1,
  ADVANCED: 1.25,
};

// The test-week reference loads target a 75 kg lifter around 18 % body fat.
const REFERENCE_LEAN_MASS = 75 * (1 - 0.18);
const DEFAULT_BODY_FAT = 18;

export interface AthleteProfile {
  weight?: number | null;
  height?: number | null;
  experience?: string | null;
  bodyFat?: number | null;
}

export function normalizeExperience(value: unknown): ExperienceLevel | undefined {
  const upper = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return (EXPERIENCE_LEVELS as readonly string[]).includes(upper) ? (upper as ExperienceLevel) : undefined;
}

const numberInRange = (value: unknown, min: number, max: number): number | undefined => {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 10) / 10 : undefined;
};

export const normalizeWeight = (value: unknown) => numberInRange(value, 30, 250);
export const normalizeHeight = (value: unknown) => {
  const n = numberInRange(value, 120, 230);
  return n === undefined ? undefined : Math.round(n);
};
export const normalizeBodyFat = (value: unknown) => numberInRange(value, 3, 60);

/** One-line French description for AI prompts. */
export function describeAthlete(profile: AthleteProfile | null | undefined): string {
  const level = normalizeExperience(profile?.experience);
  return [
    `${profile?.weight || 75} kg`,
    profile?.height ? `${profile.height} cm` : null,
    `expérience : ${level ? EXPERIENCE_LABELS[level] : 'non renseignée'}`,
    profile?.bodyFat ? `${profile.bodyFat} % de masse grasse` : null,
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * Multiplier applied to the reference calibration loads. Strength scales with lean mass
 * (allometric exponent ~2/3), then with training experience.
 */
export function calibrationLoadFactor(profile: AthleteProfile | null | undefined): number {
  const weight = profile?.weight && profile.weight > 0 ? profile.weight : 75;
  const bodyFat = profile?.bodyFat && profile.bodyFat > 0 ? profile.bodyFat : DEFAULT_BODY_FAT;
  const leanMass = weight * (1 - bodyFat / 100);
  const massFactor = Math.pow(leanMass / REFERENCE_LEAN_MASS, 2 / 3);
  const level = normalizeExperience(profile?.experience) || 'BEGINNER';
  return massFactor * EXPERIENCE_FACTORS[level];
}

/** Scales a reference load and rounds it to what the equipment allows. */
export function scaleCalibrationLoad(exerciseName: string, referenceLoad: number, factor: number): number {
  if (!referenceLoad || referenceLoad <= 0) return 0; // bodyweight movements stay at bodyweight
  const name = exerciseName.toLowerCase();
  const load = referenceLoad * factor;
  if (name.includes('dumbbell')) return Math.max(2, load < 10 ? Math.round(load) : Math.round(load / 2) * 2);
  if (name.includes('barbell')) return Math.max(20, Math.round(load / 2.5) * 2.5);
  return Math.max(2.5, Math.round(load / 2.5) * 2.5);
}
