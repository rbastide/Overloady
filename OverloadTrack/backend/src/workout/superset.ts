const SUPERSET_ID = /^[\w-]{1,64}$/;

/**
 * Superset ids of the exercises of a finished session, in order: an id is kept only when it groups
 * two neighbouring exercises, so a stray or malformed one never splits the history into odd groups.
 */
export function sanitizeSupersetIds(ids: unknown[]): (string | null)[] {
  const clean = ids.map((id) => (typeof id === 'string' && SUPERSET_ID.test(id) ? id : null));
  return clean.map((id, i) => (id && (clean[i - 1] === id || clean[i + 1] === id) ? id : null));
}
