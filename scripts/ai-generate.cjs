/**
 * DeepSeek AI 解读生成 v2 - 深度提示词版
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
function fexists(f) { try { return fs.existsSync(f); } catch { return false; } }

const date = today();
console.log('AI解读生成 - 日期:', date);

// 读取数据
const rawPath = path.join(DATA_DIR, 'raw_' + date + '.json');
const latestRaw = path.join(DATA_DIR, 'raw_latest.json');
const newsPath = path.join(DATA_DIR, 'news_' + date + '.json');
const latestNews = path.join(DATA_DIR, 'news_latest.json');
const methodPath = path.join(ROOT, 'prompts', 'methodology.txt');

let rawData = null, newsData = null, methodRules = '';
if (fexists(rawPath)) rawData = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
else if (fexists(latestRaw)) rawData = JSON.parse(fs.readFileSync(latestRaw, 'utf8'));
if (!rawData) { console.error('No raw data'); process.exit(1); }
if (fexists(newsPath)) newsData = JSON.parse(fs.readFileSync(newsPath, 'utf8'));
else if (fexists(latestNews)) newsData = JSON.parse(fs.readFileSync(latestNews, 'utf8'));
if (fexists(methodPath)) methodRules = fs.readFileSync(methodPath, 'utf8');

// 构建新闻上下文
let newsCtx = '';
if (newsData?.news_digest) newsCtx = '\n\n' + newsData.news_digest;
else if (newsData?.top_headlines?.length) newsCtx = '\n\n## 今日财经新闻\n' + newsData.top_headlines.map(n => '- [' + n.source + '] ' + n.title).join('\n');

const sysPrompt = '你是面向A股散户的资深财经解读师。你收到的是今日真实行情数据和新闻摘要。你的任务不是罗列数据，而是帮散户理解：今天到底发生了什么？为什么？对我有什么影响？\n' +
'\n' +
'## 你的工作方式\n' +
'1. 先浏览行情和新闻，找出今天最重要的3-5件事。每条用④步因果链：①事实（具体数字+来源）→②直接后果→③一步步传导到A股哪些板块→④散户该关注什么\n' +
'2. 数据先行：先引用具体数字，再与基准对比，最后给分析（分析标注⚠️分析判断）\n' +
'3. 板块分析必须用sector_indices板块指数，个股只能作为板块内部的案例\n' +
'4. 海外映射写清传导逻辑：美股XX涨→对A股XX板块的含义→为什么\n' +
'5. 术语翻译：MLF（央行放水/抽水）、北向（外资买卖A股）、两融（散户借钱炒股）、PMI（制造业健康指数，50=及格线）等\n' +
'6. 缺失数据标注❌，绝不编造\n' +
'\n' +
'## 每个板块的写作要求\n' +
'- headline_events: 5条，每条300-500字完整因果链。挑选真正影响A股的事件\n' +
'- macro_policy: 中国宏观+海外宏观+信号矛盾。即使news中政策少，也要基于数据给出判断，不要写"今日无政策"就完事\n' +
'- policy_deep: 从news提取政策信息+基于行情的政策影响推断。每子项都要有内容\n' +
'- capital_flow: 北向/两融有数据写数据，没数据说明原因+综合判断（/10分制）\n' +
'- international: 美股+外汇+大宗+地缘，引用具体数字\n' +
'- a_stock_review: 四大指数各自表现+成交额+领涨领跌板块+涨跌停，要写"为什么"\n' +
'- ai_deep: 板块指数数据→个股案例→海外映射表(至少4行)→行业动态→财报→龙虎榜→判断(偏多/偏空/中性+逻辑+风险)\n' +
'- robot_deep/metal_deep/power_deep: 同上结构\n' +
'- tomorrow_preview: 具体日期和数据名称，不是泛泛而谈\n' +
'- one_line_judge: 2-3句话总结今日最影响A股的信息，是摘要不是板块排名\n' +
'- market_panorama: 一段话串联全天信息：宏观→政策→资金→行情→板块→展望\n' +
'- self_check: 数据溯源+数值校验+防伪造+置信度统计。unverified_list不超过5项\n' +
'\n' +
methodRules.substring(0, 1500) + '\n' +
'\n输出完整JSON，字段齐全，缺一不可。只输出JSON不要其他文字。';

const userMsg = '请基于以下真实行情数据' + (newsData ? '和新闻摘要' : '') + '，生成今日财经简报完整解读JSON。\n' +
'\n## 今日行情数据（API实时采集）\n```json\n' + JSON.stringify(rawData).substring(0, 28000) + '\n```\n' +
newsCtx + '\n' +
'\n## 重要提醒\n' +
'1. 每个板块的judgment必须基于sector_indices数据，引用具体数字\n' +
'2. 海外映射表至少4行，每行都要有逻辑解读\n' +
'3. policy_deep不要写"今日无重大政策"就完事——从news和市场数据中提炼\n' +
'4. 术语必须翻译\n' +
'5. 缺失数据标❌，不编造';

async function callDeepSeek() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');
  console.log('调用DeepSeek... (system:' + sysPrompt.length + ' user:' + userMsg.length + ')');
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({ model: 'deepseek-chat', max_tokens: 8192, temperature: 0.3, messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: userMsg }] }),
  });
  if (!res.ok) { const t = await res.text(); throw new Error('DeepSeek HTTP ' + res.status + ': ' + t.substring(0, 300)); }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response');
  console.log('DeepSeek: ' + text.length + ' chars, tokens:' + (data.usage?.total_tokens || '?'));
  let json = text;
  const m = text.match(/\`\`\`json\s*([\s\S]*?)\s*\`\`\`/);
  if (m) json = m[1]; else { const m2 = text.match(/(\{[\s\S]*\})/); if (m2) json = m2[1]; }
  return JSON.parse(json.trim());
}

async function main() {
  let interp;
  try {
    interp = await callDeepSeek();
  } catch (err) {
    console.error('DeepSeek失败:', err.message);
    interp = { date, headline_events: [], one_line_judge: '今日A股数据已更新(' + date + ')。AI解读生成失败，请稍后刷新。', market_panorama: '数据驱动基础版。错误：' + err.message.substring(0, 100), self_check: { confidence_stats: { verified: 0, single: 0, unverified: 0 }, unverified_list: ['AI生成失败'], sources: ['东方财富API'] } };
  }
  interp.date = date;
  const outPath = path.join(DATA_DIR, 'interpret_' + date + '.json');
  fs.writeFileSync(outPath, JSON.stringify(interp, null, 2), 'utf-8');
  fs.writeFileSync(path.join(DATA_DIR, 'interpret_latest.json'), JSON.stringify(interp, null, 2), 'utf-8');
  console.log('✅ 保存: ' + outPath + ' (' + JSON.stringify(interp).length + ' bytes)');
  const sc = interp.self_check || {};
  console.log('自检: ✅' + (sc.confidence_stats?.verified || 0) + ' ⚠️' + (sc.confidence_stats?.single || 0) + ' ❌' + (sc.confidence_stats?.unverified || 0));
}

main().catch(err => { console.error('失败:', err.message); process.exit(1); });
