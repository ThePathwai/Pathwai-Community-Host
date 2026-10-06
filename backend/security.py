"""Cross-cutting security plumbing: response hardening headers and request correlation ids.

Pure ASGI (no BaseHTTPMiddleware) so it adds no per-request task overhead and never buffers bodies.

What it does on every HTTP response:
  * X-Request-ID  -- echoed from the caller when it looks sane, otherwise generated. The same id is
    stamped on every log line and every audit entry written during the request (see `request_id()`),
    so "what happened on this request" is answerable from the logs and the audit trail alike.
  * Security headers -- nosniff, clickjacking denial, referrer and permissions policy, and a CSP limited
    to the directives that cannot break the app (framing, <base>, plugins). HSTS only when the
    deployment is HTTPS (cookie_secure()).
  * Cache-Control: no-store on JSON API responses, so personal data is never kept by a shared cache.
"""
from __future__ import annotations

import contextvars
import logging
import re
import uuid

from starlette.datastructures import MutableHeaders

from auth import cookie_secure

_request_id: contextvars.ContextVar = contextvars.ContextVar("pathwai_request_id", default="-")
_SANE_ID = re.compile(r"^[A-Za-z0-9._-]{8,64}$")


def request_id() -> str:
    """The correlation id of the request being handled ('-' outside a request)."""
    return _request_id.get()


def install_log_request_id() -> None:
    """Make every log record carry `request_id` so a formatter can print it. Safe to call twice."""
    old = logging.getLogRecordFactory()
    if getattr(old, "_pathwai", False):
        return

    def factory(*a, **kw):
        rec = old(*a, **kw)
        rec.request_id = _request_id.get()
        return rec

    factory._pathwai = True  # type: ignore[attr-defined]
    logging.setLogRecordFactory(factory)


STATIC_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    # Deliberately narrow: no script-src/style-src/connect-src, which would have to enumerate Google/Apple
    # sign-in, Stripe and every community's brand fonts and images. These three can't break any of them.
    "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
}
HSTS = "max-age=31536000; includeSubDomains"


class SecurityMiddleware:
    def __init__(self, app):
        self.inner = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.inner(scope, receive, send)
            return
        incoming = ""
        for k, v in scope["headers"]:
            if k == b"x-request-id":
                incoming = v.decode("latin-1")
                break
        rid = incoming if _SANE_ID.match(incoming) else uuid.uuid4().hex
        token = _request_id.set(rid)
        is_api = scope.get("path", "").startswith("/api/")
        hsts = cookie_secure()

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                h = MutableHeaders(scope=message)
                h["X-Request-ID"] = rid
                for k, v in STATIC_HEADERS.items():
                    if k not in h:
                        h[k] = v
                if hsts and "Strict-Transport-Security" not in h:
                    h["Strict-Transport-Security"] = HSTS
                if is_api and "Cache-Control" not in h and (h.get("content-type") or "").startswith("application/json"):
                    h["Cache-Control"] = "no-store"
            await send(message)

        try:
            await self.inner(scope, receive, send_wrapper)
        finally:
            _request_id.reset(token)
