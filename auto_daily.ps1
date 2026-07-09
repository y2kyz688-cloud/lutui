# 每日财经简报 - Windows任务计划版
# 纯数据驱动，不依赖Claude Code
$d = "D:\tmp_fkw\daily-financial-briefing"
Set-Location $d
$date = Get-Date -Format "yyyy-MM-dd"
$log = "$d\auto_log\$date.log"
New-Item -ItemType Directory -Force -Path "$d\auto_log" | Out-Null
function log($m) { $l = "$(Get-Date -Format 'HH:mm:ss') $m"; Write-Output $l; Add-Content $log $l -Encoding UTF8 }

log "=== 简报开始 ==="

# Git代理
git config --global http.proxy http://127.0.0.1:7897
git config --global https.proxy http://127.0.0.1:7897

# 1. 采集
log "[1/4] 采集..."
$r = node scripts/fetch-data.js 2>&1
if ($r -match "成功|失败") { log ($r | Select-String "成功|失败") } else { log "采集完成" }

# 2. 补丁
log "[2/4] 补丁..."
node scripts/patch-data.cjs 2>&1 | Out-Null
log "补丁完成"

# 3. 生成+渲染
log "[3/4] 生成+渲染..."
node scripts/gen_today.cjs 2>&1 | Out-Null
node scripts/render-html.js 2>&1 | Out-Null
node scripts/update-archive.js 2>&1 | Out-Null
$html = "$d\dist\daily\$date.html"
if (Test-Path $html) { log "✅ 已生成 ($([math]::Round((Get-Item $html).Length/1KB))KB)" }
else { log "❌ 生成失败"; exit 1 }

# 4. 部署
log "[4/4] 部署..."
Push-Location "$d\dist"
git init 2>$null; git add -A; git commit -m "deploy: $date" 2>$null
git push https://github.com/y2kyz688-cloud/lutui.git HEAD:gh-pages --force 2>&1 | Out-Null
Pop-Location
cmd /c "rmdir /s /q `"$d\dist\.git`"" 2>$null

git add data/ dist/ -f; git commit -m "auto: $date" 2>$null
git push origin main 2>&1 | Out-Null
log "✅ 部署完成"
log "=== 简报结束 ==="
