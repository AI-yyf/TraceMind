const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const paper = await prisma.papers.findUnique({
    where: { id: '1710.02410' },
    select: { id: true, pdfPath: true, title: true }
  });
  console.log(JSON.stringify(paper, null, 2));
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); prisma.$disconnect(); });
