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

START_TIME = time.time()
AUTH_TOKEN = None  # Set via --token CLI arg


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
                "BHYG": procs.get("BHYG", {"running": False, "pid": None}),
                "bili_ticket_rush": procs.get("bili_ticket_rush", {"running": False, "pid": None}),
                "bili-ticket-go": procs.get("bili-ticket-go", {"running": False, "pid": None}),
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
        body = self._read_body()
        tool = body.get("tool", "")
        script = SCRIPTS_DIR / "start_all.sh"
        if not script.exists():
            return self._json({"ok": False, "error": "start_all.sh not found"}, 500)
        try:
            subprocess.Popen(
                ["bash", str(script), "--tool", tool],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            time.sleep(0.5)
            pids = read_pids()
            info = pids.get(tool, {"running": False, "pid": None})
            self._json({"ok": True, **info})
        except Exception as e:
            self._json({"ok": False, "error": str(e)}, 500)

    def _handle_tool_stop(self):
        body = self._read_body()
        tool = body.get("tool", "")
        result = kill_tool(tool)
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
