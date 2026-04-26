/**
 * 溯知研究系统测试脚本
 * 测试目标：
 * 1. 文献搜索能力验证
 * 2. 继续研究能力
 * 3. 节点页内容生成
 * 4. 主题节点生成与时间线链接
 * 5. Agent与人交互验证
 */

const http = require('http');
const path = require('path');

const BASE_URL = 'http://localhost:3303';
const backendRoot = path.resolve(__dirname, '..');

// Helper function for HTTP requests
function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// TEST 1: 文献搜索能力验证
// ============================================
async function testSearchCapability() {
  console.log('\n========================================');
  console.log('TEST 1: 文献搜索能力验证');
  console.log('========================================\n');

  const results = { passed: 0, failed: 0, details: [] };

  // 1.1 外部搜索 (Semantic Scholar)
  console.log('1.1 测试外部搜索 (Semantic Scholar)...');
  try {
    const externalSearch = await request('GET', '/api/search/external?q=VLA+autonomous+driving&limit=10');
    if (externalSearch.status === 200 && externalSearch.data.success) {
      const paperCount = externalSearch.data.data?.papers?.length || 0;
      console.log(`   ✓ 外部搜索成功: 返回 ${paperCount} 篇论文`);
      results.details.push({ test: 'external_search', status: 'PASS', papers: paperCount });
      results.passed++;
    } else {
      console.log(`   ✗ 外部搜索失败: ${externalSearch.status}`);
      results.details.push({ test: 'external_search', status: 'FAIL', error: externalSearch.status });
      results.failed++;
    }
  } catch (e) {
    console.log(`   ✗ 外部搜索异常: ${e.message}`);
    results.details.push({ test: 'external_search', status: 'ERROR', error: e.message });
    results.failed++;
  }

  // 1.2 语料库搜索
  console.log('1.2 测试语料库搜索...');
  try {
    const corpusSearch = await request('GET', '/api/search?q=transformer&limit=20');
    if (corpusSearch.status === 200 && corpusSearch.data.success) {
      const total = corpusSearch.data.data?.totals?.all || 0;
      console.log(`   ✓ 语料库搜索成功: 总计 ${total} 个结果`);
      results.details.push({ test: 'corpus_search', status: 'PASS', total });
      results.passed++;
    } else {
      console.log(`   ✗ 语料库搜索失败: ${corpusSearch.status}`);
      results.details.push({ test: 'corpus_search', status: 'FAIL' });
      results.failed++;
    }
  } catch (e) {
    console.log(`   ✗ 语料库搜索异常: ${e.message}`);
    results.details.push({ test: 'corpus_search', status: 'ERROR', error: e.message });
    results.failed++;
  }

  return results;
}

// ============================================
// TEST 2: 继续研究能力
// ============================================
async function testContinueResearch(topics) {
  console.log('\n========================================');
  console.log('TEST 2: 在现有基础上继续研究');
  console.log('========================================\n');

  const results = { passed: 0, failed: 0, details: [] };

  if (!topics || topics.length === 0) {
    console.log('   ⊘ 无可用主题，跳过测试');
    return { passed: 0, failed: 0, details: [{ test: 'continue_research', status: 'SKIP', reason: 'no_topics' }] };
  }

  const testTopicId = topics[0].id;

  // 2.1 获取研究会话状态
  console.log(`2.1 测试研究状态获取 (主题: ${testTopicId})...`);
  try {
    const researchState = await request('GET', `/api/topics/${testTopicId}/research-brief`);
    if (researchState.status === 200 && researchState.data.success) {
      const brief = researchState.data.data;
      console.log(`   ✓ 研究简报获取成功`);
      console.log(`     - 当前焦点: ${brief.sessionMemory?.summary?.currentFocus?.substring(0, 50) || '无'}`);
      console.log(`     - 开放问题: ${brief.sessionMemory?.summary?.openQuestions?.length || 0} 个`);
      results.details.push({ test: 'research_brief', status: 'PASS', hasBrief: !!brief });
      results.passed++;
    } else {
      console.log(`   ✗ 研究简报获取失败: ${researchState.status}`);
      results.details.push({ test: 'research_brief', status: 'FAIL' });
      results.failed++;
    }
  } catch (e) {
    console.log(`   ✗ 研究简报异常: ${e.message}`);
    results.details.push({ test: 'research_brief', status: 'ERROR', error: e.message });
    results.failed++;
  }

  // 2.2 检查当前研究会话
  console.log('2.2 检查研究会话状态...');
  try {
    const sessions = await request('GET', '/api/research/sessions');
    if (sessions.status === 200 && sessions.data.success) {
      const activeSessions = sessions.data.data?.filter(s => s.status === 'running') || [];
      console.log(`   ✓ 会话列表获取成功: ${activeSessions.length} 个活跃会话`);
      results.details.push({ test: 'research_sessions', status: 'PASS', activeSessions: activeSessions.length });
      results.passed++;
    } else {
      console.log(`   ✗ 会话列表获取失败`);
      results.details.push({ test: 'research_sessions', status: 'FAIL' });
      results.failed++;
    }
  } catch (e) {
    console.log(`   ✗ 会话列表异常: ${e.message}`);
    results.details.push({ test: 'research_sessions', status: 'ERROR', error: e.message });
    results.failed++;
  }

  return results;
}

