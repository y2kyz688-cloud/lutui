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
$prompt = "你是财经简报生成器。请执行：1.读取 data/raw_latest.json 获取今日真实行情 2.使用 WebSearch 搜索今日重大财经新闻(美联储/A股/美股/AI/机器人/有色/电力设备) 3.基于真实数据+搜索新闻，生成完整解读JSON写入 data/interpret_$DateStr.json 和 data/interpret_latest.json 4.运行 node scripts/render-html.js && node scripts/update-archive.js。解读必须包含：5条必知要闻含④步因果链、宏观与政策含信号矛盾、资金面、国际市场、A股行情、4行业深度(AI/机器人/有色/电力设备含海外映射表)、明日预览、一句话研判、市场全景图、自检报告。术语用大白话翻译，数据标注来源置信度。"

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
