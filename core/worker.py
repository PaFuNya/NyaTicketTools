#!/usr/bin/env python3
"""
NyaTicketTools — Worker Agent
Runs on each VPS node. Minimal HTTP server for receiving buy commands
and reporting status back to the master node.

Usage (on worker):
    python3 core/worker.py --port 8800 --token my-secret

Master communicates via:
    POST http://worker:8800/buy/start  (body: {accounts, target, interval})
    POST http://worker:8800/buy/stop
    GET  http://worker:8800/status
    GET  http://worker:8800/events     (SSE stream)
"""

import argparse
import json
import os
import signal
import sys
import time
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

TICKETS_FILE = PROJECT_ROOT / "config" / "tickets.yaml"
ACCOUNTS_FILE = PROJECT_ROOT / "config" / "accounts.yaml"
GEN_CONFIG = PROJECT_ROOT / "config" / "generated" / "biliTickerBuy" / "config.json"

AUTH_TOKEN = None
SSE_CLIENTS = set()
WORKER_START_TIME = time.time()


def load_yaml(path):
    try:
        import yaml
        if not path.exists():
            return {}
        with open(path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    except Exception:
        return {}


def generate_btb_config():
    """Generate biliTickerBuy JSON from YAML configs."""
    try:
        import yaml
        accounts_cfg = load_yaml(ACCOUNTS_FILE)
        tickets_cfg = load_yaml(TICKETS_FILE)
        tickets = tickets_cfg.get("tickets", [])
        accounts = {a["name"]: a for a in accounts_cfg.get("accounts", [])}

        for ticket in tickets:
            if not ticket.get("enabled", False):
                continue
            acc = accounts.get(ticket.get("account", ""))
            if not acc:
                continue
            cookie_str = acc.get("cookie", "")
            if not cookie_str:
                continue

            cookies = []
            for part in cookie_str.split(";"):
                part = part.strip()
                if "=" in part:
                    k, v = part.split("=", 1)
                    cookies.append({"name": k.strip(), "value": v.strip(), "domain": ".bilibili.com"})

            config = {
                "cookies": cookies,
                "detail": ticket.get("name", "Unknown"),
                "screen_id": int(ticket.get("screen_id", 0)),
                "project_id": int(ticket.get("project_id", 0)),
                "sku_id": int(ticket.get("sku_id", 0)),
                "pay_money": int(ticket.get("pay_money", 0)),
                "count": int(ticket.get("quantity", 1)),
                "is_hot_project": ticket.get("is_hot_project", False),
                "buyer_info": ticket.get("buyer_info", []),
                "deliver_info": ticket.get("deliver_info", {}),
            }
            GEN_CONFIG.parent.mkdir(parents=True, exist_ok=True)
            with open(GEN_CONFIG, "w", encoding="utf-8") as f:
                json.dump(config, f, ensure_ascii=False, indent=4)
            return True
    except Exception:
        pass
    return False


def send_sse(handler, event_type, data):
    msg = f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
    try:
        handler.wfile.write(msg.encode("utf-8"))
        handler.wfile.flush()
        return True
    except Exception:
        SSE_CLIENTS.discard(handler)
        return False


def broadcast_sse(event_type, data):
    dead = set()
    for client in SSE_CLIENTS:
        if not send_sse(client, event_type, data):
            dead.add(client)
    SSE_CLIENTS.difference_update(dead)


class WorkerHandler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def _check_auth(self):
        if not AUTH_TOKEN:
            return True
        auth = self.headers.get("Authorization", "")
        return auth == f"Bearer {AUTH_TOKEN}"

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

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        path = self.path.rstrip("/")
        if not self._check_auth():
            return self._json({"error": "Unauthorized"}, 401)
        if path == "/status":
            return self._handle_status()
        if path == "/events":
            return self._handle_sse()
        self._json({"error": "Not found"}, 404)

    def do_POST(self):
        path = self.path.rstrip("/")
        if not self._check_auth():
            return self._json({"error": "Unauthorized"}, 401)
        if path == "/buy/start":
            return self._handle_buy_start()
        if path == "/buy/stop":
            return self._handle_buy_stop()
        if path == "/config/generate":
            return self._handle_config_generate()
        self._json({"error": "Not found"}, 404)

    def _handle_status(self):
        from core.engine import get_engine
        engine = get_engine()
        self._json({
            "hostname": __import__("platform").node().split(".")[0].lower(),
            "engine": engine.status,
            "uptime": int(time.time() - WORKER_START_TIME),
        })

    def _handle_sse(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        SSE_CLIENTS.add(self)
        try:
            send_sse(self, "connected", {"hostname": __import__("platform").node().split(".")[0].lower()})
            while True:
                time.sleep(5)
                send_sse(self, "heartbeat", {"time": time.time()})
        except Exception:
            pass
        finally:
            SSE_CLIENTS.discard(self)

    def _handle_buy_start(self):
        body = self._read_body()
        accounts_data = body.get("accounts", [])
        target = body.get("target", {})
        interval = body.get("interval", 100)

        if not accounts_data or not target:
            return self._json({"ok": False, "error": "Missing accounts or target"})

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
        )
        for acc in accounts_data:
            engine.add_account(
                name=acc.get("name", "?"),
                cookies=acc.get("cookies", []),
                buyer_info=acc.get("buyer_info", []),
                deliver_info=acc.get("deliver_info", {}),
            )

        broadcast_sse("buy_started", {"accounts": len(accounts_data), "target": target})
        result = engine.start_all(interval=interval)
        self._json(result)

    def _handle_buy_stop(self):
        from core.engine import get_engine
        engine = get_engine()
        engine.stop_all()
        broadcast_sse("buy_stopped", {})
        self._json({"ok": True})

    def _handle_config_generate(self):
        ok = generate_btb_config()
        self._json({"ok": ok, "config_path": str(GEN_CONFIG) if ok else None})

    def log_message(self, format, *args):
        pass


def main():
    global AUTH_TOKEN
    parser = argparse.ArgumentParser(description="NyaTicketTools Worker Agent")
    parser.add_argument("--port", type=int, default=8800)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--token", default=None, help="Auth token for API access")
    args = parser.parse_args()

    AUTH_TOKEN = args.token
    print(f"Worker starting on {args.host}:{args.port}")

    # Auto-generate config on startup
    generate_btb_config()
    print(f"Config generated: {GEN_CONFIG}" if GEN_CONFIG.exists() else "No config generated (missing accounts/tickets)")

    server = HTTPServer((args.host, args.port), WorkerHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down worker...")
        server.shutdown()


if __name__ == "__main__":
    main()
