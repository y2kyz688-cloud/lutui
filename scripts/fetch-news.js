/**
 * 财经新闻自动采集脚本
 * 从多个RSS/API源获取当日重大财经新闻
 * 输出: data/news_YYYY-MM-DD.json
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
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

async function fetchText(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinanceBot/1.0)' } });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === retries) return null;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

async function fetchJson(url, retries = 2) {
  const text = await fetchText(url, retries);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

// 东方财富要闻
async function fetchEastMoneyNews() {
  const items = [];
  try {
    const data = await fetchJson('https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f2,f3,f4,f12,f14&secids=1.000001,0.399001,0.399006,1.000688&_=' + Date.now());
    if (data) items.push({ source: '东方财富行情API', note: 'A股指数数据已通过fetch-data.js获取' });
  } catch (e) { /* ignore */ }

  // 新浪财经快讯
  try {
    const sinaData = await fetchJson('https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2509&k=&num=20&page=1&r=' + Date.now());
    if (sinaData?.result?.data) {
      for (const item of sinaData.result.data.slice(0, 15)) {
        items.push({
          title: item.title || '',
          summary: (item.intro || item.title || '').substring(0, 200),
          source: '新浪财经',
          time: item.ctime || '',
        });
      }
    }
  } catch (e) { /* ignore */ }

  // 东方财富RSS
  try {
    const emRss = await fetchText('https://roll.eastmoney.com/roll.xml');
    if (emRss) {
      const titleMatches = emRss.match(/<title><!\[CDATA\[(.+?)\]\]><\/title>/g) || [];
      const linkMatches = emRss.match(/<link>(.+?)<\/link>/g) || [];
      for (let i = 0; i < Math.min(titleMatches.length, 20); i++) {
        const title = titleMatches[i].replace(/<title><!\[CDATA\[/, '').replace(/\]\]><\/title>/, '');
        const link = linkMatches[i + 2]?.replace(/<link>/, '').replace(/<\/link>/, '') || '';
        if (title && !title.includes('RSS') && !title.includes('xml')) {
          items.push({ title, link, source: '东方财富RSS', time: today() });
        }
      }
    }
  } catch (e) { /* ignore */ }

  return items;
}

async function main() {
  console.log('采集财经新闻...');
  const date = today();
  const allNews = await fetchEastMoneyNews();

  // 去重（按标题）
  const seen = new Set();
  const unique = [];
  for (const item of allNews) {
    const key = item.title?.substring(0, 30) || '';
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  // 分类关键词
  const categories = {
    macro: ['央行', 'MLF', 'LPR', '逆回购', '降准', '降息', 'PMI', 'CPI', 'PPI', 'GDP', '社融', '经济'],
    policy: ['国常会', '政治局', '国务院', '发改委', '工信部', '证监会', '金融监管', '新规', '政策', '十五五', '规划'],
    ai: ['AI', '人工智能', 'NVIDIA', '英伟达', '芯片', '半导体', '算力', '寒武纪', '光模块', 'HBM', '存储'],
    robot: ['机器人', 'Optimus', 'Tesla', '特斯拉', '自动化', 'Figure AI'],
    metal: ['铜', '铝', '锂', '稀土', '黄金', '有色', '紫金', '天齐'],
    power: ['光伏', '储能', '电池', '电网', '电力', '宁德', '比亚迪', '新能源', '隆基', '阳光电源'],
    market: ['北向', 'A股', '上证', '创业板', '科创', '美股', '纳指', '道指', '标普', '成交', '涨停', '跌停'],
    global: ['美联储', '加息', '降息', '美元', '人民币', '汇率', '油价', '原油', '中东', '伊朗'],
  };

  const categorized = {};
  for (const [cat, kws] of Object.entries(categories)) {
    categorized[cat] = unique.filter(item =>
      kws.some(kw => (item.title || '').includes(kw) || (item.summary || '').includes(kw))
    ).slice(0, 10);
  }

  const output = {
    date,
    fetched_at: new Date().toISOString(),
    total_articles: unique.length,
    categorized,
    top_headlines: unique.slice(0, 20),
  };

  const outPath = join(DATA_DIR, `news_${date}.json`);
  writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
  const latestPath = join(DATA_DIR, 'news_latest.json');
  writeFileSync(latestPath, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`新闻采集完成: ${unique.length}条 → ${outPath}`);
  console.log(`分类: 宏观${categorized.macro.length} 政策${categorized.policy.length} AI${categorized.ai.length} 机器人${categorized.robot.length} 市场${categorized.market.length} 国际${categorized.global.length}`);
}

main().catch(err => { console.error('新闻采集出错:', err.message); process.exit(1); });
