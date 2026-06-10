#!/usr/bin/env python3
"""
NyaTicketTools - Web Dashboard Backend
REST API server for managing tools, accounts, and ticket configs.
"""

import argparse
import json
import os
import platform
import signal
import subprocess
import sys
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from urllib.request import urlopen, Request
from urllib.error import URLError

try:
    import yaml
except ImportError:
    print("PyYAML not installed. Run: pip3 install pyyaml")
    sys.exit(1)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = PROJECT_ROOT / "config"
SCRIPTS_DIR = PROJECT_ROOT / "scripts"
LOGS_DIR = PROJECT_ROOT / "logs"
PIDS_FILE = PROJECT_ROOT / ".pids"

sys.path.insert(0, str(PROJECT_ROOT))

START_TIME = time.time()
AUTH_TOKEN = None  # Set via --token CLI arg
SSE_CLIENTS = set()  # Connected SSE clients


def check_auth(handler):
    """Check Authorization header if token is set. Returns True if authorized."""
    if AUTH_TOKEN is None:
        return True
    auth = handler.headers.get("Authorization", "")
    if auth == f"Bearer {AUTH_TOKEN}":
        return True
    handler._json({"error": "Unauthorized", "message": "Missing or invalid token"}, 401)
    return False


def load_yaml(path):
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def save_yaml(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True)


def read_pids():
    procs = {}
    if not PIDS_FILE.exists():
        return procs
    for line in PIDS_FILE.read_text().strip().splitlines():
        if ":" not in line:
            continue
        name, pid = line.strip().split(":", 1)
        try:
            pid = int(pid)
            os.kill(pid, 0)
            procs[name] = {"running": True, "pid": pid}
        except (ValueError, OSError):
            procs[name] = {"running": False, "pid": None}
    return procs


def kill_tool(name):
    pids = read_pids()
    if name not in pids or not pids[name]["running"]:
        return {"ok": False, "error": "not running"}
    pid = pids[name]["pid"]
    try:
        os.kill(pid, signal.SIGTERM)
        time.sleep(0.5)
        try:
            os.kill(pid, 0)
            os.kill(pid, signal.SIGKILL)
        except OSError:
            pass
        return {"ok": True}
    except OSError as e:
        return {"ok": False, "error": str(e)}


def uptime_str():
    secs = int(time.time() - START_TIME)
    if secs < 60:
        return f"{secs}s"
    if secs < 3600:
        return f"{secs // 60}m {secs % 60}s"
    h = secs // 3600
    m = (secs % 3600) // 60
    return f"{h}h {m}m"


def send_sse(handler, event_type, data):
    """Send a Server-Sent Event to a connected client."""
    msg = f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
    try:
        handler.wfile.write(msg.encode("utf-8"))
        handler.wfile.flush()
    except (BrokenPipeError, ConnectionResetError, OSError):
        SSE_CLIENTS.discard(handler)
        return False
    return True


def broadcast_sse(event_type, data):
    """Broadcast SSE event to all connected clients."""
    dead = set()
    for client in SSE_CLIENTS:
        if not send_sse(client, event_type, data):
            dead.add(client)
    SSE_CLIENTS.difference_update(dead)


def init_engine():
    """Initialize the multi-account buy engine with SSE event broadcasting."""
    try:
        from core.engine import get_engine
        engine = get_engine()
        engine.on_event = lambda e: broadcast_sse(e["type"], e)
        return engine
    except Exception as e:
        print(f"Warning: Engine not available: {e}")
        return None


def _build_cluster_accounts():
    """Build accounts list from local YAML configs for cluster deployment."""
    accounts = load_yaml(CONFIG_DIR / "accounts.yaml").get("accounts", [])
    result = []
    for a in accounts:
        cookie_str = a.get("cookie", "")
        cookies = []
        for part in cookie_str.split(";"):
            part = part.strip()
            if "=" in part:
                k, v = part.split("=", 1)
                cookies.append({"name": k.strip(), "value": v.strip(), "domain": ".bilibili.com"})
        if cookies:
            result.append({"name": a.get("name", "?"), "cookies": cookies})
    return result


