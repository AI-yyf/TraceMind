/**
 * 溯知研究系统直接数据库测试
 * 不依赖HTTP服务，直接查询SQLite数据库
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║              溯知 TraceMind 研究系统数据库测试报告            ║');
  console.log('║                  ' + new Date().toISOString() + '                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const report = {
    timestamp: new Date().toISOString(),
    tests: {},
    issues: [],
    recommendations: []
  };

  // ========================================
  // 测试 1: 数据库状态检查
  // ========================================
  console.log('========================================');
  console.log('测试 1: 数据库状态检查');
  console.log('========================================\n');

  try {
    const topicsCount = await prisma.topics.count();
    const papersCount = await prisma.papers.count();
    const nodesCount = await prisma.research_nodes.count();
    const figuresCount = await prisma.figures.count();
    const tablesCount = await prisma.tables.count();
    const formulasCount = await prisma.formulas.count();

    console.log(`✓ 主题数量: ${topicsCount}`);
    console.log(`✓ 论文数量: ${papersCount}`);
    console.log(`✓ 节点数量: ${nodesCount}`);
    console.log(`✓ 图片数量: ${figuresCount}`);
    console.log(`✓ 表格数量: ${tablesCount}`);
    console.log(`✓ 公式数量: ${formulasCount}`);

    report.tests.database = {
      status: 'PASS',
      topics: topicsCount,
      papers: papersCount,
      nodes: nodesCount,
      figures: figuresCount,
      tables: tablesCount,
      formulas: formulasCount
    };

    // 检查提取问题
    if (tablesCount === 0) {
      report.issues.push({
        severity: 'HIGH',
        area: 'PDF Extraction',
        issue: '表格提取数量为0',
        recommendation: '检查pdf_extract.py中的表格提取逻辑，当前置信度阈值可能过高'
      });
    }

    if (formulasCount === 0) {
      report.issues.push({
        severity: 'HIGH',
        area: 'PDF Extraction',
        issue: '公式提取数量为0',
        recommendation: '检查formula_confidence_threshold设置，当前值0.70可能需要降低到0.60'
      });
    }

    console.log();
  } catch (e) {
    console.log(`✗ 数据库查询失败: ${e.message}`);
    report.tests.database = { status: 'FAIL', error: e.message };
  }

  // ========================================
  // 测试 2: 文献搜索能力
  // ========================================
  console.log('========================================');
  console.log('测试 2: 文献搜索能力分析');
  console.log('========================================\n');

  try {
    // 检查候选池
    const candidatePool = await prisma.paper_candidate_pool.findMany({
      select: { status: true, confidence: true },
      take: 100
    });

    const statusCounts = {
      candidate: 0,
      admitted: 0,
      rejected: 0
    };

    candidatePool.forEach(p => {
      statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
    });

    console.log(`候选池统计:`);
    console.log(`  - 候选: ${statusCounts.candidate}`);
    console.log(`  - 已准入: ${statusCounts.admitted}`);
    console.log(`  - 已拒绝: ${statusCounts.rejected}`);

    // 检查搜索相关配置
    const searchConfig = await prisma.system_configs.findMany({
      where: { key: { contains: 'search' } }
    });

    console.log(`\n搜索配置项: ${searchConfig.length} 个`);

    report.tests.search = {
      status: 'PASS',
      candidatePool: statusCounts,
      searchConfigs: searchConfig.length
    };

    // 改进建议
    if (statusCounts.candidate + statusCounts.admitted < 50) {
      report.recommendations.push({
        area: 'Search Aggregation',
        suggestion: '扩大搜索范围，支持每阶段200篇论文发现。当前限制为20-50篇/批次。',
        implementation: '修改search-aggregator.ts中的limit参数，添加分页支持'
      });
    }

    console.log();
  } catch (e) {
    console.log(`✗ 搜索能力分析失败: ${e.message}`);
    report.tests.search = { status: 'ERROR', error: e.message };
  }

  // ========================================
  // 测试 3: 研究会话和继续研究
  // ========================================
  console.log('========================================');
  console.log('测试 3: 研究会话和继续研究能力');
  console.log('========================================\n');

  try {
    const sessions = await prisma.research_sessions.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    console.log(`研究会话: ${sessions.length} 个`);
    sessions.forEach((s, i) => {
      const topicIds = JSON.parse(s.topicIds);
      console.log(`  ${i + 1}. ID: ${s.id}`);
      console.log(`     主题: ${topicIds.join(', ')}`);
      console.log(`     状态: ${s.status}`);
      console.log(`     进度: ${Math.round(s.progress)}%`);
      console.log(`     创建: ${s.createdAt}`);
    });

    // 检查pipeline状态
    const pipelineStates = await prisma.research_pipeline_states.findMany();
    console.log(`\nPipeline状态: ${pipelineStates.length} 个`);

    report.tests.researchSessions = {
      status: sessions.length > 0 ? 'PASS' : 'WARN',
      sessionCount: sessions.length,
      pipelineStates: pipelineStates.length
    };

    // 改进建议
    report.recommendations.push({
      area: 'Research Scheduler',
      suggestion: '实现BullMQ持久化队列，支持长时间研究任务(周/月级别)的可靠性',
      implementation: '参考bg_4cf51afd探索结果，使用BullMQ FlowProducer构建多阶段研究流程'
    });

    console.log();
  } catch (e) {
    console.log(`✗ 研究会话分析失败: ${e.message}`);
    report.tests.researchSessions = { status: 'ERROR', error: e.message };
  }

  // ========================================
  // 测试 4: 节点内容生成
  // ========================================
  console.log('========================================');
  console.log('测试 4: 节点内容生成质量');
  console.log('========================================\n');

  try {
    const nodes = await prisma.research_nodes.findMany({
      include: {
        node_papers: {
          include: {
            papers: {
              select: { id: true, titleZh: true }
            }
          }
        },
        topics: {
          select: { nameZh: true }
        }
      },
      take: 5
    });

    console.log(`研究节点分析 (${nodes.length} 个):\n`);

    let hasArticleFlow = 0;
    let hasFullContent = 0;
    let totalNodePapers = 0;

    nodes.forEach((node, i) => {
      console.log(`节点 ${i + 1}: ${node.nodeLabel}`);
      console.log(`  主题: ${node.topics?.nameZh || '未知'}`);
      console.log(`  阶段: Stage ${node.stageIndex}`);
      console.log(`  论文数: ${node.node_papers.length}`);
      console.log(`  状态: ${node.status}`);
      console.log(`  fullArticleFlow: ${node.fullArticleFlow ? '已生成' : '未生成'}`);
      console.log(`  fullContent: ${node.fullContent ? '已生成' : '未生成'}`);

      totalNodePapers += node.node_papers.length;
      if (node.fullArticleFlow) hasArticleFlow++;
      if (node.fullContent) hasFullContent++;

      console.log();
    });

    const articleFlowRate = nodes.length > 0 ? (hasArticleFlow / nodes.length * 100).toFixed(1) : 0;

    report.tests.nodeContent = {
      status: hasArticleFlow > 0 ? 'PASS' : 'WARN',
      totalNodes: nodes.length,
      nodesWithArticleFlow: hasArticleFlow,
      nodesWithFullContent: hasFullContent,
      articleFlowRate: articleFlowRate + '%',
      avgPapersPerNode: nodes.length > 0 ? (totalNodePapers / nodes.length).toFixed(1) : 0
    };

    // 改进建议
    if (hasArticleFlow < nodes.length) {
      report.recommendations.push({
        area: 'Node Editorial Agent',
        suggestion: '增强节点内容生成，实现Introduction→PaperAnalyses→Synthesis→Closing完整流程',
        implementation: '参考bg_91de81ce探索结果，使用NodeArticleFlowBlock v2 poster-style格式'
      });
    }

    console.log();
  } catch (e) {
    console.log(`✗ 节点内容分析失败: ${e.message}`);
    report.tests.nodeContent = { status: 'ERROR', error: e.message };
  }

  // ========================================
  // 测试 5: 模型配置
  // ========================================
  console.log('========================================');
  console.log('测试 5: 模型配置检查');
  console.log('========================================\n');

  try {
    const modelConfigs = await prisma.model_configs.findMany();

    console.log(`模型配置: ${modelConfigs.length} 个\n`);
    modelConfigs.forEach((config, i) => {
      const apiKeyPreview = config.apiKey ?
        (config.apiKey.length > 10 ? config.apiKey.substring(0, 7) + '...' : '***') :
        '未配置';
      console.log(`${i + 1}. ${config.name} (${config.modelId})`);
      console.log(`   提供商: ${config.provider}`);
      console.log(`   模型: ${config.model}`);
      console.log(`   BaseURL: ${config.baseUrl || '默认'}`);
      console.log(`   API Key: ${apiKeyPreview}`);
      console.log(`   启用: ${config.enabled ? '是' : '否'}`);
      console.log();
    });

    // 检查Kimi-K2.5配置
    const kimiConfig = modelConfigs.find(c => c.modelId === 'kimi-k2.5');
    if (kimiConfig) {
      console.log('✓ Kimi-K2.5 配置已存在');
      if (kimiConfig.baseUrl === 'https://ai.1seey.com/v1') {
        console.log('✓ BaseURL正确配置为 https://ai.1seey.com/v1');
      }
    } else {
      report.issues.push({
        severity: 'MEDIUM',
        area: 'Model Config',
        issue: 'Kimi-K2.5 配置不存在',
        recommendation: '需要添加Kimi-K2.5模型配置'
      });
    }

    report.tests.modelConfig = {
      status: 'PASS',
      configs: modelConfigs.length,
      hasKimiK25: !!kimiConfig
    };

    console.log();
  } catch (e) {
    console.log(`✗ 模型配置分析失败: ${e.message}`);
    report.tests.modelConfig = { status: 'ERROR', error: e.message };
  }

  // ========================================
  // 测试 6: Agent认知记忆
  // ========================================
  console.log('========================================');
  console.log('测试 6: Agent认知记忆和研究指导');
  console.log('========================================\n');

  try {
    // 检查topic_session_memories
    const sessionMemories = await prisma.topic_session_memories.findMany();
    console.log(`会话记忆: ${sessionMemories.length} 个`);

    // 检查topic_guidance_ledgers
    const guidanceLedgers = await prisma.topic_guidance_ledgers.findMany();
    console.log(`指导账本: ${guidanceLedgers.length} 个`);

    // 检查research_world_snapshots
    const worldSnapshots = await prisma.research_world_snapshots.findMany();
    console.log(`研究世界快照: ${worldSnapshots.length} 个`);

    // 分析一个主题的认知状态
    if (sessionMemories.length > 0) {
      const sampleMemory = sessionMemories[0];
      const events = JSON.parse(sampleMemory.events || '[]');
      console.log(`\n示例主题 (${sampleMemory.topicId}) 认知状态:`);
      console.log(`  事件数: ${events.length}`);
      console.log(`  摘要: ${sampleMemory.summary ? '有' : '无'}`);
    }

    report.tests.agentMemory = {
      status: sessionMemories.length > 0 ? 'PASS' : 'WARN',
      sessionMemories: sessionMemories.length,
      guidanceLedgers: guidanceLedgers.length,
      worldSnapshots: worldSnapshots.length
    };

    // 改进建议
    if (worldSnapshots.length === 0) {
      report.recommendations.push({
        area: 'Research World',
        suggestion: '构建研究世界快照，使Agent能够像真正的专家一样理解主题',
        implementation: '参考research-world.ts，实现claims/questions/agenda的完整建模'
      });
    }

    console.log();
  } catch (e) {
    console.log(`✗ Agent记忆分析失败: ${e.message}`);
    report.tests.agentMemory = { status: 'ERROR', error: e.message };
  }

  // ========================================
  // 测试 7: i18n 支持
  // ========================================
  console.log('========================================');
  console.log('测试 7: 国际化支持检查');
  console.log('========================================\n');

  try {
    // 检查主题的多语言字段
    const topicsWithI18n = await prisma.topics.findMany({
      select: { nameZh: true, nameEn: true }
    });

    let hasZhName = 0;
    let hasEnName = 0;

    topicsWithI18n.forEach(t => {
      if (t.nameZh) hasZhName++;
      if (t.nameEn) hasEnName++;
    });

    console.log(`主题国际化:`);
    console.log(`  - 中文名称: ${hasZhName}/${topicsWithI18n.length}`);
    console.log(`  - 英文名称: ${hasEnName}/${topicsWithI18n.length}`);

    // 检查论文的多语言字段
    const papersWithI18n = await prisma.papers.findMany({
      select: { titleZh: true, titleEn: true }
    });

    let papersWithZh = 0;
    let papersWithEn = 0;

    papersWithI18n.forEach(p => {
      if (p.titleZh) papersWithZh++;
      if (p.titleEn) papersWithEn++;
    });

    console.log(`\n论文国际化:`);
    console.log(`  - 中文标题: ${papersWithZh}/${papersWithI18n.length}`);
    console.log(`  - 英文标题: ${papersWithEn}/${papersWithI18n.length}`);

    // 检查阶段的国际化
    const stagesWithI18n = await prisma.topic_stages.findMany({
      select: { name: true, nameEn: true }
    });

    const stagesWithEn = stagesWithI18n.filter(s => s.nameEn).length;

    console.log(`\n阶段国际化:`);
    console.log(`  - 有英文名称: ${stagesWithEn}/${stagesWithI18n.length}`);

    report.tests.i18n = {
      status: 'PASS',
      topics: { zh: hasZhName, en: hasEnName, total: topicsWithI18n.length },
      papers: { zh: papersWithZh, en: papersWithEn, total: papersWithI18n.length },
      stages: { en: stagesWithEn, total: stagesWithI18n.length }
    };

    console.log();
  } catch (e) {
    console.log(`✗ 国际化检查失败: ${e.message}`);
    report.tests.i18n = { status: 'ERROR', error: e.message };
  }

  // ========================================
  // 汇总报告
  // ========================================
  console.log('========================================');
  console.log('测试汇总');
  console.log('========================================\n');

  let totalPass = 0;
  let totalWarn = 0;
  let totalFail = 0;

  for (const [name, result] of Object.entries(report.tests)) {
    const status = result.status;
    if (status === 'PASS') totalPass++;
    else if (status === 'WARN') totalWarn++;
    else if (status === 'FAIL' || status === 'ERROR') totalFail++;

    console.log(`${name.padEnd(20)}: ${status}`);
  }

  console.log(`\n总计: ${totalPass} 通过, ${totalWarn} 警告, ${totalFail} 失败`);

  // 输出问题
  if (report.issues.length > 0) {
    console.log('\n发现的问题:');
    report.issues.forEach((issue, i) => {
      console.log(`\n[${issue.severity}] ${issue.area}: ${issue.issue}`);
      console.log(`  建议: ${issue.recommendation}`);
    });
  }

  // 输出改进建议
  if (report.recommendations.length > 0) {
    console.log('\n改进建议:');
    report.recommendations.forEach((rec, i) => {
      console.log(`\n${i + 1}. ${rec.area}`);
      console.log(`   建议: ${rec.suggestion}`);
      console.log(`   实现: ${rec.implementation}`);
    });
  }

  // 保存报告
  const reportPath = path.join(__dirname, '..', 'test-report-db.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n\n测试报告已保存: ${reportPath}`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
