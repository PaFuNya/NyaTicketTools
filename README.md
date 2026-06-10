<p align="center">
  <img src="web/assets/logo.png" alt="NyaTicketTools" width="128" />
</p>

<h1 align="center">NyaTicketTools</h1>

<p align="center">
  <strong>B站会员购多工具协同抢票集群管理系统</strong>
</p>

<p align="center">
  <a href="#功能特性">功能</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#部署指南">部署</a> •
  <a href="#web-管理端">Web UI</a> •
  <a href="#许可协议">License</a>
</p>

---

## 简介

NyaTicketTools 是一个**多工具、多机器协同抢票集群管理系统**。它将 4 个主流 B 站抢票工具整合到统一的配置和管理框架下，支持一键部署到多台机器，通过 Web 管理端集中控制。

### 核心理念

> **多工具 × 多机器 × 多账号 = 最大抢票概率**

```
┌─────────────────────────────────────────────────┐
│            NyaTicketTools 集群架构               │
├─────────────────────────────────────────────────┤
│                                                 │
│  🖥️ PC (Windows)  ─────┐                        │
│  🐧 PC (WSL)      ─────┤                        │
│                        ├──→ 统一配置中心         │
│  ☁️ 云服务器       ─────┤    (Web 管理端)         │
│                        │                        │
│  🏠 工作站 (Win)  ─────┤    4 个工具并行:        │
│  🐧 工作站 (WSL)  ─────┘    • biliTickerBuy     │
│                              • BHYG             │
│  3+ 独立 IP                    • bili_ticket_rush│
│  5+ 执行环境                   • bili-ticket-go  │
└─────────────────────────────────────────────────┘
```

---

## 功能特性

### 整合的抢票工具

