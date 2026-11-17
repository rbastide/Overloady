import { SetType } from '@prisma/client';
import { LoggedLift, summarizeOverload } from './overload-summary';

const NOW = new Date('2026-10-25T10:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
const lift = (exerciseId: string, days: number, weight: number, reps: number, extra: Partial<LoggedLift> = {}): LoggedLift => ({
  date: daysAgo(days),
  exerciseId,
  name: exerciseId,
  sets: [{ weight, reps, completed: true, type: SetType.normal }],
  ...extra,
});

describe('summarizeOverload', () => {
  it('reads a short week as no drop: every load went up', () => {
    // Three sessions the week before, two this week: the weekly tonnage fell, the loads did not
    const summary = summarizeOverload(
      [
        lift('Squat', 20, 60, 8),
        lift('Bench', 18, 50, 8),
        lift('Row', 16, 40, 10),
        lift('Squat', 3, 62.5, 8),
        lift('Bench', 1, 52.5, 8),
      ],
      NOW,
    );
    // The bench gained more for its load (+5 %) than the squat (+4 %): it leads
    expect(summary).toEqual({ windowDays: 28, tracked: 2, progressing: ['Bench', 'Squat'], declining: [], trend: 'up' });
  });

  it('counts more reps at the same load as progress, fewer reps as no drop', () => {
    const summary = summarizeOverload(
      [lift('Curl', 14, 12, 10), lift('Curl', 2, 12, 11), lift('Press', 14, 14, 10), lift('Press', 2, 14, 9)],
      NOW,
    );
    expect(summary.progressing).toEqual(['Curl']);
    expect(summary.declining).toEqual([]);
    expect(summary.trend).toBe('up');
  });

  it('names a real load drop and reads down only when drops outnumber gains', () => {
    const summary = summarizeOverload(
      [lift('Bench', 20, 52.5, 8), lift('Bench', 2, 50, 8), lift('Squat', 20, 60, 8), lift('Squat', 2, 60, 8)],
      NOW,
    );
    expect(summary.declining).toEqual([{ name: 'Bench', delta: -2.5 }]);
    expect(summary.trend).toBe('down');
  });

  it('ignores warm-ups, unfinished sets and sessions out of the window', () => {
    const summary = summarizeOverload(
      [
        lift('Squat', 40, 100, 5),
        lift('Squat', 10, 60, 8, {
          sets: [
            { weight: 100, reps: 3, completed: true, type: SetType.warmup },
            { weight: 60, reps: 8, completed: true, type: SetType.normal },
          ],
        }),
        lift('Squat', 2, 62.5, 8, {
          sets: [
            { weight: 62.5, reps: 8, completed: true, type: SetType.normal },
            { weight: 80, reps: 8, completed: false, type: SetType.normal },
          ],
        }),
      ],
      NOW,
    );
    expect(summary.tracked).toBe(1);
    expect(summary.progressing).toEqual(['Squat']);
  });

  it('reads one session as one, even with the movement logged twice in it', () => {
    const session = daysAgo(2);
    const summary = summarizeOverload(
      [lift('Squat', 2, 100, 5, { date: session }), lift('Squat', 2, 80, 8, { date: session })],
      NOW,
    );
    expect(summary).toMatchObject({ tracked: 0, declining: [], trend: null });
  });

  it('reads flat when gains and load drops are as many', () => {
    const summary = summarizeOverload(
      [lift('Bench', 20, 50, 8), lift('Bench', 2, 52.5, 8), lift('Squat', 20, 100, 5), lift('Squat', 2, 80, 5)],
      NOW,
    );
    expect(summary.trend).toBe('flat');
  });

  it('has no trend until a movement is trained twice in four weeks', () => {
    expect(summarizeOverload([lift('Squat', 2, 60, 8)], NOW)).toMatchObject({ tracked: 0, trend: null });
  });
});
