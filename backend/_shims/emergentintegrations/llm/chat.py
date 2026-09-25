"""Minimal LlmChat / UserMessage shim.

If OPENAI_API_KEY (or EMERGENT_LLM_KEY pointing at an OpenAI-compatible base via
LLM_BASE_URL) is set, proxies to a chat-completions endpoint via httpx.
Otherwise returns a clear offline reply so the app still runs end to end.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

import httpx


@dataclass
class UserMessage:
    text: str


class LlmChat:
    def __init__(self, api_key: str, session_id: str, system_message: str = ""):
        self.api_key = api_key
        self.session_id = session_id
        self.system_message = system_message
        self.provider = "openai"
        self.model = "gpt-5.2"

    def with_model(self, provider: str, model: str) -> "LlmChat":
        self.provider, self.model = provider, model
        return self

    async def send_message(self, message: UserMessage) -> str:
        base = os.environ.get("LLM_BASE_URL")
        key = os.environ.get("OPENAI_API_KEY") or (self.api_key if base else None)
        if not key:
            return (
                "(Offline demo reply) The AI copilot isn't connected in this environment. "
                "Set OPENAI_API_KEY or install the emergentintegrations package to enable live answers."
            )
        url = (base or "https://api.openai.com/v1").rstrip("/") + "/chat/completions"
        payload = {
            "model": os.environ.get("LLM_MODEL", self.model),
            "messages": [
                {"role": "system", "content": self.system_message},
                {"role": "user", "content": message.text},
            ],
        }
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(url, json=payload, headers={"Authorization": f"Bearer {key}"})
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]
