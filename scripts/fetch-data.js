/**
 * 全球财经数据采集脚本
 * 每天定时调用各API获取A股/美股/外汇/期货实时行情数据
 * 输出: data/raw_YYYY-MM-DD.json
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// ============================================================
// 工具函数
// ============================================================

function today() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function ts() {
  return new Date().toISOString();
}

function validate(key, value, min, max) {
  if (value === null || value === undefined) return { value: null, confidence: '❌', reason: 'API返回为空' };
  const n = Number(value);
  if (isNaN(n)) return { value, confidence: '⚠️', reason: '非数值数据' };
  if (n < min || n > max) return { value: n, confidence: '❌', reason: `超出合理范围[${min},${max}]` };
  return { value: n, confidence: '✅', reason: '通过范围校验' };
}

async function fetchJson(url, options = {}, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, { ...options, signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0', ...(options.headers || {}) } });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      return text;
    } catch (e) {
      if (i === retries) return null;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

async function fetchJsonParsed(url, retries = 2) {
  const text = await fetchJson(url, {}, retries);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function safeGet(obj, path, fallback = null) {
  try {
    let cur = obj;
    for (const k of path.split('.')) cur = cur[k];
    return cur !== undefined ? cur : fallback;
  } catch { return fallback; }
}

// ============================================================
// A股数据采集（东方财富API）
// ============================================================

async function fetchAShareIndices() {
  const result = {};
  const codes = {
    sh000001: '1.000001',  // 上证指数
    sz399001: '0.399001',  // 深证成指
    sz399006: '0.399006',  // 创业板指
    sh000688: '1.000688',  // 科创50
  };
  const secids = Object.values(codes).join(',');
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f2,f3,f4,f12,f14&secids=${secids}&_=${Date.now()}`;

  const data = await fetchJsonParsed(url);
  if (!data?.data?.diff) {
    for (const [k, v] of Object.entries(codes)) result[k] = { confidence: '❌', reason: 'API请求失败' };
    return result;
  }

  for (const item of data.data.diff) {
    const key = Object.keys(codes).find(k => codes[k] === item.f12 || codes[k].endsWith(item.f12));
    if (key) {
      const close = item.f2;
      const changePct = item.f3;
      const v = validate(key, close, 500, 25000);
      result[key] = {
        name: item.f14,
        close: v.confidence === '✅' ? v.value : close,
        change_pct: changePct,
        confidence: v.confidence,
        source: '东方财富行情API',
        fetched_at: ts(),
      };
    }
  }
  return result;
}

async function fetchAStockStocks(secidsMap) {
  const result = {};
  const entries = Object.entries(secidsMap);
  const secids = entries.map(([, v]) => v).join(',');
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f2,f3,f4,f5,f12,f14&secids=${secids}&_=${Date.now()}`;

  const data = await fetchJsonParsed(url);
  if (!data?.data?.diff) {
    for (const [k] of entries) result[k] = { confidence: '❌', reason: 'API请求失败' };
    return result;
  }

  for (const item of data.data.diff) {
    const key = Object.keys(secidsMap).find(k => secidsMap[k] === item.f12 || secidsMap[k].endsWith(`.${item.f12}`));
    if (key) {
      const close = item.f2;
      const v = validate(key, close, 1, 50000);
      result[key] = {
        name: item.f14,
        close: v.confidence === '✅' ? v.value : close,
        change_pct: item.f3,
        volume: item.f5,
        confidence: v.confidence,
        source: '东方财富行情API',
        fetched_at: ts(),
      };
    }
  }
  return result;
}

async function fetchNorthbound() {
  const url = `https://push2his.eastmoney.com/api/qt/kamt.kline/get?fields1=f1,f2,f3,f4&fields2=f51,f52,f53,f54,f55,f56&klt=101&lmt=5&_=${Date.now()}`;
  const data = await fetchJsonParsed(url);
  if (!data?.data?.klines?.length) return { confidence: '❌', reason: 'API请求失败' };

  const latest = data.data.klines[data.data.klines.length - 1].split(',');
  const net = parseFloat(latest[2]);
  const v = validate('northbound', net, -300, 300);
  return {
    net_flow: v.confidence === '✅' ? v.value : net,
    date: latest[0],
    confidence: v.confidence,
    source: '东方财富北向资金API',
    fetched_at: ts(),
  };
}

async function fetchMarginBalance() {
  const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?sortColumns=TRADE_DATE&sortTypes=-1&pageSize=3&pageNumber=1&reportName=RPTA_DAILY_MARGIN&columns=TRADE_DATE,MARGIN_BALANCE&source=WEB&client=WEB&_=${Date.now()}`;
  const data = await fetchJsonParsed(url);
  if (!data?.result?.data?.length) return { confidence: '❌', reason: 'API请求失败' };

  const latest = data.result.data[0];
  const balance = latest.MARGIN_BALANCE / 1e8; // 转为亿
  const v = validate('margin', balance, 5000, 30000);
  return {
    balance: v.confidence === '✅' ? v.value : balance,
    date: latest.TRADE_DATE,
    confidence: v.confidence,
    source: '东方财富两融API',
    fetched_at: ts(),
  };
}

async function fetchSectorRank() {
  const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=10&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:2&fields=f2,f3,f4,f12,f14&_=${Date.now()}`;
  const data = await fetchJsonParsed(url);
  if (!data?.data?.diff) return { top5_up: [], top5_down: [], confidence: '❌' };

  const list = data.data.diff.map(i => ({
    name: i.f14,
    code: i.f12,
    change_pct: i.f3,
    close: i.f2,
  }));
  const sorted = [...list].sort((a, b) => b.change_pct - a.change_pct);
  return {
    top5_up: sorted.slice(0, 5),
    top5_down: sorted.slice(-5).reverse(),
    confidence: '✅',
    source: '东方财富板块API',
    fetched_at: ts(),
  };
}

async function fetchLimitStats() {
  const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=10000&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f3&_=${Date.now()}`;
  const data = await fetchJsonParsed(url);
  if (!data?.data?.diff) return { up_limit_count: null, down_limit_count: null, confidence: '❌' };

  let up = 0, down = 0;
  for (const item of data.data.diff) {
    if (item.f3 >= 9.9) up++;
    else if (item.f3 <= -9.9) down++;
  }
  return {
    up_limit_count: up,
    down_limit_count: down,
    confidence: '⚠️',
    source: '东方财富涨跌停统计',
    fetched_at: ts(),
  };
}

async function fetchMarketVolume() {
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f2,f3,f4,f5,f12,f14&secids=1.000001,0.399001&_=${Date.now()}`;
  const data = await fetchJsonParsed(url);
  if (!data?.data?.diff) return { volume: null, amount: null, confidence: '❌' };

  const amt = data.data.diff.reduce((sum, i) => sum + (i.f5 || 0), 0);
  const v = validate('amount', amt, 1e8, 5e12);
  return {
    amount: v.confidence === '✅' ? v.value : amt,
    amount_yi: v.confidence === '✅' ? (v.value / 1e8).toFixed(0) : (amt / 1e8).toFixed(0),
    confidence: v.confidence,
    source: '东方财富行情API',
    fetched_at: ts(),
  };
}

// ============================================================
// 美股数据采集（东方财富为主，Yahoo备用）
// ============================================================

async function fetchYahooQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`;
  const data = await fetchJsonParsed(url);
  if (!data?.chart?.result?.[0]) return { close: null, change_pct: null, confidence: '❌', reason: 'Yahoo API失败' };

  const r = data.chart.result[0];
  const meta = r.meta;
  const close = meta.regularMarketPrice;
  const prevClose = meta.previousClose || meta.chartPreviousClose;
  const changePct = prevClose ? ((close - prevClose) / prevClose * 100).toFixed(2) : null;

  const v = validate(symbol, close, 0.01, 1e6);
  return {
    name: meta.symbol || symbol,
    close: v.confidence === '✅' ? v.value : close,
    change_pct: changePct ? parseFloat(changePct) : null,
    confidence: v.confidence,
    source: 'Yahoo Finance API',
    fetched_at: ts(),
  };
}

// 东方财富美股指数
async function fetchEastMoneyIndices() {
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f2,f3,f12,f14&secids=100.DJIA,100.NDX,100.SPX&_=${Date.now()}`;
  const data = await fetchJsonParsed(url);
  if (!data?.data?.diff) return {};
  const result = {};
  const keyMap = { DJIA: 'djia', NDX: 'nasdaq', SPX: 'sp500' };
  for (const item of data.data.diff) {
    const key = keyMap[item.f12] || item.f12.toLowerCase();
    const close = item.f2;
    const changePct = item.f3;
    const v = validate(item.f12, close, 100, 100000);
    result[key] = {
      name: item.f14 || item.f12,
      close: v.confidence === '✅' ? v.value : close,
      change_pct: changePct,
      confidence: v.confidence,
      source: '东方财富美股API',
      fetched_at: ts(),
    };
  }
  return result;
}

// 东方财富美股API（国内网络可用）
async function fetchEastMoneyUS(symbols) {
  const emCodes = symbols.map(s => `105.${s}`).join(',');
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f2,f3,f12,f14&secids=${emCodes}&_=${Date.now()}`;
  const data = await fetchJsonParsed(url);
  if (!data?.data?.diff) return null;

  const result = {};
  for (const item of data.data.diff) {
    const close = item.f2;
    const changePct = item.f3;
    const v = validate(item.f12, close, 0.01, 1e6);
    result[item.f12] = {
      name: item.f14 || item.f12,
      close: v.confidence === '✅' ? v.value : close,
      change_pct: changePct,
      confidence: v.confidence,
      source: '东方财富美股API',
      fetched_at: ts(),
    };
  }
  return result;
}

// ============================================================
// 外汇数据采集（新浪财经）
// ============================================================

async function fetchForex() {
  const result = { usd_index: null, usdcnh: null, confidence: '⚠️' };
  const url = 'https://hq.sinajs.cn/list=fx_susdindex,fx_scnycny';
  const text = await fetchJson(url, { headers: { Referer: 'https://finance.sina.com.cn' } });
  if (!text) return { ...result, confidence: '❌', reason: '新浪外汇API失败' };

  const lines = text.split('\n').filter(l => l.trim());
  for (const line of lines) {
    const match = line.match(/="(.+)"/);
    if (!match) continue;
    const parts = match[1].split(',');
    if (line.includes('susdindex') && parts.length > 2) {
      result.usd_index = parseFloat(parts[1]);
    } else if (line.includes('scnycny') && parts.length > 2) {
      result.usdcnh = parseFloat(parts[1]);
    }
  }
  result.source = '新浪财经外汇API';
  result.fetched_at = ts();
  return result;
}

// ============================================================
// 大宗商品期货采集（东方财富商品期货）
// ============================================================

async function fetchCommodities() {
  const result = { wti_oil: null, gold: null, copper: null, aluminum: null, confidence: '⚠️' };
  const codes = {
    wti_oil: 'CL00Y',     // WTI原油连续
    gold: 'GC00Y',        // COMEX黄金连续
  };
  const secids = Object.values(codes).map(c => `113.${c}`).join(',');
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f2,f3,f12,f14&secids=${secids}&_=${Date.now()}`;
  const data = await fetchJsonParsed(url);
  if (data?.data?.diff) {
    for (const item of data.data.diff) {
      for (const [k, c] of Object.entries(codes)) {
        if (item.f12 === c) result[k] = { close: item.f2, change_pct: item.f3, name: item.f14 };
      }
    }
  }

  // 沪铜、沪铝主力 (国内期货)
  const metalsSecids = '113.CU00Y,113.AL00Y';
  const metalsUrl = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f2,f3,f12,f14&secids=${metalsSecids}&_=${Date.now()}`;
  const metalsData = await fetchJsonParsed(metalsUrl);
  if (metalsData?.data?.diff) {
    for (const item of metalsData.data.diff) {
      if (item.f12 === 'CU00Y') result.copper = { close: item.f2, change_pct: item.f3, name: '沪铜主力' };
      if (item.f12 === 'AL00Y') result.aluminum = { close: item.f2, change_pct: item.f3, name: '沪铝主力' };
    }
  }

  result.source = '东方财富商品期货API';
  result.fetched_at = ts();
  return result;
}

// ============================================================
// 宏观经济数据（简化缓存版本）
// ============================================================

function getMacroData() {
  return {
    china_cpi: { value: null, note: '月度数据，发布日更新', confidence: '❌' },
    china_ppi: { value: null, note: '月度数据，发布日更新', confidence: '❌' },
    china_pmi_manufacturing: { value: null, note: '月度数据，发布日更新', confidence: '❌' },
    china_m2: { value: null, note: '月度数据，发布日更新', confidence: '❌' },
    china_social_financing: { value: null, note: '月度数据，发布日更新', confidence: '❌' },
    us_nonfarm: { value: null, note: '月度数据，发布日更新', confidence: '❌' },
    us_cpi: { value: null, note: '月度数据，发布日更新', confidence: '❌' },
    fed_rate: { value: null, note: '按美联储会议日程更新', confidence: '❌' },
  };
}

// ============================================================
// 新闻事件（RSS+搜索摘要，由AI补充解读）
// ============================================================

// 获取指定行业板块指数（用于板块级别的分析，而非个股代表板块）
async function fetchSectorIndices() {
  const sectorCodes = {
    semiconductor: '90.BK1036',    // 半导体
    ai_chip: '90.BK1127',          // AI芯片
    computing: '90.BK1134',         // 算力概念
    robot: '90.BK1090',             // 机器人概念
    nonferrous: '90.BK0478',        // 有色金属
    power_equipment: '90.BK1200',   // 电力设备
    grid: '90.BK0457',              // 电网设备
    solar: '90.BK1031',             // 光伏设备
    battery: '90.BK0574',           // 锂电池概念
    rare_earth: '90.BK0578',        // 稀土永磁
  };
  const secids = Object.values(sectorCodes).join(',');
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f2,f3,f4,f12,f14&secids=${secids}&_=${Date.now()}`;
  const data = await fetchJsonParsed(url);
  if (!data?.data?.diff) return {};

  const nameMap = Object.fromEntries(Object.entries(sectorCodes).map(([k, v]) => [v.replace('90.', ''), k]));
  const result = {};
  for (const item of data.data.diff) {
    const key = nameMap[item.f12] || item.f12;
    const changePct = item.f3;
    const volume = item.f4;
    result[key] = {
      name: item.f14,
      index_value: item.f2,
      change_pct: changePct,
      volume: volume,
      source: '东方财富板块指数API',
      fetched_at: ts(),
    };
  }
  return result;
}

// Yahoo Finance 外汇和大宗商品（GitHub Actions美国服务器可访问）
async function fetchYahooForexCommodities() {
  const symbols = {
    usd_index: 'DX-Y.NYB',    // 美元指数
    usdcnh: 'CNY=X',           // 美元/离岸人民币
    gold: 'GC=F',              // 黄金期货
    oil: 'CL=F',               // WTI原油
    copper: 'HG=F',            // 铜期货
  };
  const result = {};
  for (const [key, sym] of Object.entries(symbols)) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=2d`;
      const data = await fetchJsonParsed(url);
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta) {
        result[key] = {
          price: meta.regularMarketPrice,
          prev_close: meta.previousClose || meta.chartPreviousClose,
          change_pct: meta.previousClose ? ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100) : null,
          source: 'Yahoo Finance',
          confidence: '✅',
        };
      }
    } catch (e) {
      result[key] = { price: null, confidence: '❌', reason: 'Yahoo API失败' };
    }
  }
  return result;
}

function getNewsPlaceholder() {
  return [
    { title: '（新闻事件由AI搜索补充）', source: 'WebSearch', date: today(), summary: '请在AI解读阶段通过搜索补充当日重大财经新闻' },
  ];
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log(`[${ts()}] 开始数据采集...`);
  const date = today();

  // A股股票代码映射
  const aiStocks = {
    sh688041: '1.688041', sh603019: '1.603019', sh688256: '1.688256',
    sz300418: '0.300418', sz002261: '0.002261', sz000977: '0.000977',
  };
  const robotStocks = {
    sz300607: '0.300607', sh688017: '1.688017', sz002747: '0.002747',
    sz300124: '0.300124', sz300276: '0.300276', sh603728: '1.603728',
  };
  const metalStocks = {
    sh601899: '1.601899', sh600111: '1.600111', sz002466: '0.002466',
    sh603799: '1.603799', sz000807: '0.000807', sh601168: '1.601168', sz002460: '0.002460',
  };
  const powerStocks = {
    sz300750: '0.300750', sz002594: '0.002594', sz300274: '0.300274',
    sh601012: '1.601012', sh600406: '1.600406', sh600089: '1.600089', sh600438: '1.600438',
  };
  const allAStocks = { ...aiStocks, ...robotStocks, ...metalStocks, ...powerStocks };

  // 美股代码（东方财富105.前缀适用于大部分美股，106.适用于台股ADR）
  const usAiLeadersEM = ['NVDA', 'MU', 'MSFT', 'GOOGL', 'META', 'AMD', 'AVGO', 'INTC']; // 东方财富可获取
  const usAiLeadersManual = { TSM: '106.TSM' }; // 需要特殊代码
  const usMetalLeaders = ['FCX', 'AA', 'BHP', 'ALB']; // 东方财富不覆盖，需WebSearch
  const usRobotLeaders = ['TSLA'];
  const usPowerLeadersEM = ['FSLR', 'ENPH']; // 东方财富可获取
  const usPowerLeadersManual = ['GE', 'NEE', 'SIEGY', 'ABBNY', 'SBGSY']; // ADR/特殊标的，需WebSearch
  const usIndices = { djia: '^DJI', nasdaq: '^IXIC', sp500: '^GSPC' };
  const allUSStocksForEM = [...usAiLeadersEM, ...usRobotLeaders, ...usPowerLeadersEM];
  const allUSStocksManual = { ...usAiLeadersManual };

  // 并发执行所有数据采集
  const [
    aShareIndices,
    aShareStocks,
    northbound,
    margin,
    sectors,
    limits,
    volume,
    usIdxYahoo,
    usStocksYahoo,
    usIdxEastMoney,
    usStocksEastMoney,
    sectorIndices,
    forex,
    commodities,
    yahooFC,
  ] = await Promise.all([
    fetchAShareIndices(),
    fetchAStockStocks(allAStocks),
    fetchNorthbound(),
    fetchMarginBalance(),
    fetchSectorRank(),
    fetchLimitStats(),
    fetchMarketVolume(),
    Promise.all(Object.entries(usIndices).map(async ([k, sym]) => [k, await fetchYahooQuote(sym)])).then(Object.fromEntries),
    Promise.all([...usAiLeadersEM, ...usRobotLeaders, ...usPowerLeadersEM, ...Object.keys(usAiLeadersManual), ...usMetalLeaders, ...usPowerLeadersManual].map(async s => [s, await fetchYahooQuote(s)])).then(Object.fromEntries),
    fetchEastMoneyIndices(),
    fetchEastMoneyUS([...usAiLeadersEM, ...usRobotLeaders, ...usPowerLeadersEM, ...Object.values(usAiLeadersManual)]),
    fetchSectorIndices(),
    fetchForex(),
    fetchCommodities(),
    fetchYahooForexCommodities(),
  ]);



  // 合并美股数据：东方财富优先，Yahoo备用
  function mergeUS(primary, fallback) {
    const result = {};
    for (const [k, v] of Object.entries(primary)) {
      if (v && v.confidence !== '❌') result[k] = v;
      else if (fallback[k] && fallback[k].confidence !== '❌') result[k] = { ...fallback[k], source: fallback[k].source + '(备用)' };
      else result[k] = v || fallback[k] || { close: null, change_pct: null, confidence: '❌', reason: '所有数据源失败' };
    }
    return result;
  }

  // 东方财富返回的key已是djia/nasdaq/sp500，直接合并
  const usIdxResults = mergeUS(usIdxEastMoney, usIdxYahoo);
  // 东方财富数据 + Yahoo备用
  const usAiResults = mergeUS(extractBySymbols(usStocksEastMoney, [...usAiLeadersEM, ...Object.keys(usAiLeadersManual)]), usStocksYahoo);
  const usMetalResults = mergeUS(extractBySymbols(usStocksEastMoney, usMetalLeaders), usStocksYahoo);
  const usRobotResults = mergeUS(extractBySymbols(usStocksEastMoney, usRobotLeaders), usStocksYahoo);
  const usPowerResults = mergeUS(extractBySymbols(usStocksEastMoney, [...usPowerLeadersEM, ...usPowerLeadersManual]), usStocksYahoo);

  function extractBySymbols(data, symbols) {
    if (!data) return {};
    const result = {};
    for (const sym of symbols) {
      result[sym] = data[sym] || { close: null, change_pct: null, confidence: '❌', reason: '数据未找到' };
    }
    return result;
  }

  // 组装行业A股数据
  const aiA = {}, robotA = {}, metalA = {}, powerA = {};
  for (const [k, v] of Object.entries(aShareStocks)) {
    if (aiStocks[k]) aiA[k] = v;
    if (robotStocks[k]) robotA[k] = v;
    if (metalStocks[k]) metalA[k] = v;
    if (powerStocks[k]) powerA[k] = v;
  }

  const rawData = {
    date,
    generated_at: ts(),
    // 仅包含每日可获取的数据，月度数据(CPI/PMI等)不包含在每日采集中
    _note: '宏观月度数据(CPI/PPI/PMI/M2/社融)和央行操作(MLF/LPR)为月度发布，不包含在本日度采集中。如当日有发布，请通过news数据补充。',
    capital: {
      northbound,
      margin,
    },
    a_stock: {
      indices: aShareIndices,
      volume: volume.amount_yi ? `${volume.amount_yi}亿` : '未获取',
      up_limit_count: limits.up_limit_count,
      down_limit_count: limits.down_limit_count,
      top5_up_sectors: sectors.top5_up || [],
      top5_down_sectors: sectors.top5_down || [],
    },
    us_stock: {
      indices: usIdxResults,
      ai_leaders: usAiResults,
      metal_leaders: usMetalResults,
      robot_leaders: usRobotResults,
      power_leaders: usPowerResults,
    },
    forex_commodity: {
      ...forex,
      ...commodities,
      ...(yahooFC.usd_index?.price ? { usd_index: yahooFC.usd_index.price, usd_index_src: 'Yahoo Finance', usd_index_conf: '✅' } : {}),
      ...(yahooFC.usdcnh?.price ? { usdcnh: yahooFC.usdcnh.price, usdcnh_src: 'Yahoo Finance' } : {}),
      ...(yahooFC.gold?.price ? { gold: yahooFC.gold.price, gold_src: 'Yahoo Finance' } : {}),
      ...(yahooFC.oil?.price ? { wti_oil: yahooFC.oil.price, oil_src: 'Yahoo Finance' } : {}),
      ...(yahooFC.copper?.price ? { copper: yahooFC.copper.price, copper_src: 'Yahoo Finance' } : {}),
    },
    industry_a_stock: {
      ai: aiA,
      robot: robotA,
      metal: metalA,
      power: powerA,
    },
    sector_indices: sectorIndices,
    commodity_detail: {
      copper: commodities.copper?.close || null,
      aluminum: commodities.aluminum?.close || null,
      _note: '锂/稀土价格需通过news或搜索补充',
    },
    data_sources: {
      a_stock: '东方财富行情API (push2.eastmoney.com)',
      northbound: '东方财富北向资金API (push2his.eastmoney.com)',
      margin: '东方财富数据API (datacenter-web.eastmoney.com)',
      sectors: '东方财富板块API (push2.eastmoney.com)',
      us_stock: 'Yahoo Finance API (query1.finance.yahoo.com)',
      forex: '新浪财经外汇API (hq.sinajs.cn)',
      commodities: '东方财富商品期货API (push2.eastmoney.com)',
    },
  };

  // 统计采集结果
  let successCount = 0, failCount = 0;
  for (const [k, v] of Object.entries(aShareIndices)) {
    if (v.confidence === '❌') failCount++; else successCount++;
  }
  console.log(`A股指数: ${successCount}成功, ${failCount}失败`);
  console.log(`A股个股: ${Object.values(aShareStocks).filter(v => v.confidence !== '❌').length}/${Object.keys(aShareStocks).length}`);
  console.log(`美股: ${Object.values(usIdxResults).filter(v => v.confidence !== '❌').length}指数, ${[...Object.values(usAiResults),...Object.values(usMetalResults),...Object.values(usRobotResults),...Object.values(usPowerResults)].filter(v => v.confidence !== '❌').length}个股`);
  console.log(`外汇: ${forex.confidence}`);
  console.log(`商品: ${commodities.confidence}`);

  const filePath = join(DATA_DIR, `raw_${date}.json`);
  writeFileSync(filePath, JSON.stringify(rawData, null, 2), 'utf-8');

  // 同时保存一份为 raw_latest.json 供 AI 解读脚本使用
  const latestPath = join(DATA_DIR, 'raw_latest.json');
  writeFileSync(latestPath, JSON.stringify(rawData, null, 2), 'utf-8');

  console.log(`[${ts()}] 数据采集完成 → ${filePath}`);
  console.log(`文件大小: ${(JSON.stringify(rawData).length / 1024).toFixed(1)} KB`);
}

main().catch(err => {
  console.error('数据采集出错:', err.message);
  process.exit(1);
});
