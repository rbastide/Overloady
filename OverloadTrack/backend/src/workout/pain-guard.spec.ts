import { DEFAULT_EXERCISES } from '../exercise/exercise-catalog';
import {
  PainReportBuilder,
  cautionLoad,
  checkMovement,
  painAreasInText,
  protocolMovement,
  safeReplacement,
  screenMovement,
  sensitiveAreas,
} from './pain-guard';

const POOL = DEFAULT_EXERCISES.map((e, i) => ({ id: String(i), ...e }));
const byName = (name: string) => POOL.find((e) => e.name === name)!;

describe('painAreasInText', () => {
  it('reads the knee in the test panel request', () => {
    expect(painAreasInText("Séance jambes 45 min, sans squat, j'ai mal au genou gauche")).toEqual(['KNEE']);
  });

  it('reads an area written before the pain word', () => {
    expect(painAreasInText('mon épaule droite me fait mal')).toEqual(['SHOULDER']);
    expect(painAreasInText('genou en vrac depuis lundi')).toEqual(['KNEE']);
  });

  it('reads the words that name a sore area on their own', () => {
    expect(painAreasInText('je sors d’une hernie discale')).toEqual(['BACK']);
  });

  it('reads a denied pain as no pain', () => {
    expect(painAreasInText("je n'ai plus mal au genou")).toEqual([]);
    expect(painAreasInText('pas mal au dos, ça va')).toEqual([]);
    expect(painAreasInText('séance sans douleur au genou')).toEqual([]);
  });

  it('does not take a muscle group for a pain', () => {
    expect(painAreasInText('Séance dos et biceps, 1 heure')).toEqual([]);
    expect(painAreasInText("Séance dos j'ai mal à l'épaule")).toEqual(['SHOULDER']);
  });

  it('adds the areas of the message to those of the profile', () => {
    expect(sensitiveAreas(['BACK', 'OTHER'], "j'ai mal au genou")).toEqual(['KNEE', 'BACK']);
  });
});

describe('checkMovement', () => {
  it('avoids lunges, squats and the leg press for a sore knee', () => {
    expect(checkMovement('Reverse Lunge (Barbell)', ['KNEE'])).toEqual({ status: 'avoid', area: 'KNEE', label: 'fente' });
    expect(checkMovement('Hack Squat (Machine)', ['KNEE'])).toMatchObject({ status: 'avoid', label: 'squat' });
    expect(checkMovement('Leg Press (Machine)', ['KNEE'])).toMatchObject({ status: 'avoid', label: 'presse à cuisses' });
  });

  it('keeps single-joint knee work, lighter', () => {
    expect(checkMovement('Leg Extension (Machine)', ['KNEE'])).toEqual({ status: 'caution', area: 'KNEE' });
    expect(checkMovement('Seated Leg Curl (Machine)', ['KNEE'])).toEqual({ status: 'caution', area: 'KNEE' });
    expect(checkMovement('Romanian Deadlift (Dumbbell)', ['KNEE'])).toEqual({ status: 'ok' });
  });

  it('avoids hinges and barbell squats for a sore back, not the machines', () => {
    expect(checkMovement('Romanian Deadlift', ['BACK'])).toMatchObject({ status: 'avoid', label: 'soulevé de terre' });
    expect(checkMovement('Bent Over Row (Barbell)', ['BACK'])).toMatchObject({ status: 'avoid' });
    expect(checkMovement('Squat (Barbell)', ['BACK'])).toMatchObject({ status: 'avoid', label: 'squat à la barre' });
    expect(checkMovement('Hack Squat (Machine)', ['BACK'])).toEqual({ status: 'ok' });
    expect(checkMovement('Seated Cable Row - V Grip (Cable)', ['BACK'])).toEqual({ status: 'ok' });
  });

  it('does not read a hamstring curl as arm work', () => {
    expect(checkMovement('Nordic Hamstring Curl', ['WRIST', 'ELBOW'])).toEqual({ status: 'ok' });
    expect(checkMovement('Hammer Curl (Cable)', ['ELBOW'])).toEqual({ status: 'caution', area: 'ELBOW' });
  });

  it('lets avoid win over caution when two areas meet', () => {
    expect(checkMovement('Leg Extension (Machine)', ['HIP', 'KNEE'])).toEqual({ status: 'caution', area: 'KNEE' });
    expect(checkMovement('Dips (Chest / Triceps)', ['ELBOW', 'SHOULDER'])).toMatchObject({ status: 'avoid' });
  });

  it('leaves everything open without a sensitive area', () => {
    expect(checkMovement('Reverse Lunge (Barbell)', [])).toEqual({ status: 'ok' });
  });
});

