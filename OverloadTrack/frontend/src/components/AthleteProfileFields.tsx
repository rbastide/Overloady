import React from 'react';

export type ExperienceLevel = 'NONE' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export type EquipmentAccess = 'FULL_GYM' | 'HOME_GYM' | 'DUMBBELLS' | 'BANDS' | 'BODYWEIGHT';
export type PainArea = 'KNEE' | 'BACK' | 'SHOULDER' | 'WRIST' | 'ELBOW' | 'HIP' | 'OTHER';

export interface AthleteProfileValue {
  weight: string | number;
  height: string | number;
  experience: ExperienceLevel;
  bodyFat: string | number;
  firstName: string;
  birthYear: string | number;
  equipment: EquipmentAccess;
  /** Usual length of a session, null when not said. */
  sessionMinutes: number | null;
  painAreas: PainArea[];
  painNote: string;
}

export const EXPERIENCE_OPTIONS: { id: ExperienceLevel; label: string; detail: string }[] = [
  { id: 'NONE', label: 'Jamais', detail: 'Je découvre la muscu' },
  { id: 'BEGINNER', label: 'Débutant', detail: "Moins d'1 an" },
  { id: 'INTERMEDIATE', label: 'Intermédiaire', detail: '1 à 3 ans' },
  { id: 'ADVANCED', label: 'Confirmé', detail: 'Plus de 3 ans' },
];

export const EQUIPMENT_OPTIONS: { id: EquipmentAccess; label: string }[] = [
  { id: 'FULL_GYM', label: 'Salle complète' },
  { id: 'HOME_GYM', label: 'Home gym' },
  { id: 'DUMBBELLS', label: 'Haltères seulement' },
  { id: 'BANDS', label: 'Élastiques' },
  { id: 'BODYWEIGHT', label: 'Poids du corps' },
];

const EQUIPMENT_HINTS: Record<EquipmentAccess, string> = {
  FULL_GYM: 'Machines, poulies, barres et haltères.',
  HOME_GYM: 'Barre, haltères et banc, sans machines ni poulies.',
  DUMBBELLS: 'Haltères, plus les exercices au poids du corps.',
  BANDS: 'Élastiques et exercices au poids du corps.',
  BODYWEIGHT: 'Exercices au poids du corps, avec une barre de traction.',
};

const DURATION_OPTIONS = [30, 45, 60, 75, 90];

export const PAIN_OPTIONS: { id: PainArea; label: string }[] = [
  { id: 'KNEE', label: 'Genou' },
  { id: 'BACK', label: 'Dos' },
  { id: 'SHOULDER', label: 'Épaule' },
  { id: 'WRIST', label: 'Poignet' },
  { id: 'ELBOW', label: 'Coude' },
  { id: 'HIP', label: 'Hanche' },
  { id: 'OTHER', label: 'Autre' },
];

const CURRENT_YEAR = new Date().getFullYear();

export const toAthleteProfileValue = (profile: any): AthleteProfileValue => ({
  weight: profile?.weight ?? '',
  height: profile?.height ?? '',
  experience: (profile?.experience as ExperienceLevel) || 'BEGINNER',
  bodyFat: profile?.bodyFat ?? '',
  firstName: profile?.firstName ?? '',
  birthYear: profile?.birthYear ?? '',
  equipment: (profile?.equipment as EquipmentAccess) || 'FULL_GYM',
  sessionMinutes: profile?.sessionMinutes ?? null,
  // The server stores "KNEE,BACK"; the form edits a list
  painAreas: Array.isArray(profile?.painAreas)
    ? profile.painAreas
    : typeof profile?.painAreas === 'string'
    ? (profile.painAreas.split(',').filter(Boolean) as PainArea[])
    : [],
  painNote: profile?.painNote ?? '',
});

/** API payload: every field but weight, height and experience is optional (null clears it). */
export const toAthleteProfilePayload = (value: AthleteProfileValue) => ({
  weight: Number(value.weight) || undefined,
  height: Number(value.height) || undefined,
  experience: value.experience,
  bodyFat: value.bodyFat === '' || value.bodyFat === null ? null : Number(String(value.bodyFat).replace(',', '.')),
  firstName: value.firstName.trim() || null,
  birthYear: value.birthYear === '' || value.birthYear === null ? null : Number(value.birthYear),
  equipment: value.equipment,
  sessionMinutes: value.sessionMinutes,
  painAreas: value.painAreas,
  painNote: value.painAreas.includes('OTHER') ? value.painNote.trim() || null : null,
});

interface AthleteProfileFieldsProps {
  value: AthleteProfileValue;
  onChange: (value: AthleteProfileValue) => void;
  /** Field id prefix, so the component can appear twice on a page. */
  idPrefix: string;
}

