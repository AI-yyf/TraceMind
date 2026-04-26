const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const n = await prisma.research_nodes.findUnique({
    where: { id: 'autonomous-driving:stage-2:1912.12294' },
    select: { id: true, fullArticleFlow: true }
  });

  if (!n || !n.fullArticleFlow) {
    console.log('No fullArticleFlow found');
    await prisma.$disconnect();
    return;
  }

  const parsed = JSON.parse(n.fullArticleFlow);
  const flow = parsed.flow;
  const paperBlocks = flow.filter(b => b.type === 'paper-article');

  console.log('Total blocks:', flow.length);
  console.log('Paper blocks:', paperBlocks.length);

  paperBlocks.forEach((b, i) => {
    console.log(`  Paper ${i + 1}: contentVersion=${b.contentVersion}, hasCoreThesis=${!!b.coreThesis}, hasParagraphs=${!!b.paragraphs}, paragraphsCount=${b.paragraphs ? b.paragraphs.length : 0}, hasClosingInsight=${!!b.closingInsight}`);
    if (b.coreThesis) {
      console.log(`    coreThesis: ${b.coreThesis.slice(0, 100)}`);
    }
    if (b.paragraphs && b.paragraphs.length > 0) {
      b.paragraphs.forEach((p, j) => {
        console.log(`    paragraph[${j}]: role=${p.role}, content=${String(p.content).slice(0, 80)}`);
      });
    }
    if (b.closingInsight) {
      console.log(`    closingInsight: ${b.closingInsight.slice(0, 100)}`);
    }
  });

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); prisma.$disconnect(); });
