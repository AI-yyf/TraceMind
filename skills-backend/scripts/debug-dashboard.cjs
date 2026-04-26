const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testDashboard() {
  const topicId = 'autonomous-driving';

  try {
    // 测试Dashboard核心查询
    const nodes = await prisma.research_nodes.findMany({
      where: { topicId },
      include: {
        node_papers: {
          include: {
            papers: {
              select: {
                id: true,
                title: true,
                titleZh: true,
                titleEn: true,
                summary: true,
                authors: true,
                citationCount: true,
                published: true
              }
            }
          }
        }
      },
      orderBy: { stageIndex: 'asc' }
    });

    console.log('Nodes:', nodes.length);

    if (nodes.length > 0) {
      const node = nodes[0];
      console.log('First node:', node.nodeLabel);
      console.log('node_papers:', node.node_papers.length);

      // 测试可能的错误源
      const parseStringArray = (value) => {
        if (!value) return [];
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return value.split(/[;,]/).map(s => s.trim()).filter(Boolean);
        }
      };

      if (node.node_papers.length > 0) {
        const paper = node.node_papers[0].papers;
        console.log('Paper authors field:', paper.authors);
        console.log('Parsed authors:', parseStringArray(paper.authors));
      }
    }

  } catch (e) {
    console.log('Error:', e.message);
    console.log('Stack:', e.stack);
  }

  await prisma.$disconnect();
}

testDashboard();