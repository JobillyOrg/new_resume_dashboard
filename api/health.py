from http.server import BaseHTTPRequestHandler

from api_core import health_payload
from vercel_http import send_json


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        send_json(self, 200, health_payload())
        return
