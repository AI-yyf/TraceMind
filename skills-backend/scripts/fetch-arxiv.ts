/**
 * Arxiv 数据抓取脚本
 *
 * 功能：
 * 1. 通过 Arxiv OAI-PMH API 搜索论文
 * 2. 下载 LaTeX 源码包
 * 3. 提取图片资源
 *
 * 使用方法：
 * npx ts-node scripts/fetch-arxiv.ts --query "transformer" --max-results 10
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { createWriteStream, createReadStream, unlinkSync } from 'fs';
import { pipeline } from 'stream/promises';
import { spawn } from 'child_process';
import { parseStringPromise } from 'xml2js';

// ============ 配置 ============
const ARXIV_API = 'http://export.arxiv.org/api/query';
const ARXIV_EPRINT = 'https://arxiv.org/e-print';
const OUTPUT_DIR = path.join(process.cwd(), 'src', 'data');
const IMAGES_DIR = path.join(process.cwd(), 'public', 'images');

// 搜索查询配置
interface SearchConfig {
  query: string;
  maxResults: number;
  start: number;
  sortBy: 'relevance' | 'lastUpdatedDate' | 'submittedDate';
  sortOrder: 'ascending' | 'descending';
}

// 论文元数据接口
interface PaperMetadata {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  published: string;
  updated: string;
  categories: string[];
  pdfUrl: string;
  comment?: string;
  doi?: string;
}

// ============ 工具函数 ============

/**
 * 发送 HTTP GET 请求
 */
function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * 下载文件
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath);
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        // 重定向处理
        const redirectUrl = res.headers.location;
        if (redirectUrl) {
          https.get(redirectUrl, (redirectRes) => {
            pipeline(redirectRes, file)
              .then(() => resolve())
              .catch(reject);
          }).on('error', reject);
          return;
        }
      }
      pipeline(res, file)
        .then(() => resolve())
        .catch(reject);
    }).on('error', reject);
  });
}

/**
 * 解析 Arxiv API XML 响应
 */
async function parseArxivResponse(xml: string): Promise<PaperMetadata[]> {
  const result = await parseStringPromise(xml, { explicitArray: false });
  const entries = result.feed.entry ? [result.feed.entry].flat() : [];

  return entries.map((entry: any) => ({
    id: entry.id.split('/').pop(), // 提取 arxiv ID
    title: entry.title.replace(/\n/g, ' ').trim(),
    authors: Array.isArray(entry.author)
      ? entry.author.map((a: any) => a.name)
      : [entry.author?.name || 'Unknown'],
    abstract: entry.summary?.replace(/\n/g, ' ').trim() || '',
    published: entry.published,
    updated: entry.updated,
    categories: Array.isArray(entry.category)
      ? entry.category.map((c: any) => c.$.term)
      : [entry.category?.$.term || ''],
    pdfUrl: entry.link?.find((l: any) => l.$.title === 'pdf')?.$.href || '',
    comment: entry.comment?._ || entry.comment,
    doi: entry['arxiv:doi'] || entry['suri:identifier']?.split('doi:')[1],
  }));
}

/**
 * 搜索 Arxiv 论文
 */
async function searchArxiv(config: SearchConfig): Promise<PaperMetadata[]> {
  const {
    query,
    maxResults = 10,
    start = 0,
    sortBy = 'relevance',
    sortOrder = 'descending'
  } = config;

  // 构建查询 URL
  const searchQuery = encodeURIComponent(query);
  const url = `${ARXIV_API}?search_query=all:${searchQuery}&start=${start}&max_results=${maxResults}&sortBy=${sortBy}&sortOrder=${sortOrder}`;

  console.log(`正在搜索: ${query}`);
  console.log(`API URL: ${url}`);

  const xml = await httpGet(url);
  const papers = await parseArxivResponse(xml);

  console.log(`找到 ${papers.length} 篇论文`);
  return papers;
}

/**
 * 下载 Arxiv LaTeX 源码包
 */
async function downloadLatexSource(arxivId: string): Promise<string | null> {
  const url = `${ARXIV_EPRINT}/${arxivId}`;
  const tarballPath = path.join(OUTPUT_DIR, 'tarballs', `${arxivId}.tar.gz`);

  // 确保目录存在
  fs.mkdirSync(path.dirname(tarballPath), { recursive: true });

  try {
    console.log(`下载源码包: ${arxivId}`);
    await downloadFile(url, tarballPath);
    console.log(`已保存: ${tarballPath}`);
    return tarballPath;
  } catch (error: any) {
    if (error.message?.includes('404') || error.message?.includes('Not Found')) {
      console.log(`⚠️  ${arxivId} 没有 LaTeX 源码（可能不是 LaTeX 提交）`);
      return null;
    }
    console.error(`下载失败: ${error.message}`);
    return null;
  }
}