describe('safeReplacement', () => {
  it('swaps the reverse lunge for a safe leg movement of the catalogue', () => {
    const lunge = byName('Reverse Lunge (Barbell)');
    const swap = safeReplacement(lunge.name, lunge.category, POOL, ['KNEE'], new Set([lunge.id]));
    expect(swap).not.toBeNull();
    expect(swap!.category).toBe('Jambes');
    expect(checkMovement(swap!.name, ['KNEE']).status).toBe('ok');
  });

  it('never picks a movement already in the session', () => {
    const lunge = byName('Reverse Lunge (Barbell)');
    const first = safeReplacement(lunge.name, lunge.category, POOL, ['KNEE'], new Set([lunge.id]))!;
    const second = safeReplacement(lunge.name, lunge.category, POOL, ['KNEE'], new Set([lunge.id, first.id]))!;
    expect(second.id).not.toBe(first.id);
  });

  it('returns null when the group has nothing safe left', () => {
    const pool = [byName('Squat (Barbell)'), byName('Lunge (Barbell)')];
    expect(safeReplacement('Squat (Barbell)', 'Jambes', pool, ['KNEE'], new Set())).toBeNull();
  });
});

describe('cautionLoad', () => {
  it('takes about 20 % off on the equipment steps, never heavier', () => {
    expect(cautionLoad(40, 'Leg Extension (Machine)')).toBe(30);
    expect(cautionLoad(12, 'Lateral Raise (Dumbbell)')).toBe(10);
    expect(cautionLoad(5, 'Leg Extension (Machine)')).toBe(5);
    expect(cautionLoad(0, 'Pull Up')).toBe(0);
  });
});

describe('PainReportBuilder', () => {
  it('says once what was left out, and warns on careful movements', () => {
    const report = new PainReportBuilder();
    report.noteAvoided('fente', 'KNEE');
    report.noteAvoided('fente', 'KNEE');
    report.noteCaution('KNEE');
    const built = report.build();
    expect(built.avoided).toEqual(['Pas de fente : tu as signalé ton genou.']);
    expect(built.prevention).toMatch(/^Genou sensible/);
    expect(built.prevention).toMatch(/arrête/);
  });

  it('names what a leg session would have held, in one short sentence per area', () => {
    const report = new PainReportBuilder();
    report.noteRuledOut(['Jambes'], POOL, ['KNEE']);
    expect(report.build().avoided).toEqual(['Pas de fente ni de squat : tu as signalé ton genou.']);
    // Whatever order the database returns the catalogue in
    const reversed = new PainReportBuilder();
    reversed.noteRuledOut(['Jambes'], [...POOL].reverse(), ['KNEE']);
    expect(reversed.build().avoided).toEqual(['Pas de fente ni de squat : tu as signalé ton genou.']);
  });

  it('says the swapped movement before those only ruled out', () => {
    const report = new PainReportBuilder();
    report.noteAvoided('presse à cuisses', 'KNEE');
    report.noteRuledOut(['Jambes'], POOL, ['KNEE']);
    expect(report.build().avoided).toEqual(['Pas de presse à cuisses ni de fente : tu as signalé ton genou.']);
  });

  it('elides before a vowel and stays silent when the groups hold nothing to avoid', () => {
    const report = new PainReportBuilder();
    report.noteAvoided('extension du dos', 'BACK');
    report.noteRuledOut(['Pectoraux'], POOL, ['KNEE']);
    expect(report.build().avoided).toEqual(["Pas d'extension du dos : tu as signalé ton dos."]);
  });

  it('has no prevention line without careful movement', () => {
    expect(new PainReportBuilder().build()).toEqual({ avoided: [], prevention: null });
  });
});

describe('screenMovement', () => {
  it('swaps an avoided movement and says why', () => {
    const report = new PainReportBuilder();
    const lunge = byName('Reverse Lunge (Barbell)');
    const kept = screenMovement(lunge, ['KNEE'], POOL, new Set([lunge.id]), report);
    expect(kept!.exercise.id).not.toBe(lunge.id);
    expect(report.build().avoided).toEqual(['Pas de fente : tu as signalé ton genou.']);
  });

  it('keeps a careful movement and asks for prevention', () => {
    const report = new PainReportBuilder();
    const extension = byName('Leg Extension (Machine)');
    expect(screenMovement(extension, ['KNEE'], POOL, new Set(), report)).toEqual({ exercise: extension, careful: true });
    expect(report.build().prevention).not.toBeNull();
  });

  it('drops the movement when nothing safe is left in its group', () => {
    const squat = byName('Squat (Barbell)');
    expect(screenMovement(squat, ['KNEE'], [squat], new Set(), new PainReportBuilder())).toBeNull();
  });
});

describe('protocolMovement', () => {
  it('keeps a calibration squat for a sore knee, lighter and with the prevention line', () => {
    const report = new PainReportBuilder();
    expect(protocolMovement('Squat (Barbell)', 60, ['KNEE'], report)).toEqual({ weight: 47.5, careful: true });
    const built = report.build();
    expect(built.avoided).toEqual([]);
    expect(built.prevention).toMatch(/^Genou sensible/);
  });

  it('leaves the other movements of the protocol as they are', () => {
    const report = new PainReportBuilder();
    expect(protocolMovement('Bench Press (Barbell)', 60, ['KNEE'], report)).toEqual({ weight: 60, careful: false });
    expect(report.build().prevention).toBeNull();
  });
});
