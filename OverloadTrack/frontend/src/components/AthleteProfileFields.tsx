import React from 'react';

export type ExperienceLevel = 'NONE' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export interface AthleteProfileValue {
  weight: string | number;
  height: string | number;
  experience: ExperienceLevel;
  bodyFat: string | number;
}

export const EXPERIENCE_OPTIONS: { id: ExperienceLevel; label: string; detail: string }[] = [
  { id: 'NONE', label: 'Jamais', detail: 'Je découvre la muscu' },
  { id: 'BEGINNER', label: 'Débutant', detail: "Moins d'1 an" },
  { id: 'INTERMEDIATE', label: 'Intermédiaire', detail: '1 à 3 ans' },
  { id: 'ADVANCED', label: 'Confirmé', detail: 'Plus de 3 ans' },
];

export const toAthleteProfileValue = (profile: any): AthleteProfileValue => ({
  weight: profile?.weight ?? '',
  height: profile?.height ?? '',
  experience: (profile?.experience as ExperienceLevel) || 'BEGINNER',
  bodyFat: profile?.bodyFat ?? '',
});

/** API payload: body fat stays optional (null clears it). */
export const toAthleteProfilePayload = (value: AthleteProfileValue) => ({
  weight: Number(value.weight) || undefined,
  height: Number(value.height) || undefined,
  experience: value.experience,
  bodyFat: value.bodyFat === '' || value.bodyFat === null ? null : Number(String(value.bodyFat).replace(',', '.')),
});

interface AthleteProfileFieldsProps {
  value: AthleteProfileValue;
  onChange: (value: AthleteProfileValue) => void;
  /** Field id prefix, so the component can appear twice on a page. */
  idPrefix: string;
}

export const AthleteProfileFields: React.FC<AthleteProfileFieldsProps> = ({ value, onChange, idPrefix }) => {
  const set = (patch: Partial<AthleteProfileValue>) => onChange({ ...value, ...patch });

  return (
    <div className="athlete-fields">
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

      <div className="athlete-field">
        <label>Expérience en musculation</label>
        <div className="athlete-experience" role="radiogroup">
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
      <p className="athlete-hint">
        Sert à calibrer tes charges de départ et le coach IA. Le body fat affine l'estimation de ta masse maigre.
      </p>
    </div>
  );
};
