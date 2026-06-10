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

NyaTicketTools 是一个**单引擎、多机器集群抢票系统**。以 [biliTickerBuy](https://github.com/mikumifa/biliTickerBuy) 为核心引擎，通过 SSH 管理多台机器上的抢票进程，提供统一的 Web Dashboard 实时监控。

### 核心理念

> **一个引擎 × 多台机器 × 多账号 = 最大抢票概率**

```
                 你的电脑 (大脑)
                 ┌──────────────────────┐
                 │  Web Dashboard       │
                 │  localhost:8090      │
                 │                      │
                 │  ./nyaticket start   │ ← 一条命令
                 └──┬──────┬──────┬─────┘
                    │      │      │
              SSH   │      │      │  SSH
        ┌───────────┘      │      └───────────┐
        ▼                  ▼                  ▼
  ┌──────────┐      ┌──────────┐      ┌──────────┐
  │ 上海 VPS  │      │ 杭州 VPS  │      │  本地机器  │
  │ <5ms延迟 │      │ <5ms延迟 │      │  ~30ms    │
  │ 账号 A   │      │ 账号 B   │      │ 账号 C   │
  └────┬─────┘      └────┬─────┘      └────┬─────┘
       │                 │                 │
       └────────┬────────┴────────┬────────┘
                │                 │
         POST createV2      POST createV2
                │                 │
         ┌──────▼─────────────────▼──────┐
         │       Bilibili API (上海)      │
         └───────────────────────────────┘
```

---

## 功能特性

- **单引擎策略** — 只用 biliTickerBuy，不搞「多工具同时跑」的伪需求。多机器的不同 IP 才是提升概率的关键
- **集群管理** — SSH + rsync 一键部署配置到所有节点，统一启停
- **实时监控** — SSE (Server-Sent Events) 推送引擎状态到 Dashboard，不需要刷新
- **定时自动化** — 设定开售时间后，系统提前自动启动工具，开售后自动停止
- **通知系统** — 声音提醒 + 浏览器桌面通知 + Webhook (飞书/钉钉/PushPlus/Server酱)
- **Cookie 管理** — 一键粘贴自动解析，点击验证 B站 登录状态
- **中英双语** — 自动检测浏览器语言，支持手动切换
- **配置同步** — Web 表单修改后自动同步到 YAML 配置文件和所有节点

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
nyaticket setup                   # 安装 biliTickerBuy
nyaticket config [--dry-run]      # 生成 biliTickerBuy 配置
nyaticket start                   # 启动 Dashboard + 自动生成配置
nyaticket stop                    # 停止所有进程
nyaticket deploy <机器名|all>      # 部署到远程机器
nyaticket dashboard               # 仅启动 Dashboard
nyaticket status                  # 健康检查
nyaticket logs                    # 查看日志
nyaticket clean                   # 清理
```

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
