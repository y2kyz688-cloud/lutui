/**
 * 数据补丁脚本 — 在fetch-data.js之后运行
 * 补充：黄金/原油/铜（新浪期货）、人民币汇率（东方财富外汇）
 */
const fs=require('fs');
const path=require('path');
const DATA=path.join(__dirname,'..','data');
const f=path.join(DATA,'raw_latest.json');
if(!fs.existsSync(f)){console.log('raw_latest.json not found');process.exit(0);}
const raw=JSON.parse(fs.readFileSync(f,'utf8'));
const date=raw.date;

async function fetchSina(code){try{const r=await fetch('https://hq.sinajs.cn/list='+code,{headers:{Referer:'https://finance.sina.com.cn'}});const t=await r.text();const m=t.match(/="(.+)"/);if(!m)return null;const p=m[1].split(',');return parseFloat(p[0])||null;}catch(e){return null;}}

async function main(){
console.log('补丁数据采集...');
// 新浪期货
raw.forex_commodity.gold=await fetchSina('hf_GC')||raw.forex_commodity.gold;
raw.forex_commodity.wti_oil=await fetchSina('hf_CL')||raw.forex_commodity.wti_oil;
raw.forex_commodity.copper=await fetchSina('hf_HG')||raw.forex_commodity.copper;
if(raw.forex_commodity.gold)raw.forex_commodity.gold_src='新浪期货';
if(raw.forex_commodity.wti_oil)raw.forex_commodity.oil_src='新浪期货';
if(raw.forex_commodity.copper)raw.forex_commodity.copper_src='新浪期货';
// 人民币(新浪外汇)
try{const r=await fetch('https://hq.sinajs.cn/list=fx_susdcnh',{headers:{Referer:'https://finance.sina.com.cn'}});const t=await r.text();const m=t.match(/=\"(.+)\"/);if(m){const p=m[1].split(',');if(p.length>0&&p[0].length>3){raw.forex_commodity.usdcnh=parseFloat(p[0])||raw.forex_commodity.usdcnh;raw.forex_commodity.usdcnh_src='新浪外汇';}}}catch(e){}
// 东财外汇备用
if(!raw.forex_commodity.usdcnh){try{const r=await fetch('https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f2,f3,f12,f14&secids=133.USDCNH');const d=await r.json();const cnh=d?.data?.diff?.find(i=>i.f12==='USDCNH');if(cnh?.f2){raw.forex_commodity.usdcnh=cnh.f2;raw.forex_commodity.usdcnh_src='东方财富外汇';}}catch(e){}}
console.log('黄金:',raw.forex_commodity.gold,'原油:',raw.forex_commodity.wti_oil,'铜:',raw.forex_commodity.copper,'人民币:',raw.forex_commodity.usdcnh);
fs.writeFileSync(f,JSON.stringify(raw),'utf-8');
const df=path.join(DATA,'raw_'+date+'.json');
fs.writeFileSync(df,JSON.stringify(raw),'utf-8');
console.log('补丁完成');
}
main().catch(e=>{console.log('补丁失败:',e.message);});
