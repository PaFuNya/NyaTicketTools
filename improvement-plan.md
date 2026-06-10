# NyaTicketTools 改进计划

> 本文件为详细实施计划，可交给其他 AI 或开发者按步骤执行。
> 计划分为 5 个阶段，标注了优先级 (P0-P3) 和预计工作量。

---

## 第一阶段：修复数据错误（无依赖，低风险）

### 1.1 修复 `web/js/app.js` TOOLS 数组（第 10-46 行）

**文件：** `web/js/app.js`，`TOOLS` 常量

**当前（错误）：**
- `BHYG.lang = "Go"` → 应为 `"Python"`
- `bili_ticket_rush.lang = "Python"` → 应为 `"Rust"`
- 所有 4 个仓库链接指向 `github.com/NyaTicker/...`（不存在）

**修改为：**
```javascript
const TOOLS = [
  {
    id: 'biliTickerBuy',
    name: 'biliTickerBuy',
    desc: 'Python-based ticket purchase automation',
    color: '#7C3AED',
    abbrev: 'BTB',
    lang: 'Python',
    repo: 'https://github.com/mikumifa/biliTickerBuy',
  },
  {
    id: 'BHYG',
    name: 'BHYG',
    desc: 'High-speed Bilibili helper',
    color: '#3B82F6',
    abbrev: 'BHYG',
    lang: 'Python',
    repo: 'https://github.com/ZianTT/BHYG',
  },
  {
    id: 'bili_ticket_rush',
    name: 'bili_ticket_rush',
    desc: 'Rush-grab ticket tool',
    color: '#10B981',
    abbrev: 'BTR',
    lang: 'Rust',
    repo: 'https://github.com/Violiate/bili_ticket_rush',
  },
  {
    id: 'bili-ticket-go',
    name: 'bili-ticket-go',
    desc: 'Go-based ticket grabber',
    color: '#F59E0B',
    abbrev: 'BTG',
    lang: 'Go',
    repo: 'https://github.com/konaxia548/bili-ticket-go',
  },
];
```

### 1.2 修复 `scripts/setup.sh` 仓库 URL（第 48-51 行）

**文件：** `scripts/setup.sh`

```bash
# 当前：
BHYG_REPO="https://github.com/HanFa/BHYG.git"
RUSH_REPO="https://github.com/biliup/bili_ticket_rush.git"
BTG_REPO="https://github.com/biliup/bili-ticket-go.git"

# 改为（与 README 和 ANALYSIS.md 一致）：
BHYG_REPO="https://github.com/ZianTT/BHYG.git"
RUSH_REPO="https://github.com/Violiate/bili_ticket_rush.git"
BTG_REPO="https://github.com/konaxia548/bili-ticket-go.git"
```

### 1.3 修正 README.md 配置示例（第 223-266 行）

**文件：** `README.md`

将 README 中的 YAML 示例代码块替换为与 `config/sample_accounts.yaml` 和 `config/sample_tickets.yaml` 实际结构一致的内容。

**accounts 示例（替换原有）：**
```yaml
accounts:
  - name: "主号"
    uid: "123456789"
    cookie: "SESSDATA=your_sessdata; bili_jct=your_bili_jct; DedeUserID=your_dede_uid"
    enabled: true
```

**tickets 示例（替换原有）：**
```yaml
tickets:
  - name: "示例演唱会"
    project_id: "12345"
    screen_id: "67890"
    sku_id: "11111"
    pay_money: 48000
    quantity: 1
    account: "主号"
    tools:
      - "biliTickerBuy"
    sale_start: "2026-07-01T10:00:00+08:00"
    enabled: false
```

**machines 示例（替换原有，已有 `machines` 键但需去掉 `-` 列表符号）：**
```yaml
machines:
  server1:
    host: "1.2.3.4"
    user: "root"
    port: 22
    remote_path: "/opt/NyaTicketTools"
    accounts: ["主号"]
```

---

## 第二阶段：脚本层完善（独立于 Web 后端）

### 2.1 创建统一 CLI 入口 `nyaticket`

**新文件：** `nyaticket`（项目根目录）

可执行的 bash 脚本，作为所有操作的统一入口：

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

