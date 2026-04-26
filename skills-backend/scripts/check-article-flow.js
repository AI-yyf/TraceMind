const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const n = await p.research_nodes.findUnique({
    where: { id: 'autonomous-driving:stage-2:1912.12294' },
    select: { id: true, fullArticleFlow: true }
  });
  console.log('fullArticleFlow exists:', !!n && !!n.fullArticleFlow);
  console.log('Length:', n && n.fullArticleFlow ? n.fullArticleFlow.length : 0);
  if (n && n.fullArticleFlow) {
    const parsed = JSON.parse(n.fullArticleFlow);
    console.log('Schema version:', parsed.schemaVersion);
    console.log('Flow entries:', parsed.flow ? parsed.flow.length : 0);
    console.log('Generated at:', parsed.generatedAt);
  }
  await p.$disconnect();
}
main().catch(e => { console.error(e); p.$disconnect(); });
