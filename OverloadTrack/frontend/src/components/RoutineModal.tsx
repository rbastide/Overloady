import React, { useState } from 'react';
import api from '../api';

interface RoutineModalProps {
  isOpen: boolean;
  onClose: () => void;
  exercises: any[];
  onSuccess: (newRoutine: any) => void;
}

export const RoutineModal: React.FC<RoutineModalProps> = ({ isOpen, onClose, exercises, onSuccess }) => {
  const [name, setName] = useState('');
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const toggleExercise = (id: string) => {
    if (selectedExerciseIds.includes(id)) {
      setSelectedExerciseIds(selectedExerciseIds.filter((x) => x !== id));
    } else {
      setSelectedExerciseIds([...selectedExerciseIds, id]);
    }
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

  const filteredExercises = exercises.filter((ex) =>
    ex.name.toLowerCase().includes(search.toLowerCase()) ||
    (ex.category && ex.category.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="glass-panel modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex-between" style={{ marginBottom: '1.5rem' }}>
          <h2>Créer un Programme / Routine</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
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
            <div className="flex-between" style={{ marginBottom: '0.5rem' }}>
              <label style={{ margin: 0 }}>Sélectionner les exercices ({selectedExerciseIds.length})</label>
            </div>
            <input 
              type="text" 
              className="input-glass" 
              placeholder="Filtrer les exercices..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ marginBottom: '0.75rem' }}
            />

            <div className="exercise-picker-list" style={{ maxHeight: '220px', overflowY: 'auto' }}>
              {filteredExercises.map((ex) => {
                const isSelected = selectedExerciseIds.includes(ex.id);
                return (
                  <div 
                    key={ex.id} 
                    className={`exercise-picker-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleExercise(ex.id)}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{ex.name}</div>
                      <span className="badge-category" style={{ fontSize: '0.75rem' }}>{ex.category || 'Général'}</span>
                    </div>
                    <span style={{ fontSize: '1.2rem', color: isSelected ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                      {isSelected ? '✓' : '+'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {error && <div style={{ color: '#ff2a5f', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</div>}

          <button type="submit" className="btn-neon" style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
            {loading ? 'Enregistrement...' : 'Enregistrer le programme'}
          </button>
        </form>
      </div>
    </div>
  );
};