export const AthleteProfileFields: React.FC<AthleteProfileFieldsProps> = ({ value, onChange, idPrefix }) => {
  const set = (patch: Partial<AthleteProfileValue>) => onChange({ ...value, ...patch });
  const togglePain = (area: PainArea) =>
    set({
      painAreas: value.painAreas.includes(area)
        ? value.painAreas.filter((a) => a !== area)
        : [...value.painAreas, area],
    });

  return (
    <div className="athlete-fields">
      <fieldset className="athlete-group">
        <legend>Toi</legend>
        <div className="athlete-fields-row is-two">
          <div className="athlete-field">
            <label htmlFor={`${idPrefix}-firstname`}>
              Prénom <span className="athlete-optional">facultatif</span>
            </label>
            <input
              id={`${idPrefix}-firstname`}
              type="text"
              name="firstName"
              autoComplete="given-name"
              spellCheck={false}
              maxLength={30}
              placeholder="ex. Alex…"
              value={value.firstName}
              onChange={(e) => set({ firstName: e.target.value })}
            />
          </div>
          <div className="athlete-field">
            <label htmlFor={`${idPrefix}-birthyear`}>
              Année de naissance <span className="athlete-optional">facultatif</span>
            </label>
            <input
              id={`${idPrefix}-birthyear`}
              type="number"
              inputMode="numeric"
              name="birthYear"
              autoComplete="bday-year"
              min={CURRENT_YEAR - 100}
              max={CURRENT_YEAR - 12}
              placeholder="ex. 1992"
              value={value.birthYear}
              onChange={(e) => set({ birthYear: e.target.value })}
            />
          </div>
        </div>

        <div className="athlete-fields-row">
          <div className="athlete-field">
            <label htmlFor={`${idPrefix}-weight`}>Poids (kg)</label>
            <input
              id={`${idPrefix}-weight`}
              type="number"
              inputMode="decimal"
              step="0.1"
              min={30}
              max={250}
              placeholder="ex. 78"
              value={value.weight}
              onChange={(e) => set({ weight: e.target.value })}
            />
          </div>
          <div className="athlete-field">
            <label htmlFor={`${idPrefix}-height`}>Taille (cm)</label>
            <input
              id={`${idPrefix}-height`}
              type="number"
              inputMode="numeric"
              min={120}
              max={230}
              placeholder="ex. 178"
              value={value.height}
              onChange={(e) => set({ height: e.target.value })}
            />
          </div>
          <div className="athlete-field">
            <label htmlFor={`${idPrefix}-bodyfat`}>
              Body fat (%) <span className="athlete-optional">facultatif</span>
            </label>
            <input
              id={`${idPrefix}-bodyfat`}
              type="number"
              inputMode="decimal"
              step="0.5"
              min={3}
              max={60}
              placeholder="ex. 15"
              value={value.bodyFat}
              onChange={(e) => set({ bodyFat: e.target.value })}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="athlete-group">
        <legend>Ton entraînement</legend>
        <div className="athlete-field">
          <span className="athlete-field-label" id={`${idPrefix}-experience-label`}>
            Expérience en musculation
          </span>
          <div className="athlete-experience" role="radiogroup" aria-labelledby={`${idPrefix}-experience-label`}>
            {EXPERIENCE_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.id}
                role="radio"
                aria-checked={value.experience === opt.id}
                className={`athlete-experience-option ${value.experience === opt.id ? 'selected' : ''}`}
                onClick={() => set({ experience: opt.id })}
              >
                <span className="athlete-experience-label">{opt.label}</span>
                <span className="athlete-experience-detail">{opt.detail}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="athlete-field">
          <span className="athlete-field-label" id={`${idPrefix}-equipment-label`}>
            Matériel disponible
          </span>
          <div className="athlete-chips" role="radiogroup" aria-labelledby={`${idPrefix}-equipment-label`}>
            {EQUIPMENT_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.id}
                role="radio"
                aria-checked={value.equipment === opt.id}
                className={`athlete-chip ${value.equipment === opt.id ? 'selected' : ''}`}
                onClick={() => set({ equipment: opt.id })}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span className="athlete-field-hint">{EQUIPMENT_HINTS[value.equipment]}</span>
        </div>

        <div className="athlete-field">
          <span className="athlete-field-label" id={`${idPrefix}-duration-label`}>
            Durée d’une séance <span className="athlete-optional">facultatif</span>
          </span>
          <div className="athlete-segments" role="radiogroup" aria-labelledby={`${idPrefix}-duration-label`}>
            {DURATION_OPTIONS.map((minutes) => (
              <button
                type="button"
                key={minutes}
                role="radio"
                aria-checked={value.sessionMinutes === minutes}
                aria-label={`${minutes === 90 ? '90 minutes ou plus' : `${minutes} minutes`}`}
                className={`athlete-segment ${value.sessionMinutes === minutes ? 'selected' : ''}`}
                // A second tap clears the choice: the field stays optional
                onClick={() => set({ sessionMinutes: value.sessionMinutes === minutes ? null : minutes })}
              >
                {minutes === 90 ? '90+' : minutes}
              </button>
            ))}
          </div>
          <span className="athlete-field-hint">En minutes, échauffement compris.</span>
        </div>

        <div className="athlete-field">
          <span className="athlete-field-label" id={`${idPrefix}-pain-label`}>
            Douleurs ou zones sensibles <span className="athlete-optional">facultatif</span>
          </span>
          <div className="athlete-chips" role="group" aria-labelledby={`${idPrefix}-pain-label`}>
            {PAIN_OPTIONS.map((opt) => {
              const checked = value.painAreas.includes(opt.id);
              return (
                <button
                  type="button"
                  key={opt.id}
                  role="checkbox"
                  aria-checked={checked}
                  className={`athlete-chip is-check ${checked ? 'selected' : ''}`}
                  onClick={() => togglePain(opt.id)}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {value.painAreas.includes('OTHER') && (
            <input
              id={`${idPrefix}-pain-note`}
              className="athlete-pain-note"
              name="painNote"
              type="text"
              maxLength={80}
              aria-label="Précise la zone"
              placeholder="Précise la zone, ex. cheville…"
              value={value.painNote}
              onChange={(e) => set({ painNote: e.target.value })}
            />
          )}
        </div>
      </fieldset>

      <p className="athlete-hint">
        Sert à calibrer tes charges de départ et à ne te proposer que des exercices faisables avec ton matériel.
      </p>
    </div>
  );
};
