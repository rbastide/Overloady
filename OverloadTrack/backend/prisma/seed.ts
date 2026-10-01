import { PrismaClient } from '@prisma/client';
import { importWgerExercises, syncLocalCatalog } from '../src/exercise/exercise-sync';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');
  const added = await syncLocalCatalog(prisma);
  console.log(`Local catalog: ${added} exercises added`);

  const { fetched, imported } = await importWgerExercises(prisma);
  console.log(`wger: ${imported} new exercises imported (${fetched} fetched)`);
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
