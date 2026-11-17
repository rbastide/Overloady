export interface CatalogExercise {
  /** English name: the stable key the engine reads (equipment, pains, templates). Never renamed. */
  name: string;
  category: string;
  /** Name shown to the athlete. */
  nameFr: string;
  /** A duplicate of another entry: kept for history, listed behind "Voir plus de variantes". */
  variant?: boolean;
  /** wger exercise whose picture illustrates this movement. */
  wgerImage?: number;
}

// Built-in exercise library. The first 15 are the original defaults (their names are
// referenced by the workout recommendation templates), the rest come from the Hevy export.
export const DEFAULT_EXERCISES: CatalogExercise[] = [
  { name: 'Bench Press (Barbell)', category: 'Pectoraux', nameFr: 'Développé couché (barre)', wgerImage: 73 },
  { name: 'Squat (Barbell)', category: 'Jambes', nameFr: 'Squat (barre)', wgerImage: 1801 },
  { name: 'Deadlift (Barbell)', category: 'Dos', nameFr: 'Soulevé de terre (barre)', wgerImage: 184 },
  { name: 'Overhead Press (Dumbbell)', category: 'Épaules', nameFr: 'Développé militaire (haltères)', wgerImage: 567 },
  { name: 'Pull-up', category: 'Dos', nameFr: 'Traction', wgerImage: 475 },
  { name: 'Barbell Row', category: 'Dos', nameFr: 'Rowing barre', wgerImage: 83 },
  { name: 'Leg Press', category: 'Jambes', nameFr: 'Presse à cuisses', wgerImage: 371 },
  { name: 'Bicep Curl (Dumbbell)', category: 'Bras', nameFr: 'Curl biceps (haltères)', wgerImage: 92 },
  { name: 'Tricep Extension (Cable)', category: 'Bras', nameFr: 'Extension triceps (poulie)', wgerImage: 659 },
  { name: 'Lat Pulldown (Cable)', category: 'Dos', nameFr: 'Tirage vertical (poulie)' },
  { name: 'Incline Dumbbell Press', category: 'Pectoraux', nameFr: 'Développé incliné (haltères)', wgerImage: 537 },
  { name: 'Romanian Deadlift', category: 'Jambes', nameFr: 'Soulevé de terre roumain', wgerImage: 507 },
  { name: 'Lateral Raise (Dumbbell)', category: 'Épaules', nameFr: 'Élévation latérale (haltères)', wgerImage: 348 },
  { name: 'Dips (Chest / Triceps)', category: 'Pectoraux', nameFr: 'Dips (pectoraux / triceps)', wgerImage: 194 },
  { name: 'Cable Crunch / Abs', category: 'Abdominaux', nameFr: 'Crunch à la poulie' },

  // Pectoraux
  { name: 'Bench Press (Dumbbell)', category: 'Pectoraux', nameFr: 'Développé couché (haltères)', wgerImage: 75 },
  { name: 'Bench Press - Close Grip (Barbell)', category: 'Pectoraux', nameFr: 'Développé couché prise serrée (barre)', wgerImage: 76 },
  { name: 'Incline Bench Press (Barbell)', category: 'Pectoraux', nameFr: 'Développé incliné (barre)', wgerImage: 538 },
  { name: 'Incline Bench Press (Dumbbell)', category: 'Pectoraux', nameFr: 'Développé incliné (haltères)', variant: true, wgerImage: 537 },
  { name: 'Incline Bench Press (Smith Machine)', category: 'Pectoraux', nameFr: 'Développé incliné (barre guidée)', wgerImage: 925 },
  { name: 'Chest Press (Machine)', category: 'Pectoraux', nameFr: 'Développé pectoraux (machine)', wgerImage: 129 },
  { name: 'Incline Chest Press (Machine)', category: 'Pectoraux', nameFr: 'Développé incliné (machine)' },
  { name: 'Iso-Lateral Chest Press (Machine)', category: 'Pectoraux', nameFr: 'Développé pectoraux unilatéral (machine)' },
  { name: 'Butterfly (Pec Deck)', category: 'Pectoraux', nameFr: 'Écarté à la machine (pec deck)', wgerImage: 135 },
  { name: 'Pullover (Dumbbell)', category: 'Pectoraux', nameFr: 'Pull-over (haltère)', wgerImage: 161 },

  // Dos
  { name: 'Pull Up', category: 'Dos', nameFr: 'Traction', variant: true, wgerImage: 475 },
  { name: 'Pull Up (Band)', category: 'Dos', nameFr: 'Traction (élastique)' },
  { name: 'Chin Up (Assisted)', category: 'Dos', nameFr: 'Traction supination (assistée)', wgerImage: 152 },
  { name: 'Lat Pulldown (Machine)', category: 'Dos', nameFr: 'Tirage vertical (machine)' },
  { name: 'Lat Pulldown - Close Grip (Cable)', category: 'Dos', nameFr: 'Tirage vertical prise serrée (poulie)', wgerImage: 158 },
  { name: 'Reverse Grip Lat Pulldown (Cable)', category: 'Dos', nameFr: 'Tirage vertical supination (poulie)', wgerImage: 1127 },
  { name: 'Straight Arm Lat Pulldown (Cable)', category: 'Dos', nameFr: 'Tirage bras tendus (poulie)', wgerImage: 1726 },
  { name: 'Seated Row (Machine)', category: 'Dos', nameFr: 'Rowing assis (machine)', wgerImage: 1725 },
  { name: 'Seated Cable Row - V Grip (Cable)', category: 'Dos', nameFr: 'Tirage horizontal prise en V (poulie)', wgerImage: 1117 },
  { name: 'Single Arm Cable Row', category: 'Dos', nameFr: 'Rowing unilatéral (poulie)', wgerImage: 1621 },
  { name: 'Iso-Lateral Row (Machine)', category: 'Dos', nameFr: 'Rowing unilatéral (machine)' },
  { name: 'Iso-Lateral High Row (Machine)', category: 'Dos', nameFr: 'Rowing haut unilatéral (machine)' },
  { name: 'Bent Over Row (Barbell)', category: 'Dos', nameFr: 'Rowing barre', variant: true, wgerImage: 83 },
  { name: 'Dumbbell Row', category: 'Dos', nameFr: 'Rowing haltère', wgerImage: 81 },
  { name: 'Back Extension (Weighted Hyperextension)', category: 'Dos', nameFr: 'Extension lombaire lestée', wgerImage: 301 },

  // Épaules
  { name: 'Shoulder Press (Dumbbell)', category: 'Épaules', nameFr: 'Développé militaire (haltères)', variant: true, wgerImage: 567 },
  { name: 'Seated Shoulder Press (Machine)', category: 'Épaules', nameFr: 'Développé épaules assis (machine)', wgerImage: 543 },
  { name: 'Arnold Press (Dumbbell)', category: 'Épaules', nameFr: 'Développé Arnold (haltères)' },
  { name: 'Lateral Raise (Cable)', category: 'Épaules', nameFr: 'Élévation latérale (poulie)', wgerImage: 1378 },
  { name: 'Single Arm Lateral Raise (Cable)', category: 'Épaules', nameFr: 'Élévation latérale unilatérale (poulie)', wgerImage: 1378 },
  { name: 'Rear Delt Reverse Fly (Cable)', category: 'Épaules', nameFr: 'Oiseau (poulie)', wgerImage: 822 },
  { name: 'Rear Delt Reverse Fly (Machine)', category: 'Épaules', nameFr: 'Oiseau (machine)' },
  { name: 'Reverse Fly Single Arm (Cable)', category: 'Épaules', nameFr: 'Oiseau unilatéral (poulie)', wgerImage: 822 },
  { name: 'Chest Supported Reverse Fly (Dumbbell)', category: 'Épaules', nameFr: 'Oiseau buste appuyé (haltères)', wgerImage: 828 },
  { name: 'Chest Supported Y Raise (Dumbbell)', category: 'Épaules', nameFr: 'Élévation en Y buste appuyé (haltères)' },
  { name: 'Face Pull', category: 'Épaules', nameFr: 'Tirage visage (face pull)' },

  // Bras (biceps, triceps, avant-bras)
  { name: 'Bicep Curl (Cable)', category: 'Bras', nameFr: 'Curl biceps (poulie)', wgerImage: 95 },
  { name: 'Bayesian curl (poulie)', category: 'Bras', nameFr: 'Curl bayésien (poulie)' },
  { name: 'Hammer Curl (Cable)', category: 'Bras', nameFr: 'Curl marteau (poulie)', wgerImage: 275 },
  { name: 'Hammer Curl (Dumbbell)', category: 'Bras', nameFr: 'Curl marteau (haltères)', wgerImage: 272 },
  { name: 'Seated Incline Curl (Dumbbell)', category: 'Bras', nameFr: 'Curl incliné assis (haltères)', wgerImage: 204 },
  { name: 'Preacher Curl (Machine)', category: 'Bras', nameFr: 'Curl pupitre (machine)', wgerImage: 465 },
  { name: 'Spider Curl (Barbell)', category: 'Bras', nameFr: 'Curl araignée (barre)' },
  { name: 'EZ Bar Biceps Curl', category: 'Bras', nameFr: 'Curl biceps (barre EZ)', wgerImage: 94 },
  { name: 'Reverse Curl (Barbell)', category: 'Bras', nameFr: 'Curl inversé (barre)', wgerImage: 1290 },
  { name: 'Triceps Pushdown', category: 'Bras', nameFr: 'Extension triceps à la poulie haute', wgerImage: 1185 },
  { name: 'Triceps Extension (Cable)', category: 'Bras', nameFr: 'Extension triceps (poulie)', variant: true, wgerImage: 659 },
  { name: 'Overhead Triceps Extension (Cable)', category: 'Bras', nameFr: 'Extension triceps au-dessus de la tête (poulie)', wgerImage: 1519 },
  { name: 'Skullcrusher (Barbell)', category: 'Bras', nameFr: 'Barre au front', wgerImage: 246 },
  { name: 'Triceps Dip', category: 'Bras', nameFr: 'Dips triceps', wgerImage: 197 },
  { name: 'Seated Palms Up Wrist Curl', category: 'Bras', nameFr: 'Flexion des poignets assis', wgerImage: 51 },
  { name: 'Seated Wrist Extension (Barbell)', category: 'Bras', nameFr: 'Extension des poignets assis (barre)' },
  { name: 'Behind the Back Wrist Curl (Barbell)', category: 'Bras', nameFr: 'Flexion des poignets derrière le dos (barre)' },

  // Jambes
  { name: 'Squat (Smith Machine)', category: 'Jambes', nameFr: 'Squat (barre guidée)', wgerImage: 1747 },
  { name: 'Hack Squat (Machine)', category: 'Jambes', nameFr: 'Hack squat (machine)', wgerImage: 375 },
  { name: 'Leg Press (Machine)', category: 'Jambes', nameFr: 'Presse à cuisses', variant: true, wgerImage: 371 },
  { name: 'Leg Extension (Machine)', category: 'Jambes', nameFr: 'Extension des jambes (machine)', wgerImage: 369 },
  { name: 'Seated Leg Curl (Machine)', category: 'Jambes', nameFr: 'Leg curl assis (machine)', wgerImage: 366 },
  { name: 'Lying Leg Curl (Machine)', category: 'Jambes', nameFr: 'Leg curl allongé (machine)', wgerImage: 365 },
  { name: 'Hip Abduction (Machine)', category: 'Jambes', nameFr: 'Abduction de hanche (machine)', wgerImage: 1748 },
  { name: 'Hip Adduction (Machine)', category: 'Jambes', nameFr: 'Adduction de hanche (machine)', wgerImage: 12 },
  { name: 'Romanian Deadlift (Barbell)', category: 'Jambes', nameFr: 'Soulevé de terre roumain', variant: true, wgerImage: 507 },
  { name: 'Romanian Deadlift (Dumbbell)', category: 'Jambes', nameFr: 'Soulevé de terre roumain (haltères)', wgerImage: 1652 },
  { name: 'Lunge (Barbell)', category: 'Jambes', nameFr: 'Fente (barre)', wgerImage: 984 },
  { name: 'Reverse Lunge (Barbell)', category: 'Jambes', nameFr: 'Fente arrière (barre)', wgerImage: 1830 },
  { name: 'Walking Lunge (Dumbbell)', category: 'Jambes', nameFr: 'Fente marchée (haltères)', wgerImage: 206 },

  // Abdominaux
  { name: 'Cable Crunch', category: 'Abdominaux', nameFr: 'Crunch à la poulie', variant: true },
  { name: 'Oblique crunch poulie', category: 'Abdominaux', nameFr: 'Crunch oblique à la poulie' },
  { name: 'Ab Wheel', category: 'Abdominaux', nameFr: 'Roue abdominale', wgerImage: 1573 },
  { name: 'Plank', category: 'Abdominaux', nameFr: 'Gainage', wgerImage: 458 },
  { name: 'Hanging Leg Raise', category: 'Abdominaux', nameFr: 'Relevé de jambes suspendu', wgerImage: 979 },
  { name: 'Hanging Knee Raise', category: 'Abdominaux', nameFr: 'Relevé de genoux suspendu', wgerImage: 978 },
  { name: 'Leg Raise Parallel Bars', category: 'Abdominaux', nameFr: 'Relevé de jambes aux barres parallèles' },
  { name: 'Knee Raise Parallel Bars', category: 'Abdominaux', nameFr: 'Relevé de genoux aux barres parallèles', wgerImage: 2674 },
];
