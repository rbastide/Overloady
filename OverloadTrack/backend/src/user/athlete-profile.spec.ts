import {
  athleteConstraints,
  normalizeBirthYear,
  normalizeEquipment,
  normalizeGoal,
  normalizePainAreas,
  normalizeShortText,
} from './athlete-profile';

describe('athlete profile fields', () => {
  const now = new Date('2026-11-17T10:00:00Z');

  it('accepts the health goal and refuses an unknown one', () => {
    expect(normalizeGoal('health')).toBe('HEALTH');
    expect(normalizeGoal('YOGA')).toBeUndefined();
  });

  it('stores known pain areas only, once each', () => {
    expect(normalizePainAreas(['knee', 'BACK', 'knee', 'nose'])).toBe('KNEE,BACK');
    expect(normalizePainAreas([])).toBeNull();
    expect(normalizePainAreas('SHOULDER,HIP')).toBe('SHOULDER,HIP');
  });

  it('takes a year of birth between 12 and 100 years old', () => {
    expect(normalizeBirthYear(1992, now)).toBe(1992);
    expect(normalizeBirthYear('1992', now)).toBe(1992);
    expect(normalizeBirthYear(2020, now)).toBeUndefined();
    expect(normalizeBirthYear(1900, now)).toBeUndefined();
  });

  it('cleans the first name and the equipment', () => {
    expect(normalizeShortText('  Alex   Martin ', 30)).toBe('Alex Martin');
    expect(normalizeShortText('   ', 30)).toBeNull();
    expect(normalizeEquipment('home_gym')).toBe('HOME_GYM');
    expect(normalizeEquipment('garage')).toBeUndefined();
  });

  it('describes the constraints for Atlas, defaults included', () => {
    expect(athleteConstraints({})).toMatchObject({ equipment: 'salle complète', painAreas: [] });
    expect(athleteConstraints({ painAreas: 'KNEE,OTHER', painNote: 'cheville', equipment: 'DUMBBELLS' })).toMatchObject({
      equipment: 'haltères seulement',
      painAreas: ['genou', 'autre'],
      painNote: 'cheville',
    });
  });
});
