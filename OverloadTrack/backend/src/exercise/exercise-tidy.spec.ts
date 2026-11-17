import { DEFAULT_EXERCISES } from './exercise-catalog';
import { catalogKeys, correctCategory, isObscureName, movementKey } from './exercise-tidy';

describe('exercise tidying rules', () => {
  it('flags the obscure wger names the testers stumbled on', () => {
    expect(isObscureName('Pin Bench Press BB')).toBe(true);
    expect(isObscureName('Legend Incline Bench Press')).toBe(true);
    expect(isObscureName('3008 Abdominal Crunch')).toBe(true);
    expect(isObscureName('Triceps stretch left')).toBe(true);
    expect(isObscureName('Bench Press')).toBe(false);
    expect(isObscureName('Hip Thrust')).toBe(false);
  });

  it('gives look-alike names the same movement key', () => {
    expect(movementKey('Leg Press (Machine)')).toBe(movementKey('Machine leg presses'));
    expect(movementKey('Benchpress Dumbbells')).toBe(movementKey('Bench Press (Dumbbell)'));
    expect(movementKey('Pull-up')).toBe(movementKey('Pull Up'));
    expect(movementKey('Squat (Barbell)')).not.toBe(movementKey('Front Squat'));
  });

  it('lets the built-in catalog claim the generic form of its movements', () => {
    const keys = catalogKeys(DEFAULT_EXERCISES.filter((ex) => !ex.variant));
    expect(keys.has(movementKey('Bench Press'))).toBe(true);
    expect(keys.has(movementKey('Développé couché'))).toBe(true);
    expect(keys.has(movementKey('Decline Bench Press'))).toBe(false);
  });

  it('marks exactly one entry of each built-in duplicate as a variant', () => {
    const shown = DEFAULT_EXERCISES.filter((ex) => !ex.variant).map((ex) => ex.nameFr);
    expect(new Set(shown).size).toBe(shown.length);
  });

  it('fixes the plainly wrong wger categories', () => {
    expect(correctCategory('Mentzer Pulldown', 'Bras')).toBe('Dos');
    expect(correctCategory('Arm and neck stretch', 'Abdominaux')).toBe('Bras');
    expect(correctCategory('Leg raises pull up bar', 'Abdominaux')).toBe('Abdominaux');
    expect(correctCategory('Knee to Chest Stretch', 'Jambes')).toBe('Jambes');
    expect(correctCategory('Bench Press', 'Pectoraux')).toBe('Pectoraux');
    expect(correctCategory('Triceps pull-down (rope)', 'Bras')).toBe('Bras');
  });
});
