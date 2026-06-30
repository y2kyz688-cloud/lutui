/**
 * AI解读生成脚本
 * 读取raw_data.json + system-prompt.txt → 调用AI API → 输出结构化解读JSON
 * 支持: Claude API（推荐）和 OpenAI API（备选）
 * 输出: data/interpret_YYYY-MM-DD.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const PROMPTS_DIR = join(ROOT, 'prompts');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

function today() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function ts() {
  return new Date().toISOString();
}

// ============================================================
// Fallback解读（AI API不可用时使用）
// ============================================================

function generateFallback(rawData) {
  const date = rawData.date || today();
  const idx = rawData.a_stock?.indices || {};
  const nfb = rawData.capital?.northbound || {};
  const usIdx = rawData.us_stock?.indices || {};

  const defChain = {
    fact: '①数据已采集，AI解读暂不可用',
    consequence: '②无法生成因果链解读',
    transmission: '③请参考原始数据自行判断',
    impact: '④AI解读服务恢复后将自动补充',
  };

  function idxLine(d, name) { return d?.close ? `${name}: ${d.close}（${d.change_pct > 0 ? '+' : ''}${d.change_pct}%）` : `${name}: 数据未获取`; }

  return {
    headline_events: [{
      title: '今日市场概况（AI离线模式）',
      chain: defChain,
      confidence: '⚠️',
      source: '自动生成fallback',
    }],
    macro_policy: {
      china: '宏观经济数据为月度发布，当日未更新。请关注PMI/CPI/社融等数据发布日程。',
      overseas: '海外宏观数据待AI解读恢复后补充。',
      signal_conflict: '',
    },
    capital_flow: {
      northbound: nfb?.net_flow ? `北向资金净${nfb.net_flow > 0 ? '流入' : '流出'}${Math.abs(nfb.net_flow)}亿元` : '北向数据未获取',
      margin: '两融数据待AI解读',
      pboc_operation: '央行操作数据待AI解读',
      overall_judgment: '资金面数据已采集，解读待AI恢复',
    },
    international: {
      us_stock: `美股: ${idxLine(usIdx.djia, '道指')}，${idxLine(usIdx.nasdaq, '纳指')}，${idxLine(usIdx.sp500, '标普')}`,
      forex: '外汇数据已采集，解读待AI恢复',
      commodity: '商品数据已采集，解读待AI恢复',
      geopolitical: '',
    },
    a_stock_review: {
      indices: `A股: ${idxLine(idx.sh000001, '上证')}，${idxLine(idx.sz399001, '深证')}，${idxLine(idx.sz399006, '创业板')}，${idxLine(idx.sh000688, '科创50')}`,
      volume: rawData.a_stock?.volume || '未获取',
      top_sectors: `领涨: ${(rawData.a_stock?.top5_up_sectors || []).map(s => s.name).join('、') || '未获取'}`,
      limit_up_down: `涨停${rawData.a_stock?.up_limit_count || '?'}家，跌停${rawData.a_stock?.down_limit_count || '?'}家`,
    },
    ai_deep: {
      a_stock_leaders: 'AI板块数据已采集，解读待AI恢复',
      overseas_mapping_table: [],
      industry_news: '',
      earnings_alert: '',
      dragon_tiger: '',
      judgment: '中性（AI离线，无法判断）',
    },
    robot_deep: {
      a_stock_leaders: '机器人板块数据已采集，解读待AI恢复',
      overseas_mapping_table: [],
      policy: '',
      overseas_progress: '',
      earnings_alert: '',
      dragon_tiger: '',
      judgment: '中性（AI离线）',
    },
    metal_deep: {
      a_stock_leaders: '有色板块数据已采集，解读待AI恢复',
      overseas_mapping_table: [],
      commodity_anchor: '',
      supply_side: '',
      earnings_alert: '',
      dragon_tiger: '',
      judgment: '中性（AI离线）',
    },
    tomorrow_preview: {
      economic_data: '明日经济数据待更新',
      events: '',
      ai_sector: '',
      robot_sector: '',
      metal_sector: '',
      trend_tracking: '',
    },
    one_line_judge: `今日A股市场数据已采集，AI解读暂不可用（${date}）`,
    market_panorama: `本简报为离线模式生成，仅包含原始行情数据。AI因果链解读将在API服务恢复后自动补充。`,
    self_check: {
      data_traceability: '原始数据已由fetch-data.js采集并校验',
      value_check: '数据已通过范围校验',
      fabrication_check: 'AI离线模式，无编造风险',
      confidence_stats: { verified: 0, single: 0, unverified: 0 },
      unverified_list: ['AI解读不可用，所有解读项为fallback'],
      sources: ['东方财富API', 'Yahoo Finance API', '新浪财经API'],
    },
  };
}

// ============================================================
// Claude API 调用
// ============================================================

async function callClaudeAPI(systemPrompt, rawDataJson) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 环境变量未设置');

  const userMessage = `以下是今日采集的全球财经原始数据（raw_data.json），请严格按照System Prompt的要求，生成完整的结构化解读JSON。

<raw_data>
${rawDataJson}
</raw_data>

重要提醒：
1. 必须输出完整JSON，不要省略任何字段
2. 每个行业必须输出海外映射对比表
3. 必须执行自检流程并输出self_check
4. 专业术语必须附带大白话解释
5. raw_data中标注❌的数据，在解读中也标注❌未验证，不要编造`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API HTTP ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data?.content?.[0]?.text;
  if (!text) throw new Error('Claude API返回为空');

  // 解析JSON（可能被包裹在```json```中）
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch ? jsonMatch[1] : text;
  return JSON.parse(jsonStr.trim());
}

// ============================================================
// DeepSeek API 调用（兼容OpenAI格式，国内直连）
// ============================================================

async function callDeepSeekAPI(systemPrompt, rawDataJson) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY 环境变量未设置');

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      max_tokens: 8192,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `以下是今日采集的全球财经原始数据（raw_data.json），请严格按照System Prompt的要求，生成完整的结构化解读JSON。\n\n<raw_data>\n${rawDataJson}\n</raw_data>` },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DeepSeek API HTTP ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('DeepSeek API返回为空');

  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch ? jsonMatch[1] : text;
  return JSON.parse(jsonStr.trim());
}

// ============================================================
// OpenAI API 调用（备用）
// ============================================================

async function callOpenAIAPI(systemPrompt, rawDataJson) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY 环境变量未设置');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 8192,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `以下是今日采集的全球财经原始数据（raw_data.json），请严格按照System Prompt的要求，生成完整的结构化解读JSON。\n\n<raw_data>\n${rawDataJson}\n</raw_data>` },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API HTTP ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI API返回为空');

  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch ? jsonMatch[1] : text;
  return JSON.parse(jsonStr.trim());
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log(`[${ts()}] 开始AI解读生成...`);
  const date = today();

  // 读取原始数据
  const rawPath = join(DATA_DIR, `raw_${date}.json`);
  const latestPath = join(DATA_DIR, 'raw_latest.json');

  let rawPathToUse;
  if (existsSync(rawPath)) rawPathToUse = rawPath;
  else if (existsSync(latestPath)) rawPathToUse = latestPath;
  else {
    console.error('未找到raw_data文件，跳过AI解读');
    process.exit(1);
  }

  const rawData = JSON.parse(readFileSync(rawPathToUse, 'utf-8'));
  const rawDataJson = JSON.stringify(rawData, null, 2);

  // 读取系统提示词
  const promptPath = join(PROMPTS_DIR, 'system-prompt.txt');
  const systemPrompt = readFileSync(promptPath, 'utf-8');

  // 选择API
  const apiChoice = process.env.AI_API || 'deepseek'; // deepseek | claude | openai
  let interpret;
  let apiUsed = 'fallback';

  try {
    if (apiChoice === 'deepseek') {
      console.log('使用 DeepSeek API...');
      interpret = await callDeepSeekAPI(systemPrompt, rawDataJson);
      apiUsed = 'deepseek';
    } else if (apiChoice === 'openai') {
      console.log('使用 OpenAI API...');
      interpret = await callOpenAIAPI(systemPrompt, rawDataJson);
      apiUsed = 'openai';
    } else {
      console.log('使用 Claude API...');
      interpret = await callClaudeAPI(systemPrompt, rawDataJson);
      apiUsed = 'claude';
    }
    console.log('AI解读生成成功');
  } catch (err) {
    console.error(`AI API调用失败 (${apiChoice}): ${err.message}`);
    console.log('切换到fallback模式...');

    // 如果有另一个API的key，尝试切换
    if (apiChoice === 'claude' && process.env.OPENAI_API_KEY) {
      try {
        console.log('尝试切换到OpenAI API...');
        interpret = await callOpenAIAPI(systemPrompt, rawDataJson);
        apiUsed = 'openai(fallback)';
        console.log('OpenAI备选成功');
      } catch (e2) {
        console.error(`备选也失败: ${e2.message}`);
        interpret = generateFallback(rawData);
        apiUsed = 'fallback';
      }
    } else if (apiChoice === 'openai' && (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY)) {
      try {
        console.log('尝试切换到Claude API...');
        interpret = await callClaudeAPI(systemPrompt, rawDataJson);
        apiUsed = 'claude(fallback)';
        console.log('Claude备选成功');
      } catch (e2) {
        console.error(`备选也失败: ${e2.message}`);
        interpret = generateFallback(rawData);
        apiUsed = 'fallback';
      }
    } else {
      interpret = generateFallback(rawData);
      apiUsed = 'fallback';
    }
  }

  // 补全日期
  if (!interpret.date) interpret.date = date;
  interpret._meta = {
    generated_at: ts(),
    api_used: apiUsed,
    raw_data_date: rawData.date,
  };

  const outPath = join(DATA_DIR, `interpret_${date}.json`);
  writeFileSync(outPath, JSON.stringify(interpret, null, 2), 'utf-8');

  const latestOut = join(DATA_DIR, 'interpret_latest.json');
  writeFileSync(latestOut, JSON.stringify(interpret, null, 2), 'utf-8');

  console.log(`[${ts()}] AI解读完成 → ${outPath}`);
  console.log(`API: ${apiUsed}, 大小: ${(JSON.stringify(interpret).length / 1024).toFixed(1)} KB`);
}

main().catch(err => {
  console.error('AI解读生成出错:', err.message);
  process.exit(1);
});
