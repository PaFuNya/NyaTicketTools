<h1 align="center">NyaTicketTools</h1>

<p align="center">
  <strong>B站会员购 · 单引擎多机器集群抢票系统</strong>
</p>

<p align="center">
  <a href="#简介">简介</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#集群部署">集群部署</a> •
  <a href="#web-管理面板">Web 面板</a> •
  <a href="#配置参考">配置</a>
</p>

---

## 简介

NyaTicketTools 是一个**主控端 / 被控端 集群抢票系统**。以 [biliTickerBuy](https://github.com/mikumifa/biliTickerBuy) 为核心引擎，主控端负责扫码登录和配置管理，被控端（VPS）无浏览器纯 CLI 执行抢票，Dashboard 实时监控全集群状态。

### 核心理念

> **主控端配一次 × 多台被控端并行抢 × 多账号 = 最大抢票概率**

### 架构

```
主控端 (你的电脑, 有浏览器)
┌─────────────────────────────────────────────┐
│  localhost:8090  Dashboard                  │
│  ├─ 扫码登录 → 获取 Cookie → 验证            │
│  ├─ 填写票务 → 存 YAML                       │
│  └─ 点「集群开始抢票」                        │
│                                             │
│  web/server.py   API + SSE 实时推送          │
│  core/cluster.py  SSH + HTTP 双重控制        │
└──────┬──────────┬──────────┬────────────────┘
       │          │          │
  SSH  │    SSH   │    SSH   │  rsync 配置
  HTTP │    HTTP  │    HTTP  │  启动 worker
       │          │          │
┌──────▼────┐ ┌───▼──────┐ ┌▼──────────────┐
│ 被控端 VPS │ │ 被控端 VPS │ │ 被控端 VPS     │
│ (无浏览器) │ │ (无浏览器) │ │ (无浏览器)     │
│           │ │           │ │               │
│ worker.py │ │ worker.py │ │ worker.py     │
│ :8800     │ │ :8800     │ │ :8800         │
│   ↓       │ │   ↓       │ │   ↓           │
│ import    │ │ import    │ │ import        │
│ biliTicke │ │ biliTicke │ │ biliTicke     │
│ rBuy      │ │ rBuy      │ │ rBuy          │
│   ↓       │ │   ↓       │ │   ↓           │
│ B站 API   │ │ B站 API   │ │ B站 API       │
└───────────┘ └───────────┘ └───────────────┘
```

---

## 功能特性

- **主控端 / 被控端 架构** — 主控端浏览器扫码登录、配置票务；被控端纯 CLI 抢票，不需要浏览器
- **扫码登录** — 浏览器点「扫码登录」→ B站 App 扫码 → Cookie 自动解析填入
- **Cookie 验证** — 调 B站 API 实时验证 Cookie 有效性
- **多账号并行** — 所有账号同时抢，任一成功自动停止其余
- **集群管理** — SSH + rsync 部署配置，HTTP 控制被控端 worker，一键全集群启停
- **实时监控** — SSE 推送每台被控端状态，不需要刷新
- **定时自动化** — 设定开售时间，系统提前自动启动，开售后自动停止
- **通知系统** — 声音提醒 + 浏览器桌面通知 + Webhook (飞书/钉钉/PushPlus/Server酱)
- **中英双语** — 自动检测浏览器语言，支持手动切换
- **配置同步** — Web 表单修改后自动同步到 YAML，rsync 到所有被控端

---

## 快速开始

### 1. 克隆并安装

```bash
git clone https://github.com/PaFuNya/NyaTicketTools.git
cd NyaTicketTools
chmod +x nyaticket scripts/*
./nyaticket setup
```

### 2. 配置

```bash
# 编辑配置文件
cp config/sample_accounts.yaml config/accounts.yaml
cp config/sample_tickets.yaml config/tickets.yaml

# 填你的 B站 Cookie 和票务信息
nano config/accounts.yaml
nano config/tickets.yaml
```

### 3. 启动

```bash
./nyaticket config          # YAML → biliTickerBuy JSON
./nyaticket start           # 启动 Dashboard
```

浏览器打开 **http://localhost:8090**

### 4. 使用 Web 面板

1. **账号管理** → 粘贴 Cookie → 点「解析」→ 点「验证」确认有效
2. **抢票配置** → 4 步向导填写活动信息 → 保存（自动同步到 YAML）
3. **总览** → 看到就绪检查全部 ✅ → 点「开始抢票」或等定时自动启动

---

## 集群部署

### 配置远程机器

编辑 `config/machines.yaml`：

```yaml
machines:
  vps-shanghai:
    host: "1.2.3.4"
    user: "root"
    port: 22
    remote_path: "/opt/NyaTicketTools"
    accounts: ["主号"]

  vps-hangzhou:
    host: "5.6.7.8"
    user: "root"
    port: 22
    remote_path: "/opt/NyaTicketTools"
    accounts: ["小号"]
```

### 部署并启动

```bash
./nyaticket deploy all     # rsync 配置到所有节点
./nyaticket start          # 启动 Dashboard

# 在 Dashboard → 多机部署：
# 点「部署配置到所有节点」 → 「集群开始抢票」
```

---

## Web 管理面板

```
总览 (Dashboard)
├── 状态条: N个工具运行中 | 离开售 00:23:15 | [开始抢票]
├── 就绪检查: 账号/票务/工具 三色状态卡
├── 运行中的工具: 实时状态 + [停止] [日志]
├── 所有工具 (折叠)
└── 通知与定时设置: 声音/浏览器通知/Webhook/提前启动/自动停止

账号管理
├── 粘贴完整 Cookie → 一键解析 SESSDATA/bili_jct/DedeUserID
├── 验证 Cookie 有效性 (调 B站 API)
└── 显示该账号用于哪些票务

抢票配置 (4步向导)
├── Step 1: 活动信息 (project_id/screen_id/sku_id/票价/开售时间)
├── Step 2: 工具选择 (biliTickerBuy · 全自动)
├── Step 3: 购票人信息 (可选)
└── Step 4: 配送与通知 (可选)

多机部署
├── 节点列表 (在线状态/引擎运行状态)
├── 部署配置到所有节点
├── 集群开始抢票 / 集群停止
└── 导出/导入/重置
```

---

## CLI 命令

```bash
nyaticket setup                          # 安装 biliTickerBuy
nyaticket config [--dry-run]             # 生成 biliTickerBuy 配置
nyaticket start                          # 启动 Dashboard
nyaticket stop                           # 停止所有进程
nyaticket deploy all                     # rsync 配置到所有被控端
nyaticket dashboard                      # 仅启动 Dashboard (端口 8090)
nyaticket status                         # 健康检查
nyaticket logs                           # 查看日志
nyaticket clean                          # 清理
```

## 项目结构

```
NyaTicketTools/
├── core/                        # 核心引擎 (Python)
│   ├── engine.py                # 多账号抢票引擎 (import biliTickerBuy)
│   ├── cluster.py               # 集群管理 (SSH + HTTP 双重控制)
│   └── worker.py                # 被控端 agent (:8800 HTTP API)
├── web/                         # Web 面板
│   ├── server.py                # 主控端 API + SSE + 静态文件
│   ├── index.html               # SPA (中英双语)
│   ├── css/style.css            # 暗色玻璃拟态主题
│   └── js/
│       ├── app.js               # 前端逻辑 (SSE + QR登录 + 集群)
│       └── i18n.js              # 国际化 (~100 条文案)
├── scripts/
│   ├── setup.sh                 # 安装 biliTickerBuy
│   ├── inject_config.py         # YAML → JSON 配置生成
│   ├── start_all.sh             # 启动 Dashboard
│   ├── stop_all.sh              # 停止所有进程
│   └── deploy.sh                # rsync 多机部署
├── config/
│   ├── sample_accounts.yaml
│   ├── sample_tickets.yaml
│   └── sample_machines.yaml
├── tools/biliTickerBuy/         # 抢票引擎 (git-ignored)
├── nyaticket                    # CLI 统一入口
└── README.md
```

## 集群部署流程

```bash
# 【被控端 VPS 上 — 只需做一次】
pip install bilitickerbuy pyyaml
# 确保 SSH 能从主控端免密登录

# 【主控端】
vim config/machines.yaml    # 填写 VPS IP
vim config/accounts.yaml    # 或通过 Dashboard 扫码登录
vim config/tickets.yaml     # 或通过 Dashboard 填写票务

./nyaticket start           # 启动 Dashboard

# Dashboard → 多机部署 → 点「集群开始抢票」
# 自动完成：
#   1. rsync 配置到所有被控端
#   2. SSH 启动所有被控端的 worker agent (:8800)
#   3. HTTP 通知所有 worker 开始抢票
#   4. SSE 实时推送每台被控端状态

---

## 项目结构

```
NyaTicketTools/
├── core/                        # 核心引擎 (Python)
│   ├── engine.py                # 抢票引擎 (管理 biliTickerBuy)
│   └── cluster.py               # 集群管理 (SSH + rsync)
├── web/                         # Web 面板
│   ├── server.py                # REST API + SSE + 静态文件
│   ├── index.html               # SPA (中英双语)
│   ├── css/style.css            # 暗色玻璃拟态主题
│   └── js/
│       ├── app.js               # 前端逻辑
│       └── i18n.js              # 国际化 (~80 条文案)
├── scripts/
│   ├── setup.sh                 # 安装 biliTickerBuy
│   ├── inject_config.py         # YAML → JSON 配置生成
│   ├── start_all.sh             # 启动 Dashboard
│   ├── stop_all.sh              # 停止所有进程
│   └── deploy.sh                # rsync 多机部署
├── config/
│   ├── sample_accounts.yaml     # 账号配置模板
│   ├── sample_tickets.yaml      # 票务配置模板
│   └── sample_machines.yaml     # 集群节点模板
├── tools/biliTickerBuy/         # 抢票引擎 (git-ignored)
├── nyaticket                    # CLI 统一入口
└── README.md
```

---

## 配置参考

### accounts.yaml

```yaml
accounts:
  - name: "主号"
    uid: "123456789"
    cookie: "SESSDATA=xxx; bili_jct=xxx; DedeUserID=xxx"
    enabled: true
```

### tickets.yaml

```yaml
tickets:
  - name: "示例演唱会"
    project_id: "12345"
    screen_id: "67890"
    sku_id: "11111"
    pay_money: 48000
    quantity: 1
    account: "主号"
    sale_start: "2026-07-01T10:00:00+08:00"
    is_hot_project: false
    enabled: true
```

### machines.yaml

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
T-60s   NTP 时间同步，确保毫秒级精度
T-30s   预取 prepare token，HTTP 连接池预热
T+0     多节点 × 多账号 并发 createV2
T+0.1s  任一节点成功 → 通知所有节点停止
        推送通知 (声音 + 浏览器 + Webhook)
```

---

## 常见问题

### 多机器真的比多工具有用吗？

是的。B站限流按 IP 维度，同一台机器跑 10 个工具和跑 1 个没区别。
不同 IP 的不同机器才是真正提升概率的手段。

### 如何获取 B站 Cookie？

1. 浏览器登录 bilibili.com
2. F12 → Application → Cookies → bilibili.com
3. 复制完整的 Cookie 字符串
4. 在 Web 面板 → 账号管理 → 粘贴 → 解析

### 必须用 VPS 吗？

不是必须，但推荐。上海/杭州的云服务器离 B站服务器最近（<5ms），比家庭宽带（20-50ms）有明显优势。本地机器也可以作为集群中的节点。

---

## 致谢

- [mikumifa/biliTickerBuy](https://github.com/mikumifa/biliTickerBuy) — 核心抢票引擎

---

## License

MIT License. 仅供学习交流使用，使用本工具购票请遵守 B站 用户协议。
