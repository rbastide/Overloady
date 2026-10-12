import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createNameMatcher } from '../lib/exerciseSearch';
import { Icon } from './Icons';
import { MUSCLE_GROUPS, muscleGroupsOf } from '../lib/muscleGroups';

const MORE_PAGE_SIZE = 40;
const SEARCH_LIMIT = 80;

// The base catalog and the athlete's own exercises come first; the imported wger database is "more".
const isCommon = (ex: any) => ex.source !== 'wger';

interface ExercisePickerProps {
  exercises: any[];
  /** Exercises already chosen: shown checked and counted on their muscle group. */
  selectedIds: string[];
  onPick: (exercise: any) => void;
  searchInputRef?: React.Ref<HTMLInputElement>;
}

/** Browse the library by muscle group, or search it by name in French or English. */
export const ExercisePicker: React.FC<ExercisePickerProps> = ({ exercises, selectedIds, onPick, searchInputRef }) => {
  const [group, setGroup] = useState(MUSCLE_GROUPS[0]);
  const [search, setSearch] = useState('');
  const [moreLimit, setMoreLimit] = useState(0);
  const pickerRef = useRef<HTMLDivElement>(null);

  const exerciseById = useMemo(() => new Map(exercises.map((ex) => [ex.id, ex])), [exercises]);
  const groups = useMemo(() => muscleGroupsOf(exercises), [exercises]);

  const groupExercises = useMemo(() => {
    const inGroup = exercises.filter((ex) => (ex.category || 'Général') === group);
    return { common: inGroup.filter(isCommon), more: inGroup.filter((ex) => !isCommon(ex)) };
  }, [exercises, group]);

  const searchResults = useMemo(() => {
    const matches = createNameMatcher(search);
    if (!matches) return null;
    const found = exercises.filter((ex) => matches(ex.name));
    return [...found.filter(isCommon), ...found.filter((ex) => !isCommon(ex))];
  }, [exercises, search]);

  useEffect(() => {
    if (pickerRef.current) pickerRef.current.scrollTop = 0;
  }, [group, search]);

  const selectGroup = (groupName: string) => {
    setGroup(groupName);
    setSearch('');
    setMoreLimit(0);
  };

  const countInGroup = (groupName: string) =>
    selectedIds.filter((id) => (exerciseById.get(id)?.category || 'Général') === groupName).length;

  const renderTile = (ex: any) => {
    const isSelected = selectedIds.includes(ex.id);
    return (
      <button
        type="button"
        key={ex.id}
        className={`routine-tile ${isSelected ? 'selected' : ''}`}
        onClick={() => onPick(ex)}
        aria-pressed={isSelected}
      >
        <span className="routine-tile-name">{ex.name}</span>
        {searchResults && <span className="routine-tile-cat">{ex.category || 'Général'}</span>}
        <span className="routine-tile-check" aria-hidden="true">
          <Icon name={isSelected ? 'check' : 'plus'} size={15} strokeWidth={isSelected ? 2.6 : 2} />
        </span>
      </button>
    );
  };

  return (
    <>
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
        ref={searchInputRef}
        type="search"
        className="input-glass routine-search"
        placeholder="Rechercher, en français ou en anglais"
        aria-label="Rechercher un exercice"
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
    </>
  );
};
