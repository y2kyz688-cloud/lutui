# 每日财经简报自动生成（纯数据驱动，不依赖Claude对话）
# Windows 任务计划程序每天 6:30 触发
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
log "[1/3] 采集行情数据..."
node scripts/fetch-data.js 2>&1 | Select-Object -Last 3
if (-not (Test-Path "data\raw_$DateStr.json")) { log "❌ 数据采集失败"; exit 1 }
log "✅ 数据采集完成"

# Step 2: 渲染HTML（使用raw数据生成数据驱动简报）
log "[2/3] 渲染HTML..."
node scripts/render-html.js 2>&1 | Select-Object -Last 3
node scripts/update-archive.js 2>&1 | Select-Object -Last 1
if (Test-Path "dist\daily\$DateStr.html") {
  log "✅ HTML已生成 ($((Get-Item "dist\daily\$DateStr.html").Length / 1KB) KB)"
} else {
  log "❌ HTML生成失败"
  exit 1
}

# Step 3: 部署 + 保存
log "[3/3] 部署上线..."
Push-Location dist
git init 2>$null
git add -A
git commit -m "deploy: $DateStr" 2>$null
git push https://github.com/y2kyz688-cloud/lutui.git HEAD:gh-pages --force 2>&1 | Select-Object -Last 1
Pop-Location
cmd /c "rmdir /s /q `"$ScriptDir\dist\.git`"" 2>$null
log "✅ GitHub Pages 部署完成"

git add data/ dist/ -f
git commit -m "auto: daily briefing $DateStr" 2>$null
git push origin main 2>&1 | Select-Object -Last 1
log "✅ 数据已保存"

log "========== 简报完成 =========="
log "注意：本脚本生成的是数据驱动简报。深度解读需Claude Code手动增强。"
