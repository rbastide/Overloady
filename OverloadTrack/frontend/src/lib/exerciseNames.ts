/**
 * French names and pictures of the exercises. Sessions, history, records and Atlas all carry the
 * English name (the key the engine reads); the app shows the French one, looked up here. The last
 * catalog received is kept on the device so names stay French offline.
 */

export interface CatalogEntry {
  name: string;
  nameFr?: string | null;
  imageUrl?: string | null;
}

const STORAGE_KEY = 'overloady.exerciseNames';

const keyOf = (name: string) => name.trim().toLowerCase();

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let byName = new Map<string, CatalogEntry>();
// One pattern for every translated English name, longest first so "Bench Press (Dumbbell)" wins over
// "Bench Press", and whole words only so "Row" never touches "Rowing"
let namePattern: RegExp | null = null;

const index = (entries: CatalogEntry[]) => {
  byName = new Map(entries.map((e) => [keyOf(e.name), e]));
  const translated = entries
    .filter((e) => e.nameFr && e.nameFr !== e.name)
    .map((e) => e.name)
    .sort((a, b) => b.length - a.length);
  namePattern =
    translated.length > 0
      ? new RegExp(`(?<![\\p{L}\\d])(?:${translated.map(escapeRegExp).join('|')})(?![\\p{L}\\d])`, 'giu')
      : null;
};

try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) index(JSON.parse(stored));
} catch {
  // Nothing stored or storage unavailable: English names until the catalog arrives.
}

/** Records the catalog received from the server (and keeps it for offline use). */
export const rememberCatalog = (exercises: CatalogEntry[]) => {
  if (!Array.isArray(exercises) || exercises.length === 0) return;
  const entries = exercises.map(({ name, nameFr, imageUrl }) => ({ name, nameFr: nameFr ?? null, imageUrl: imageUrl ?? null }));
  index(entries);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or unavailable: names stay French until the app is closed.
  }
};

/** The French name of an exercise, or null when there is none. */
export const frenchName = (name?: string | null): string | null => {
  if (!name) return null;
  const french = byName.get(keyOf(name))?.nameFr;
  return french && french !== name ? french : null;
};

/** The name to show: French when known, else the stored one. */
export const displayName = (name?: string | null): string => frenchName(name) ?? name ?? 'Exercice';

/** Picture of the movement, when the catalog has one. */
export const exerciseImage = (name?: string | null): string | null => (name ? byName.get(keyOf(name))?.imageUrl ?? null : null);

/** Replaces the English exercise names quoted in a text (Atlas notes and tips) by their French names. */
export const frenchifyText = (text?: string | null): string => {
  if (!text || !namePattern) return text ?? '';
  // A single pass: a French name just inserted is never matched again
  return text.replace(namePattern, (match) => frenchName(match) ?? match);
};
