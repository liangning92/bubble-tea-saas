"""Serve only compiled synthetic fixtures and save synthetic browser evidence locally."""
import base64
import http.server
import json
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

root = Path(__file__).resolve().parents[3] / 'output/staff-chat-layout-20261020'
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(root / 'fixture'), **kwargs)
    def do_GET(self):
        if self.path == '/evidence':
            data = '<!doctype html><meta charset="utf-8"><form method="post"><label>文件名<input name="name"></label><label>截图数据<textarea name="data"></textarea></label><button>保存证据</button></form>'.encode()
            self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8'); self.end_headers(); self.wfile.write(data); return
        if not (root / 'fixture' / urlparse(self.path).path.lstrip('/')).is_file():
            self.path = '/index.html'
        super().do_GET()
    def do_POST(self):
        values = parse_qs(self.rfile.read(int(self.headers['Content-Length'])).decode())
        name = values['name'][0]
        if not name.replace('-', '').replace('_', '').replace('.', '').isalnum() or not name.endswith(('.jpg', '.json')):
            self.send_error(400); return
        data = values['data'][0]
        destination = root / name
        destination.write_bytes(base64.b64decode(data) if name.endswith('.jpg') else json.dumps(json.loads(data), ensure_ascii=False, indent=2).encode())
        self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8'); self.end_headers(); self.wfile.write(b'Saved')
httpd = http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 0), Handler)
print('SYNTHETIC_FIXTURE_URL=http://127.0.0.1:' + str(httpd.server_port), flush=True)
try: httpd.serve_forever()
except KeyboardInterrupt: pass
finally: httpd.server_close()
