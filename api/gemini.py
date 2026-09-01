from http.server import BaseHTTPRequestHandler

from api_core import handle_gemini_request
from vercel_http import read_json, send_json


class handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802
        data = read_json(self)
        if not data and self.headers.get("Content-Length", "0") != "0":
            send_json(self, 400, {"ok": False, "error": "Invalid JSON body"})
            return
        status, payload = handle_gemini_request(data)
        send_json(self, status, payload)
        return
