import { PrismaClient } from '@prisma/client';
import { DEFAULT_EXERCISES } from './exercise-catalog';
import { catalogKeys, correctCategory, isObscureName, movementKey } from './exercise-tidy';

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
  images?: Array<{ image: string; is_main: boolean }>;
}

/** What the app keeps of one wger exercise. */
interface WgerEntry {
  wgerId: number;
  name: string;
  nameFr: string | null;
  category: string;
  imageUrl: string | null;
  isVariant: boolean;
}

const normalizeName = (name: string) => name.trim().toLowerCase();

/**
 * Makes sure every built-in catalog exercise exists in the database, with its French name and
 * its variant flag. Older databases stored them with fake wger ids (101-189); those ids are
 * released so they can be used by real wger exercises.
 */
export async function syncLocalCatalog(prisma: PrismaClient) {
  const catalogNames = DEFAULT_EXERCISES.map((ex) => ex.name);

  await prisma.exercise.updateMany({
    where: { name: { in: catalogNames }, source: { not: 'wger' } },
    data: { wgerId: null, source: 'local' },
  });

  const existing = await prisma.exercise.findMany({
    select: { id: true, name: true, source: true, nameFr: true, isVariant: true },
  });
  const byName = new Map(existing.map((e) => [normalizeName(e.name), e]));

  const missing = DEFAULT_EXERCISES.filter((ex) => !byName.has(normalizeName(ex.name)));
  if (missing.length > 0) {
    await prisma.exercise.createMany({
      data: missing.map((ex) => ({
        name: ex.name,
        category: ex.category,
        nameFr: ex.nameFr,
        isVariant: ex.variant ?? false,
        source: 'local',
      })),
    });
  }

  // The catalog is ours: its French names and variant flags follow the code
  const updates = DEFAULT_EXERCISES.flatMap((ex) => {
    const row = byName.get(normalizeName(ex.name));
    if (!row || row.source !== 'local') return [];
    const isVariant = ex.variant ?? false;
    if (row.nameFr === ex.nameFr && row.isVariant === isVariant) return [];
    return [prisma.exercise.update({ where: { id: row.id }, data: { nameFr: ex.nameFr, isVariant } })];
  });
  if (updates.length > 0) await prisma.$transaction(updates);

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

const mainImage = (ex: WgerExerciseInfo) => (ex.images?.find((img) => img.is_main) ?? ex.images?.[0])?.image ?? null;

/**
 * Reads the wger strength exercises and decides how each one is shown: French name, picture,
 * corrected category, and whether it is a variant (no French name, obscure, or a duplicate of a
 * built-in or of a better wger entry).
 */
function tidyWgerExercises(wgerExercises: WgerExerciseInfo[]): WgerEntry[] {
  const entries = wgerExercises.flatMap((ex): Array<Omit<WgerEntry, 'isVariant'>> => {
    const mapped = WGER_CATEGORY_MAP[ex.category?.name];
    const english = ex.translations.find((t) => t.language === WGER_LANGUAGE_EN)?.name?.trim();
    const french = ex.translations.find((t) => t.language === WGER_LANGUAGE_FR)?.name?.trim() || null;
    const name = english || french;
    if (!mapped || !name) return [];
    return [{ wgerId: ex.id, name, nameFr: french, category: correctCategory(name, mapped), imageUrl: mainImage(ex) }];
  });

  // The best-described entries claim a movement first; later look-alikes become variants
  const ranked = [...entries].sort(
    (a, b) =>
      Number(!!b.nameFr) - Number(!!a.nameFr) ||
      Number(!!b.imageUrl) - Number(!!a.imageUrl) ||
      a.name.length - b.name.length,
  );
  const taken = catalogKeys(DEFAULT_EXERCISES.filter((ex) => !ex.variant));
  const variants = new Set<number>();
  for (const entry of ranked) {
    const keys = [movementKey(entry.name), entry.nameFr ? movementKey(entry.nameFr) : ''].filter(Boolean);
    if (!entry.nameFr || isObscureName(entry.name) || keys.some((key) => taken.has(key))) {
      variants.add(entry.wgerId);
      continue;
    }
    keys.forEach((key) => taken.add(key));
  }

  return entries.map((entry) => ({ ...entry, isVariant: variants.has(entry.wgerId) }));
}

/**
 * Imports every strength exercise from the public wger database (https://wger.de) and keeps the
 * already imported ones up to date (French name, picture, category, variant flag). Exercises are
 * never deleted, and a name already in the database is never imported twice. Built-in exercises
 * get the picture of the wger movement they are linked to.
 */
export async function importWgerExercises(prisma: PrismaClient) {
  const wgerExercises = await fetchAllWgerExercises();
  const entries = tidyWgerExercises(wgerExercises);

  const existing = await prisma.exercise.findMany({
    select: { id: true, wgerId: true, name: true, source: true, nameFr: true, category: true, imageUrl: true, isVariant: true },
  });
  const byWgerId = new Map(existing.filter((e) => e.wgerId !== null).map((e) => [e.wgerId as number, e]));
  const existingNames = new Set(existing.map((e) => normalizeName(e.name)));

  const toCreate: Array<Omit<WgerEntry, 'wgerId'> & { wgerId: number; source: string }> = [];
  const updates: Array<ReturnType<typeof prisma.exercise.update>> = [];

  for (const entry of entries) {
    const row = byWgerId.get(entry.wgerId);
    if (row) {
      const { nameFr, category, imageUrl, isVariant } = entry;
      if (row.nameFr !== nameFr || row.category !== category || row.imageUrl !== imageUrl || row.isVariant !== isVariant) {
        updates.push(prisma.exercise.update({ where: { id: row.id }, data: { nameFr, category, imageUrl, isVariant } }));
      }
      continue;
    }
    if (existingNames.has(normalizeName(entry.name))) continue;
    existingNames.add(normalizeName(entry.name));
    toCreate.push({ ...entry, source: 'wger' });
  }

  // Pictures of the built-in exercises, borrowed from the wger movement they match
  const imageById = new Map(wgerExercises.map((ex) => [ex.id, mainImage(ex)]));
  const localByName = new Map(existing.filter((e) => e.source === 'local').map((e) => [normalizeName(e.name), e]));
  for (const ex of DEFAULT_EXERCISES) {
    const row = localByName.get(normalizeName(ex.name));
    const imageUrl = ex.wgerImage ? imageById.get(ex.wgerImage) ?? null : null;
    if (row && imageUrl && row.imageUrl !== imageUrl) {
      updates.push(prisma.exercise.update({ where: { id: row.id }, data: { imageUrl } }));
    }
  }

  if (toCreate.length > 0) {
    await prisma.exercise.createMany({ data: toCreate, skipDuplicates: true });
  }
  // Batched so a large first backfill never holds one long transaction
  for (let i = 0; i < updates.length; i += 100) {
    await prisma.$transaction(updates.slice(i, i + 100));
  }

  return {
    fetched: wgerExercises.length,
    imported: toCreate.length,
    updated: updates.length,
    withoutFrench: entries.filter((e) => !e.nameFr).length,
  };
}
