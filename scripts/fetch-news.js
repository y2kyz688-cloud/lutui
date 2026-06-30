/**
 * 财经新闻采集 - 多源RSS + 关键词分类
 */
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function fetchText(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    clearTimeout(t);
    return res.ok ? await res.text() : null;
  } catch { return null; }
}

async function fetchJson(url) {
  const text = await fetchText(url);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

// 财联社电报
async function fetchCLS() {
  const items = [];
  try {
    const data = await fetchJson('https://www.cls.cn/api/sw?app=CailianpressWeb&os=web&sv=8.4.6');
    for (const r of (data?.data?.roll_data || []).slice(0, 30)) {
      const title = (r.title || r.content || '').replace(/<[^>]+>/g, '').trim();
      if (title) items.push({ title: title.substring(0, 200), source: '财联社', time: r.ctime ? new Date(r.ctime * 1000).toISOString() : '' });
    }
  } catch (e) { /* ignore */ }
  return items;
}

// 东方财富RSS
async function fetchEastMoney() {
  const items = [];
  try {
    const text = await fetchText('https://roll.eastmoney.com/roll.xml');
    if (!text) return items;
    const matches = text.match(/<title><!\[CDATA\[(.+?)\]\]><\/title>/g) || [];
    for (let i = 0; i < Math.min(matches.length, 30); i++) {
      const title = matches[i].replace(/<title><!\[CDATA\[/, '').replace(/\]\]><\/title>/, '').trim();
      if (title && title.length > 8 && !title.includes('RSS')) items.push({ title, source: '东方财富', time: today() });
    }
  } catch (e) { /* ignore */ }
  return items;
}

// 新浪财经
async function fetchSina() {
  const items = [];
  try {
    const data = await fetchJson('https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2509&k=&num=20&page=1');
    for (const item of (data?.result?.data || [])) {
      const title = (item.title || '').replace(/<[^>]+>/g, '').trim();
      if (title) items.push({ title, source: '新浪财经', time: item.ctime || '' });
    }
  } catch (e) { /* ignore */ }
  return items;
}

// 关键词分类
const KEYWORDS = {
  macro: ['央行', 'MLF', 'LPR', '逆回购', '降准', '降息', 'PMI', 'CPI', 'PPI', 'GDP', '社融', '经济数据', '统计局', '财政', '国债', '利率'],
  policy: ['国常会', '政治局', '国务院', '发改委', '工信部', '证监会', '金融监管', '新规', '政策', '十五五', '碳达峰', '碳中和', '能源局', '商务部'],
  ai: ['AI', '人工智能', '芯片', '半导体', '算力', '寒武纪', '光模块', 'CPO', 'HBM', '存储', 'NVIDIA', '英伟达', '大模型', 'GPU', '台积电', 'OpenAI'],
  robot: ['机器人', 'Optimus', '特斯拉', '自动化', 'Figure AI', '宇树', '人形', '减速器'],
  metal: ['铜价', '铝价', '锂价', '稀土', '黄金', '有色', '紫金', '天齐', '大宗商品'],
  power: ['光伏', '储能', '电池', '电网', '宁德', '比亚迪', '新能源', '隆基', '阳光电源', '国电南瑞', '特高压', '风电'],
  market: ['北向资金', 'A股', '上证', '创业板', '科创50', '美股', '纳指', '道指', '成交额', '涨停', '两融'],
  global: ['美联储', '加息', '降息', '美元指数', '人民币', '汇率', '油价', '原油', '中东', '伊朗', '非农'],
};

function categorize(items) {
  const result = {};
  for (const [cat, kws] of Object.entries(KEYWORDS)) {
    result[cat] = items.filter(item => kws.some(kw => (item.title || '').includes(kw))).slice(0, 10);
  }
  return result;
}

async function main() {
  console.log('采集财经新闻...');
  const date = today();

  const [clsNews, emNews, sinaNews] = await Promise.all([fetchCLS(), fetchEastMoney(), fetchSina()]);
  console.log(`财联社:${clsNews.length} 东财:${emNews.length} 新浪:${sinaNews.length}`);

  // 合并去重
  const seen = new Set();
  const unique = [];
  for (const item of [...clsNews, ...emNews, ...sinaNews]) {
    const key = (item.title || '').substring(0, 40);
    if (key && !seen.has(key)) { seen.add(key); unique.push(item); }
  }

  const categorized = categorize(unique);

  // 生成新闻摘要（直接注入AI提示词）
  const catNames = { macro: '宏观/央行', policy: '政策/监管', ai: 'AI/半导体', robot: '机器人', metal: '有色/大宗', power: '电力/新能源', market: 'A股/美股', global: '国际/外汇' };
  let digest = '## 今日财经新闻摘要\n\n';
  let totalCats = 0;
  for (const [cat, items] of Object.entries(categorized)) {
    if (items.length > 0) {
      digest += `### ${catNames[cat] || cat} (${items.length}条)\n`;
      items.slice(0, 6).forEach(i => { digest += `- [${i.source}] ${i.title}\n`; });
      digest += '\n';
      totalCats++;
    }
  }
  if (totalCats === 0) digest += '(今日未采集到分类新闻，请主要参考行情数据分析)\n';

  const output = { date, fetched_at: new Date().toISOString(), total_articles: unique.length, categorized, news_digest: digest, top_headlines: unique.slice(0, 20) };
  writeFileSync(join(DATA_DIR, `news_${date}.json`), JSON.stringify(output, null, 2), 'utf-8');
  writeFileSync(join(DATA_DIR, 'news_latest.json'), JSON.stringify(output, null, 2), 'utf-8');
  console.log(`完成: ${unique.length}条 (宏观${categorized.macro.length} 政策${categorized.policy.length} AI${categorized.ai.length} 市场${categorized.market.length} 国际${categorized.global.length})`);
}

main().catch(err => { console.error('新闻出错:', err.message); process.exit(1); });
