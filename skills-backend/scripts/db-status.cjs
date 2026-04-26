const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('\n=== DATABASE STATUS ===\n');

  // Topics
  const topics = await prisma.topics.findMany({
    select: { id: true, nameZh: true, status: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 10
  });
  console.log('TOPICS:');
  console.log(JSON.stringify(topics, null, 2));

  // Paper count
  const paperCount = await prisma.papers.count();
  console.log('\nPAPERS COUNT:', paperCount);

  // Node count
  const nodeCount = await prisma.research_nodes.count();
  console.log('NODES COUNT:', nodeCount);

  // Model configs
  const models = await prisma.model_configs.findMany();
  console.log('\nMODEL CONFIGS:');
  console.log(JSON.stringify(models, null, 2));

  // Figures count
  const figureCount = await prisma.figures.count();
  console.log('\nFIGURES COUNT:', figureCount);

  // Tables count
  const tableCount = await prisma.tables.count();
  console.log('TABLES COUNT:', tableCount);

  // Formulas count
  const formulaCount = await prisma.formulas.count();
  console.log('FORMULAS COUNT:', formulaCount);

  // Research sessions
  const sessions = await prisma.research_sessions.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log('\nRESEARCH SESSIONS:');
  console.log(JSON.stringify(sessions, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
