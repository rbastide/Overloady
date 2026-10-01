import { PrismaClient } from '@prisma/client';
import { DEFAULT_EXERCISES } from './exercise-catalog';

const WGER_API_URL = 'https://wger.de/api/v2/exerciseinfo/?limit=200';
const WGER_LANGUAGE_EN = 2;
const WGER_LANGUAGE_FR = 12;

// wger category name -> app category. Cardio is intentionally not imported.
const WGER_CATEGORY_MAP: Record<string, string> = {
  Abs: 'Abdominaux',
  Arms: 'Bras',
  Back: 'Dos',
  Calves: 'Jambes',
  Chest: 'Pectoraux',
  Legs: 'Jambes',
  Shoulders: 'Épaules',
};

interface WgerExerciseInfo {
  id: number;
  category: { name: string };
  translations: Array<{ language: number; name: string }>;
}

const normalizeName = (name: string) => name.trim().toLowerCase();

/**
 * Makes sure every built-in catalog exercise exists in the database.
 * Older databases stored them with fake wger ids (101-189); those ids are released
 * so they can be used by real wger exercises.
 */
export async function syncLocalCatalog(prisma: PrismaClient) {
  const catalogNames = DEFAULT_EXERCISES.map((ex) => ex.name);

  await prisma.exercise.updateMany({
    where: { name: { in: catalogNames }, source: { not: 'wger' } },
    data: { wgerId: null, source: 'local' },
  });

  const existing = await prisma.exercise.findMany({ select: { name: true } });
  const existingNames = new Set(existing.map((e) => normalizeName(e.name)));
  const missing = DEFAULT_EXERCISES.filter((ex) => !existingNames.has(normalizeName(ex.name)));

  if (missing.length > 0) {
    await prisma.exercise.createMany({
      data: missing.map((ex) => ({ ...ex, source: 'local' })),
    });
  }
  return missing.length;
}

async function fetchAllWgerExercises(): Promise<WgerExerciseInfo[]> {
  const results: WgerExerciseInfo[] = [];
  let url: string | null = WGER_API_URL;

  while (url) {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`wger API responded ${response.status} for ${url}`);
    }
    const page = await response.json();
    results.push(...page.results);
    url = page.next;
  }
  return results;
}

/**
 * Imports every strength exercise from the public wger database (https://wger.de).
 * Existing exercises are never overwritten: entries whose wger id or name is already
 * present are skipped.
 */
export async function importWgerExercises(prisma: PrismaClient) {
  const wgerExercises = await fetchAllWgerExercises();

  const existing = await prisma.exercise.findMany({ select: { wgerId: true, name: true } });
  const existingIds = new Set(existing.map((e) => e.wgerId).filter((id) => id !== null));
  const existingNames = new Set(existing.map((e) => normalizeName(e.name)));

  const toCreate: Array<{ wgerId: number; name: string; category: string; source: string }> = [];

  for (const ex of wgerExercises) {
    const category = WGER_CATEGORY_MAP[ex.category?.name];
    if (!category || existingIds.has(ex.id)) continue;

    const translation =
      ex.translations.find((t) => t.language === WGER_LANGUAGE_EN) ||
      ex.translations.find((t) => t.language === WGER_LANGUAGE_FR);
    const name = translation?.name?.trim();
    if (!name || existingNames.has(normalizeName(name))) continue;

    existingNames.add(normalizeName(name));
    toCreate.push({ wgerId: ex.id, name, category, source: 'wger' });
  }

  if (toCreate.length > 0) {
    await prisma.exercise.createMany({ data: toCreate, skipDuplicates: true });
  }
  return { fetched: wgerExercises.length, imported: toCreate.length };
}
