/**
 * 财经新闻采集 v3 - 第一财经API + RSS混合源
 * 覆盖：宏观政策/AI科技/A股市场/海外/产业
 */
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(dirname(__dirname), 'data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function fetchJson(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    clearTimeout(t);
    return res.ok ? await res.json() : null;
  } catch { return null; }
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

// 第一财经 - 多频道采集
async function fetchYicai() {
  const items = [];
  const channels = [
    { id: 'getlatest', name: '最新' },
    { id: 'getlistbycid?cid=54', name: 'A股' },
    { id: 'getlistbycid?cid=58', name: '科技' },
    { id: 'getlistbycid?cid=56', name: '海外' },
    { id: 'getlistbycid?cid=51', name: '金融' },
  ];

  for (const ch of channels) {
    try {
      const url = `https://www.yicai.com/api/ajax/${ch.id}&page=1&size=15`;
      const data = await fetchJson(url);
      if (!Array.isArray(data)) continue;
      for (const item of data) {
        const title = (item.NewsTitle || '').trim();
        if (title && title.length > 6) {
          items.push({
            title,
            summary: (item.NewsNotes || '').substring(0, 100),
            source: `第一财经${ch.name !== '最新' ? '-' + ch.name : ''}`,
            time: item.CreateDate || item.pubDate || '',
            url: item.url ? `https://www.yicai.com${item.url}` : (item.ShareUrl || ''),
          });
        }
      }
    } catch (e) { /* skip failed channel */ }
  }
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
    const data = await fetchJson(`https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2509&k=&num=20&page=1&r=${Date.now()}`);
    for (const item of (data?.result?.data || [])) {
      const title = (item.title || '').replace(/<[^>]+>/g, '').trim();
      if (title) items.push({ title, source: '新浪财经', time: item.ctime || '' });
    }
  } catch (e) { /* ignore */ }
  return items;
}

// 关键词分类
const KEYWORDS = {
  macro: ['央行', 'MLF', 'LPR', '逆回购', '降准', '降息', 'PMI', 'CPI', 'PPI', 'GDP', '社融', '经济数据', '统计局', '财政', '国债', '利率', '通胀', '通缩'],
  policy: ['国常会', '政治局', '国务院', '发改委', '工信部', '证监会', '金融监管', '新规', '政策', '十五五', '碳达峰', '碳中和', '能源局', '商务部', '科技部', '数据局', '人工智能+'],
  ai: ['AI', '人工智能', '芯片', '半导体', '算力', '寒武纪', '光模块', 'CPO', 'HBM', '存储', 'NVIDIA', '英伟达', '大模型', 'GPU', '台积电', 'OpenAI', '微软', '谷歌', '博通', 'AMD'],
  robot: ['机器人', 'Optimus', '特斯拉', '自动化', 'Figure AI', '宇树', '人形', '减速器', '伺服', '具身智能'],
  metal: ['铜价', '铝价', '锂价', '稀土', '黄金', '有色', '紫金', '天齐', '赣锋', '大宗商品', '铁矿'],
  power: ['光伏', '储能', '电池', '电网', '宁德', '比亚迪', '新能源', '隆基', '阳光电源', '国电南瑞', '特高压', '风电', '充电桩', '碳达峰'],
  market: ['北向', 'A股', '上证', '创业板', '科创50', '美股', '纳指', '道指', '成交额', '涨停', '两融', 'IPO', '退市'],
  global: ['美联储', '加息', '降息', '美元', '人民币', '汇率', '油价', '原油', '中东', '伊朗', '非农', 'PCE', 'CPI'],
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

  const [yicai, em, sina] = await Promise.all([fetchYicai(), fetchEastMoney(), fetchSina()]);
  console.log(`第一财经:${yicai.length} 东财:${em.length} 新浪:${sina.length}`);

  const seen = new Set();
  const unique = [];
  for (const item of [...yicai, ...em, ...sina]) {
    const key = (item.title || '').substring(0, 40);
    if (key && !seen.has(key)) { seen.add(key); unique.push(item); }
  }

  const categorized = categorize(unique);

  // 生成预格式化摘要
  const catNames = { macro: '宏观/央行', policy: '政策/监管', ai: 'AI/半导体', robot: '机器人', metal: '有色/大宗', power: '电力/新能源', market: 'A股/美股', global: '国际/外汇' };
  let digest = '## 今日财经新闻摘要\n\n';
  for (const [cat, items] of Object.entries(categorized)) {
    if (items.length > 0) {
      digest += `### ${catNames[cat] || cat} (${items.length}条)\n`;
      items.slice(0, 6).forEach(i => { digest += `- [${i.source}] ${i.title}${i.summary ? ' | ' + i.summary : ''}\n`; });
      digest += '\n';
    }
  }
  if (unique.length === 0) digest += '(今日未采集到新闻，请主要参考行情数据分析)\n';

  const output = { date, fetched_at: new Date().toISOString(), total_articles: unique.length, categorized, news_digest: digest, top_headlines: unique.slice(0, 25) };
  writeFileSync(join(DATA_DIR, `news_${date}.json`), JSON.stringify(output, null, 2), 'utf-8');
  writeFileSync(join(DATA_DIR, 'news_latest.json'), JSON.stringify(output, null, 2), 'utf-8');
  console.log(`完成: ${unique.length}条 (宏观${categorized.macro.length} 政策${categorized.policy.length} AI${categorized.ai.length} 市场${categorized.market.length} 国际${categorized.global.length})`);
}

main().catch(err => { console.error('新闻出错:', err.message); process.exit(1); });
