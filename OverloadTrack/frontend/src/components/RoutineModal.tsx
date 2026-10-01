import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api';

interface RoutineModalProps {
  isOpen: boolean;
  onClose: () => void;
  exercises: any[];
  onSuccess: (newRoutine: any) => void;
}

const MUSCLE_GROUPS = ['Pectoraux', 'Dos', 'Épaules', 'Bras', 'Jambes', 'Abdominaux'];
const MORE_PAGE_SIZE = 40;
const SEARCH_LIMIT = 80;

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

// The base catalog and the athlete's own exercises come first; the imported wger database is "more".
const isCommon = (ex: any) => ex.source !== 'wger';

export const RoutineModal: React.FC<RoutineModalProps> = ({ isOpen, onClose, exercises, onSuccess }) => {
  const [name, setName] = useState('');
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<string[]>([]);
  const [group, setGroup] = useState(MUSCLE_GROUPS[0]);
  const [search, setSearch] = useState('');
  const [moreLimit, setMoreLimit] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  const exerciseById = useMemo(() => new Map(exercises.map((ex) => [ex.id, ex])), [exercises]);

  const groups = useMemo(() => {
    const extra = Array.from(new Set(exercises.map((ex) => ex.category || 'Général'))).filter(
      (cat) => !MUSCLE_GROUPS.includes(cat),
    );
    return [...MUSCLE_GROUPS, ...extra];
  }, [exercises]);

  const groupExercises = useMemo(() => {
    const inGroup = exercises.filter((ex) => (ex.category || 'Général') === group);
    return { common: inGroup.filter(isCommon), more: inGroup.filter((ex) => !isCommon(ex)) };
  }, [exercises, group]);

  const searchResults = useMemo(() => {
    const query = normalize(search.trim());
    if (!query) return null;
    const matches = exercises.filter((ex) => normalize(ex.name).includes(query));
    return [...matches.filter(isCommon), ...matches.filter((ex) => !isCommon(ex))];
  }, [exercises, search]);

  useEffect(() => {
    if (pickerRef.current) pickerRef.current.scrollTop = 0;
  }, [group, search]);

  if (!isOpen) return null;

  const toggleExercise = (id: string) => {
    setError('');
    setSelectedExerciseIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const selectGroup = (groupName: string) => {
    setGroup(groupName);
    setSearch('');
    setMoreLimit(0);
  };

  const close = () => {
    setError('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Veuillez donner un nom à votre programme.');
      return;
    }
    if (selectedExerciseIds.length === 0) {
      setError('Veuillez sélectionner au moins un exercice.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await api.post('/routines', {
        name: name.trim(),
        exerciseIds: selectedExerciseIds,
      });
      onSuccess(res.data);
      setName('');
      setSelectedExerciseIds([]);
      setSearch('');
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la création de la routine');
    } finally {
      setLoading(false);
    }
  };

  const renderTile = (ex: any) => {
    const isSelected = selectedExerciseIds.includes(ex.id);
    return (
      <button
        type="button"
        key={ex.id}
        className={`routine-tile ${isSelected ? 'selected' : ''}`}
        onClick={() => toggleExercise(ex.id)}
        aria-pressed={isSelected}
      >
        <span className="routine-tile-name">{ex.name}</span>
        {searchResults && <span className="routine-tile-cat">{ex.category || 'Général'}</span>}
        <span className="routine-tile-check">{isSelected ? '✓' : '+'}</span>
      </button>
    );
  };

  const countInGroup = (groupName: string) =>
    selectedExerciseIds.filter((id) => (exerciseById.get(id)?.category || 'Général') === groupName).length;

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="glass-panel modal-card routine-modal" onClick={(e) => e.stopPropagation()}>
        <div className="flex-between" style={{ marginBottom: '1.25rem' }}>
          <h2>Créer un programme</h2>
          <button className="btn-icon" onClick={close} aria-label="Fermer">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nom du programme</label>
            <input
              type="text"
              className="input-glass"
              placeholder="Ex: Push Day (Pecs / Épaules / Triceps)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Ton programme ({selectedExerciseIds.length} exercice{selectedExerciseIds.length > 1 ? 's' : ''})</label>
            {selectedExerciseIds.length === 0 ? (
              <p className="routine-selected-empty">Choisis un groupe musculaire puis touche les exercices à ajouter.</p>
            ) : (
              <div className="routine-selected">
                {selectedExerciseIds.map((id) => (
                  <button type="button" key={id} className="routine-selected-chip" onClick={() => toggleExercise(id)}>
                    {exerciseById.get(id)?.name || 'Exercice'}
                    <span aria-label="Retirer">✕</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="form-group routine-browse">
            <label>Ajouter des exercices</label>
            <div className="routine-groups">
              {groups.map((g) => {
                const count = countInGroup(g);
                return (
                  <button
                    type="button"
                    key={g}
                    className={`routine-group ${!searchResults && group === g ? 'active' : ''}`}
                    onClick={() => selectGroup(g)}
                  >
                    <span>{g}</span>
                    {count > 0 && <span className="routine-group-count">{count}</span>}
                  </button>
                );
              })}
            </div>

            <input
              type="search"
              className="input-glass routine-search"
              placeholder="…ou rechercher un exercice par nom"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <div className="routine-picker" ref={pickerRef}>
              {searchResults ? (
                <>
                  <div className="routine-tiles">{searchResults.slice(0, SEARCH_LIMIT).map(renderTile)}</div>
                  {searchResults.length === 0 && <p className="routine-picker-note">Aucun exercice ne correspond.</p>}
                  {searchResults.length > SEARCH_LIMIT && (
                    <p className="routine-picker-note">
                      {searchResults.length - SEARCH_LIMIT} autres résultats : précise ta recherche.
                    </p>
                  )}
                </>
              ) : (
                <>
                  {groupExercises.common.length > 0 && (
                    <>
                      <div className="routine-picker-title">Exercices courants</div>
                      <div className="routine-tiles">{groupExercises.common.map(renderTile)}</div>
                    </>
                  )}
                  {groupExercises.more.length > 0 &&
                    (moreLimit === 0 ? (
                      <button type="button" className="btn-secondary routine-more" onClick={() => setMoreLimit(MORE_PAGE_SIZE)}>
                        Voir plus de variantes ({groupExercises.more.length})
                      </button>
                    ) : (
                      <>
                        <div className="routine-picker-title">Autres variantes</div>
                        <div className="routine-tiles">{groupExercises.more.slice(0, moreLimit).map(renderTile)}</div>
                        {groupExercises.more.length > moreLimit && (
                          <button
                            type="button"
                            className="btn-secondary routine-more"
                            onClick={() => setMoreLimit((l) => l + MORE_PAGE_SIZE)}
                          >
                            Afficher plus ({groupExercises.more.length - moreLimit} restants)
                          </button>
                        )}
                      </>
                    ))}
                </>
              )}
            </div>
          </div>

          {error && <div style={{ color: '#ff2a5f', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</div>}

          <button type="submit" className="btn-neon" style={{ width: '100%', marginTop: '0.5rem' }} disabled={loading}>
            {loading
              ? 'Enregistrement...'
              : `Enregistrer le programme${selectedExerciseIds.length ? ` (${selectedExerciseIds.length})` : ''}`}
          </button>
        </form>
      </div>
    </div>
  );
};
