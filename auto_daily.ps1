# 每日财经简报自动生成
# Windows 任务计划程序每天 7:30 触发
$ScriptDir = "D:\tmp_fkw\daily-financial-briefing"
Set-Location $ScriptDir
$DateStr = Get-Date -Format "yyyy-MM-dd"
New-Item -ItemType Directory -Force -Path "auto_log" | Out-Null

function log($msg) {
  $line = "$(Get-Date -Format 'HH:mm:ss') $msg"
  Write-Output $line
  Add-Content -Path "auto_log\$DateStr.log" -Value $line -Encoding UTF8
}

# 配置git代理
git config --global http.proxy http://127.0.0.1:7897
git config --global https.proxy http://127.0.0.1:7897

log "========== 每日简报开始 =========="

# Step 1: 采集数据
log "[1/4] 采集行情数据..."
node scripts/fetch-data.js 2>&1 | Select-Object -Last 3
if (-not (Test-Path "data\raw_latest.json")) { log "❌ 数据采集失败"; exit 1 }
log "✅ 数据采集完成"

# Step 2: AI生成解读
log "[2/4] AI生成深度解读..."
$prompt = "你是财经简报生成器。请严格按以下步骤执行：1.读取 data/raw_latest.json 获取今日真实行情 2.使用 WebSearch 分别搜索以下内容（每次搜索用独立关键词）：今日A股行情/北向资金/两融余额、美股收盘/美元指数/人民币汇率/WTI原油/黄金/铜铝期货、美联储最新动态、中国央行/证监会/金融监管总局最新政策、十五五规划行业政策(AI/机器人/新能源/电力设备/有色)、7月政治局会议前瞻、AI行业重大动态(NVIDIA/TSMC/美光/国产GPU)、机器人行业动态(Tesla Optimus/Figure AI/宇树科技)、有色行业动态(铜价/锂价/稀土政策)、电力设备行业动态(国家电网投资/光伏/储能/美国变压器短缺) 3.基于真实数据+搜索结果，生成完整解读JSON写入 data/interpret_$DateStr.json 和 data/interpret_latest.json 4.运行 node scripts/render-html.js && node scripts/update-archive.js。解读必须包含所有以下板块(缺一不可)：5条必知要闻含④步因果链(事实→直接后果→传导A股→对散户影响)、宏观与政策含信号矛盾、政策与规划解读(十五五规划/金融政策/产业政策/监管动态/重要会议/政策影响研判)、资金面(北向+两融+央行操作+综合判断)、国际市场(美股+外汇+大宗商品+地缘)、A股行情(四大指数+成交额+板块涨跌+涨跌停)、4行业深度(AI/机器人/有色/电力设备各含A股龙头分析+海外映射对比表+行业动态+财报关注+龙虎榜+综合判断)、明日提前知道(经济数据+事件+持续跟踪+4行业明日关注)、一句话研判、市场全景图、自检报告(数据溯源+数值校验+防伪造+置信度统计+来源清单)。所有专业术语用大白话翻译，数据标注来源和置信度，搜不到的数据明确标注❌未验证绝不编造。"

try {
  $job = Start-Job -ScriptBlock {
    param($d, $p)
    Set-Location $d
    claude -p $p --allowedTools "Bash Read Write WebSearch WebFetch" --output-format text 2>&1
  } -ArgumentList $ScriptDir, $prompt

  Wait-Job $job -Timeout 600  # 最多等10分钟
  if ($job.State -eq 'Running') {
    Stop-Job $job
    log "⚠️ Claude超时(10分钟)，使用模板模式"
    $claudeFailed = $true
  } else {
    Receive-Job $job 2>&1 | Select-Object -Last 5
    $claudeFailed = $false
  }
  Remove-Job $job -Force
} catch {
  log "⚠️ Claude调用失败: $_"
  $claudeFailed = $true
}

# Step 3: 确保HTML已生成
log "[3/4] 检查HTML..."
if (-not (Test-Path "dist\daily\$DateStr.html")) {
  log "HTML缺失，手动渲染..."
  node scripts/render-html.js 2>&1
  node scripts/update-archive.js 2>&1
}
if (Test-Path "dist\daily\$DateStr.html") {
  log "✅ HTML已生成 ($((Get-Item "dist\daily\$DateStr.html").Length / 1KB) KB)"
} else {
  log "❌ HTML生成失败"
  exit 1
}

# Step 4: 部署上线 + 保存数据
log "[4/4] 部署上线..."

# 部署到gh-pages
Push-Location dist
git init 2>$null
git add -A
git commit -m "deploy: $DateStr" 2>$null
git push https://github.com/y2kyz688-cloud/lutui.git HEAD:gh-pages --force 2>&1 | Select-Object -Last 1
Pop-Location
cmd /c "rmdir /s /q `"$ScriptDir\dist\.git`"" 2>$null
log "✅ GitHub Pages 部署完成"

# 保存数据到主分支
git add data/ dist/ -f
git commit -m "auto: daily briefing $DateStr" 2>$null
git push origin main 2>&1 | Select-Object -Last 1
log "✅ 数据已保存到主分支"

log "========== 简报完成 =========="
log "网站: https://y2kyz688-cloud.github.io/lutui/"