def _build_cluster_target():
    """Build target dict from local tickets.yaml for cluster deployment."""
    tickets = load_yaml(CONFIG_DIR / "tickets.yaml").get("tickets", [])
    for t in tickets:
        if t.get("enabled", False):
            return {
                "project_id": int(t.get("project_id", 0)),
                "screen_id": int(t.get("screen_id", 0)),
                "sku_id": int(t.get("sku_id", 0)),
                "pay_money": int(t.get("pay_money", 0)),
                "count": int(t.get("quantity", 1)),
                "sale_start": t.get("sale_start"),
                "is_hot_project": t.get("is_hot_project", False),
                "detail": t.get("name", "Ticket"),
            }
    return {}


class APIHandler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length))

    def _serve_static(self, path):
        """Serve static files from the web directory."""
        if path == "" or path == "/":
            path = "/index.html"
        # Map URL path to file system
        file_path = Path(__file__).resolve().parent / path.lstrip("/")
        # Security: prevent directory traversal
        try:
            file_path = file_path.resolve()
            if not str(file_path).startswith(str(Path(__file__).resolve().parent)):
                return self._json({"error": "Forbidden"}, 403)
        except (ValueError, OSError):
            return self._json({"error": "Not found"}, 404)
        if not file_path.exists() or not file_path.is_file():
            return self._json({"error": "Not found"}, 404)
        # Determine content type
        ext = file_path.suffix.lower()
        content_types = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".json": "application/json",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".svg": "image/svg+xml",
            ".ico": "image/x-icon",
            ".woff": "font/woff",
            ".woff2": "font/woff2",
        }
        ct = content_types.get(ext, "application/octet-stream")
        data = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ct)
        self.send_header("Content-Length", str(len(data)))
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        qs = parse_qs(parsed.query)

        if path.startswith("/api/") and not check_auth(self):
            return
        if path == "/api/status":
            return self._handle_status()
        if path == "/api/accounts":
            return self._handle_get_accounts()
        if path == "/api/tickets":
            return self._handle_get_tickets()
        if path == "/api/health":
            return self._handle_health()
        if path == "/api/nodes":
            return self._handle_get_nodes()
        if path == "/api/events":
            return self._handle_sse()
        if path == "/api/user/info":
            return self._handle_get_user_info()
        if path.startswith("/api/project/"):
            project_id = path.split("/")[-1]
            return self._handle_get_project(project_id)
        if path.startswith("/api/tools/") and path.endswith("/log"):
            tool = path.split("/")[3]
            lines = int(qs.get("lines", ["100"])[0])
            return self._handle_tool_log(tool, lines)

        # Static file serving
        return self._serve_static(path)

    def do_POST(self):
        path = urlparse(self.path).path.rstrip("/")

        if not check_auth(self):
            return
        if path == "/api/accounts":
            return self._handle_post_accounts()
        if path == "/api/tickets":
            return self._handle_post_tickets()
        if path == "/api/tools/start":
            return self._handle_tool_start()
        if path == "/api/tools/stop":
            return self._handle_tool_stop()
        if path == "/api/config/generate":
            return self._handle_config_generate()
        if path == "/api/notify":
            return self._handle_notify()
        if path == "/api/qr-login/start":
            return self._handle_qr_login_start()
        if path == "/api/qr-login/poll":
            return self._handle_qr_login_poll()
        if path == "/api/accounts/verify":
            return self._handle_account_verify()
        if path == "/api/buy/start":
            return self._handle_buy_start()
        if path == "/api/buy/stop":
            return self._handle_buy_stop()
        if path == "/api/cluster/start":
            return self._handle_cluster_start()
        if path == "/api/cluster/stop":
            return self._handle_cluster_stop()
        if path == "/api/cluster/deploy":
            return self._handle_cluster_deploy()

        self._json({"error": "Not found"}, 404)

    def _handle_status(self):
        procs = read_pids()
        tickets_cfg = load_yaml(CONFIG_DIR / "tickets.yaml")
        sale_start = None
        for t in tickets_cfg.get("tickets", []):
            if t.get("enabled") and t.get("sale_start"):
                sale_start = t["sale_start"]
                break

        countdown = None
        if sale_start:
            try:
                from datetime import datetime, timezone
                target = datetime.fromisoformat(sale_start)
                now = datetime.now(target.tzinfo or timezone.utc)
                countdown = max(0, int((target - now).total_seconds()))
            except Exception:
                pass

        self._json({
            "hostname": platform.node().split(".")[0].lower(),
            "tools": {
                "biliTickerBuy": procs.get("biliTickerBuy", {"running": False, "pid": None}),
            },
            "sale_start": sale_start,
            "countdown_seconds": countdown,
            "uptime": uptime_str(),
            "node_count": 1,
        })

    def _handle_get_accounts(self):
        data = load_yaml(CONFIG_DIR / "accounts.yaml")
        self._json(data)

    def _handle_post_accounts(self):
        body = self._read_body()
        save_yaml(CONFIG_DIR / "accounts.yaml", body)
        self._json({"ok": True})

    def _handle_get_tickets(self):
        data = load_yaml(CONFIG_DIR / "tickets.yaml")
        self._json(data)

    def _handle_post_tickets(self):
        body = self._read_body()
        save_yaml(CONFIG_DIR / "tickets.yaml", body)
        self._json({"ok": True})

    def _handle_tool_start(self):
        """Start biliTickerBuy via multi-account engine."""
        body = self._read_body()
        tool = body.get("tool", "")

        if tool == "biliTickerBuy":
            return self._handle_buy_start()

        # Fallback
        script = SCRIPTS_DIR / "start_all.sh"
        if not script.exists():
            return self._json({"ok": False, "error": "start_all.sh not found"}, 500)
        try:
            subprocess.Popen(
                ["bash", str(script), "--tool", tool],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            time.sleep(0.5)
            pids = read_pids()
            info = pids.get(tool, {"running": False, "pid": None})
            broadcast_sse("tool_started", {"tool": tool})
            self._json({"ok": True, **info})
        except Exception as e:
            self._json({"ok": False, "error": str(e)}, 500)

    def _handle_tool_stop(self):
        """Stop biliTickerBuy engine."""
        body = self._read_body()
        tool = body.get("tool", "")

        if tool == "biliTickerBuy":
            return self._handle_buy_stop()

        result = kill_tool(tool)
        broadcast_sse("tool_stopped", {"tool": tool})
        self._json(result)

    def _handle_tool_log(self, tool, lines):
        log_files = sorted(LOGS_DIR.glob(f"{tool}*.log"), reverse=True)
        if not log_files:
            return self._json({"lines": [], "file": None})
        log_file = log_files[0]
        try:
            all_lines = log_file.read_text(encoding="utf-8", errors="replace").splitlines()
            tail = all_lines[-lines:]
            self._json({"lines": tail, "file": str(log_file.name)})
        except Exception as e:
            self._json({"error": str(e)}, 500)

    def _handle_notify(self):
        """Send notification to webhook (Feishu, PushPlus, ServerChan, etc.)"""
        body = self._read_body()
        title = body.get("title", "NyaTicketTools")
        message = body.get("body", "")
        webhook_url = body.get("webhook", "")

        if not webhook_url:
            return self._json({"ok": False, "error": "No webhook URL"})

        try:
            # Detect webhook type and format payload
            payload = None
            headers = {"Content-Type": "application/json"}

            if "feishu.cn" in webhook_url or "larksuite.com" in webhook_url:
                # Feishu/Lark webhook
                payload = {
                    "msg_type": "text",
                    "content": {"text": f"🎫 {title}\n{message}"},
                }
            elif "pushplus.plus" in webhook_url:
                # PushPlus
                payload = {
                    "title": title,
                    "content": message,
                    "template": "txt",
                }
            elif "server酱" in webhook_url or "sctapi.ftqq.com" in webhook_url:
                # ServerChan
                payload = {
                    "title": title,
                    "desp": message,
                }
            elif "oapi.dingtalk.com" in webhook_url:
                # DingTalk
                payload = {
                    "msgtype": "text",
                    "text": {"content": f"🎫 {title}\n{message}"},
                }
            elif "hooks.slack.com" in webhook_url:
                # Slack
                payload = {
                    "text": f"🎫 *{title}*\n{message}",
                }
            else:
                # Generic: POST JSON with title+body
                payload = {"title": title, "body": message, "text": f"{title}\n{message}"}

            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            req = Request(webhook_url, data=data, headers=headers, method="POST")
            with urlopen(req, timeout=10) as resp:
                status = resp.status
            self._json({"ok": True, "status": status})
        except URLError as e:
            self._json({"ok": False, "error": str(e)})
        except Exception as e:
            self._json({"ok": False, "error": str(e)})

    def _handle_config_generate(self):
        script = SCRIPTS_DIR / "inject_config.py"
        if not script.exists():
            return self._json({"ok": False, "error": "inject_config.py not found"}, 500)
        try:
            result = subprocess.run(
                ["python3", str(script)],
                capture_output=True, text=True, timeout=30,
            )
            self._json({
                "ok": result.returncode == 0,
                "stdout": result.stdout,
                "stderr": result.stderr,
            })
        except Exception as e:
            self._json({"ok": False, "error": str(e)}, 500)

    def _handle_health(self):
        pyver = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
        config_ok = (CONFIG_DIR / "accounts.yaml").exists() and (CONFIG_DIR / "tickets.yaml").exists()
        self._json({
            "ok": True,
            "python": pyver,
            "config_valid": config_ok,
            "uptime": uptime_str(),
        })

    # ── QR Login ──────────────────────────────────────────────

    def _handle_qr_login_start(self):
        """Start QR code login flow."""
        from core.engine import MultiBuyEngine
        result = MultiBuyEngine.start_qr_login(qr_image_path=False)
        self._json(result)

    def _handle_qr_login_poll(self):
        """Poll QR login status."""
        body = self._read_body()
        qrcode_key = body.get("qrcode_key", "")
        timeout = body.get("timeout", 120)
        if not qrcode_key:
            return self._json({"ok": False, "error": "Missing qrcode_key"})
        from core.engine import MultiBuyEngine
        result = MultiBuyEngine.poll_qr_login(qrcode_key, timeout=timeout)
        if result.get("ok") and result.get("cookies"):
            result["cookie_string"] = "; ".join(
                f"{c['name']}={c['value']}" for c in result["cookies"]
                if c.get("name") in ("SESSDATA", "bili_jct", "DedeUserID")
            )
        self._json(result)

    # ── Account ───────────────────────────────────────────────

    def _handle_account_verify(self):
        """Verify account cookies against Bilibili API."""
        body = self._read_body()
        cookies = body.get("cookies", [])
        from core.engine import MultiBuyEngine
        ok, username, error = MultiBuyEngine.verify_cookies(cookies)
        self._json({"ok": ok, "username": username, "error": error})

    def _handle_get_user_info(self):
        """Get user buyers and addresses."""
        cookies = None
        # Try to parse cookies from query params
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        cookie_str = qs.get("cookie", [None])[0]
        if cookie_str:
            cookies = []
            for part in cookie_str.split(";"):
                part = part.strip()
                if "=" in part:
                    k, v = part.split("=", 1)
                    cookies.append({"name": k.strip(), "value": v.strip(), "domain": ".bilibili.com"})
        if not cookies:
            return self._json({"ok": False, "error": "No cookies provided. Use ?cookie=SESSDATA=..."})
        from core.engine import MultiBuyEngine
        result = MultiBuyEngine.fetch_user_info(cookies)
        self._json(result)

    # ── Project ───────────────────────────────────────────────

    def _handle_get_project(self, project_id):
        """Get project detail."""
        from core.engine import MultiBuyEngine
        result = MultiBuyEngine.fetch_project_detail(project_id)
        self._json(result)

    # ── Multi-Account Buy ─────────────────────────────────────

    def _handle_buy_start(self):
        """Start multi-account buy engine."""
        body = self._read_body()
        accounts_data = body.get("accounts", [])
        target = body.get("target", {})
        interval = body.get("interval", 100)

        if not accounts_data:
            return self._json({"ok": False, "error": "No accounts provided"})
        if not target.get("project_id"):
            return self._json({"ok": False, "error": "Missing project_id in target"})

        from core.engine import reset_engine, get_engine
        reset_engine()
        engine = get_engine()
        engine.on_event = lambda e: broadcast_sse(e["type"], e)

        engine.set_target(
            project_id=target["project_id"],
            screen_id=target.get("screen_id", 0),
            sku_id=target.get("sku_id", 0),
            pay_money=target.get("pay_money", 0),
            count=target.get("count", 1),
            sale_start=target.get("sale_start"),
            is_hot_project=target.get("is_hot_project", False),
            detail=target.get("detail"),
        )

        for acc in accounts_data:
            engine.add_account(
                name=acc.get("name", "unknown"),
                cookies=acc.get("cookies", []),
                buyer_info=acc.get("buyer_info", []),
                deliver_info=acc.get("deliver_info", {}),
            )

        broadcast_sse("buy_started", {"accounts": len(accounts_data), "target": target})
        result = engine.start_all(interval=interval)
        self._json(result)

    def _handle_buy_stop(self):
        """Stop multi-account buy engine."""
        from core.engine import get_engine
        engine = get_engine()
        engine.stop_all()
        broadcast_sse("buy_stopped", {"message": "Buy stopped"})
        self._json({"ok": True})

    def _handle_sse(self):
        """Server-Sent Events endpoint for real-time engine status."""
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        SSE_CLIENTS.add(self)
        try:
            send_sse(self, "connected", {"message": "SSE connected", "time": time.time()})
            while True:
                time.sleep(5)
                send_sse(self, "heartbeat", {"time": time.time()})
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            SSE_CLIENTS.discard(self)

    def _handle_get_nodes(self):
        """Get cluster node status with live polling."""
        try:
            from core.cluster import get_cluster
            cluster = get_cluster()
            cluster.check_all()
            nodes = cluster.status_all()
            self._json({"ok": True, "nodes": nodes})
        except Exception as e:
            self._json({"ok": False, "error": str(e), "nodes": {}})

    def _handle_cluster_start(self):
        """Deploy configs, start workers, and start buying on all nodes."""
        try:
            from core.cluster import get_cluster
            cluster = get_cluster()
            cluster.check_all()

            # Build accounts/target from local config
            accounts_data = _build_cluster_accounts()
            target_data = _build_cluster_target()

            results = cluster.full_deploy_and_start(accounts=accounts_data, target=target_data)
            broadcast_sse("cluster_start", {"results": results})
            self._json({"ok": True, "results": results})
        except Exception as e:
            self._json({"ok": False, "error": str(e)})

    def _handle_cluster_stop(self):
        """Stop buying and workers on all nodes."""
        try:
            from core.cluster import get_cluster
            cluster = get_cluster()
            stop_results = cluster.stop_buy_all()
            worker_results = cluster.stop_workers()
            broadcast_sse("cluster_stop", {"stop": stop_results, "workers": worker_results})
            self._json({"ok": True, "stop": stop_results, "workers": worker_results})
        except Exception as e:
            self._json({"ok": False, "error": str(e)})

    def _handle_cluster_deploy(self):
        """Deploy configs to all nodes and start workers."""
        try:
            from core.cluster import get_cluster
            cluster = get_cluster()
            deploy = cluster.deploy_all()
            time.sleep(2)
            workers = cluster.start_workers()
            broadcast_sse("cluster_deploy", {"deploy": deploy, "workers": workers})
            self._json({"ok": True, "deploy": deploy, "workers": workers})
        except Exception as e:
            self._json({"ok": False, "error": str(e)})

    def log_message(self, format, *args):
        pass  # Suppress default access logs


def main():
    global AUTH_TOKEN
    parser = argparse.ArgumentParser(description="NyaTicketTools Web Dashboard Server")
    parser.add_argument("--port", type=int, default=8090, help="Port to listen on")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to")
    parser.add_argument("--token", default=None, help="API auth token (optional, enables Bearer auth)")
    args = parser.parse_args()

    AUTH_TOKEN = args.token
    if AUTH_TOKEN:
        print(f"API authentication enabled. Use header: Authorization: Bearer {AUTH_TOKEN}")

    server = HTTPServer((args.host, args.port), APIHandler)
    print(f"NyaTicketTools Dashboard running on http://{args.host}:{args.port}")
    if args.host == "0.0.0.0" and not AUTH_TOKEN:
        print("WARNING: Listening on all interfaces without auth. Use --token <secret> or --host 127.0.0.1")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        server.shutdown()


if __name__ == "__main__":
    main()