case "${1:-}" in
  setup)
    shift
    exec bash "$SCRIPT_DIR/scripts/setup.sh" "$@"
    ;;
  config|configure)
    shift
    exec python3 "$SCRIPT_DIR/scripts/inject_config.py" "$@"
    ;;
  start)
    shift
    exec bash "$SCRIPT_DIR/scripts/start_all.sh" "$@"
    ;;
  stop)
    shift
    exec bash "$SCRIPT_DIR/scripts/stop_all.sh" "$@"
    ;;
  deploy)
    shift
    exec bash "$SCRIPT_DIR/scripts/deploy.sh" "$@"
    ;;
  dashboard)
    shift
    exec python3 "$SCRIPT_DIR/web/server.py" "$@"
    ;;
  status)
    bash "$SCRIPT_DIR/scripts/health_check.sh"
    ;;
  logs)
    TOOL="${2:-}"
    if [[ -z "$TOOL" ]]; then
      tail -f "$SCRIPT_DIR/logs"/*.log 2>/dev/null || echo "No logs found"
    else
      tail -f "$SCRIPT_DIR/logs/$TOOL.log" 2>/dev/null || echo "No log for $TOOL"
    fi
    ;;
  clean)
    shift
    exec bash "$SCRIPT_DIR/scripts/clean.sh" "$@"
    ;;
  -h|--help|help)
    echo "NyaTicketTools - Usage:"
    echo "  nyaticket setup [--quick]         Install all tools"
    echo "  nyaticket config [--dry-run]       Generate tool configs"
    echo "  nyaticket start [--tool <name>]    Start tools"
    echo "  nyaticket stop                     Stop all tools"
    echo "  nyaticket deploy <machine|all>     Deploy to machines"
    echo "  nyaticket dashboard                Start web dashboard"
    echo "  nyaticket status                   Health check"
    echo "  nyaticket logs [tool]              View logs"
    echo "  nyaticket clean [--tools|--all]    Clean up"
    ;;
  *)
    echo "Unknown command: ${1:-}"
    echo "Run 'nyaticket --help'"
    exit 1
    ;;
esac
```

### 2.2 创建 `scripts/health_check.sh`

**新文件：** `scripts/health_check.sh`

检查项：
1. Python 3 版本 >= 3.8
2. PyYAML 已安装
3. `config/accounts.yaml` 和 `config/tickets.yaml` 存在且格式有效
4. 4 个工具目录存在
5. bili-ticket-go 二进制文件存在且可执行
6. 网络连通性（curl B站 API）
7. 当前是否有工具进程在运行

每项检查显示 ✓ 或 ✗ 及具体信息，退出码 = 失败项数量。

### 2.3 为 `start_all.sh` 添加 `--dry-run`

**修改文件：** `scripts/start_all.sh`

添加参数解析逻辑，当 `--dry-run` 时只打印将要启动什么，不实际启动进程。

```bash
# 在参数解析部分添加：
DRY_RUN=false
--dry-run)
    DRY_RUN=true
    shift
    ;;
```

在所有 `start_btb()` 和 `start_btg()` 的实际启动命令处，检查 `$DRY_RUN`：
```bash
if [[ "$DRY_RUN" == true ]]; then
    info "[DRY RUN] Would start ${tool_name} with PID tracking"
    return
fi
```

### 2.4 添加 `scripts/clean.sh` 卸载脚本

**新文件：** `scripts/clean.sh`

```
用法：
  ./clean.sh --tools    删除 tools/ 目录
  ./clean.sh --config   清除生成的配置（保留 sample_* 文件）
  ./clean.sh --all      恢复干净状态（保留 .git 和 sample 文件）
  ./clean.sh --logs     清除日志文件
```

每次删除操作前用 `read -p "确认? (y/N) "` 确认。

### 2.5 为 `inject_config.py` 添加命令行选项

**修改文件：** `scripts/inject_config.py`

在 `argparse` 部分（第 324-330 行）添加：

```python
parser.add_argument("--config-dir", default=None,
                    help="Override config directory path")
parser.add_argument("--tool", choices=["biliTickerBuy", "BHYG", "bili_ticket_rush", "bili-ticket-go"],
                    help="Only generate config for specified tool")
parser.add_argument("--hostname", default=None,
                    help="Override hostname for account assignment")
```

然后修改 `CONFIG_DIR` 使用 `args.config_dir`（如果提供），并在主函数中根据 `--tool` 过滤执行哪些生成器。

### 2.6 `setup.sh` 添加 `--status` 版本检查

**修改文件：** `scripts/setup.sh`

添加 `--status` 参数，检查每个工具：
- 目录是否存在
- 当前 commit hash (`git -C <dir> log -1 --format=%H`)
- 远程最新 commit (`git -C <dir> ls-remote origin HEAD | awk '{print $1}'`)
- 对比并输出 "Up to date" / "Update available"

---

## 第三阶段：Web 后端（核心工作量）

### 3.1 创建 `web/server.py`

**新文件：** `web/server.py`

使用 Python 标准库 `http.server` 实现 REST API 后端（检查 biliTickerBuy 已安装 fastapi，可直接使用 fastapi + uvicorn）。

**API 端点：**

```
GET  /api/status
    返回: {
      "hostname": "...",
      "tools": {
        "biliTickerBuy": {"running": true, "pid": 1234, "port": null},
        "bili-ticket-go": {"running": false, "pid": null, "port": null},
        ...
      },
      "sale_start": "2026-07-01T10:00:00+08:00",
      "countdown_seconds": 1734000,
      "uptime": "2h 15m",
      "node_count": 1
    }

GET  /api/accounts
    返回 config/accounts.yaml 内容

POST /api/accounts
    Body: {accounts: [...]}
    写入 config/accounts.yaml（保留注释困难，可覆盖）

GET  /api/tickets
    返回 config/tickets.yaml 内容（含全局设置 + 通知）

POST /api/tickets
    Body: {tickets: [...], global: {...}, notifications: {...}}
    写入 config/tickets.yaml

POST /api/tools/start
    Body: {"tool": "biliTickerBuy"}
    执行 scripts/start_all.sh --tool <name>
    返回: {"ok": true, "pid": 1234}

POST /api/tools/stop
    Body: {"tool": "biliTickerBuy"}
    读取 .pids，发送 SIGTERM，返回结果

GET  /api/tools/:name/log?lines=100
    返回 logs/<name>.log 最后 N 行

POST /api/config/generate
    执行 python3 scripts/inject_config.py
    返回 stdout + 生成的文件列表

GET  /api/health
    返回: {"ok": true, "python": "3.11", "config_valid": true, ...}
```

**处理工具状态判断：**
- 如果 `.pids` 文件存在且进程存活 → running
- 如果 `.pids` 存在但进程已死 → failed
- 否则 → idle

**CORS 处理：** 所有 `/api/*` 请求添加 `Access-Control-Allow-Origin: *` 响应头。

**启动方式：**
```bash
# 方式1
python3 web/server.py --port 8090

# 方式2（如用 uvicorn）
uvicorn web.server:app --host 0.0.0.0 --port 8090
```

### 3.2 修改 `web/js/app.js` 连接后端

**核心修改：**

**A. 添加 API 通信层（文件开头）：**
```javascript
const API_BASE = 'http://localhost:8090';

async function apiCall(path, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn(`API unavailable (${path}):`, e.message);
    return null;
  }
}
```

**B. 改造状态初始化（替换从 localStorage 读取）：**
```javascript
// init() 函数中，改为先尝试 API：
async function loadState() {
  const status = await apiCall('/api/status');
  if (status) {
    toolStates = {};
    for (const [name, info] of Object.entries(status.tools || {})) {
      toolStates[name] = {
        status: info.running ? 'running' : 'idle',
        lastRun: info.last_run,
      };
    }
    save(STORAGE_KEYS.toolStates, toolStates);
  } else {
    toolStates = loadObj(STORAGE_KEYS.toolStates);
  }
}
```

**C. 改造账户 CRUD（对接真实 YAML）：**
- `renderAccounts()`: 先调用 `GET /api/accounts`，再 fallback localStorage
- `__deleteAccount()`: 删除后调用 `POST /api/accounts` 同步
- 账户表单提交: 保存后调用 `POST /api/accounts` 同步

**D. 改造工具启停（`__toggleTool()`）：**
```javascript
window.__toggleTool = async function(toolId) {
  const state = toolStates[toolId] || { status: 'idle' };
  if (state.status === 'running') {
    const result = await apiCall('/api/tools/stop', {
      method: 'POST', body: JSON.stringify({ tool: toolId })
    });
    if (result?.ok) state.status = 'idle';
  } else {
    const result = await apiCall('/api/tools/start', {
      method: 'POST', body: JSON.stringify({ tool: toolId })
    });
    if (result?.ok) { state.status = 'running'; state.lastRun = Date.now(); }
  }
  toolStates[toolId] = state;
  save(STORAGE_KEYS.toolStates, toolStates);
  renderDashboard(); renderTools();
};
```

**E. 改造 Sync/Generate 按钮：**
```javascript
// Sync 按钮
$('#syncBtn').addEventListener('click', async () => {
  const result = await apiCall('/api/config/generate', { method: 'POST' });
  if (result) { showToast('Configs generated', 'success'); }
  else { showToast('API unavailable - generating locally', 'warning'); }
  $('#lastSyncTime').textContent = new Date().toLocaleString();
});
```

**F. 添加连接状态指示器：**
```javascript
const statusDot = $('#connectionStatus');
if (statusDot) {
  const health = await apiCall('/api/health');
  statusDot.className = health ? 'connected' : 'disconnected';
  statusDot.title = health ? 'Connected to backend' : 'Offline mode';
}
```

**G. 添加服务器端日志查看（Tools 页面）：**
每个工具详情卡片添加一个 "View Log" 链接按钮，点击后打开模态框显示最近 100 行日志，每 3 秒自动刷新。

### 3.3 修改 `scripts/start_all.sh` 同时启动后端

在脚本末尾（第 280 行附近），添加启动 Web 后端的逻辑：

```bash
# ── Start Web Dashboard ──────────────────────────────────────
info "Starting Web Dashboard..."
WEB_PORT="${WEB_PORT:-8090}"
WEB_LOG="$LOGS_DIR/web-dashboard.log"
python3 "$PROJECT_ROOT/web/server.py" --port "$WEB_PORT" \
    > "$WEB_LOG" 2>&1 &
log_pid "web-dashboard" "$!"
info "  Dashboard: http://$(hostname -I | awk '{print $1}'):${WEB_PORT}"
info "  Log: $WEB_LOG"
((started++))
```

### 3.4 修改 `web/index.html` 添加连接状态指示器

在 topbar 中加入：
```html
<div class="connection-status" id="connectionStatus" title="Checking backend...">
  <span class="status-dot"></span>
</div>
```

配套 CSS：
```css
.connection-status .status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
.connection-status.connected .status-dot { background: var(--green); }
.connection-status.disconnected .status-dot { background: var(--red); }
```

---

## 第四阶段：功能补全

### 4.1 倒计时器

**前端（web/js/app.js）：**
```javascript
function updateCountdown() {
  const tickets = load(STORAGE_KEYS.tickets);
  const saleTime = tickets[0]?.saleTime;
  if (!saleTime) {
    $('#countdownDisplay').textContent = '--:--:--';
    return;
  }
  const target = new Date(saleTime).getTime();
  const now = Date.now();
  const diff = Math.max(0, target - now);

  if (diff === 0) {
    $('#countdownDisplay').textContent = 'NOW!';
    $('#countdownCard').classList.add('urgent');
    return;
  }

  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const d = Math.floor(h / 24);

  if (d > 0) {
    $('#countdownDisplay').textContent = `${d}d ${String(h%24).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  } else {
    $('#countdownDisplay').textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  if (diff < 60000) $('#countdownCard').classList.add('urgent');
}
setInterval(updateCountdown, 1000);
```

**前端（web/index.html）** 在 Dashboard 页面 stats-grid 之前加入：
```html
<div class="countdown-card glass" id="countdownCard">
  <div class="countdown-label">Sale Countdown</div>
  <div class="countdown-value" id="countdownDisplay">--:--:--</div>
</div>
```

**CSS 样式：**
```css
.countdown-card { padding: 24px; text-align: center; margin-bottom: 24px; border: 1px solid var(--border); transition: border-color 0.3s; }
.countdown-card.urgent { border-color: var(--red); animation: pulse-border 0.5s infinite; }
.countdown-value { font-size: 2.5rem; font-weight: 700; font-family: var(--font-mono); color: var(--primary); }
.countdown-card.urgent .countdown-value { color: var(--red); }
@keyframes pulse-border { 0%,100% { border-color: var(--red); } 50% { border-color: transparent; } }
```

### 4.2 修复多账户 biliTickerBuy 配置

**修改文件：** `scripts/inject_config.py`

**问题点：** 第 126-216 行的 `generate_btb_config()` 函数。

**修改 1：** 移除 `global_cookie = accounts[0].get("cookie", "")` 这种全局回退逻辑，改为每个 ticket 严格使用其 `account` 字段匹配的账户 cookie。

```python
# 删除第 130-133 行的 global_cookie 逻辑
# 在循环内部（第 151-168 行），改为：
for ticket in btb_tickets:
    acc_name = ticket.get("account", "")
    acc = account_map.get(acc_name)
    if not acc:
        warn(f"No account '{acc_name}' found for ticket '{ticket['name']}', skipping")
        continue
    cookie_str = acc.get("cookie", "")
    if not cookie_str:
        warn(f"Account '{acc_name}' has no cookie, skipping ticket '{ticket['name']}'")
        continue
    config = { ... }  # 原有逻辑
```

**修改 2：** 默认 `config.json`（第 188-216 行）的生成保持但确保使用第一个有效票务的匹配账户 cookie。

### 4.3 日志轮转

**修改文件：** `scripts/start_all.sh`

将日志文件名从 `<tool>.log` 改为 `<tool>-YYYYMMDD-HHMMSS.log`

```bash
# 在 start_btb() 中
local timestamp=$(date +%Y%m%d-%H%M%S)
local log_file="$LOGS_DIR/biliTickerBuy-${timestamp}.log"
```

并在启动前清理旧日志：
```bash
# 在初始化部分添加
find "$LOGS_DIR" -name "*.log" -mtime +7 -delete 2>/dev/null || true
```

### 4.4 票务表单补充字段

**修改文件：** `web/index.html`

在 Ticket Configuration 表单中增加：

**在 Project Info 区域（第 148-176 行，form-grid 内）加：**
```html
<div class="form-group">
  <label for="ticketName">Ticket Name</label>
  <input type="text" id="ticketName" placeholder="e.g. 周杰伦演唱会" class="form-input">
</div>
<div class="form-group">
  <label for="isHotProject">Hot Project</label>
  <input type="checkbox" id="isHotProject" class="form-checkbox">
</div>
```

**新增区域（在 Buyer Info 下面，第 193 行之前插入）：**
```html
<div class="form-section">
  <h3 class="form-section-title">Tool & Account</h3>
  <div class="form-grid">
    <div class="form-group">
      <label>Select Tools</label>
      <div class="checkbox-group" id="toolCheckboxes">
        <label><input type="checkbox" value="biliTickerBuy" checked> biliTickerBuy</label>
        <label><input type="checkbox" value="BHYG"> BHYG</label>
        <label><input type="checkbox" value="bili_ticket_rush"> bili_ticket_rush</label>
        <label><input type="checkbox" value="bili-ticket-go"> bili-ticket-go</label>
      </div>
    </div>
    <div class="form-group">
      <label for="ticketAccount">Account</label>
      <select id="ticketAccount" class="form-input">
        <option value="">-- Select account --</option>
      </select>
    </div>
  </div>
</div>

<div class="form-section">
  <h3 class="form-section-title">Delivery Info</h3>
  <div class="form-grid">
    <div class="form-group">
      <label for="deliverName">Recipient Name</label>
      <input type="text" id="deliverName" class="form-input">
    </div>
    <div class="form-group">
      <label for="deliverTel">Recipient Phone</label>
      <input type="tel" id="deliverTel" class="form-input">
    </div>
    <div class="form-group">
      <label for="deliverAddrId">Address ID</label>
      <input type="text" id="deliverAddrId" class="form-input">
    </div>
    <div class="form-group">
      <label for="deliverAddr">Address</label>
      <input type="text" id="deliverAddr" class="form-input">
    </div>
  </div>
</div>

<div class="form-section">
  <h3 class="form-section-title">Notifications</h3>
  <div class="form-group">
    <label for="webhookUrl">Webhook URL</label>
    <input type="url" id="webhookUrl" placeholder="https://open.feishu.cn/..." class="form-input">
  </div>
</div>
```

**修改文件：** `web/js/app.js`

更新 `gatherTicketForm()` 和 `renderTicketPreview()` 以覆盖新字段：
```javascript
function gatherTicketForm() {
  const tools = [...$$('#toolCheckboxes input:checked')].map(cb => cb.value);
  return {
    name: $('#ticketName').value.trim(),
    projectId: $('#projectId').value.trim(),
    screenId: $('#screenId').value.trim(),
    skuId: $('#skuId').value.trim(),
    payMoney: $('#payMoney').value.trim(),
    count: $('#ticketCount').value.trim(),
    saleTime: $('#saleTime').value,
    isHotProject: $('#isHotProject').checked,
    tools: tools,
    account: $('#ticketAccount').value,
    buyerName: $('#buyerName').value.trim(),
    buyerPhone: $('#buyerPhone').value.trim(),
    buyerIdCard: $('#buyerIdCard').value.trim(),
    deliverName: $('#deliverName').value.trim(),
    deliverTel: $('#deliverTel').value.trim(),
    deliverAddrId: $('#deliverAddrId').value.trim(),
    deliverAddr: $('#deliverAddr').value.trim(),
    webhookUrl: $('#webhookUrl').value.trim(),
  };
}

function renderTicketPreview() {
  const data = gatherTicketForm();
  const isEmpty = Object.values(data).every(v => !v || (Array.isArray(v) && !v.length));
  const code = $('#configCode');
  if (isEmpty) {
    code.textContent = '// Fill in the form to see the generated config';
    return;
  }
  const config = {
    name: data.name || 'Unnamed Ticket',
    project_id: data.projectId,
    screen_id: data.screenId,
    sku_id: data.skuId,
    pay_money: parseInt(data.payMoney) || 0,
    count: parseInt(data.count) || 1,
    sale_start: data.saleTime,
    is_hot_project: data.isHotProject,
    tools: data.tools,
    account: data.account,
    buyer_info: [{ name: data.buyerName, tel: data.buyerPhone, id_card: data.buyerIdCard }],
    deliver_info: { name: data.deliverName, tel: data.deliverTel, addr_id: data.deliverAddrId, addr: data.deliverAddr },
    webhook: data.webhookUrl,
  };
  code.textContent = JSON.stringify(config, null, 2);
}
```

同时，在 `renderAccounts()` 调用后、`init()` 中，动态填充 `#ticketAccount` 下拉框：
```javascript
function populateAccountSelect() {
  const select = $('#ticketAccount');
  select.innerHTML = '<option value="">-- Select account --</option>' +
    accounts.map(a => `<option value="${a.name}">${escHtml(a.name)}</option>`).join('');
}
```

### 4.5 BHYG 配置生成增强

**修改文件：** `scripts/inject_config.py`

在 `print_bhyg_instructions()` 函数中增加：

1. 生成 `.env.bhyg` 文件，包含环境变量，方便脚本化启动
2. 生成一键启动脚本 `tools/BHYG/start_with_config.sh`

```python
def generate_bhyg_env(accounts, tickets):
    """Generate BHYG environment config and launch script."""
    bhyg_tickets = [t for t in tickets if t.get("enabled", False) and "BHYG" in t.get("tools", [])]
    if not bhyg_tickets:
        return

    bhyg_dir = PROJECT_ROOT / "tools" / "BHYG"
    account_map = {a["name"]: a for a in accounts}

    for ticket in bhyg_tickets:
        acc_name = ticket.get("account", "")
        acc = account_map.get(acc_name, accounts[0] if accounts else {})
        cookie = acc.get("cookie", "")

        env_content = f"""# Auto-generated by NyaTicketTools
BHYG_PROJECT_ID={ticket['project_id']}
BHYG_SCREEN_ID={ticket['screen_id']}
BHYG_SKU_ID={ticket['sku_id']}
BHYG_COUNT={ticket.get('quantity', 1)}
BHYG_PAY_MONEY={ticket.get('pay_money', 0)}
BHYG_SALE_TIME={ticket.get('sale_start', '')}
BHYG_COOKIE={cookie}
"""
        env_file = bhyg_dir / f".env.{ticket['name'].replace(' ', '_')}"
        with open(env_file, "w") as f:
            f.write(env_content)
        ok(f"Generated BHYG env file: {env_file}")
```

---

## 第五阶段：收尾改进

### 5.1 减少 `setup.sh` 错误抑制

**修改文件：** `scripts/setup.sh`

将关键操作中的 `2>/dev/null` 移除：

```bash
# git clone（第 160 行附近）
# 改前：
git clone --depth 1 "$repo" "$dir" 2>/dev/null || { err "Failed"; return 1; }
# 改后：
if ! git clone --depth 1 "$repo" "$dir"; then
    err "  Failed to clone ${name} from ${repo}"
    return 1
fi

# pip install（第 189-216 行）
# 改前：
pip3 install -r "$TOOLS_DIR/biliTickerBuy/requirements.txt" --quiet 2>/dev/null || \
pip install -r "$TOOLS_DIR/biliTickerBuy/requirements.txt" --quiet 2>/dev/null || \
warn "Failed"
# 改后：
if ! pip3 install -r "$TOOLS_DIR/biliTickerBuy/requirements.txt" --quiet; then
    if ! pip install -r "$TOOLS_DIR/biliTickerBuy/requirements.txt" --quiet; then
        warn "Failed to install biliTickerBuy deps"
    fi
fi
```

### 5.2 修复端口冲突

**修改文件：** `scripts/start_all.sh`

```bash
# bili-ticket-go 端口（第 249 行）
# 改前：
"$binary" -web -port 8080 -host 0.0.0.0 \
# 改后：
BTG_PORT="${BTG_PORT:-8081}"
"$binary" -web -port "$BTG_PORT" -host 0.0.0.0 \

# web server 端口（新增）
WEB_PORT="${WEB_PORT:-8090}"
```

### 5.3 提高 `deploy.sh` 安全性

**修改文件：** `scripts/deploy.sh`

将 rsync 参数（第 149 行）中的 `StrictHostKeyChecking=accept-new` 改为 `StrictHostKeyChecking=yes`，并在函数开头增加环境变量提示：

```bash
# 第 149 行：
-e "ssh -p ${port} -o StrictHostKeyChecking=yes"

# 在 deploy_to() 开头添加说明
info "  Note: Set SSH_ACCEPT_HOSTKEY=1 to skip host key verification"
```

---

## 实施顺序总结

| 阶段 | 文件改动 | 风险 | 预计工作量 |
|------|----------|------|-----------|
| Phase 1 | `app.js` (TOOLS), `setup.sh` (repos), `README.md` | 极低 | 15 分钟 |
| Phase 2 | 新建 `nyaticket`, `health_check.sh`, `clean.sh`；修改 `inject_config.py`, `start_all.sh`, `setup.sh` | 低 | 1.5 小时 |
| Phase 3 | 新建 `server.py`；大幅修改 `app.js`, `start_all.sh`, `index.html` | 中 | 3-4 小时 |
| Phase 4 | 修改 `index.html`, `app.js`, `inject_config.py`, `start_all.sh` | 中 | 2 小时 |
| Phase 5 | 修改 `setup.sh`, `start_all.sh`, `deploy.sh` | 低 | 30 分钟 |

**总计预计：7-8 小时**

---

## 验证检查清单

- [ ] `nyaticket --help` 显示所有子命令
- [ ] `nyaticket setup` 克隆 4 个仓库成功
- [ ] `nyaticket config` 生成 JSON 配置成功
- [ ] `nyaticket config --dry-run` 预览模式正常
- [ ] `nyaticket start --dry-run` 预览模式正常
- [ ] `nyaticket start` 启动 2 个自动化工具 + web 后端
- [ ] `nyaticket stop` 正常停止所有进程
- [ ] `nyaticket status` 显示所有检查通过
- [ ] `nyaticket dashboard` 启动并可访问 http://localhost:8090
- [ ] 浏览器打开仪表盘，顶部连接指示灯为绿色
- [ ] 仪表盘显示真实工具状态（运行/空闲）
- [ ] 点击 Start/Stop 按钮实际启停工具
- [ ] 倒计时器实时显示剩余时间
- [ ] 票务表单包含所有字段，配置预览完整 JSON
- [ ] 添加/编辑/删除账户同步到真实 YAML 配置文件
- [ ] View Log 弹窗显示真实日志内容
- [ ] Sync/Generate Configs 按钮触发真实配置生成
- [ ] `nyaticket clean --all` 恢复干净状态
- [ ] `nyaticket deploy server1` SSH 部署正常
