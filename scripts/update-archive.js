/**
 * 历史简报归档列表更新脚本
 * 扫描/data目录下所有interpret JSON → 生成archive.html列表页
 * 输出: dist/archive.html
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const DIST_DIR = join(ROOT, 'dist');

const CSS = `
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#f5f6fa; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif; color:#333; line-height:1.8; }
.container { max-width:960px; margin:0 auto; padding:20px; }
.header { background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460); color:#fff; text-align:center; padding:40px 20px 30px; border-radius:12px; margin-bottom:24px; }
.header h1 { font-size:28px; margin-bottom:8px; }
.nav { display:flex; gap:12px; justify-content:center; margin-bottom:24px; flex-wrap:wrap; }
.nav a { color:#3498db; text-decoration:none; padding:6px 16px; background:#fff; border-radius:20px; font-size:14px; border:1px solid #e0e0e0; transition:all .2s; }
.nav a:hover { background:#3498db; color:#fff; border-color:#3498db; }
.nav a.active { background:#3498db; color:#fff; border-color:#3498db; }
.archive-list { list-style:none; }
.archive-list li { background:#fff; border-radius:8px; padding:16px 20px; margin-bottom:10px; box-shadow:0 1px 3px rgba(0,0,0,0.05); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; transition:all .2s; }
.archive-list li:hover { box-shadow:0 2px 8px rgba(0,0,0,0.1); transform:translateY(-1px); }
.archive-list .date { font-weight:700; font-size:16px; color:#1a1a2e; text-decoration:none; }
.archive-list .date a { color:#1a1a2e; text-decoration:none; }
.archive-list .date a:hover { color:#3498db; }
.archive-list .summary { color:#666; font-size:14px; flex:1; min-width:200px; }
.empty-state { text-align:center; padding:60px 20px; color:#999; }
.footer { text-align:center; font-size:12px; color:#999; padding:24px 0; margin-top:20px; border-top:1px solid #e0e0e0; }
@media (max-width: 768px) {
  .container { padding:12px; }
  .header { padding:24px 16px 20px; }
  .header h1 { font-size:22px; }
  .archive-list li { padding:12px 14px; }
  .archive-list .summary { font-size:13px; }
}
`;

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function scanInterpretFiles() {
  if (!existsSync(DATA_DIR)) return [];
  const files = readdirSync(DATA_DIR);
  const interpretFiles = files
    .filter(f => f.startsWith('interpret_') && f.endsWith('.json'))
    .map(f => f.replace('interpret_', '').replace('.json', ''))
    .sort()
    .reverse();
  return interpretFiles;
}

function getOneLine(file) {
  try {
    const path = join(DATA_DIR, `interpret_${file}.json`);
    const data = JSON.parse(readFileSync(path, 'utf-8'));
    return data.one_line_judge || '';
  } catch {
    return '';
  }
}

function main() {
  console.log('生成历史简报列表...');
  const dates = scanInterpretFiles();
  console.log(`找到 ${dates.length} 期历史简报`);

  let listHTML;
  if (dates.length === 0) {
    listHTML = '<div class="empty-state"><p>今日简报尚未生成，请稍后刷新。</p><p style="margin-top:12px">简报每天上午7:30自动更新。</p></div>';
  } else {
    listHTML = '<ul class="archive-list">';
    for (const d of dates) {
      const oneLine = getOneLine(d);
      listHTML += `
        <li>
          <span class="date"><a href="daily/${d}.html">${d}</a></span>
          ${oneLine ? `<span class="summary">${esc(oneLine)}</span>` : ''}
        </li>`;
    }
    listHTML += '</ul>';
  }

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>历史简报 - 全球财经每日简报</title>
<style>${CSS}</style>
</head>
<body>
<div class="container">

<header class="header">
  <h1>历史简报</h1>
  <div>全部${dates.length}期</div>
</header>

<nav class="nav">
  <a href="index.html">今日简报</a>
  <a href="archive.html" class="active">历史简报</a>
  <a href="about.html">关于</a>
</nav>

${listHTML}

<div class="footer">
  <p>全球财经每日简报 | 面向A股散户的信息解读平台</p>
  <p>由 GitHub Actions 每日自动生成</p>
</div>

</div>
</body>
</html>`;

  const outPath = join(DIST_DIR, 'archive.html');
  writeFileSync(outPath, html, 'utf-8');
  console.log(`✓ archive.html (${dates.length}期)`);
}

main();
