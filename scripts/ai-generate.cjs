/**
 * 专业投资机构级 AI 解读生成
 * 提示词编码了专业投资分析方法论
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

function today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function fexists(f) { try { return fs.existsSync(f); } catch { return false; } }

const date = today();
console.log('AI解读 - ' + date);

let rawData = null, newsData = null, methodRules = '';
const rp = path.join(DATA, 'raw_' + date + '.json');
const rl = path.join(DATA, 'raw_latest.json');
const np = path.join(DATA, 'news_' + date + '.json');
const nl = path.join(DATA, 'news_latest.json');
const mp = path.join(ROOT, 'prompts', 'methodology.txt');

if (fexists(rp)) rawData = JSON.parse(fs.readFileSync(rp, 'utf8'));
else if (fexists(rl)) rawData = JSON.parse(fs.readFileSync(rl, 'utf8'));
if (!rawData) { console.error('No raw data'); process.exit(1); }
if (fexists(np)) newsData = JSON.parse(fs.readFileSync(np, 'utf8'));
else if (fexists(nl)) newsData = JSON.parse(fs.readFileSync(nl, 'utf8'));
if (fexists(mp)) methodRules = fs.readFileSync(mp, 'utf8');

let newsCtx = '';
if (newsData?.news_digest) newsCtx = '\n\n' + newsData.news_digest;
else if (newsData?.top_headlines?.length) newsCtx = '\n\n## 今日财经新闻\n' + newsData.top_headlines.map(n => '- [' + n.source + '] ' + n.title).join('\n');

// ====== 专业投资机构级系统提示词 ======
const SYS = '你是一家顶级资产管理公司的资深投资分析师。你的客户是中国A股散户，他们需要你帮他们理解：今天市场发生了什么？为什么？对我有什么影响？\n' +
'\n' +
'## 你的分析框架（必须按此顺序思考）\n' +
'\n' +
'### 第一层：宏观定调\n' +
'先看全局——大盘涨跌、成交额、涨跌比。判断今天是风险偏好上升还是下降。回答：今天市场总体处于什么状态？（普涨/普跌/分化/震荡）\n' +
'\n' +
'### 第二层：资金流向\n' +
'钱在往哪里流？从哪个板块流向哪个板块？北向/两融是什么态度？回答：今天的资金逻辑是什么？\n' +
'\n' +
'### 第三层：板块轮动\n' +
'基于sector_indices数据，哪些板块强、哪些弱？为什么强、为什么弱？回答：板块轮动方向是什么？\n' +
'\n' +
'### 第四层：核心驱动\n' +
'找出今天市场变动的最核心的3-5个驱动因素。每个驱动因素写成一条要闻，按④步因果链展开。\n' +
'\n' +
'## 写作要求\n' +
'\n' +
'### 每条要闻的④步因果链（每条300-500字）\n' +
'①事实：引用raw_data或news中的具体数字。上限点位/涨跌幅/成交量/价格。必须标注数据来源（东方财富API/新浪期货/news等）。\n' +
'②直接后果：这个事实本身导致什么变化？不要跳跃，一步步推导。\n' +
'③传导到A股：后果如何一步步传导到A股的具体板块？每条传导路径都要写清楚。\n' +
'④对散户的影响：具体到投资方向/关注重点/风险提示。说方向（偏多/偏空/中性），但不说买入/卖出。\n' +
'\n' +
'### 宏观与政策解读\n' +
'- 中国宏观：引用具体数据（PMI/CPI等），没有就说没有\n' +
'- 海外宏观：美联储/欧央行/日央行最新动态\n' +
'- 信号矛盾：当不同维度信号指向相反时，必须列出并分析权重。这是全篇最重要的判断之一\n' +
'\n' +
'### 政策与规划解读（每个子项都要充实）\n' +
'- overview：一句话概括今日政策面\n' +
'- five_year_plan：十五五相关行业政策\n' +
'- financial_policy：央行/证监会/金融监管总局最新\n' +
'- industry_policy：AI/机器人/有色/电力设备相关\n' +
'- regulation：监管动态\n' +
'- key_meetings：近期重要会议及前瞻\n' +
'- policy_impact：政策对A股的综合影响研判（标注⚠️分析判断）\n' +
'\n' +
'### 行业深度（每个行业必须包含以下完整结构）\n' +
'1. sector_index：板块指数涨跌+与大盘对比。这是板块判断的基础\n' +
'2. a_stock_leaders：代表性个股逐一分析（6-7只），每只2-3句话说明涨跌原因。标注⚠️个股仅为案例\n' +
'3. overseas_mapping_table：海外映射表（至少4行），每行含海外龙头涨跌+垄断地位+A股映射+映射逻辑解读\n' +
'4. industry_news：行业重大动态\n' +
'5. earnings_alert：财报关注\n' +
'6. dragon_tiger：龙虎榜（有就写，没有标注❌）\n' +
'7. judgment：综合判断（偏多/偏空/中性+评分/10+3条以上逻辑+3条以上风险+内部优先级排序）。标注⚠️分析判断\n' +
'\n' +
'### 方向性判断的铁律\n' +
'- 必须基于sector_indices板块指数数据\n' +
'- 必须有板块vs大盘的对比\n' +
'- 缺少资金流向/广度数据时标注⚠️数据局限\n' +
'- 单日数据仅代表单日观察，不妄下趋势结论\n' +
'\n' +
'### 风险提示必须包含\n' +
'- 每个判断都要列出至少2-3个风险点\n' +
'- 区分短期风险（1-5天）和中期风险（1-3个月）\n' +
'- 标注哪些是市场共识风险、哪些是被市场忽视的风险\n' +
'\n' +
'## 方法论铁律\n' +
methodRules + '\n' +
'\n' +
'## 输出格式\n' +
'完整JSON。每个字段都要充实，不要用\"今日无数据\"\"待更新\"\"暂无\"敷衍。数据没有就标注❌并说明原因。分析判断标注⚠️。大白话翻译所有术语。只输出JSON不要其他文字。';

// ====== 用户消息 ======
const USER = '请基于以下真实数据' + (newsData ? '和新闻' : '') + '，以上述专业投资机构的标准，生成今日完整财经简报JSON。\n' +
'\n## 今日行情数据（API实时采集）\n```json\n' + JSON.stringify(rawData).substring(0, 28000) + '\n```\n' + newsCtx + '\n' +
'\n## 关键提醒\n' +
'1. 5条要闻必须各有侧重：宏观1-2条、产业1-2条、资金/情绪1-2条、海外1条。不要5条都写同一个方向\n' +
'2. 海外映射表每行必须写清楚传导逻辑，不是简单罗列\n' +
'3. 判断中必须区分\"数据事实\"和\"分析推断\"，后者标注⚠️\n' +
'4. policy_deep每个子项都要有实质内容，不要写\"今日无政策\"\n' +
'5. self_check的unverified_list不超过5项\n' +
'6. 板块指数数据必须引用真实数字，不要用\"大涨\"\"暴跌\"替代具体百分比';

async function callDeepSeek() {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY not set');
  console.log('调用DeepSeek... (sys:' + SYS.length + ' user:' + USER.length + ')');
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({ model: 'deepseek-chat', max_tokens: 8192, temperature: 0.3, messages: [{ role: 'system', content: SYS }, { role: 'user', content: USER }] }),
  });
  if (!res.ok) { const t = await res.text(); throw new Error('HTTP ' + res.status + ': ' + t.substring(0, 300)); }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response');
  console.log('DeepSeek: ' + text.length + ' chars, ' + (data.usage?.total_tokens || '?') + ' tokens');
  let json = text;
  const m = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (m) json = m[1]; else { const m2 = text.match(/(\{[\s\S]*\})/); if (m2) json = m2[1]; }
  return JSON.parse(json.trim());
}

async function main() {
  let interp;
  try {
    interp = await callDeepSeek();
  } catch (err) {
    console.error('DeepSeek失败:', err.message);
    interp = { date, headline_events: [], one_line_judge: '今日数据已更新(' + date + ')。AI解读生成失败。', market_panorama: '数据驱动基础版。', self_check: { confidence_stats: { verified: 0, single: 0, unverified: 0 }, unverified_list: ['AI生成失败'], sources: ['东方财富API'] } };
  }
  interp.date = date;
  const op = path.join(DATA, 'interpret_' + date + '.json');
  fs.writeFileSync(op, JSON.stringify(interp, null, 2), 'utf-8');
  fs.writeFileSync(path.join(DATA, 'interpret_latest.json'), JSON.stringify(interp, null, 2), 'utf-8');
  console.log('✅ 保存: ' + op + ' (' + JSON.stringify(interp).length + ' bytes)');
  const sc = interp.self_check || {};
  console.log('自检: ✅' + (sc.confidence_stats?.verified || 0) + ' ⚠️' + (sc.confidence_stats?.single || 0) + ' ❌' + (sc.confidence_stats?.unverified || 0));
}

main().catch(err => { console.error('失败:', err.message); process.exit(1); });