| 工具 | 语言 | 自动化程度 | 平台 | 特点 |
|------|------|-----------|------|------|
| [biliTickerBuy](https://github.com/mikumifa/biliTickerBuy) | Python | **完全自动** | 全平台 | CLI 模式 `btb buy config.json`, Gradio Web UI, Docker |
| [BHYG](https://github.com/ZianTT/BHYG) | Python | **可自动生成配置** | 全平台 | AES 加密配置可自动生成, 终端交互 |
| [bili_ticket_rush](https://github.com/Violiate/bili_ticket_rush) | Rust | 需 GUI | Windows/Linux 桌面 | 原生 GUI, ONNX 验证码识别 |
| [bili-ticket-go](https://github.com/konaxia548/bili-ticket-go) | Binary | Web/TUI | **仅 Linux/WSL** | 预编译二进制, Web UI, 无源码 |

> **自动化说明：** biliTickerBuy 和 BHYG 的配置可以由统一 YAML 自动生成并一键启动。bili_ticket_rush 需要手动 GUI 操作。bili-ticket-go 仅提供 Linux 二进制，Windows 用户需通过 WSL 运行。

### 管理功能

- **统一配置中心** — YAML 格式管理所有账号和票务信息，自动注入各工具
- **Web 管理端** — 暗色主题 + 玻璃拟态风格的 Dashboard，GSAP 动画
- **一键部署** — rsync + SSH 自动同步到所有机器
- **多机器支持** — 配置 `machines.yaml`，一键分发到云服务器、工作站等
- **进程管理** — 一键启动/停止所有工具，PID 追踪，优雅退出

---

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/PaFuNya/NyaTicketTools.git
cd NyaTicketTools
```

### 2. 一键安装所有工具

```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

这会自动：
- 克隆 4 个抢票工具的源码
- 安装 Python 依赖 (biliTickerBuy, BHYG)
- 下载 bili-ticket-go 二进制文件
- (可选) 编译 bili_ticket_rush (需要 Rust 环境)

### 3. 配置账号和票务

```bash
# 复制示例配置
cp config/sample_accounts.yaml config/accounts.yaml
cp config/sample_tickets.yaml config/tickets.yaml

# 编辑配置 (填入你的 B 站 cookie 和票务信息)
nano config/accounts.yaml
nano config/tickets.yaml
```

### 4. 注入配置到各工具

```bash
python3 scripts/inject_config.py
```

### 5. 一键启动

```bash
chmod +x scripts/start_all.sh
./scripts/start_all.sh
```

### 6. 打开 Web 管理端

```bash
cd web && python3 -m http.server 8080
# 浏览器打开 http://localhost:8080
```

---

## 部署指南

### 单机部署 (当前电脑)

直接按上面的「快速开始」操作即可。

### 多机集群部署

#### 1. 配置目标机器

编辑 `config/machines.yaml`：

```yaml
machines:
  - name: "cloud-server"
    host: "your-server-ip"
    user: "root"
    port: 22
    accounts: ["账号1", "账号2"]

  - name: "home-workstation"
    host: "192.168.1.100"
    user: "user"
    port: 22
    accounts: ["账号3"]
```

#### 2. 一键部署到所有机器

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh all        # 部署到所有机器
./scripts/deploy.sh cloud-server  # 只部署到指定机器
```

#### 3. 在远程机器上安装工具

```bash
ssh your-server-ip
cd ~/NyaTicketTools
./scripts/setup.sh --quick  # 跳过 git clone，只装依赖
```

### Windows 部署

Windows 端的部署步骤：

1. 安装 [Python 3.11+](https://python.org)
2. 安装 [Git](https://git-scm.com)
3. 克隆项目并运行 `setup.bat` (TODO: 提供 Windows 脚本)
4. 或者使用 WSL2 按 Linux 流程部署

---

## Web 管理端

NyaTicketTools 内置了一个精美的 Web 管理端：

- **暗色主题** — 深紫色调 + 玻璃拟态效果
- **GSAP 动画** — 卡片入场、悬浮、状态脉冲等
- **5 个页面** — Dashboard / Accounts / Tickets / Tools / Deploy
- **响应式设计** — 支持手机到桌面各种屏幕
- **本地存储** — 配置保存在浏览器 LocalStorage

### 截图

MEDIA:/root/.hermes/cache/screenshots/browser_screenshot_8fdefa6d0dc54acc981bbfb23259a918.png

---

## 项目结构

```
NyaTicketTools/
├── config/                    # 配置文件目录
│   ├── sample_accounts.yaml   # 账号配置模板
│   ├── sample_tickets.yaml    # 票务配置模板
│   └── sample_machines.yaml   # 部署目标模板
├── scripts/                   # 管理脚本
│   ├── setup.sh              # 一键安装所有工具
│   ├── inject_config.py      # 配置注入脚本
│   ├── start_all.sh          # 一键启动
│   ├── stop_all.sh           # 一键停止
│   └── deploy.sh             # 多机部署
├── web/                       # Web 管理端
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
├── tools/                     # 抢票工具 (git-ignored, 由 setup.sh 安装)
├── docs/                      # 文档
├── LICENSE
└── README.md
```

---

## 配置说明

### 账号配置 (config/accounts.yaml)

```yaml
accounts:
  - name: "主号"
    uid: "123456789"
    cookie: "SESSDATA=your_sessdata; bili_jct=your_bili_jct; DedeUserID=your_dede_uid"
    enabled: true
```

### 票务配置 (config/tickets.yaml)

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

### 机器配置 (config/machines.yaml)

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

## 工作原理

```
┌──────────────────────────────────────────────────────┐
│                    工作流程                            │
├──────────────────────────────────────────────────────┤
│                                                      │
│  1. 用户在 Web UI 或 YAML 中配置账号 + 票务信息       │
│                     ↓                                │
│  2. start_all.sh 自动调用 inject_config.py            │
│     → 生成 biliTickerBuy JSON (CLI 模式)             │
│     → 生成 BHYG 加密 .sba 配置                       │
│     → 打印 bili_ticket_rush/bili-ticket-go 指引      │
│                     ↓                                │
│  3. 一键启动所有可自动化工具                           │
│     → biliTickerBuy (CLI: btb buy config.json)       │
│     → BHYG (python3 main.py)                         │
│     → bili-ticket-go (Web 模式, 仅 Linux/WSL)        │
│                     ↓                                │
│  4. 开售时间到 → 多工具同时发起请求                    │
│                     ↓                                │
│  5. 成功购票 → 推送通知 (Bark/PushPlus/ServerChan)    │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 一键启动流程

```bash
# 方式1: 使用统一 CLI
./nyaticket start

# 方式2: 直接调用脚本
./scripts/start_all.sh

# 预览模式 (不实际启动)
./scripts/start_all.sh --dry-run
```

启动时会自动：
1. 检查配置是否需要更新，如有变更自动重新生成
2. 启动 biliTickerBuy (CLI 模式，自动抢票)
3. 启动 BHYG (如已配置)
4. 启动 bili-ticket-go Web UI (仅 Linux/WSL)
5. 启动 Web 管理端 (http://localhost:8090)

---

## 常见问题

### Q: 多工具同时抢会不会被封号？

A: 同一账号从多工具同时请求确实有风控风险。建议：
- **多账号** — 每个工具绑定不同账号，真正的倍增器
- **多 IP** — 不同机器用不同网络出口
- **合理频率** — 不要设置过高的请求频率

### Q: 哪个工具最好用？

A: 推荐优先级：
1. **biliTickerBuy** — 最推荐，完全自动化，CLI 模式一键抢票
2. **BHYG** — 配置可自动生成，3 年迭代经验丰富
3. **bili-ticket-go** — 仅限 Linux/WSL，Web UI 友好
4. **bili_ticket_rush** — 需要 GUI 操作，适合有桌面环境的机器

### Q: 如何获取 B 站 Cookie？

A: 浏览器登录 bilibili.com → F12 → Application → Cookies，复制 `SESSDATA`、`bili_jct`、`DedeUserID`。

---

## 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本项目
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到远程 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

---

## 致谢

感谢以下开源项目：
- [mikumifa/biliTickerBuy](https://github.com/mikumifa/biliTickerBuy) — B 站会员购购票辅助
- [ZianTT/BHYG](https://github.com/ZianTT/BHYG) — B 站抢票脚本
- [Violiate/bili_ticket_rush](https://github.com/Violiate/bili_ticket_rush) — Rust 抢票工具
- [konaxia548/bili-ticket-go](https://github.com/konaxia548/bili-ticket-go) — Go 抢票工具

---

## 许可协议

本项目采用 [MIT License](LICENSE) 开源。

**免责声明：** 本项目仅供学习交流使用。使用本工具购票时请遵守 B 站用户协议和相关法律法规。因使用本工具产生的任何后果，作者概不负责。
