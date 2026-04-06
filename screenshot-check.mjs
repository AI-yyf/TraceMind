import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 确保输出目录存在
const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

(async () => {
  console.log('正在启动浏览器...');
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  // 截图首页
  console.log('正在截图首页...');
  try {
    await page.goto('http://localhost:5173/', { timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ 
      path: path.join(outputDir, 'manual-home-check.png'),
      fullPage: true 
    });
    console.log('✅ 首页截图完成');
  } catch (e) {
    console.log('❌ 首页截图失败:', e.message);
  }

  // 截图主题页
  console.log('正在截图主题页...');
  try {
    await page.goto('http://localhost:5173/topic/topic-1', { timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ 
      path: path.join(outputDir, 'manual-topic-check.png'),
      fullPage: true 
    });
    console.log('✅ 主题页截图完成');
  } catch (e) {
    console.log('❌ 主题页截图失败:', e.message);
  }

  // 截图节点页
  console.log('正在截图节点页...');
  try {
    await page.goto('http://localhost:5173/node/node-1', { timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ 
      path: path.join(outputDir, 'manual-node-check.png'),
      fullPage: true 
    });
    console.log('✅ 节点页截图完成');
  } catch (e) {
    console.log('❌ 节点页截图失败:', e.message);
  }

  await browser.close();
  console.log('\n所有截图完成！保存在 output/ 目录');
})();