/**
 * 解压并提取图片
 */
async function extractImages(arxivId: string, tarballPath: string): Promise<string[]> {
  const extractDir = path.join(IMAGES_DIR, arxivId);
  fs.mkdirSync(extractDir, { recursive: true });

  try {
    // 解压 tar.gz
    const tarCommand = process.platform === 'win32' ? 'tar' : 'tar';
    await new Promise((resolve, reject) => {
      const tar = spawn(tarCommand, ['-xzf', tarballPath, '-C', extractDir]);
      tar.on('close', (code) => {
        if (code === 0) resolve(null);
        else reject(new Error(`tar exited with code ${code}`));
      });
      tar.on('error', reject);
    });

    // 扫描图片文件
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.pdf', '.eps', '.svg'];
    const images: string[] = [];

    function scanDir(dir: string) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          scanDir(fullPath);
        } else {
          const ext = path.extname(file).toLowerCase();
          if (imageExtensions.includes(ext)) {
            // 移动到images目录
            const destPath = path.join(extractDir, path.basename(file));
            fs.renameSync(fullPath, destPath);
            images.push(`/images/${arxivId}/${path.basename(file)}`);
          }
        }
      }
    }

    // 处理解压后的目录（通常是 arxiv_id 格式）
    const extractedDirs = fs.readdirSync(extractDir);
    for (const dir of extractedDirs) {
      const fullPath = path.join(extractDir, dir);
      if (fs.statSync(fullPath).isDirectory()) {
        scanDir(fullPath);
        // 删除原目录
        fs.rmSync(fullPath, { recursive: true });
      }
    }

    // 删除 tarball
    unlinkSync(tarballPath);

    console.log(`提取了 ${images.length} 张图片: ${images.join(', ')}`);
    return images;
  } catch (error: any) {
    console.error(`解压失败: ${error.message}`);
    return [];
  }
}

/**
 * 解析 LaTeX 文件获取图表引用关系
 */
function parseLatexForFigures(latexDir: string): Map<string, string[]> {
  const figureMap = new Map<string, string[]>();
  const texFiles = getTexFiles(latexDir);

  for (const texFile of texFiles) {
    const content = fs.readFileSync(texFile, 'utf-8');
    const figures: string[] = [];

    // 匹配 \begin{figure} ... \end{figure} 块
    const figureRegex = /\\begin\{figure\}.*?\\label\{([^}]+)\}.*?\\includegraphics(?:\[.*?\])?\{([^}]+)\}.*?\\end\{figure\}/gs;
    let match;

    while ((match = figureRegex.exec(content)) !== null) {
      const [, label, filename] = match;
      figures.push(filename);
    }

    if (figures.length > 0) {
      figureMap.set(path.basename(texFile), figures);
    }
  }

  return figureMap;
}

function getTexFiles(dir: string): string[] {
  const texFiles: string[] = [];
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      texFiles.push(...getTexFiles(fullPath));
    } else if (file.endsWith('.tex')) {
      texFiles.push(fullPath);
    }
  }

  return texFiles;
}

// ============ 主程序 ============

async function main() {
  const args = process.argv.slice(2);
  const config: Partial<SearchConfig> = {
    query: '',
    maxResults: 10,
    start: 0,
    sortBy: 'relevance',
    sortOrder: 'descending',
  };

  // 解析命令行参数
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];
    switch (key) {
      case 'query':
        config.query = value;
        break;
      case 'max-results':
        config.maxResults = parseInt(value);
        break;
      case 'start':
        config.start = parseInt(value);
        break;
    }
  }

  if (!config.query) {
    console.error('请提供搜索查询: --query "transformer"');
    process.exit(1);
  }

  console.log('========== Arxiv 数据抓取工具 ==========\n');

  // 1. 搜索论文
  const papers = await searchArxiv(config as SearchConfig);

  // 2. 下载源码并提取图片（可选）
  const shouldDownload = args.includes('--download');
  if (shouldDownload) {
    console.log('\n开始下载 LaTeX 源码...\n');
    for (const paper of papers) {
      const tarballPath = await downloadLatexSource(paper.id);
      if (tarballPath) {
        await extractImages(paper.id, tarballPath);
      }
    }
  }

  // 3. 保存元数据
  const outputPath = path.join(OUTPUT_DIR, `search_${Date.now()}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(papers, null, 2));
  console.log(`\n元数据已保存: ${outputPath}`);

  console.log('\n========== 完成 ==========');
}

// 运行主程序
main().catch(console.error);

// 导出类型供其他模块使用
export { searchArxiv, downloadLatexSource, extractImages, parseArxivResponse };
