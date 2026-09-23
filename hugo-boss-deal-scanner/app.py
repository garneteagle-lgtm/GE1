"""Local web app for the Hugo Boss deal scanner.

Starts a small server on http://127.0.0.1:8765 and opens it in your browser.
Only listens on your own machine; nothing is exposed to the network.
"""
import asyncio
import json
import os
import socket
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import scanner

HOST, PORT = "127.0.0.1", 8765
HERE = Path(__file__).resolve().parent
INDEX_HTML = HERE / "static" / "index.html"
LAST_SCAN = HERE / "last_scan.json"
SEEN_FILE = HERE / "seen.json"

state_lock = threading.Lock()
state = {"running": False, "progress": [], "total": 0, "checked": 0, "to_check": None, "report": None, "error": None}
if LAST_SCAN.exists():
    try:
        state["report"] = json.loads(LAST_SCAN.read_text())
    except ValueError:
        pass


def _run_scan(show_browser, size):
    sites = [s for s in scanner.load_sites() if s.get("enabled", True)]
    with state_lock:
        state.update(running=True, progress=[], total=len(sites), checked=0, to_check=None, error=None)

    def on_progress(r):
        with state_lock:
            state["progress"].append({k: v for k, v in r.items() if k != "items"})

    def on_check(d):
        with state_lock:
            if "total" in d:
                state["to_check"] = d["total"]
            else:
                state["checked"] += 1

    try:
        report = asyncio.run(scanner.scan(sites, headless=not show_browser, on_progress=on_progress,
                                          size=size, on_check=on_check))
        seen = set(json.loads(SEEN_FILE.read_text())) if SEEN_FILE.exists() else set()
        first_run = not seen
        for d in report["deals"]:
            d["new"] = not first_run and d["url"].split("?")[0] not in seen
            seen.add(d["url"].split("?")[0])
        SEEN_FILE.write_text(json.dumps(sorted(seen)))
        LAST_SCAN.write_text(json.dumps(report, indent=1))
        with state_lock:
            state["report"] = report
    except Exception as e:
        msg = str(e)
        if "Executable doesn't exist" in msg or "playwright install" in msg:
            msg = "Browser not installed. Re-run ./install.sh (it downloads Chromium)."
        with state_lock:
            state["error"] = msg.splitlines()[0][:300]
    finally:
        with state_lock:
            state["running"] = False


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def _same_origin(self):
        # Block other websites from driving this local server.
        origin = self.headers.get("Origin")
        return origin in (None, f"http://{HOST}:{PORT}", f"http://localhost:{PORT}")

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            return self._send(200, INDEX_HTML.read_bytes(), "text/html; charset=utf-8")
        if self.path == "/api/status":
            with state_lock:
                return self._send(200, state)
        if self.path == "/api/sites":
            return self._send(200, scanner.load_sites())
        if self.path == "/api/ping":
            return self._send(200, {"app": "hugo-boss-deals"})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if not self._same_origin():
            return self._send(403, {"error": "forbidden"})
        if self.path == "/api/scan":
            with state_lock:
                if state["running"]:
                    return self._send(409, {"error": "Scan already running"})
                state["running"] = True
            body = self._body()
            size = str(body.get("size") or scanner.DEFAULT_SIZE).strip().upper()
            try:
                scanner.parse_size(size)
            except ValueError as e:
                with state_lock:
                    state["running"] = False
                return self._send(400, {"error": str(e)})
            threading.Thread(target=_run_scan, args=(bool(body.get("show_browser")), size), daemon=True).start()
            return self._send(202, {"ok": True})
        if self.path == "/api/sites":
            sites = self._body()
            if not isinstance(sites, list) or not all(
                isinstance(s, dict) and s.get("name") and str(s.get("url", "")).startswith("http") for s in sites
            ):
                return self._send(400, {"error": "Each site needs a name and an http(s) URL"})
            scanner.save_sites(sites)
            return self._send(200, {"ok": True})
        if self.path == "/api/quit":
            self._send(200, {"ok": True})
            threading.Thread(target=lambda: (time.sleep(0.3), os._exit(0)), daemon=True).start()
            return
        self._send(404, {"error": "not found"})


def already_running():
    try:
        with socket.create_connection((HOST, PORT), timeout=0.5):
            return True
    except OSError:
        return False


def main():
    url = f"http://{HOST}:{PORT}/"
    if already_running():
        webbrowser.open(url)
        return
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Hugo Boss Deal Scanner running at {url}  (Ctrl+C to stop)")
    if "--no-browser" not in sys.argv:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
