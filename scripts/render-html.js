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
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#f5f6fa; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif; color:#333; line-height:1.8; }
.container { max-width:960px; margin:0 auto; padding:20px; }

/* 头部 */
.header { background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460); color:#fff; text-align:center; padding:40px 20px 30px; border-radius:12px; margin-bottom:24px; }
.header h1 { font-size:28px; margin-bottom:8px; }
.header .date { font-size:14px; opacity:0.85; margin-bottom:4px; }
.header .source { font-size:12px; opacity:0.6; }

/* 导航 */
.nav { display:flex; gap:12px; justify-content:center; margin-bottom:24px; flex-wrap:wrap; }
.nav a { color:#3498db; text-decoration:none; padding:6px 16px; background:#fff; border-radius:20px; font-size:14px; border:1px solid #e0e0e0; transition:all .2s; }
.nav a:hover { background:#3498db; color:#fff; border-color:#3498db; }
.nav a.active { background:#3498db; color:#fff; border-color:#3498db; }

/* 卡片 */
.card { background:#fff; border-radius:10px; padding:22px 24px; margin-bottom:18px; box-shadow:0 1px 4px rgba(0,0,0,0.06); }
.card h2 { font-size:19px; margin-bottom:14px; display:flex; align-items:center; gap:8px; }
.card.priority-high { border-left:4px solid #e74c3c; }
.card.priority-mid { border-left:4px solid #f39c12; }
.card.priority-ref { border-left:4px solid #3498db; }

/* 因果链 */
.chain { margin:14px 0; }
.chain-step { display:flex; gap:10px; align-items:flex-start; margin-bottom:10px; }
.chain-num { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:50%; background:#1a1a2e; color:#fff; font-size:14px; font-weight:700; flex-shrink:0; }
.chain-text { flex:1; font-size:15px; }

/* 术语翻译 */
.term { color:#888; font-size:13px; }

/* 信号矛盾 */
.conflict-box { background:#fff3cd; border:1px solid #ffc107; border-radius:8px; padding:14px 18px; margin:14px 0; font-size:15px; }
.conflict-box strong { color:#d35400; }

/* 行业深度区块 */
.industry-block { background:linear-gradient(135deg,#2d1b69,#1a1a2e); color:#fff; border-radius:10px; padding:24px; margin-bottom:18px; border-left:4px solid #8e44ad; }
.industry-block h2 { color:#fff; font-size:19px; margin-bottom:14px; }
.industry-block p, .industry-block li { color:rgba(255,255,255,0.9); }
.industry-block .term { color:rgba(255,255,255,0.6); }

/* 表格 */
.table-wrap { overflow-x:auto; margin:12px 0; }
table { width:100%; border-collapse:collapse; font-size:14px; }
th { background:#f0f3f8; padding:10px 12px; text-align:left; font-weight:600; border-bottom:2px solid #ddd; white-space:nowrap; }
td { padding:9px 12px; border-bottom:1px solid #eee; }
tr:hover { background:#fafbfc; }

/* 涨跌颜色（中国惯例：涨红跌绿）*/
.up { color:#e74c3c; font-weight:600; }
.down { color:#2ecc71; font-weight:600; }
.flat { color:#999; }

/* 置信度标签 */
.badge { display:inline-block; padding:2px 8px; border-radius:4px; font-size:12px; font-weight:600; }
.badge-verified { background:#d4edda; color:#155724; }
.badge-single { background:#fff3cd; color:#856404; }
.badge-fail { background:#f8d7da; color:#721c24; }

/* 标签 */
.tag { display:inline-block; padding:2px 10px; border-radius:12px; font-size:12px; font-weight:600; }
.tag-red { background:#fde8e8; color:#c0392b; }
.tag-orange { background:#fef3e0; color:#d35400; }
.tag-blue { background:#e8f4fd; color:#2471a3; }
.tag-purple { background:#f0e6f6; color:#7d3c98; }

/* 自检报告 */
.self-check { background:#fafafa; border-radius:10px; padding:22px 24px; margin-top:24px; border:1px solid #eee; }
.self-check h3 { font-size:17px; margin-bottom:14px; color:#555; }
.self-check table { font-size:13px; }
.self-check .stats { display:flex; gap:16px; flex-wrap:wrap; margin-bottom:14px; }

/* 一句话研判 */
.one-line { background:linear-gradient(135deg,#1a1a2e,#0f3460); color:#fff; border-radius:10px; padding:20px 24px; margin-bottom:18px; text-align:center; font-size:17px; font-weight:600; }

/* 市场全景图 */
.panorama { background:#f0f4ff; border-radius:10px; padding:20px 24px; margin-bottom:18px; border:1px solid #d0d8f0; font-size:15px; line-height:2; }

/* 底部声明 */
.footer { text-align:center; font-size:12px; color:#999; padding:24px 0; margin-top:20px; border-top:1px solid #e0e0e0; }
.footer p { margin:4px 0; }

/* 空状态 */
.empty-state { text-align:center; padding:60px 20px; color:#999; }
.empty-state .icon { font-size:48px; margin-bottom:16px; }

/* 移动端 */
@media (max-width: 768px) {
  .container { padding:12px; }
  .header { padding:24px 16px 20px; border-radius:8px; }
  .header h1 { font-size:22px; }
  .card { padding:15px; border-radius:8px; }
  .industry-block { padding:15px; }
  table { font-size:12px; }
  th, td { padding:6px 8px; }
  .chain-step { font-size:14px; }
  .one-line { font-size:15px; padding:16px; }
  .nav a { font-size:12px; padding:4px 12px; }
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
<meta name="description" content="${esc(date)} 全球财经每日简报 - A股/美股/外汇/期货市场解读">
<title>${esc(date)} 全球财经每日简报</title>
<style>${CSS}</style>
</head>
<body>
<div class="container">

<!-- 头部 -->
<header class="header">
  <h1>全球财经每日简报</h1>
  <div class="date">${esc(date)}</div>
  <div class="source">面向A股散户的信息解读 | 非荐股，只做信息整理</div>
</header>

<!-- 导航 -->
<nav class="nav">
  <a href="index.html" class="active">今日简报</a>
  <a href="archive.html">历史简报</a>
  <a href="about.html">关于</a>
</nav>

${r.one_line_judge ? `<div class="one-line">${escWithBr(r.one_line_judge)}</div>` : ''}

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
  ${r.tomorrow_preview.ai_sector ? `<p style="margin-top:6px"><strong>AI：</strong>${escWithBr(r.tomorrow_preview.ai_sector)}</p>` : ''}
  ${r.tomorrow_preview.robot_sector ? `<p style="margin-top:6px"><strong>机器人：</strong>${escWithBr(r.tomorrow_preview.robot_sector)}</p>` : ''}
  ${r.tomorrow_preview.metal_sector ? `<p style="margin-top:6px"><strong>有色：</strong>${escWithBr(r.tomorrow_preview.metal_sector)}</p>` : ''}
  ${r.tomorrow_preview.trend_tracking ? `<p style="margin-top:6px"><strong>持续跟踪：</strong>${escWithBr(r.tomorrow_preview.trend_tracking)}</p>` : ''}
</div>` : ''}

<!-- 市场全景图 -->
${r.market_panorama ? `<div class="panorama"><strong>今日市场全景图</strong><br>${escWithBr(r.market_panorama)}</div>` : ''}

<!-- 自检报告 -->
${renderSelfCheck(r.self_check)}

<!-- 底部 -->
<div class="footer">
  <p>⚠️ 免责声明：本简报仅供信息参考，不构成任何投资建议。投资决策由用户自行做出，盈亏自负。</p>
  <p>数据来源公开API，可能存在延迟或误差。建议通过官方渠道二次确认关键数据。</p>
  <p>由 GitHub Actions 每日自动生成 | ${esc(date)}</p>
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
