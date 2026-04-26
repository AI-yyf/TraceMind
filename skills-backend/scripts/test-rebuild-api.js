const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3303,
  path: '/api/nodes/autonomous-driving:stage-2:1912.12294/rebuild-article',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
};

console.log('Sending request...');
const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log('Success:', parsed.success);
      if (parsed.data) {
        const d = parsed.data;
        console.log('Schema version:', d.schemaVersion);
        console.log('Node ID:', d.nodeId);
        console.log('Title:', d.title);
        if (d.enhancedArticleFlow) {
          console.log('Enhanced article flow length:', d.enhancedArticleFlow.length);
          const paperBlocks = d.enhancedArticleFlow.filter(b => b.type === 'paper-article');
          console.log('Paper blocks:', paperBlocks.length);
          paperBlocks.forEach((b, i) => {
            console.log(`  Paper ${i+1}:`, {
              paperId: b.paperId,
              contentVersion: b.contentVersion,
              hasCoreThesis: !!b.coreThesis,
              hasParagraphs: !!b.paragraphs,
              paragraphsCount: b.paragraphs ? b.paragraphs.length : 0,
              hasClosingInsight: !!b.closingInsight
            });
          });
        } else {
          console.log('No enhancedArticleFlow in response');
        }
        if (d.article && d.article.flow) {
          console.log('Article flow length:', d.article.flow.length);
        }
      }
    } catch (e) {
      console.log('Parse error:', e.message);
      console.log('Raw data:', data.slice(0, 500));
    }
  });
});

req.on('error', (e) => {
  console.log('Request error:', e.message);
});

req.setTimeout(300000, () => {
  console.log('Request timeout');
  req.destroy();
});

req.end();
