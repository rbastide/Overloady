import { Injectable, Logger } from '@nestjs/common';

export interface AiWorkoutPromptContext {
  goal: string;
  weight?: number;
  height?: number;
  age?: number;
  benchmarks?: Record<string, any> | null;
  lastSession?: {
    title?: string;
    startedAt?: string;
    exercises: Array<{
      name: string;
      category?: string;
      maxWeight?: number;
      reps?: number;
    }>;
  } | null;
  availableExercises: Array<{
    id: string;
    name: string;
    category: string;
  }>;
}

export interface AiGeneratedExercise {
  name: string;
  category: string;
  reason: string;
  targetAdvice: string;
  sets: Array<{
    setNumber: number;
    weight: number;
    reps: number;
  }>;
}

export interface AiGeneratedWorkout {
  title: string;
  focusMuscle: string;
  rationale: string;
  coachingTips: string[];
  exercises: AiGeneratedExercise[];
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly apiUrl = 'https://text.pollinations.ai/';

  /**
   * Generates an intelligent workout recommendation using a free AI bodybuilding coach model.
   * Gracefully returns null if network fails or times out, allowing seamless fallback.
   */
  async generateWorkoutSession(context: AiWorkoutPromptContext): Promise<AiGeneratedWorkout | null> {
    const goal = (context.goal || 'BODYBUILDING').toUpperCase();
    const catalogNames = context.availableExercises.map((e) => e.name);

    const systemPrompt = `Tu es un préparateur physique certifié CSCS et coach expert en musculation et force.
Tu conçois une séance d'entraînement optimisée selon l'objectif de l'athlète (${goal}) et son historique (rotation musculaire Push/Pull/Legs).
Exercices autorisés disponibles dans l'application : ${catalogNames.join(', ')}.
Sélectionne 3 ou 4 exercices pertinents. Garde les explications courtes (1 phrase max par champ).

Tu dois répondre STRICTEMENT avec un objet JSON valide (aucun markdown, aucun outil) suivant ce schéma :
{
  "title": "Titre clair de la séance (ex: Séance Hypertrophie — Push Pectoraux & Triceps)",
  "focusMuscle": "Groupes musculaires ciblés",
  "rationale": "Courte explication tactique du coach (rotation, récupération, surcharge)",
  "coachingTips": [
    "Conseil d'activation ou d'échauffement",
    "Conseil de tempo ou exécution",
    "Conseil de récupération"
  ],
  "exercises": [
    {
      "name": "Nom exact choisi dans la liste des exercices autorisés",
      "category": "Catégorie (Pectoraux, Dos, Jambes, Épaules, Bras, Abdominaux)",
      "reason": "Raison courte du choix pour cet objectif",
      "targetAdvice": "Consignes de tempo, intensité et repos",
      "sets": [
        { "setNumber": 1, "weight": 60, "reps": 10 },
        { "setNumber": 2, "weight": 60, "reps": 10 },
        { "setNumber": 3, "weight": 60, "reps": 10 }
      ]
    }
  ]
}`;

    const userPrompt = `Profil athlète :
- Objectif sélectionné : ${goal}
- Poids corporel : ${context.weight ? `${context.weight} kg` : '75 kg'}
- Dernière séance : ${
      context.lastSession && context.lastSession.exercises.length > 0
        ? JSON.stringify(context.lastSession)
        : 'Aucune séance récente enregistrée'
    }
- Données de calibration issues de la Semaine Test : ${
      context.benchmarks && Object.keys(context.benchmarks).length > 0
        ? JSON.stringify(context.benchmarks)
        : 'Non testé'
    }

Génère la prochaine séance d'entraînement idéale au format JSON en calibrant les charges selon ces données.`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 28000);

    try {
      this.logger.log(`Requesting free AI workout generation for goal: ${goal}...`);
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          jsonMode: true,
          max_tokens: 1800,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        this.logger.warn(`AI Provider returned HTTP status: ${response.status}`);
        return null;
      }

      const rawText = await response.text();
      let cleanJson = rawText.trim();
      if (cleanJson.startsWith('```json')) {
        cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
      } else if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
      }

      const parsed: any = JSON.parse(cleanJson);

      if (!parsed || typeof parsed !== 'object') {
        this.logger.warn(`AI did not return a valid object: ${cleanJson.substring(0, 200)}`);
        return null;
      }

      // Check tool_calls, content, or direct object
      let rawObj: any = parsed;
      if (parsed.tool_calls && parsed.tool_calls[0]?.function?.arguments) {
        try {
          rawObj = JSON.parse(parsed.tool_calls[0].function.arguments);
        } catch (e) {}
      } else if (parsed.content) {
        try {
          rawObj = typeof parsed.content === 'string' ? JSON.parse(parsed.content) : parsed.content;
        } catch (e) {}
      }

      if (rawObj.workout) rawObj = rawObj.workout;
      if (rawObj.seance) rawObj = rawObj.seance;
      const title = rawObj.title || rawObj.nom || rawObj.name || `Séance ${goal}`;
      const exercises = rawObj.exercises || rawObj.exercices || rawObj.mouvements || [];
      const focusMuscle = rawObj.focusMuscle || rawObj.focus || rawObj.targetMuscle || 'Haut / Bas du corps';
      const rationale = rawObj.rationale || rawObj.description || rawObj.explication || 'Séance générée par Coach IA';
      const coachingTips = rawObj.coachingTips || rawObj.tips || rawObj.conseils || [];

      if (!Array.isArray(exercises) || exercises.length === 0) {
        this.logger.warn(`AI returned JSON without exercises array: ${cleanJson.substring(0, 300)}`);
        return null;
      }

      const formattedResult: AiGeneratedWorkout = {
        title,
        focusMuscle,
        rationale,
        coachingTips,
        exercises: exercises.map((ex: any) => ({
          name: ex.name || ex.nom || 'Exercice',
          category: ex.category || ex.categorie || 'Général',
          reason: ex.reason || ex.explication || 'Recommandé par votre coach IA',
          targetAdvice: ex.targetAdvice || ex.consigne || ex.advice || '',
          sets: Array.isArray(ex.sets) || Array.isArray(ex.series)
            ? (ex.sets || ex.series).map((s: any, idx: number) => ({
                setNumber: s.setNumber || s.serie || idx + 1,
                weight: Number(s.weight || s.poids || s.charge) || 20,
                reps: Number(s.reps || s.repetitions) || 10,
              }))
            : [
                { setNumber: 1, weight: 20, reps: 10 },
                { setNumber: 2, weight: 20, reps: 10 },
                { setNumber: 3, weight: 20, reps: 10 },
              ],
        })),
      };

      this.logger.log(`Successfully generated AI workout: "${formattedResult.title}" with ${formattedResult.exercises.length} exercises`);
      return formattedResult;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        this.logger.warn('AI workout request timed out (10s limit exceeded). Falling back to internal engine.');
      } else {
        this.logger.warn(`AI generation failed: ${err.message}. Falling back to internal engine.`);
      }
      return null;
    }
  }
}
