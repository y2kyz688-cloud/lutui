/**
 * HTML渲染脚本
 * 读取 raw_data + interpret JSON → 渲染每日简报HTML页面
 * 输出: dist/daily/YYYY-MM-DD.html, dist/index.html
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const DIST_DIR = join(ROOT, 'dist');
const DAILY_DIR = join(DIST_DIR, 'daily');

if (!existsSync(DAILY_DIR)) mkdirSync(DAILY_DIR, { recursive: true });

function today() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ============================================================
// CSS样式
// ============================================================

const CSS = `
:root {
  --navy: #0a1628;
  --navy-light: #132038;
  --gold: #c9a96e;
  --gold-light: #f5ecd7;
  --red: #dc3545;
  --green: #00a854;
  --blue: #1a73e8;
  --blue-light: #e8f0fe;
  --gray-100: #f8f9fa;
  --gray-200: #e9ecef;
  --gray-300: #dee2e6;
  --gray-500: #6c757d;
  --gray-700: #495057;
  --gray-900: #212529;
  --white: #ffffff;
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.06);
  --shadow: 0 2px 12px rgba(0,0,0,0.08);
  --shadow-lg: 0 8px 30px rgba(0,0,0,0.12);
  --radius: 10px;
  --radius-sm: 6px;
  --font-cn: "Noto Serif SC", "Source Han Serif CN", "STSong", "SimSun", "Microsoft YaHei", serif;
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
}

* { margin:0; padding:0; box-sizing:border-box; }

body {
  background: #f0f2f5;
  color: var(--gray-900);
  font-family: var(--font-sans);
  line-height: 1.8;
  -webkit-font-smoothing: antialiased;
}

.container { max-width: 1000px; margin: 0 auto; padding: 16px; }

/* ===== 顶部导航栏 ===== */
.top-bar {
  background: var(--navy);
  color: #fff;
  padding: 10px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(10px);
}
.top-bar .brand { font-weight: 700; letter-spacing: 2px; color: var(--gold); font-size: 15px; }
.top-bar .brand span { color: #8899aa; font-weight: 400; font-size: 12px; margin-left: 8px; }
.top-bar .nav-links { display: flex; gap: 4px; }
.top-bar .nav-links a {
  color: #8899aa;
  text-decoration: none;
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 13px;
  transition: all .2s;
}
.top-bar .nav-links a:hover,
.top-bar .nav-links a.active { color: #fff; background: rgba(255,255,255,0.1); }

/* ===== 报告头部 ===== */
.report-header {
  background: linear-gradient(160deg, #0a1628 0%, #132038 40%, #1a2d50 100%);
  color: #fff;
  padding: 48px 40px 40px;
  border-radius: var(--radius);
  margin-top: 20px;
  position: relative;
  overflow: hidden;
}
.report-header::before {
  content: '';
  position: absolute;
  top: -60px; right: -60px;
  width: 280px; height: 280px;
  border: 1px solid rgba(201,169,110,0.15);
  border-radius: 50%;
}
.report-header::after {
  content: '';
  position: absolute;
  bottom: -40px; left: 30%;
  width: 200px; height: 200px;
  border: 1px solid rgba(201,169,110,0.1);
  border-radius: 50%;
}
.report-header .pub-info {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 4px;
  color: var(--gold);
  margin-bottom: 16px;
  font-weight: 600;
}
.report-header h1 {
  font-size: 34px;
  font-weight: 900;
  letter-spacing: 2px;
  margin-bottom: 8px;
  font-family: var(--font-cn);
}
.report-header .subtitle {
  font-size: 15px;
  color: #8899aa;
  margin-bottom: 20px;
  font-weight: 300;
}
.report-header .meta-row {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  font-size: 13px;
  color: #667788;
  padding-top: 20px;
  border-top: 1px solid rgba(255,255,255,0.08);
}
.report-header .meta-item { display: flex; align-items: center; gap: 6px; }
.report-header .meta-item .label { color: #556677; }
.report-header .meta-item .value { color: #aabbcc; }

/* ===== 市场快照仪表盘 ===== */
.market-snapshot {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
  margin: 20px 0;
}
.snap-card {
  background: #fff;
  border-radius: var(--radius-sm);
  padding: 14px 16px;
  box-shadow: var(--shadow-sm);
  border-top: 3px solid transparent;
  transition: all .2s;
}
.snap-card:hover { box-shadow: var(--shadow); transform: translateY(-2px); }
.snap-card.cn-idx { border-top-color: #dc3545; }
.snap-card.us-idx { border-top-color: #1a73e8; }
.snap-card.flow { border-top-color: #c9a96e; }
.snap-card.commodity { border-top-color: #6c757d; }
.snap-card .snap-label { font-size: 11px; color: var(--gray-500); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; font-weight: 600; }
.snap-card .snap-name { font-size: 14px; font-weight: 700; margin-bottom: 4px; color: var(--gray-900); }
.snap-card .snap-value { font-size: 20px; font-weight: 800; }
.snap-card .snap-change { font-size: 13px; margin-top: 2px; }

/* ===== 一句话研判 ===== */
.verdict-bar {
  background: linear-gradient(135deg, var(--navy), #1a2d50);
  color: #fff;
  padding: 20px 28px;
  border-radius: var(--radius);
  margin-bottom: 20px;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.7;
  border-left: 4px solid var(--gold);
  position: relative;
}
.verdict-bar::before { content: '📊 今日研判'; display: block; font-size: 11px; letter-spacing: 3px; color: var(--gold); margin-bottom: 6px; text-transform: uppercase; }

/* ===== 卡片系统 ===== */
.card {
  background: #fff;
  border-radius: var(--radius);
  padding: 28px 30px;
  margin-bottom: 18px;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--gray-200);
  transition: box-shadow .2s;
}
.card:hover { box-shadow: var(--shadow); }
.card h2 {
  font-size: 18px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  color: var(--navy);
  padding-bottom: 12px;
  border-bottom: 2px solid var(--gray-200);
}
.card.priority-high h2 { border-bottom-color: #dc3545; }
.card.priority-mid h2 { border-bottom-color: #c9a96e; }
.card.priority-ref h2 { border-bottom-color: #1a73e8; }

/* ===== 因果链 ===== */
.chain { margin: 12px 0; }
.chain-step {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 10px;
  padding: 10px 14px;
  background: var(--gray-100);
  border-radius: var(--radius-sm);
  transition: background .15s;
}
.chain-step:hover { background: #e8ecf2; }
.chain-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 30px;
  border-radius: 50%;
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
  color: #fff;
}
.chain-step:nth-child(1) .chain-num { background: #dc3545; }
.chain-step:nth-child(2) .chain-num { background: #e87a2a; }
.chain-step:nth-child(3) .chain-num { background: #1a73e8; }
.chain-step:nth-child(4) .chain-num { background: #00a854; }
.chain-text { flex:1; font-size: 15px; line-height: 1.7; }

/* ===== 冲突警告 ===== */
.conflict-box {
  background: linear-gradient(135deg, #fff9e6, #fff3cd);
  border: 1px solid #e6c940;
  border-left: 4px solid #e6a817;
  border-radius: var(--radius-sm);
  padding: 16px 20px;
  margin: 14px 0;
  font-size: 15px;
}
.conflict-box strong { color: #b45309; }

/* ===== 行业深度区块 ===== */
.industry-block {
  background: linear-gradient(160deg, #0f1d35 0%, #162540 50%, #0d1a30 100%);
  color: #e0e6f0;
  border-radius: var(--radius);
  padding: 32px;
  margin-bottom: 18px;
  box-shadow: var(--shadow-lg);
  position: relative;
  overflow: hidden;
}
.industry-block::after {
  content: '';
  position: absolute;
  top: 20px; right: 20px;
  width: 60px; height: 60px;
  border: 2px solid rgba(201,169,110,0.1);
  border-radius: 50%;
}
.industry-block h2 {
  color: var(--gold) !important;
  font-size: 20px;
  margin-bottom: 18px;
  font-weight: 800;
  letter-spacing: 1px;
  border-bottom: 1px solid rgba(255,255,255,0.1) !important;
  padding-bottom: 14px !important;
}
.industry-block p, .industry-block li { color: rgba(224,230,240,0.9); line-height: 1.9; }
.industry-block strong { color: var(--gold); }
.industry-block .term { color: rgba(200,200,210,0.5); }

/* ===== 表格 ===== */
.table-wrap { overflow-x:auto; margin: 14px 0; border-radius: var(--radius-sm); border: 1px solid var(--gray-200); }
table { width:100%; border-collapse:collapse; font-size: 13px; }
th {
  background: #f1f3f5;
  padding: 11px 14px;
  text-align: left;
  font-weight: 700;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--gray-700);
  border-bottom: 2px solid var(--gray-300);
  white-space: nowrap;
}
td { padding: 10px 14px; border-bottom: 1px solid var(--gray-200); vertical-align: top; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: #f8f9fb; }
.industry-block table { border-color: rgba(255,255,255,0.1); }
.industry-block th {
  background: rgba(255,255,255,0.08);
  color: #c0c8d4;
  border-bottom-color: rgba(255,255,255,0.12);
}
.industry-block td {
  border-bottom-color: rgba(255,255,255,0.06);
  color: #d0d6e0;
}
.industry-block tr:hover td { background: rgba(255,255,255,0.04); }

/* ===== 涨跌颜色 ===== */
.up { color: #dc3545; font-weight: 700; }
.down { color: #00a854; font-weight: 700; }
.flat { color: #adb5bd; }

/* ===== 徽章 ===== */
.badge { display:inline-block; padding:3px 10px; border-radius:4px; font-size:11px; font-weight:700; letter-spacing:0.5px; }
.badge-verified { background:#d4edda; color:#155724; }
.badge-single { background:#fff3cd; color:#856404; }
.badge-fail { background:#f8d7da; color:#721c24; }

.tag { display:inline-block; padding:3px 12px; border-radius:3px; font-size:11px; font-weight:700; letter-spacing:1px; text-transform:uppercase; }
.tag-red { background:#fde8e8; color:#c0392b; }
.tag-orange { background:#fef3e0; color:#b45309; }
.tag-blue { background:#e8f0fe; color:#1a56cc; }
.tag-purple { background:#f0e6f6; color:#7d3c98; }
.tag-green { background:#d4edda; color:#155724; }

/* ===== 全景图 ===== */
.panorama {
  background: linear-gradient(135deg, #f0f4ff, #e8ecf8);
  border-radius: var(--radius);
  padding: 28px 30px;
  margin-bottom: 18px;
  border: 1px solid #d0d8f0;
  font-size: 15px;
  line-height: 2;
  position: relative;
}
.panorama::before { content: '🗺️ 市场全景图'; display: block; font-size: 12px; font-weight: 700; letter-spacing: 2px; color: #5a6c8a; margin-bottom: 10px; text-transform: uppercase; }

/* ===== 明日预览 ===== */
.tomorrow-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
  margin-top: 8px;
}
.tomorrow-item {
  background: var(--gray-100);
  padding: 14px 16px;
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--blue);
  font-size: 14px;
}
.tomorrow-item strong { color: var(--navy); display: block; margin-bottom: 4px; font-size: 13px; }

/* ===== 自检报告 ===== */
.self-check {
  background: #fafbfc;
  border-radius: var(--radius);
  padding: 28px 30px;
  margin-top: 28px;
  border: 1px solid var(--gray-200);
}
.self-check h3 { font-size: 17px; margin-bottom: 16px; color: var(--gray-700); font-weight: 700; }
.self-check .stats { display:flex; gap:16px; flex-wrap:wrap; margin-bottom:16px; }

/* ===== 页脚 ===== */
.footer {
  text-align: center;
  font-size: 12px;
  color: #8899aa;
  padding: 32px 0 20px;
  margin-top: 30px;
  border-top: 2px solid var(--gray-200);
}
.footer p { margin: 4px 0; }
.footer .disclaimer {
  color: #cc5555;
  font-weight: 600;
  margin-bottom: 8px;
}

/* ===== 平滑滚动 ===== */
html { scroll-behavior: smooth; }

/* ===== 移动端 ===== */
@media (max-width: 768px) {
  .container { padding: 8px; }
  .report-header { padding: 28px 20px 24px; border-radius: 8px; }
  .report-header h1 { font-size: 22px; }
  .report-header .subtitle { font-size: 13px; }
  .report-header .meta-row { gap: 12px; font-size: 12px; }
  .market-snapshot { grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .snap-card { padding: 10px 12px; }
  .snap-card .snap-value { font-size: 16px; }
  .card { padding: 18px 16px; border-radius: 8px; }
  .card h2 { font-size: 16px; }
  .industry-block { padding: 18px 16px; }
  .industry-block h2 { font-size: 16px; }
  table { font-size: 11px; }
  th, td { padding: 7px 8px; }
  .chain-step { font-size: 13px; padding: 8px 10px; }
  .verdict-bar { font-size: 14px; padding: 16px 18px; }
  .top-bar { padding: 8px 12px; }
  .top-bar .brand { font-size: 13px; }
  .tomorrow-grid { grid-template-columns: 1fr; }
  .panorama { padding: 18px 16px; font-size: 14px; }
}
`;

// ============================================================
// HTML生成函数
// ============================================================

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escWithBr(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

function formatPct(v) {
  if (v === null || v === undefined) return '<span class="flat">--</span>';
  const n = Number(v);
  if (n > 0) return `<span class="up">+${n.toFixed(2)}%</span>`;
  if (n < 0) return `<span class="down">${n.toFixed(2)}%</span>`;
  return `<span class="flat">0.00%</span>`;
}

function formatPrice(v) {
  if (v === null || v === undefined) return '<span class="flat">--</span>';
  return esc(v);
}

function formatNum(v) {
  if (v === null || v === undefined) return '--';
  if (typeof v === 'string') return esc(v);
  return esc(String(v));
}

function confidenceBadge(c) {
  if (!c || c === '❌') return '<span class="badge badge-fail">❌不可用</span>';
  if (c === '⚠️') return '<span class="badge badge-single">⚠️单一源</span>';
  return '<span class="badge badge-verified">✅已验证</span>';
}

function renderChain(chainObj) {
  if (!chainObj) return '';
  const steps = [
    ['①', chainObj.fact],
    ['②', chainObj.consequence],
    ['③', chainObj.transmission],
    ['④', chainObj.impact],
  ];
  return steps.map(([num, text]) => {
    if (!text) return '';
    return `<div class="chain-step"><span class="chain-num">${num}</span><span class="chain-text">${escWithBr(text)}</span></div>`;
  }).join('');
}

function renderHeadlineEvent(evt) {
  return `
    <div class="card priority-high">
      <h2>${esc(evt.title)} ${confidenceBadge(evt.confidence)}</h2>
      <div class="chain">${renderChain(evt.chain)}</div>
      ${evt.source ? `<div class="term">数据来源：${esc(evt.source)}</div>` : ''}
    </div>`;
}

function renderMappingTable(rows) {
  if (!rows || !rows.length) return '<p class="term">暂无海外映射对比数据</p>';
  return `
    <div class="table-wrap">
      <table>
        <tr><th>海外龙头</th><th>当日涨跌</th><th>垄断地位</th><th>A股映射</th><th>A股涨跌</th><th>映射逻辑</th></tr>
        ${rows.map(r => `
          <tr>
            <td>${esc(r.overseas)}</td>
            <td>${esc(r.change || '--')}</td>
            <td>${esc(r.monopoly || '--')}</td>
            <td>${esc(r.a_stock || '--')}</td>
            <td>${esc(r.a_change || '--')}</td>
            <td>${esc(r.logic || '--')}</td>
          </tr>`).join('')}
      </table>
    </div>`;
}

function renderIndustryBlock(title, data) {
  if (!data) return '';
  return `
    <div class="industry-block">
      <h2>${esc(title)}</h2>
      ${data.a_stock_leaders ? `<p>${escWithBr(data.a_stock_leaders)}</p>` : ''}
      ${data.overseas_mapping_table ? renderMappingTable(data.overseas_mapping_table) : ''}
      ${data.industry_news ? `<p style="margin-top:8px"><strong>行业动态：</strong>${escWithBr(data.industry_news)}</p>` : ''}
      ${data.policy ? `<p style="margin-top:8px"><strong>产业政策：</strong>${escWithBr(data.policy)}</p>` : ''}
      ${data.overseas_progress ? `<p style="margin-top:8px"><strong>海外进展：</strong>${escWithBr(data.overseas_progress)}</p>` : ''}
      ${data.commodity_anchor ? `<p style="margin-top:8px"><strong>商品传导链：</strong>${escWithBr(data.commodity_anchor)}</p>` : ''}
      ${data.supply_side ? `<p style="margin-top:8px"><strong>供给侧：</strong>${escWithBr(data.supply_side)}</p>` : ''}
      ${data.earnings_alert ? `<p style="margin-top:8px"><strong>财报关注：</strong>${escWithBr(data.earnings_alert)}</p>` : ''}
      ${data.dragon_tiger ? `<p style="margin-top:8px"><strong>龙虎榜：</strong>${escWithBr(data.dragon_tiger)}</p>` : ''}
      ${data.judgment ? `<p style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.2);font-weight:600;">综合判断：${escWithBr(data.judgment)}</p>` : ''}
    </div>`;
}

function renderSelfCheck(sc) {
  if (!sc) return '';
  const stats = sc.confidence_stats || {};
  return `
    <div class="self-check">
      <h3>📋 自检报告</h3>
      <div class="stats">
        <span class="badge badge-verified">✅已验证: ${stats.verified || 0}项</span>
        <span class="badge badge-single">⚠️单一来源: ${stats.single || 0}项</span>
        <span class="badge badge-fail">❌未验证: ${stats.unverified || 0}项</span>
      </div>
      ${sc.data_traceability ? `<p><strong>数据溯源：</strong>${escWithBr(sc.data_traceability)}</p>` : ''}
      ${sc.value_check ? `<p><strong>数值校验：</strong>${escWithBr(sc.value_check)}</p>` : ''}
      ${sc.fabrication_check ? `<p><strong>防伪造校验：</strong>${escWithBr(sc.fabrication_check)}</p>` : ''}
      ${sc.unverified_list?.length ? `<p style="color:#c0392b"><strong>⚠️未验证项：</strong>${sc.unverified_list.map(esc).join('、')}</p>` : ''}
      ${sc.sources?.length ? `<p style="margin-top:8px"><strong>数据来源：</strong>${sc.sources.map(esc).join(' | ')}</p>` : ''}
    </div>`;
}

function renderDailyHTML(date, rawData, interpret) {
  const r = interpret || {};
  const rd = rawData || {};

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
<meta name="description" content="${esc(date)} 全球财经每日简报 - A股/美股/外汇/期货市场解读">
<title>${esc(date)} 全球财经每日简报</title>
<style>${CSS}</style>
<script>
// 强制刷新检测：如果页面版本与当前日期不匹配，自动刷新
(function(){
  var v='${esc(date)}-${Date.now()}';
  if(localStorage.getItem('briefing_v')!==v){ localStorage.setItem('briefing_v',v); if(!sessionStorage.getItem('loaded')){ sessionStorage.setItem('loaded','1'); location.reload(true); } }
})();
</script>
</head>
<body>

<div class="top-bar">
  <div class="brand">财经简报<span> | 全球市场每日解读</span></div>
  <div class="nav-links">
    <a href="index.html" class="active">今日简报</a>
    <a href="archive.html">历史简报</a>
    <a href="about.html">关于</a>
  </div>
</div>

<div class="container">

<header class="report-header">
  <div class="pub-info">Daily Financial Briefing</div>
  <h1>全球财经每日简报</h1>
  <div class="subtitle">面向A股散户的信息解读 · 非荐股 · 只做信息整理与方向分析</div>
  <div class="meta-row">
    <div class="meta-item"><span class="label">报告日期</span> <span class="value">${esc(date)}</span></div>
    <div class="meta-item"><span class="label">覆盖市场</span> <span class="value">A股 / 美股 / 港股 / 外汇 / 大宗商品</span></div>
    <div class="meta-item"><span class="label">数据来源</span> <span class="value">东方财富 / Yahoo Finance / 新浪财经</span></div>
    <div class="meta-item"><span class="label">更新时间</span> <span class="value" id="renderTime">${new Date().toISOString()}</span></div>
  </div>
</header>

<div class="market-snapshot">
  <div class="snap-card cn-idx">
    <div class="snap-label">上证指数</div>
    <div class="snap-value">${rd.a_stock?.indices?.sh000001?.close || '--'}</div>
    <div class="snap-change">${rd.a_stock?.indices?.sh000001?.change_pct > 0 ? '<span class="up">+' : '<span class="down">'}${rd.a_stock?.indices?.sh000001?.change_pct || '--'}%</span></div>
  </div>
  <div class="snap-card cn-idx">
    <div class="snap-label">科创50</div>
    <div class="snap-value">${rd.a_stock?.indices?.sh000688?.close || '--'}</div>
    <div class="snap-change">${rd.a_stock?.indices?.sh000688?.change_pct > 0 ? '<span class="up">+' : '<span class="down">'}${rd.a_stock?.indices?.sh000688?.change_pct || '--'}%</span></div>
  </div>
  <div class="snap-card us-idx">
    <div class="snap-label">纳斯达克</div>
    <div class="snap-value">${rd.us_stock?.indices?.nasdaq?.close || '--'}</div>
    <div class="snap-change">${rd.us_stock?.indices?.nasdaq?.change_pct > 0 ? '<span class="up">+' : '<span class="down">'}${rd.us_stock?.indices?.nasdaq?.change_pct || '--'}%</span></div>
  </div>
  <div class="snap-card us-idx">
    <div class="snap-label">标普500</div>
    <div class="snap-value">${rd.us_stock?.indices?.sp500?.close || '--'}</div>
    <div class="snap-change">${rd.us_stock?.indices?.sp500?.change_pct > 0 ? '<span class="up">+' : '<span class="down">'}${rd.us_stock?.indices?.sp500?.change_pct || '--'}%</span></div>
  </div>
  <div class="snap-card flow">
    <div class="snap-label">北向资金</div>
    <div class="snap-value">${rd.capital?.northbound?.net_flow > 0 ? '+' : ''}${rd.capital?.northbound?.net_flow || '--'}亿</div>
    <div class="snap-change" style="font-size:12px;color:#8899aa;">人民币</div>
  </div>
  <div class="snap-card commodity">
    <div class="snap-label">美元指数</div>
    <div class="snap-value">${rd.forex_commodity?.usd_index || '--'}</div>
    <div class="snap-change" style="font-size:12px;color:#8899aa;">离岸CNH ${rd.forex_commodity?.usdcnh || '--'}</div>
  </div>
</div>

${r.one_line_judge ? `<div class="verdict-bar">${escWithBr(r.one_line_judge)}</div>` : ''}

<!-- 今日必知要闻 -->
${(r.headline_events || []).map(renderHeadlineEvent).join('')}

<!-- 宏���与政策 -->
${r.macro_policy ? `
<div class="card priority-high">
  <h2>宏观与政策解读 <span class="tag tag-red">高优先级</span></h2>
  ${r.macro_policy.china ? `<p><strong>中国：</strong>${escWithBr(r.macro_policy.china)}</p>` : ''}
  ${r.macro_policy.overseas ? `<p style="margin-top:8px"><strong>海外：</strong>${escWithBr(r.macro_policy.overseas)}</p>` : ''}
  ${r.macro_policy.signal_conflict ? `<div class="conflict-box"><strong>⚠️ 信号矛盾：</strong>${escWithBr(r.macro_policy.signal_conflict)}</div>` : ''}
</div>` : ''}

<!-- 政策与规划 -->
${r.policy_deep ? `
<div class="card priority-high">
  <h2>政策与规划解读 <span class="tag tag-red">高优先级</span></h2>
  ${r.policy_deep.overview ? `<p>${escWithBr(r.policy_deep.overview)}</p>` : ''}
  ${r.policy_deep.five_year_plan ? `<p style="margin-top:8px"><strong>十五五规划：</strong>${escWithBr(r.policy_deep.five_year_plan)}</p>` : ''}
  ${r.policy_deep.financial_policy ? `<p style="margin-top:8px"><strong>金融政策：</strong>${escWithBr(r.policy_deep.financial_policy)}</p>` : ''}
  ${r.policy_deep.industry_policy ? `<p style="margin-top:8px"><strong>产业政策：</strong>${escWithBr(r.policy_deep.industry_policy)}</p>` : ''}
  ${r.policy_deep.regulation ? `<p style="margin-top:8px"><strong>监管动态：</strong>${escWithBr(r.policy_deep.regulation)}</p>` : ''}
  ${r.policy_deep.key_meetings ? `<p style="margin-top:8px"><strong>重要会议：</strong>${escWithBr(r.policy_deep.key_meetings)}</p>` : ''}
  ${r.policy_deep.policy_impact ? `<div class="conflict-box"><strong>政策影响研判：</strong>${escWithBr(r.policy_deep.policy_impact)}</div>` : ''}
</div>` : ''}

<!-- 资金面 -->
${r.capital_flow ? `
<div class="card priority-high">
  <h2>资金面解读 <span class="tag tag-red">高优先级</span></h2>
  ${r.capital_flow.northbound ? `<p>${escWithBr(r.capital_flow.northbound)}</p>` : ''}
  ${r.capital_flow.margin ? `<p style="margin-top:6px">${escWithBr(r.capital_flow.margin)}</p>` : ''}
  ${r.capital_flow.pboc_operation ? `<p style="margin-top:6px">${escWithBr(r.capital_flow.pboc_operation)}</p>` : ''}
  ${r.capital_flow.overall_judgment ? `<p style="margin-top:8px;font-weight:600;">资金面综合判断：${escWithBr(r.capital_flow.overall_judgment)}</p>` : ''}
</div>` : ''}

<!-- 国际市场 -->
${r.international ? `
<div class="card priority-mid">
  <h2>国际市场解读 <span class="tag tag-orange">中优先级</span></h2>
  ${r.international.us_stock ? `<p>${escWithBr(r.international.us_stock)}</p>` : ''}
  ${r.international.forex ? `<p style="margin-top:6px">${escWithBr(r.international.forex)}</p>` : ''}
  ${r.international.commodity ? `<p style="margin-top:6px">${escWithBr(r.international.commodity)}</p>` : ''}
  ${r.international.geopolitical ? `<p style="margin-top:6px">${escWithBr(r.international.geopolitical)}</p>` : ''}
</div>` : ''}

<!-- A股行情 -->
${r.a_stock_review ? `
<div class="card priority-mid">
  <h2>A股行情解读 <span class="tag tag-orange">中优先级</span></h2>
  ${r.a_stock_review.indices ? `<p>${escWithBr(r.a_stock_review.indices)}</p>` : ''}
  ${r.a_stock_review.volume ? `<p style="margin-top:6px">${escWithBr(r.a_stock_review.volume)}</p>` : ''}
  ${r.a_stock_review.top_sectors ? `<p style="margin-top:6px">${escWithBr(r.a_stock_review.top_sectors)}</p>` : ''}
  ${r.a_stock_review.limit_up_down ? `<p style="margin-top:6px">${escWithBr(r.a_stock_review.limit_up_down)}</p>` : ''}
</div>` : ''}

<!-- 四个行业深度 -->
${renderIndustryBlock('AI 人工智能板块深度解读', r.ai_deep)}
${renderIndustryBlock('具身智能机器人板块深度解读', r.robot_deep)}
${renderIndustryBlock('有色金属（上游）板块深度解读', r.metal_deep)}
${renderIndustryBlock('电力设备与新能源板块深度解读', r.power_deep)}

<!-- 明日预览 -->
${r.tomorrow_preview ? `
<div class="card priority-ref">
  <h2>明日提前知道 <span class="tag tag-blue">参考级</span></h2>
  ${r.tomorrow_preview.economic_data ? `<p>${escWithBr(r.tomorrow_preview.economic_data)}</p>` : ''}
  ${r.tomorrow_preview.events ? `<p style="margin-top:6px">${escWithBr(r.tomorrow_preview.events)}</p>` : ''}
  <div class="tomorrow-grid">
    ${r.tomorrow_preview.ai_sector ? `<div class="tomorrow-item"><strong>AI板块</strong>${escWithBr(r.tomorrow_preview.ai_sector)}</div>` : ''}
    ${r.tomorrow_preview.robot_sector ? `<div class="tomorrow-item"><strong>机器人板块</strong>${escWithBr(r.tomorrow_preview.robot_sector)}</div>` : ''}
    ${r.tomorrow_preview.metal_sector ? `<div class="tomorrow-item"><strong>有色板块</strong>${escWithBr(r.tomorrow_preview.metal_sector)}</div>` : ''}
    ${r.tomorrow_preview.power_sector ? `<div class="tomorrow-item"><strong>电力设备板块</strong>${escWithBr(r.tomorrow_preview.power_sector)}</div>` : ''}
    ${r.tomorrow_preview.trend_tracking ? `<div class="tomorrow-item"><strong>持续跟踪</strong>${escWithBr(r.tomorrow_preview.trend_tracking)}</div>` : ''}
  </div>
</div>` : ''}

<!-- 市场全景图 -->
${r.market_panorama ? `<div class="panorama">${escWithBr(r.market_panorama)}</div>` : ''}

<!-- 自检报告 -->
${renderSelfCheck(r.self_check)}

<!-- 底部 -->
<div class="footer">
  <p class="disclaimer">⚠️ 免责声明：本简报仅供信息参考，不构成任何投资建议。投资决策由用户自行做出，盈亏自负。</p>
  <p>数据来自公开API，可能存在延迟或误差。建议通过官方渠道二次确认关键数据。</p>
  <p>简报中的"影响分析"部分为AI基于数据的推理判断，属于主观分析，不代表确定性预测。</p>
  <p style="margin-top:8px;">全球财经每日简报 · 由 Claude Code 每日自动生成 · ${esc(date)}</p>
</div>

</div>
</body>
</html>`;
}

// ============================================================
// 首页（重定向到当天简报）
// ============================================================

function renderIndexHTML(date) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0;url=daily/${date}.html">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>全球财经每日简报</title>
<link rel="canonical" href="daily/${date}.html">
<style>
  body { font-family:-apple-system,BlinkMacSystemFont,"Microsoft YaHei",sans-serif; display:flex; justify-content:center; align-items:center; min-height:100vh; background:#f5f6fa; margin:0; }
  .loading { text-align:center; color:#333; }
  .loading h2 { margin-bottom:10px; }
  .loading a { color:#3498db; }
</style>
</head>
<body>
<div class="loading">
  <h2>正在跳转到今日简报...</h2>
  <p>如果没有自动跳转，请点击 <a href="daily/${date}.html">这里</a></p>
</div>
</body>
</html>`;
}

// ============================================================
// 关于页面
// ============================================================

function renderAboutHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
<title>关于 - 全球财经每日简报</title>
<style>${CSS}</style>
</head>
<body>
<div class="container">

<header class="header">
  <h1>全球财经每日简报</h1>
  <div class="date">关于本网站</div>
</header>

<nav class="nav">
  <a href="index.html">今日简报</a>
  <a href="archive.html">历史简报</a>
  <a href="about.html" class="active">关于</a>
</nav>

<div class="card">
  <h2>简报定位</h2>
  <p>本网站面向中国A股散户投资者，提供每日全球财经信息整理和解读。核心目标是：<strong>把华尔街语言翻译成菜市场语言</strong>。</p>
  <p style="margin-top:8px">我们不做荐股，不做买卖建议，只做信息整理和方向分析。让散户在掌握足够信息的基础上，做出自己的投资决策。</p>
</div>

<div class="card">
  <h2>重点关注行业</h2>
  <p><strong>AI 人工智能</strong>：A股AI龙头 + 美股AI龙头（NVIDIA/TSMC/AMD等）映射对比</p>
  <p style="margin-top:6px"><strong>具身智能机器人</strong>：A股机器人龙头 + 海外（Tesla Optimus/ABB等）进展追踪</p>
  <p style="margin-top:6px"><strong>有色金属（上游）</strong>：大宗商品价格传导链 + 矿企利润分析 + 海外矿企映射</p>
</div>

<div class="card">
  <h2>数据来源</h2>
  <table>
    <tr><th>数据类别</th><th>来源</th></tr>
    <tr><td>A股行情数据</td><td>东方财富行情API (push2.eastmoney.com)</td></tr>
    <tr><td>北向资金</td><td>东方财富北向资金API (push2his.eastmoney.com)</td></tr>
    <tr><td>两融余额</td><td>东方财富数据中心 (datacenter-web.eastmoney.com)</td></tr>
    <tr><td>美股行情</td><td>Yahoo Finance API (query1.finance.yahoo.com)</td></tr>
    <tr><td>外汇</td><td>新浪财经外汇API (hq.sinajs.cn)</td></tr>
    <tr><td>商品期货</td><td>东方财富商品期货API (push2.eastmoney.com)</td></tr>
    <tr><td>行业政策/新闻</td><td>公开财经媒体 + RSS订阅</td></tr>
    <tr><td>宏观经济数据</td><td>国家统计局/央行官网公开数据</td></tr>
    <tr><td>解读生成</td><td>AI大模型（Claude/OpenAI）</td></tr>
  </table>
</div>

<div class="card">
  <h2>更新时间</h2>
  <p>每天早上 <strong>7:30（北京时间）</strong> 自动更新，覆盖隔夜美股收盘数据和A股盘前重要信息。</p>
  <p style="margin-top:4px">A股交易日发布完整版，周末和节假日发布精简版。</p>
</div>

<div class="card priority-high">
  <h2>⚠️ 免责声明</h2>
  <ol style="padding-left:20px;">
    <li>本简报仅供信息参考，<strong>不构成任何投资建议</strong>。投资决策由用户自行做出，盈亏自负。</li>
    <li>简报中的数据来自公开API和搜索结果，可能存在延迟或误差。建议用户在做决策前通过官方渠道二次确认关键数据。</li>
    <li>简报中的"影响分析"部分为AI基于数据的推理判断，属于主观分析，不代表确定性预测。</li>
    <li>简报不对任何标的做买入/卖出建议。</li>
    <li>历史类比仅供参考，不代表未来必然如此。</li>
  </ol>
</div>

<div class="footer">
  <p>全球财经每日简报 | 面向A股散户的信息解读平台</p>
  <p>由 GitHub Actions 每日自动生成</p>
</div>

</div>
</body>
</html>`;
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  const date = today();
  console.log(`开始渲染HTML页面，日期: ${date}`);

  // 读取数据
  const rawPath = join(DATA_DIR, `raw_${date}.json`);
  const interpPath = join(DATA_DIR, `interpret_${date}.json`);
  const rawLatestPath = join(DATA_DIR, 'raw_latest.json');
  const interpLatestPath = join(DATA_DIR, 'interpret_latest.json');

  let rawData = null;
  let interpret = null;

  if (existsSync(rawPath)) rawData = JSON.parse(readFileSync(rawPath, 'utf-8'));
  else if (existsSync(rawLatestPath)) rawData = JSON.parse(readFileSync(rawLatestPath, 'utf-8'));

  if (existsSync(interpPath)) interpret = JSON.parse(readFileSync(interpPath, 'utf-8'));
  else if (existsSync(interpLatestPath)) interpret = JSON.parse(readFileSync(interpLatestPath, 'utf-8'));

  if (!rawData && !interpret) {
    console.error(`未找到${date}的数据文件，无法渲染`);
    process.exit(1);
  }

  // 生成每日简报HTML
  const dailyHTML = renderDailyHTML(date, rawData, interpret);
  writeFileSync(join(DAILY_DIR, `${date}.html`), dailyHTML, 'utf-8');
  console.log(`✓ dist/daily/${date}.html`);

  // 生成首页（重定向）
  const indexHTML = renderIndexHTML(date);
  writeFileSync(join(DIST_DIR, 'index.html'), indexHTML, 'utf-8');
  console.log('✓ dist/index.html');

  // 生成关于页面
  const aboutHTML = renderAboutHTML();
  writeFileSync(join(DIST_DIR, 'about.html'), aboutHTML, 'utf-8');
  console.log('✓ dist/about.html');

  console.log('HTML渲染完成');
}

main().catch(err => {
  console.error('HTML渲染出错:', err.message);
  process.exit(1);
});
