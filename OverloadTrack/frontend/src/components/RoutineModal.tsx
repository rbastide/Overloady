import React, { useMemo, useState } from 'react';
import api from '../api';
import { Icon } from './Icons';
import { ExercisePicker } from './ExercisePicker';
import { muscleGroupsOf } from '../lib/muscleGroups';

interface RoutineModalProps {
  isOpen: boolean;
  onClose: () => void;
  exercises: any[];
  onSuccess: (newRoutine: any) => void;
}

export const RoutineModal: React.FC<RoutineModalProps> = ({ isOpen, onClose, exercises, onSuccess }) => {
  const [name, setName] = useState('');
  // Kept in the order the athlete adds them: it is the order of the program
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const exerciseById = useMemo(() => new Map(exercises.map((ex) => [ex.id, ex])), [exercises]);
  const groups = useMemo(() => muscleGroupsOf(exercises), [exercises]);

  if (!isOpen) return null;

  const toggleExercise = (id: string) => {
    setError('');
    setSelectedExerciseIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const moveExercise = (index: number, offset: -1 | 1) => {
    setSelectedExerciseIds((ids) => {
      const target = index + offset;
      if (target < 0 || target >= ids.length) return ids;
      const reordered = [...ids];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      return reordered;
    });
  };

  // Groups the exercises by muscle group, keeping the athlete's order inside each group
  const sortByMuscleGroup = () => {
    const groupRank = (id: string) => groups.indexOf(exerciseById.get(id)?.category || 'Général');
    setSelectedExerciseIds((ids) => [...ids].sort((a, b) => groupRank(a) - groupRank(b)));
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
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la création de la routine');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="glass-panel modal-card routine-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Créer un programme</h2>
          <button className="btn-icon" onClick={close} aria-label="Fermer">
            <Icon name="close" size={20} />
          </button>
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
            <div className="routine-order-head">
              <label>Ton programme ({selectedExerciseIds.length} exercice{selectedExerciseIds.length > 1 ? 's' : ''})</label>
              {selectedExerciseIds.length > 1 && (
                <button type="button" className="link-btn" onClick={sortByMuscleGroup}>
                  Trier par groupe musculaire
                </button>
              )}
            </div>
            {selectedExerciseIds.length === 0 ? (
              <p className="routine-selected-empty">
                Choisis un groupe musculaire puis touche les exercices dans l'ordre où tu veux les faire.
              </p>
            ) : (
              <ol className="routine-order">
                {selectedExerciseIds.map((id, index) => {
                  const ex = exerciseById.get(id);
                  return (
                    <li key={id} className="routine-order-row">
                      <span className="routine-order-num">{index + 1}</span>
                      <span className="routine-order-name">{ex?.name || 'Exercice'}</span>
                      <span className="badge-category">{ex?.category || 'Général'}</span>
                      <span className="routine-order-actions">
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => moveExercise(index, -1)}
                          disabled={index === 0}
                          aria-label={`Monter ${ex?.name || "l'exercice"}`}
                        >
                          <Icon name="chevronUp" size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => moveExercise(index, 1)}
                          disabled={index === selectedExerciseIds.length - 1}
                          aria-label={`Descendre ${ex?.name || "l'exercice"}`}
                        >
                          <Icon name="chevronDown" size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon is-danger"
                          onClick={() => toggleExercise(id)}
                          aria-label={`Retirer ${ex?.name || "l'exercice"}`}
                        >
                          <Icon name="close" size={16} />
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <div className="form-group routine-browse">
            <label>Ajouter des exercices</label>
            <ExercisePicker
              exercises={exercises}
              selectedIds={selectedExerciseIds}
              onPick={(ex) => toggleExercise(ex.id)}
            />
          </div>

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={loading}>
            {loading
              ? 'Enregistrement...'
              : `Enregistrer le programme${selectedExerciseIds.length ? ` (${selectedExerciseIds.length})` : ''}`}
          </button>
        </form>
      </div>
    </div>
  );
};
