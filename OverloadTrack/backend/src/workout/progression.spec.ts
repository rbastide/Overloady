import {
  Performance,
  detectEquipment,
  guardProposal,
  guardSets,
  maxIncrease,
  nextTarget,
  pauseFactor,
  startingTarget,
  topPerformance,
} from './progression';

const NOW = new Date('2026-10-25T10:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
const perf = (weight: number, reps: number, days = 4, extra: Partial<Performance> = {}): Performance => ({
  weight,
  reps,
  date: daysAgo(days),
  ...extra,
});

// Profile of the test panel account: intermediate, 74 kg, body fat unknown (calibrationLoadFactor ≈ 0.99)
const FACTOR = 0.99;
const BB = 'BODYBUILDING';

/** Atlas's proposal, guarded against the athlete's history. */
const guard = (name: string, proposed: { weight: number; reps: number }, last: Performance | null, known = []) =>
  guardProposal(proposed, name, { goal: BB, last, start: startingTarget(name, BB, known, FACTOR), now: NOW });

describe('panel case 1: Bicep Curl (Dumbbell) went from 12 to 30 kg', () => {
  const name = 'Bicep Curl (Dumbbell)';

  it('adds a rep at 12 kg below the top of the range', () => {
    expect(nextTarget(perf(12, 11), name, BB, NOW)).toMatchObject({ weight: 12, reps: 12, rule: 'reps' });
  });

  it('then moves up one 2 kg dumbbell step, reps back to the bottom', () => {
    expect(nextTarget(perf(12, 12), name, BB, NOW)).toMatchObject({ weight: 14, reps: 8, rule: 'load' });
  });

  it('caps a 30 kg proposal from Atlas at 14 kg', () => {
    expect(guard(name, { weight: 30, reps: 10 }, perf(12, 12)).weight).toBe(14);
  });
});

describe('panel case 2: Overhead Press (Dumbbell) went from 14 to 28 kg', () => {
  const name = 'Overhead Press (Dumbbell)';

  it('reads the load of one dumbbell', () => {
    expect(detectEquipment(name)).toBe('dumbbell');
    expect(maxIncrease(14, 'dumbbell')).toBe(2);
  });

  it('keeps 14 kg and adds a rep', () => {
    expect(nextTarget(perf(14, 11), name, BB, NOW)).toMatchObject({ weight: 14, reps: 12 });
  });

  it('caps a 28 kg proposal from Atlas at 16 kg', () => {
    expect(guard(name, { weight: 28, reps: 8 }, perf(14, 11)).weight).toBe(16);
  });
});

describe('panel case 3: Bench Press (Barbell) dropped from 52.5 to 50 kg with targets held', () => {
  const name = 'Bench Press (Barbell)';

  it('never lowers a load the athlete keeps lifting', () => {
    expect(nextTarget(perf(52.5, 10), name, BB, NOW)).toMatchObject({ weight: 52.5, reps: 11 });
  });

  it('raises a lower proposal from Atlas back to 52.5 kg', () => {
    expect(guard(name, { weight: 50, reps: 8 }, perf(52.5, 10, 5)).weight).toBe(52.5);
  });

  it('allows at most +5 kg on the bar in one session', () => {
    expect(guard(name, { weight: 70, reps: 8 }, perf(52.5, 10)).weight).toBe(57.5);
    expect(maxIncrease(52.5, 'barbell')).toBe(5);
  });
});

describe('panel case 4: after calibration, Deadlift 4 × 30 kg and Pull-up "30 kg" for a 74 kg intermediate', () => {
  const calibration = [
    { name: 'Romanian Deadlift', weight: 50, reps: 11 },
    { name: 'Squat (Barbell)', weight: 60, reps: 10 },
  ];

  it('starts the deadlift from the lifts already measured', () => {
    const start = startingTarget('Deadlift (Barbell)', BB, calibration, FACTOR);
    expect(start.weight).toBeGreaterThanOrEqual(50);
    expect(start.weight).toBeLessThanOrEqual(65);
    expect(start.note).toMatch(/Première fois/);
  });

  it('starts the deadlift from the reference loads without related lift', () => {
    const start = startingTarget('Deadlift (Barbell)', BB, [], FACTOR);
    expect(start.weight).toBeGreaterThanOrEqual(60);
    expect(start.weight).toBeLessThanOrEqual(75);
  });

  it('raises a 30 kg deadlift proposal from Atlas near the starting load', () => {
    expect(guard('Deadlift (Barbell)', { weight: 30, reps: 10 }, null, calibration as any).weight).toBeGreaterThanOrEqual(45);
  });

  it('keeps a pull-up done at bodyweight at bodyweight, one more rep', () => {
    const last = topPerformance('Pull-up', [{ weight: 0, reps: 8, completed: true, type: 'normal' }], daysAgo(4));
    expect(last).toMatchObject({ weight: 0, reps: 8 });
    expect(nextTarget(last!, 'Pull-up', BB, NOW)).toMatchObject({ weight: 0, reps: 9 });
  });

  it('turns a 30 kg pull-up proposal into bodyweight', () => {
    expect(guard('Pull-up', { weight: 30, reps: 10 }, perf(0, 8)).weight).toBe(0);
    expect(guard('Pull-up', { weight: 30, reps: 10 }, null).weight).toBe(0);
  });

  it('lets a belt grow by 2.5 kg at most when the athlete uses one', () => {
    expect(guard('Pull-up', { weight: 30, reps: 6 }, perf(10, 6)).weight).toBe(12.5);
  });
});

describe('break on a movement', () => {
  const name = 'Bench Press (Barbell)';

  it('keeps the load within the normal weekly rhythm', () => {
    expect(pauseFactor(7)).toBe(1);
    expect(pauseFactor(9)).toBe(1);
    expect(nextTarget(perf(52.5, 10, 8), name, BB, NOW).rule).toBe('reps');
  });

  it('lowers 10 % after about one week of break, and says so', () => {
    const target = nextTarget(perf(52.5, 10, 12), name, BB, NOW);
    expect(target).toMatchObject({ weight: 47.5, reps: 10, rule: 'pause' });
    expect(target.note).toMatch(/1 semaine de pause.*10 %/);
  });

  it('lowers 25 % after two weeks, 50 % after three or more', () => {
    expect(nextTarget(perf(80, 10, 18), name, BB, NOW).weight).toBe(60);
    expect(nextTarget(perf(80, 10, 30), name, BB, NOW).weight).toBe(40);
  });

  it('never goes under the empty bar', () => {
    expect(nextTarget(perf(25, 10, 40), name, BB, NOW).weight).toBe(20);
  });

  it('applies the same drop to a proposal from Atlas', () => {
    const guarded = guard(name, { weight: 55, reps: 10 }, perf(52.5, 10, 12));
    expect(guarded.weight).toBe(47.5);
    expect(guarded.note).toMatch(/pause/);
  });

  it('lowers the reps of bodyweight work instead', () => {
    expect(nextTarget(perf(0, 10, 30), 'Pull-up', BB, NOW)).toMatchObject({ weight: 0, reps: 5 });
  });
});

describe('guard-rails on Atlas, edge cases', () => {
  it('applies the break drop to a belt and to bodyweight reps', () => {
    expect(guard('Pull-up', { weight: 22.5, reps: 8 }, perf(20, 8, 30))).toMatchObject({ weight: 10 });
    expect(guard('Pull-up', { weight: 0, reps: 12 }, perf(0, 12, 30))).toMatchObject({ weight: 0, reps: 6 });
  });

  it('keeps the belt of a movement still trained', () => {
    expect(guard('Dips (Chest / Triceps)', { weight: 0, reps: 10 }, perf(15, 10)).weight).toBe(15);
  });

  it('holds the load after a set to failure or an all-out session', () => {
    expect(guard('Bench Press (Barbell)', { weight: 57.5, reps: 10 }, perf(52.5, 10, 4, { failure: true })).weight).toBe(52.5);
    expect(guard('Bench Press (Barbell)', { weight: 57.5, reps: 10 }, perf(52.5, 10, 4, { rpe: 10 })).weight).toBe(52.5);
  });

  it('takes the starting load itself when Atlas gives none', () => {
    const start = startingTarget('Leg Press', BB, [], FACTOR);
    expect(guard('Leg Press', { weight: 0, reps: 10 }, null).weight).toBe(start.weight);
  });

  it('keeps back-off sets lighter than the guarded top set', () => {
    const name = 'Squat (Barbell)';
    const last = perf(100, 5);
    const { sets } = guardSets(
      [
        { weight: 102.5, reps: 5 },
        { weight: 85, reps: 8 },
        { weight: 85, reps: 8 },
      ],
      name,
      { goal: BB, last, start: startingTarget(name, BB, [], FACTOR), now: NOW },
    );
    expect(sets[0].weight).toBe(102.5);
    expect(sets[1].weight).toBe(85);
    expect(sets[2].weight).toBe(85);
  });

  it('scales every set when the top set is capped', () => {
    const name = 'Bicep Curl (Dumbbell)';
    const { sets } = guardSets(
      [
        { weight: 30, reps: 10 },
        { weight: 24, reps: 12 },
      ],
      name,
      { goal: BB, last: perf(12, 12), start: startingTarget(name, BB, [], FACTOR), now: NOW },
    );
    expect(sets.map((s) => s.weight)).toEqual([14, 12]);
  });
});

describe('other rules', () => {
  it('holds a set taken to failure', () => {
    expect(nextTarget(perf(60, 8, 4, { failure: true }), 'Squat (Barbell)', BB, NOW)).toMatchObject({ weight: 60, reps: 8 });
  });

  it('holds after an all-out session (RPE 10)', () => {
    expect(nextTarget(perf(60, 12, 4, { rpe: 10 }), 'Squat (Barbell)', BB, NOW)).toMatchObject({ weight: 60, reps: 12 });
  });

  it('keeps endurance loads stable instead of shrinking them each session', () => {
    expect(nextTarget(perf(40, 15), 'Bench Press (Barbell)', 'ENDURANCE', NOW)).toMatchObject({ weight: 40, reps: 16 });
  });

  it('follows the strength range', () => {
    expect(nextTarget(perf(80, 5), 'Squat (Barbell)', 'FORCE', NOW)).toMatchObject({ weight: 82.5, reps: 3 });
  });

  it('allows two machine steps on heavy stacks', () => {
    expect(maxIncrease(100, 'machine')).toBe(10);
    expect(maxIncrease(30, 'machine')).toBe(5);
  });

  it('moves to the next load of the grid from an odd one', () => {
    expect(nextTarget(perf(12.5, 12), 'Bicep Curl (Dumbbell)', BB, NOW).weight).toBe(14);
    expect(nextTarget(perf(15, 12), 'Bicep Curl (Dumbbell)', BB, NOW).weight).toBe(16);
    expect(nextTarget(perf(42, 12), 'Incline Bench Press (Barbell)', BB, NOW).weight).toBe(42.5);
  });

  it('leaves warm-up and drop sets out of the last performance', () => {
    const last = topPerformance(
      'Bench Press (Barbell)',
      [
        { weight: 40, reps: 10, completed: true, type: 'warmup' },
        { weight: 52.5, reps: 10, completed: true, type: 'normal' },
        { weight: 60, reps: 3, completed: true, type: 'drop' },
        { weight: 70, reps: 1, completed: false, type: 'normal' },
      ],
      daysAgo(3),
    );
    expect(last).toMatchObject({ weight: 52.5, reps: 10 });
  });
});
