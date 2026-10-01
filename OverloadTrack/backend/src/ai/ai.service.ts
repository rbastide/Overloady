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

export interface CoachChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CoachChatContext {
  goal: string;
  weight?: number;
  height?: number;
  benchmarks?: Record<string, any> | null;
  recentSessions: Array<{ date: string; title: string; exercises: string[] }>;
  availableExercises: string[];
  messages: CoachChatMessage[];
}

export interface CoachWorkoutDraft {
  title: string;
  focus: string;
  durationMin: number | null;
  notes: string;
  exercises: Array<{
    name: string;
    sets: number;
    reps: number;
    weight: number;
    rest: string;
    tip: string;
  }>;
}

export interface CoachChatReply {
  message: string;
  workouts: CoachWorkoutDraft[];
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly apiUrl = 'https://text.pollinations.ai/';
  /** Optional free Pollinations token (auth.pollinations.ai): lowers the rate limit from 15s to 5s. */
  private get apiToken(): string {
    return process.env.POLLINATIONS_TOKEN?.trim() || '';
  }
  /** Earliest time the next AI request may be sent (shared by all users of this server). */
  private nextSlotAt = 0;

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

    try {
      this.logger.log(`Requesting free AI workout generation for goal: ${goal}...`);
      const parsed = await this.requestJson(systemPrompt, [{ role: 'user', content: userPrompt }], 1800, 28000);
      if (!parsed) return null;

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
        this.logger.warn(`AI returned JSON without exercises array: ${JSON.stringify(parsed).substring(0, 300)}`);
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
      this.logger.warn(`AI generation failed: ${err.message}. Falling back to internal engine.`);
      return null;
    }
  }

  /**
   * Conversational coach: answers the athlete and, when relevant, designs one or several
   * complete sessions. Returns null when the AI provider is unavailable.
   */
  async coachChat(context: CoachChatContext): Promise<CoachChatReply | null> {
    const goal = (context.goal || 'BODYBUILDING').toUpperCase();

    const systemPrompt = `Tu es Atlas, le coach IA de l'application de musculation Overloady : préparateur physique expert (CSCS), direct et bienveillant. Tu tutoies l'athlète et réponds en français.
L'athlète te décrit ce qu'il veut : une séance, un programme de plusieurs séances, ou une modification d'une séance déjà proposée.
- Si la demande est claire, conçois la ou les séances demandées (une séance par jour d'entraînement demandé, 6 séances maximum).
- Si la demande est trop vague pour programmer quoi que ce soit, pose UNE question courte et renvoie "workouts": [].
- Pour modifier une séance déjà proposée, renvoie la version complète mise à jour.
- Choisis les exercices UNIQUEMENT dans cette liste, en recopiant le nom exact : ${context.availableExercises.join(', ')}.
- 4 à 7 exercices par séance selon la durée demandée. Charges en kg réalistes pour ce profil (0 pour le poids du corps), adaptées à l'objectif et aux records connus.
- Messages courts (3 phrases max), conseils de 1 phrase.

Réponds STRICTEMENT avec un objet JSON valide (aucun markdown) suivant ce schéma :
{
  "message": "Ta réponse à l'athlète",
  "workouts": [
    {
      "title": "Nom de la séance (ex: Push — Pectoraux, Épaules, Triceps)",
      "focus": "Groupes musculaires ciblés",
      "durationMin": 60,
      "notes": "Échauffement ou consigne générale en 1 phrase",
      "exercises": [
        { "name": "Nom exact de la liste", "sets": 4, "reps": 10, "weight": 60, "rest": "90s", "tip": "Consigne d'exécution" }
      ]
    }
  ]
}`;

    const profileNote = `[Profil athlète — objectif ${goal}, ${context.weight || 75} kg, ${context.height || 178} cm. Records connus : ${
      context.benchmarks && Object.keys(context.benchmarks).length > 0 ? JSON.stringify(context.benchmarks) : 'aucun'
    }. Dernières séances : ${
      context.recentSessions.length > 0
        ? context.recentSessions.map((s) => `${s.date} ${s.title} (${s.exercises.join(', ')})`).join(' ; ')
        : 'aucune'
    }]`;

    // The profile travels with the first user message so the conversation keeps a plain user/assistant shape.
    const messages = context.messages.map((m, idx) =>
      idx === 0 && m.role === 'user' ? { ...m, content: `${profileNote}\n\n${m.content}` } : m,
    );

    try {
      this.logger.log(`Coach chat request (${messages.length} messages, goal ${goal})`);
      const parsed = await this.requestJson(systemPrompt, messages, 3000, 60000);
      if (!parsed) return null;

      const rawWorkouts = Array.isArray(parsed.workouts) ? parsed.workouts : Array.isArray(parsed.seances) ? parsed.seances : [];
      const workouts: CoachWorkoutDraft[] = rawWorkouts
        .map((w: any) => ({
          title: String(w.title || w.nom || 'Séance'),
          focus: String(w.focus || w.focusMuscle || ''),
          durationMin: Number(w.durationMin || w.duree) || null,
          notes: String(w.notes || w.description || ''),
          exercises: (Array.isArray(w.exercises) ? w.exercises : w.exercices || [])
            .filter((ex: any) => ex && (ex.name || ex.nom))
            .map((ex: any) => ({
              name: String(ex.name || ex.nom),
              sets: Math.min(Math.max(Math.round(Number(ex.sets || ex.series)) || 3, 1), 10),
              reps: Math.min(Math.max(Math.round(Number(ex.reps || ex.repetitions)) || 10, 1), 100),
              weight: Math.max(Number(ex.weight ?? ex.poids ?? ex.charge) || 0, 0),
              rest: String(ex.rest || ex.repos || ''),
              tip: String(ex.tip || ex.conseil || ex.targetAdvice || ''),
            })),
        }))
        .filter((w: CoachWorkoutDraft) => w.exercises.length > 0)
        .slice(0, 6);

      const message = String(parsed.message || parsed.reponse || parsed.reply || '').trim();
      return {
        message: message || (workouts.length > 0 ? 'Voici ce que je te propose :' : 'Peux-tu préciser ce que tu veux travailler ?'),
        workouts,
      };
    } catch (err: any) {
      this.logger.warn(`Coach chat failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Calls the Pollinations text endpoint in JSON mode and returns the parsed object, or null when
   * the provider is unavailable within the time budget.
   * Pollinations allows one request per 15s anonymously (5s with a free POLLINATIONS_TOKEN), shared by
   * every user of this server: calls are spaced out locally, and a rate-limit answer is retried once.
   */
  private async requestJson(
    systemPrompt: string,
    messages: CoachChatMessage[],
    maxTokens: number,
    timeoutMs: number,
  ): Promise<any | null> {
    const deadline = Date.now() + timeoutMs;

    for (let attempt = 1; attempt <= 2; attempt++) {
      const slotWait = this.reserveSlot();
      if (Date.now() + slotWait + MIN_REQUEST_TIME_MS > deadline) {
        this.logger.warn('AI provider queue is too long for this request.');
        return null;
      }
      if (slotWait > 0) await sleep(slotWait);

      const result = await this.requestJsonOnce(systemPrompt, messages, maxTokens, deadline - Date.now());
      if (result.status === 'ok') return result.data;
      if (result.status === 'failed') return null;
      this.logger.warn('AI provider rate limit reached, retrying on the next slot...');
    }
    return null;
  }

  /** Books the next request slot and returns how long to wait for it (ms). */
  private reserveSlot(): number {
    const interval = this.apiToken ? SEED_TIER_INTERVAL_MS : ANONYMOUS_INTERVAL_MS;
    const now = Date.now();
    const start = Math.max(now, this.nextSlotAt);
    this.nextSlotAt = start + interval;
    return start - now;
  }

  private async requestJsonOnce(
    systemPrompt: string,
    messages: CoachChatMessage[],
    maxTokens: number,
    timeoutMs: number,
  ): Promise<{ status: 'ok'; data: any } | { status: 'retry' | 'failed' }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(this.apiToken ? { Authorization: `Bearer ${this.apiToken}` } : {}),
        },
        body: JSON.stringify({
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          jsonMode: true,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(`AI Provider returned HTTP status: ${response.status}`);
        const retryable = response.status === 402 || response.status === 429 || response.status >= 500;
        return { status: retryable ? 'retry' : 'failed' };
      }

      const rawText = await response.text();
      const parsed = parseJsonObject(rawText);
      if (!parsed) {
        this.logger.warn(`AI did not return a valid JSON object: ${rawText.substring(0, 200)}`);
        return { status: 'failed' };
      }
      return { status: 'ok', data: parsed };
    } catch (err: any) {
      this.logger.warn(
        err.name === 'AbortError' ? `AI request timed out after ${Math.round(timeoutMs / 1000)}s` : `AI request failed: ${err.message}`,
      );
      return { status: 'failed' };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

const ANONYMOUS_INTERVAL_MS = 15500;
const SEED_TIER_INTERVAL_MS = 5500;
const MIN_REQUEST_TIME_MS = 8000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Parses the model output as a JSON object, tolerating markdown fences and stray characters
 * around the object (the free models occasionally prefix the payload with garbage).
 */
function parseJsonObject(rawText: string): any | null {
  const text = rawText
    .trim()
    .replace(/^```(?:json)?\s*/, '')
    .replace(/```\s*$/, '')
    .trim();

  const tryParse = (candidate: string) => {
    try {
      const value = JSON.parse(candidate);
      return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    } catch {
      return null;
    }
  };

  const direct = tryParse(text);
  if (direct) return direct;

  // Retry from each opening brace, keeping the outermost object that parses.
  const end = text.lastIndexOf('}');
  for (let start = text.indexOf('{'); start !== -1 && start < end; start = text.indexOf('{', start + 1)) {
    const value = tryParse(text.slice(start, end + 1));
    if (value) return value;
  }
  return null;
}
