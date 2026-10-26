"""Platform-level transactional email: password resets, set-your-password links, welcome mail.

Community email blasts use the same SendGrid account but go through messaging.py (which adds the community's name,
reply-to and per-community accounting). This module is Pathwai's own mail, sent regardless of any community.

Set SENDGRID_API_KEY (plus optionally MAIL_FROM_EMAIL / MAIL_FROM_NAME) to send for real.
Without a key, the email is logged instead of sent, so the reset flow stays testable end to end.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger("pathwai.email")


async def send_email(to: str, subject: str, text: str, html: Optional[str] = None) -> None:
    api_key = os.environ.get("SENDGRID_API_KEY")
    if not api_key:
        logger.info("EMAIL not sent — no SENDGRID_API_KEY set. Logging instead.\nTo: %s\nSubject: %s\n\n%s", to, subject, text)
        return
    from_email = os.environ.get("MAIL_FROM_EMAIL", "no-reply@pathwai.app")
    from_name = os.environ.get("MAIL_FROM_NAME", "Pathwai")
    content = [{"type": "text/plain", "value": text}]
    if html:
        content.append({"type": "text/html", "value": html})
    payload = {
        "personalizations": [{"to": [{"email": to}]}],
        "from": {"email": from_email, "name": from_name},
        "subject": subject,
        "content": content,
    }
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post("https://api.sendgrid.com/v3/mail/send", headers={"Authorization": f"Bearer {api_key}"}, json=payload)
    if r.status_code >= 400:
        try:
            msg = r.json().get("errors", [{}])[0].get("message")
        except Exception:  # noqa: BLE001
            msg = r.text[:200]
        logger.error("SendGrid send to %s failed (%s): %s", to, r.status_code, msg)
        raise RuntimeError(msg or f"HTTP {r.status_code}")
