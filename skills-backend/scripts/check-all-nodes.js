const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const nodes = await prisma.research_nodes.findMany({
    select: { id: true, fullArticleFlow: true }
  });

  console.log('Total nodes:', nodes.length);
  console.log('');

  let withContent = 0;
  let withoutContent = 0;

  for (const node of nodes) {
    if (node.fullArticleFlow) {
      withContent++;
      const parsed = JSON.parse(node.fullArticleFlow);
      const paperBlocks = (parsed.flow || []).filter(b => b.type === 'paper-article');
      const v2Count = paperBlocks.filter(b => b.contentVersion === 'v2').length;
      console.log(`✓ ${node.id}: ${paperBlocks.length} papers (${v2Count} v2)`);
    } else {
      withoutContent++;
      console.log(`✗ ${node.id}: NO CONTENT`);
    }
  }

  console.log('');
  console.log(`With content: ${withContent}`);
  console.log(`Without content: ${withoutContent}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); prisma.$disconnect(); });
