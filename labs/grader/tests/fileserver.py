"""A file server on 127.0.0.1 for the tests of `enginespace fetch` (ARCHITECTURE section 9.7). No test reaches the internet: every download comes from here.

A route says what the server does for one path: serve a body (with or without `Range`), redirect, answer a status, hang up part of the way through a body, or announce a
size that is not the body's. The server records every request it gets, with the names and values of its headers, so a test can say what was sent. The tests in test_fetch.py
use it as a context manager (`self.enterContext(FileServer())`), and a server stops with the test that started it.
"""

from __future__ import annotations

import http.server
import re
import threading
from dataclasses import dataclass, field


@dataclass
class Route:
    """What the server does for one path."""

    body: bytes = b""
    #: The status for a plain request. A request with a range that the route honours is answered 206.
    status: int = 200
    #: Whether `Range: bytes=<n>-` is honoured. A server that ignores it sends the whole body with a 200.
    ranges: bool = True
    #: Send a 302 to this location instead of the body.
    redirect: str | None = None
    #: Send this many bytes of the body that would be sent, then hang up.
    cut_after: int | None = None
    #: The Content-Length to announce instead of the true one; -1 announces none and ends the body by closing the connection.
    announce: int | None = None
    #: The Content-Range to send with a 206 instead of the true one.
    content_range: str | None = None


@dataclass
class Seen:
    """One request the server got."""

    path: str
    #: The header names as they came, in order.
    names: list[str] = field(default_factory=list[str])
    #: The headers by lower-case name.
    headers: dict[str, str] = field(default_factory=dict[str, str])


class _Server(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self) -> None:
        super().__init__(("127.0.0.1", 0), _Handler)
        self.routes: dict[str, Route] = {}
        self.seen: list[Seen] = []


class _Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server: _Server  # type: ignore[assignment]

    def log_message(self, format: str, *args: object) -> None:
        pass

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        self.server.seen.append(Seen(path, list(self.headers.keys()), {name.lower(): value for name, value in self.headers.items()}))
        route = self.server.routes.get(path)
        if route is None:
            self.send_error(404)
            return
        if route.redirect is not None:
            self.send_response(302)
            self.send_header("Location", route.redirect)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        body = route.body
        start = 0
        status = route.status
        wanted = re.fullmatch(r"bytes=([0-9]+)-", self.headers.get("Range", ""))
        if route.ranges and wanted is not None and status == 200:
            start = int(wanted[1])
            if start >= len(body):
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{len(body)}")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            status = 206
        part = body[start:]
        self.send_response(status)
        if status == 206:
            self.send_header("Content-Range", route.content_range or f"bytes {start}-{len(body) - 1}/{len(body)}")
        if route.announce == -1:
            self.send_header("Connection", "close")
            self.close_connection = True
        else:
            self.send_header("Content-Length", str(len(part) if route.announce is None else route.announce))
        self.end_headers()
        self.wfile.write(part if route.cut_after is None else part[: route.cut_after])
        self.wfile.flush()
        if route.cut_after is not None:
            self.close_connection = True


class FileServer:
    """A server on an unused port of 127.0.0.1, in a thread of its own."""

    def __init__(self) -> None:
        self._server = _Server()
        # A short poll interval: `shutdown` waits for one, and a suite of dozens of servers would otherwise wait half a second for each.
        self._thread = threading.Thread(target=lambda: self._server.serve_forever(poll_interval=0.01), name="fileserver", daemon=True)

    def __enter__(self) -> FileServer:
        self._thread.start()
        return self

    def __exit__(self, *exc: object) -> None:
        self._server.shutdown()
        self._server.server_close()
        self._thread.join(timeout=10)

    @property
    def base(self) -> str:
        return f"http://127.0.0.1:{self._server.server_address[1]}"

    def serve(self, path: str, body: bytes = b"", **route: object) -> str:
        """Serves `path` (with a leading slash) as the route says, and returns its URL."""
        self._server.routes[path] = Route(body=body, **route)  # type: ignore[arg-type]
        return self.base + path

    @property
    def seen(self) -> list[Seen]:
        return self._server.seen

    def requests_for(self, path: str) -> list[Seen]:
        return [request for request in self._server.seen if request.path == path]