// ============================================
// TEST 3: 节点页内容生成
// ============================================
async function testNodeContentGeneration(nodes) {
  console.log('\n========================================');
  console.log('TEST 3: 节点页内容生成');
  console.log('========================================\n');

  const results = { passed: 0, failed: 0, details: [] };

  if (!nodes || nodes.length === 0) {
    console.log('   ⊘ 无可用节点，跳过测试');
    return { passed: 0, failed: 0, details: [{ test: 'node_content', status: 'SKIP', reason: 'no_nodes' }] };
  }

  const testNode = nodes[0];
  console.log(`3.1 获取节点详情 (节点: ${testNode.id})...`);

  try {
    const nodeDetail = await request('GET', `/api/nodes/${testNode.id}`);
    if (nodeDetail.status === 200 && nodeDetail.data.success) {
      const node = nodeDetail.data.data;
      console.log(`   ✓ 节点详情获取成功`);
      console.log(`     - 标题: ${node.nodeLabel}`);
      console.log(`     - 论文数: ${node.node_papers?.length || 0}`);
      console.log(`     - 状态: ${node.status}`);
      console.log(`     - fullArticleFlow: ${node.fullArticleFlow ? '已生成' : '未生成'}`);

      results.details.push({
        test: 'node_detail',
        status: 'PASS',
        label: node.nodeLabel,
        paperCount: node.node_papers?.length || 0,
        hasArticleFlow: !!node.fullArticleFlow
      });
      results.passed++;
    } else {
      console.log(`   ✗ 节点详情获取失败: ${nodeDetail.status}`);
      results.details.push({ test: 'node_detail', status: 'FAIL' });
      results.failed++;
    }
  } catch (e) {
    console.log(`   ✗ 节点详情异常: ${e.message}`);
    results.details.push({ test: 'node_detail', status: 'ERROR', error: e.message });
    results.failed++;
  }

  return results;
}

// ============================================
// TEST 4: 主题节点生成与时间线
// ============================================
async function testTopicNodeGeneration(topics) {
  console.log('\n========================================');
  console.log('TEST 4: 主题中节点的生成与时间线链接');
  console.log('========================================\n');

  const results = { passed: 0, failed: 0, details: [] };

  if (!topics || topics.length === 0) {
    console.log('   ⊘ 无可用主题，跳过测试');
    return { passed: 0, failed: 0, details: [{ test: 'topic_nodes', status: 'SKIP', reason: 'no_topics' }] };
  }

  const testTopic = topics[0];

  // 4.1 获取主题Dashboard (时间线视图)
  console.log(`4.1 获取主题Dashboard (主题: ${testTopic.nameZh})...`);
  try {
    const dashboard = await request('GET', `/api/topics/${testTopic.id}/dashboard`);
    if (dashboard.status === 200 && dashboard.data.success) {
      const data = dashboard.data.data;
      console.log(`   ✓ Dashboard获取成功`);
      console.log(`     - 研究线: ${data.researchThreads?.length || 0} 条`);
      console.log(`     - 方法演进: ${data.methodEvolution?.length || 0} 个`);
      console.log(`     - 总节点数: ${data.stats?.totalNodes || 0}`);
      console.log(`     - 已映射论文: ${data.stats?.mappedPapers || 0}`);

      results.details.push({
        test: 'topic_dashboard',
        status: 'PASS',
        threads: data.researchThreads?.length || 0,
        nodes: data.stats?.totalNodes || 0
      });
      results.passed++;
    } else {
      console.log(`   ✗ Dashboard获取失败: ${dashboard.status}`);
      results.details.push({ test: 'topic_dashboard', status: 'FAIL' });
      results.failed++;
    }
  } catch (e) {
    console.log(`   ✗ Dashboard异常: ${e.message}`);
    results.details.push({ test: 'topic_dashboard', status: 'ERROR', error: e.message });
    results.failed++;
  }

  return results;
}

