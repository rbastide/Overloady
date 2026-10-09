import React, { useState } from 'react';
import api from '../api';
import { Icon } from './Icons';

interface AddExerciseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newExercise: any) => void;
}

const CATEGORIES = [
  'Pectoraux',
  'Dos',
  'Jambes',
  'Épaules',
  'Bras',
  'Abdominaux',
  'Cardio / Général',
];

export const AddExerciseModal: React.FC<AddExerciseModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Pectoraux');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Veuillez renseigner un nom.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/exercises', { name: name.trim(), category });
      onSuccess(res.data);
      setName('');
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || "Erreur lors de l'ajout de l'exercice");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="glass-panel modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Nouvel Exercice</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Fermer">
            <Icon name="close" size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nom de l'exercice</label>
            <input 
              type="text" 
              className="input-glass" 
              placeholder="Ex: Développé incliné haltères" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Groupe musculaire / Catégorie</label>
            <select 
              className="input-glass"
              value={category} 
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Création...' : '+ Créer l\'exercice'}
          </button>
        </form>
      </div>
    </div>
  );
};
