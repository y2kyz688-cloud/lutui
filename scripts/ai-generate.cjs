/**
 * DeepSeek AI 解读生成（新闻驱动版）
 * 读取 raw数据 + news新闻 → 注入方法论规则 → 调用DeepSeek → 输出interpret JSON
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

function today() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function fileExists(f) { try { return fs.existsSync(f); } catch { return false; } }

const date = today();
console.log('AI解读生成 - 日期:', date);

// ====== 1. 读取数据 ======
const rawPath = path.join(DATA_DIR, `raw_${date}.json`);
const latestRaw = path.join(DATA_DIR, 'raw_latest.json');
const newsPath = path.join(DATA_DIR, `news_${date}.json`);
const latestNews = path.join(DATA_DIR, 'news_latest.json');
const methodPath = path.join(ROOT, 'prompts', 'methodology.txt');

let rawData = null, newsData = null, methodRules = '';

if (fileExists(rawPath)) rawData = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
else if (fileExists(latestRaw)) rawData = JSON.parse(fs.readFileSync(latestRaw, 'utf8'));
if (!rawData) { console.error('No raw data found'); process.exit(1); }

if (fileExists(newsPath)) newsData = JSON.parse(fs.readFileSync(newsPath, 'utf8'));
else if (fileExists(latestNews)) newsData = JSON.parse(fs.readFileSync(latestNews, 'utf8'));
else console.log('No news data, proceeding without news context');

if (fileExists(methodPath)) methodRules = fs.readFileSync(methodPath, 'utf8');

// ====== 2. 构建系统提示词 ======
const systemPrompt = `你是面向A股散户的财经信息解读师。你收到的是今日真实行情数据和新闻摘要。你的任务是把这些信息翻译成散户能看懂的财经简报。

## 分析方法论铁律（必须遵守）

${methodRules.substring(0, 3000)}

## 输出格式

必须输出完整JSON，结构如下（每个字段都要有，缺一不可）：
{
  "date": "${date}",
  "headline_events": [{"title":"","chain":{"fact":"①事实","consequence":"②直接后果","transmission":"③传导A股","impact":"④对散户影响"},"confidence":"✅/⚠️/❌","source":""}],
  "macro_policy": {"china":"","overseas":"","signal_conflict":""},
  "policy_deep": {"overview":"","five_year_plan":"","financial_policy":"","industry_policy":"","regulation":"","key_meetings":"","policy_impact":""},
  "capital_flow": {"northbound":"","margin":"","pboc_operation":"","overall_judgment":""},
  "international": {"us_stock":"","forex":"","commodity":"","geopolitical":""},
  "a_stock_review": {"indices":"","volume":"","top_sectors":"","limit_up_down":""},
  "ai_deep": {"sector_index":"","a_stock_leaders":"","overseas_mapping_table":[],"industry_news":"","earnings_alert":"","dragon_tiger":"","judgment":""},
  "robot_deep": {"sector_index":"","a_stock_leaders":"","overseas_mapping_table":[],"policy":"","overseas_progress":"","earnings_alert":"","dragon_tiger":"","judgment":""},
  "metal_deep": {"sector_index":"","a_stock_leaders":"","overseas_mapping_table":[],"commodity_anchor":"","supply_side":"","earnings_alert":"","dragon_tiger":"","judgment":""},
  "power_deep": {"sector_index":"","a_stock_leaders":"","overseas_mapping_table":[],"industry_news":"","earnings_alert":"","dragon_tiger":"","judgment":""},
  "tomorrow_preview": {"economic_data":"","events":"","ai_sector":"","robot_sector":"","metal_sector":"","power_sector":"","trend_tracking":""},
  "one_line_judge": "",
  "market_panorama": "",
  "self_check": {"data_traceability":"","value_check":"","fabrication_check":"","confidence_stats":{"verified":0,"single":0,"unverified":0},"unverified_list":[],"sources":[]}
}

## 板块判断规则
- 板块结论必须基于sector_indices板块指数数据，严禁用个股代表板块
- 方向性判断（偏多/偏空）必须有板块指数vs大盘的数据支撑
- 缺少资金流向数据时，必须标注⚠️数据局限

## 数据事实vs分析判断
- 数字是事实（用✅标注），推理是分析（用⚠️标注）
- raw_data中没有的数据标注❌未验证，绝不编造
- 新闻中获取的数据标注来源

## 大白话翻译
所有术语必须翻译：MLF→央行放水/抽水、北向→外资买卖A股、两融→散户借钱炒股、PMI→制造业及格线`;

// ====== 3. 构建用户消息 ======
let newsContext = '';
if (newsData && newsData.top_headlines && newsData.top_headlines.length > 0) {
  newsContext = '\n\n## 今日财经新闻（RSS采集）\n';
  newsContext += newsData.top_headlines.map(n => `- [${n.source}] ${n.title}${n.summary ? ' | ' + n.summary : ''}`).join('\n');
  if (newsData.categorized) {
    const cats = newsData.categorized;
    newsContext += '\n\n### 分类摘要\n';
    if (cats.macro?.length) newsContext += '**宏观**: ' + cats.macro.slice(0,5).map(n=>n.title).join('; ') + '\n';
    if (cats.policy?.length) newsContext += '**政策**: ' + cats.policy.slice(0,5).map(n=>n.title).join('; ') + '\n';
    if (cats.ai?.length) newsContext += '**AI/科技**: ' + cats.ai.slice(0,5).map(n=>n.title).join('; ') + '\n';
    if (cats.market?.length) newsContext += '**市场**: ' + cats.market.slice(0,5).map(n=>n.title).join('; ') + '\n';
    if (cats.global?.length) newsContext += '**国际**: ' + cats.global.slice(0,5).map(n=>n.title).join('; ') + '\n';
  }
}

const userMessage = `请基于以下真实行情数据${newsData ? '和新闻摘要' : ''}，生成今日财经简报的完整解读JSON。

## 今日行情数据（来自API实时采集）
\`\`\`json
${JSON.stringify(rawData, null, 2).substring(0, 25000)}
\`\`\`
${newsContext}

## 重要提醒
1. 必须输出完整JSON，不要省略任何字段
2. 板块判断基于sector_indices数据，不是个股
3. raw数据中标注❌的字段，在解读中也标注❌，不要编造
4. 分析部分标注⚠️分析判断
5. 只输出JSON，不要其他文字`;

// ====== 4. 调用 DeepSeek API ======
async function callDeepSeek() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

  console.log(`调用DeepSeek API... (system:${systemPrompt.length} user:${userMessage.length})`);

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      max_tokens: 8192,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`DeepSeek HTTP ${res.status}: ${errText.substring(0, 500)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('DeepSeek returned empty response');

  console.log(`DeepSeek响应: ${text.length} chars, ${data.usage?.total_tokens || '?'} tokens`);

  // 解析JSON（可能包裹在```json```中）
  let jsonStr = text;
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) jsonStr = jsonMatch[1];
  else {
    const objMatch = text.match(/(\{[\s\S]*\})/);
    if (objMatch) jsonStr = objMatch[1];
  }

  return JSON.parse(jsonStr.trim());
}

// ====== 5. 主流程 ======
async function main() {
  let interpret;
  try {
    interpret = await callDeepSeek();
    interpret._meta = {
      generated_at: new Date().toISOString(),
      api: 'deepseek',
      raw_date: rawData.date,
      news_available: !!newsData,
    };
  } catch (err) {
    console.error(`DeepSeek API失败: ${err.message}`);
    // Fallback: 数据驱动基础版
    interpret = {
      date,
      headline_events: [],
      one_line_judge: `今日A股市场数据已更新（${date}）。AI深度解读生成失败，请稍后刷新。`,
      market_panorama: `本简报为数据驱动基础版，包含今日实时行情数据。AI深度解读暂时不可用（错误：${err.message.substring(0, 100)}）。`,
      self_check: { confidence_stats: { verified: 0, single: 0, unverified: 0 }, unverified_list: ['AI生成失败'], sources: ['东方财富API'] }
    };
  }

  // 补全日期
  interpret.date = date;

  // 保存
  const outPath = path.join(DATA_DIR, `interpret_${date}.json`);
  fs.writeFileSync(outPath, JSON.stringify(interpret, null, 2), 'utf-8');
  const latestPath = path.join(DATA_DIR, 'interpret_latest.json');
  fs.writeFileSync(latestPath, JSON.stringify(interpret, null, 2), 'utf-8');

  console.log(`✅ 解读JSON已保存: ${outPath} (${JSON.stringify(interpret).length} bytes)`);

  // 自检
  const sc = interpret.self_check || {};
  const stats = sc.confidence_stats || {};
  console.log(`自检: ✅${stats.verified||0} ⚠️${stats.single||0} ❌${stats.unverified||0}`);
  if (sc.unverified_list?.length) console.log(`未验证: ${sc.unverified_list.join(', ')}`);
}

main().catch(err => {
  console.error('生成失败:', err.message);
  process.exit(1);
});