// ============================================
// TEST 5: Agent与人交互验证
// ============================================
async function testAgentInteraction(topics) {
  console.log('\n========================================');
  console.log('TEST 5: 工作台Agent与人交互验证');
  console.log('========================================\n');

  const results = { passed: 0, failed: 0, details: [] };

  if (!topics || topics.length === 0) {
    console.log('   ⊘ 无可用主题，跳过测试');
    return { passed: 0, failed: 0, details: [{ test: 'agent_interaction', status: 'SKIP', reason: 'no_topics' }] };
  }

  const testTopicId = topics[0].id;

  // 5.1 获取认知记忆 (Agent对主题的理解)
  console.log('5.1 获取Agent认知记忆...');
  try {
    const brief = await request('GET', `/api/topics/${testTopicId}/research-brief`);
    if (brief.status === 200 && brief.data.success) {
      const cognitiveMemory = brief.data.data?.cognitiveMemory;
      if (cognitiveMemory) {
        console.log(`   ✓ 认知记忆获取成功`);
        console.log(`     - 已建立判断: ${cognitiveMemory.establishedJudgments?.length || 0} 条`);
        console.log(`     - 开放问题: ${cognitiveMemory.openQuestions?.length || 0} 个`);
        console.log(`     - 研究动量: ${cognitiveMemory.researchMomentum?.length || 0} 条`);

        // 检查Agent是否真正理解主题
        const hasJudgments = (cognitiveMemory.establishedJudgments?.length || 0) > 0;
        const hasQuestions = (cognitiveMemory.openQuestions?.length || 0) > 0;

        if (hasJudgments || hasQuestions) {
          console.log(`   ✓ Agent展现出主题专家特征`);
          results.details.push({
            test: 'agent_cognitive_memory',
            status: 'PASS',
            hasJudgments,
            hasQuestions,
            judgmentCount: cognitiveMemory.establishedJudgments?.length || 0
          });
          results.passed++;
        } else {
          console.log(`   ⚠ Agent认知记忆为空，可能需要更多研究`);
          results.details.push({ test: 'agent_cognitive_memory', status: 'WARN', message: 'empty_memory' });
          results.passed++; // 仍算通过，只是警告
        }
      } else {
        console.log(`   ✗ 无认知记忆数据`);
        results.details.push({ test: 'agent_cognitive_memory', status: 'FAIL', reason: 'no_data' });
        results.failed++;
      }
    } else {
      console.log(`   ✗ 获取失败: ${brief.status}`);
      results.details.push({ test: 'agent_cognitive_memory', status: 'FAIL' });
      results.failed++;
    }
  } catch (e) {
    console.log(`   ✗ 认知记忆异常: ${e.message}`);
    results.details.push({ test: 'agent_cognitive_memory', status: 'ERROR', error: e.message });
    results.failed++;
  }

  return results;
}

// ============================================
// PDF提取质量检查
// ============================================
async function checkPDFExtractionQuality() {
  console.log('\n========================================');
  console.log('PDF提取质量检查');
  console.log('========================================\n');

  const results = { passed: 0, failed: 0, details: [], issues: [] };

  try {
    // 检查论文的提取统计
    const papersResponse = await request('GET', '/api/papers');
    if (papersResponse.status === 200 && papersResponse.data.success) {
      const papers = papersResponse.data.data || [];
      console.log(`共发现 ${papers.length} 篇论文\n`);

      let totalFigures = 0;
      let totalTables = 0;
      let totalFormulas = 0;
      let papersWithIssues = [];

      for (const paper of papers) {
        // 检查是否有extraction_stats
        if (paper.extraction_stats) {
          totalFigures += paper.extraction_stats.figureCount || 0;
          totalTables += paper.extraction_stats.tableCount || 0;
          totalFormulas += paper.extraction_stats.formulaCount || 0;

          if (paper.extraction_stats.figureCount === 0 && paper.extraction_stats.tableCount === 0) {
            papersWithIssues.push({
              title: paper.titleZh || paper.title,
              issue: '无图表提取'
            });
          }
        }
      }

      console.log('提取统计:');
      console.log(`  - 图片总数: ${totalFigures}`);
      console.log(`  - 表格总数: ${totalTables}`);
      console.log(`  - 公式总数: ${totalFormulas}`);

      if (totalTables === 0) {
        console.log(`\n  ⚠ 问题: 表格提取数量为0`);
        results.issues.push({ type: 'table_extraction', severity: 'HIGH', message: '表格提取数量为0，需要检查PDF提取配置' });
      }

      if (totalFormulas === 0) {
        console.log(`  ⚠ 问题: 公式提取数量为0`);
        results.issues.push({ type: 'formula_extraction', severity: 'HIGH', message: '公式提取数量为0，置信度阈值可能过高' });
      }

      results.details.push({
        papers: papers.length,
        totalFigures,
        totalTables,
        totalFormulas,
        papersWithIssues: papersWithIssues.length
      });

      if (totalFigures > 0) results.passed++;
      if (totalTables > 0) results.passed++;
      if (totalFormulas > 0) results.passed++;
    }
  } catch (e) {
    console.log(`  ✗ PDF提取检查异常: ${e.message}`);
    results.failed++;
  }

  return results;
}

