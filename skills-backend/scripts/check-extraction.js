const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const fc = await prisma.formulas.count();
  const tc = await prisma.tables.count();
  const fic = await prisma.figures.count();
  console.log('Formulas:', fc, 'Tables:', tc, 'Figures:', fic);

  const adPapers = ['1604.07316', '1912.12294', '1710.02410', '1511.03791'];
  for (const pid of adPapers) {
    const f = await prisma.formulas.count({ where: { paperId: pid } });
    const t = await prisma.tables.count({ where: { paperId: pid } });
    const fi = await prisma.figures.count({ where: { paperId: pid } });
    console.log(pid + ': formulas=' + f + ' tables=' + t + ' figures=' + fi);
  }

  // Check top formula papers
  const topFormulaPapers = await prisma.formulas.groupBy({
    by: ['paperId'],
    _count: { paperId: true },
    orderBy: { _count: { paperId: 'desc' } },
    take: 5,
  });
  console.log('Top formula papers:', JSON.stringify(topFormulaPapers));
}

main().catch(console.error).finally(() => prisma.$disconnect());
