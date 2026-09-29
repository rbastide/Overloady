import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const exercises = [
  { wgerId: 101, name: 'Bench Press (Barbell)', category: 'Pectoraux' },
  { wgerId: 102, name: 'Squat (Barbell)', category: 'Jambes' },
  { wgerId: 103, name: 'Deadlift (Barbell)', category: 'Dos' },
  { wgerId: 104, name: 'Overhead Press (Dumbbell)', category: 'Épaules' },
  { wgerId: 105, name: 'Pull-up', category: 'Dos' },
  { wgerId: 106, name: 'Barbell Row', category: 'Dos' },
  { wgerId: 107, name: 'Leg Press', category: 'Jambes' },
  { wgerId: 108, name: 'Bicep Curl (Dumbbell)', category: 'Bras' },
  { wgerId: 109, name: 'Tricep Extension (Cable)', category: 'Bras' },
  { wgerId: 110, name: 'Lat Pulldown (Cable)', category: 'Dos' },
  { wgerId: 111, name: 'Incline Dumbbell Press', category: 'Pectoraux' },
  { wgerId: 112, name: 'Romanian Deadlift', category: 'Jambes' },
  { wgerId: 113, name: 'Lateral Raise (Dumbbell)', category: 'Épaules' },
  { wgerId: 114, name: 'Dips (Chest / Triceps)', category: 'Pectoraux' },
  { wgerId: 115, name: 'Cable Crunch / Abs', category: 'Abdominaux' },
];

async function main() {
  console.log('Start seeding...');
  for (const ex of exercises) {
    const exercise = await prisma.exercise.upsert({
      where: { wgerId: ex.wgerId },
      update: {
        category: ex.category,
        name: ex.name,
      },
      create: {
        wgerId: ex.wgerId,
        name: ex.name,
        category: ex.category,
      },
    });
    console.log(`Exercise ready: ${exercise.name} [${exercise.category}]`);
  }
  console.log('Seeding finished.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