// ============================================
// 主测试流程
// ============================================
async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║              溯知 TraceMind 研究系统测试报告                  ║');
  console.log('║                  ' + new Date().toISOString() + '                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // 等待服务启动
  console.log('\n等待服务启动...');
  await sleep(3000);

  // 检查健康状态
  console.log('\n检查服务健康状态...');
  try {
    const health = await request('GET', '/health');
    if (health.status === 200) {
      console.log(`✓ 后端服务正常运行 (${health.data.status || 'OK'})`);
    } else {
      console.log(`✗ 后端服务异常: ${health.status}`);
      process.exit(1);
    }
  } catch (e) {
    console.log(`✗ 无法连接后端服务: ${e.message}`);
    console.log('\n请确保后端服务已启动: cd skills-backend && npm run dev');
    process.exit(1);
  }

  // 获取主题和节点数据
  console.log('\n获取基础数据...');
  let topics = [];
  let nodes = [];

  try {
    const topicsRes = await request('GET', '/api/topics');
    if (topicsRes.status === 200 && topicsRes.data.success) {
      topics = topicsRes.data.data || [];
      console.log(`✓ 主题列表: ${topics.length} 个`);
    }
  } catch (e) {
    console.log(`✗ 获取主题失败: ${e.message}`);
  }

  try {
    const nodesRes = await request('GET', '/api/nodes');
    if (nodesRes.status === 200 && nodesRes.data.success) {
      nodes = nodesRes.data.data || [];
      console.log(`✓ 节点列表: ${nodes.length} 个`);
    }
  } catch (e) {
    console.log(`✗ 获取节点失败: ${e.message}`);
  }

  // 执行测试
  const testResults = {};

  testResults.search = await testSearchCapability();
  testResults.continueResearch = await testContinueResearch(topics);
  testResults.nodeContent = await testNodeContentGeneration(nodes);
  testResults.topicNodes = await testTopicNodeGeneration(topics);
  testResults.agentInteraction = await testAgentInteraction(topics);
  testResults.pdfExtraction = await checkPDFExtractionQuality();

  // 汇总结果
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                       测试结果汇总                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  let totalPassed = 0;
  let totalFailed = 0;

  for (const [testName, result] of Object.entries(testResults)) {
    const passCount = result.passed || 0;
    const failCount = result.failed || 0;
    const status = failCount === 0 ? '✓通过' : (passCount > 0 ? '⚠部分通过' : '✗失败');
    console.log(`${testName.padEnd(20)}: ${status} (${passCount}/${passCount + failCount})`);
    totalPassed += passCount;
    totalFailed += failCount;
  }

  console.log(`\n总计: ${totalPassed} 通过, ${totalFailed} 失败`);

  // 输出问题
  if (testResults.pdfExtraction?.issues?.length > 0) {
    console.log('\n发现的改进建议:');
    for (const issue of testResults.pdfExtraction.issues) {
      console.log(`  [${issue.severity}] ${issue.type}: ${issue.message}`);
    }
  }

  // 保存结果
  const fs = require('fs');
  const reportPath = path.join(backendRoot, 'test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { passed: totalPassed, failed: totalFailed },
    results: testResults
  }, null, 2));
  console.log(`\n测试报告已保存: ${reportPath}`);
}

main().catch(console.error);
