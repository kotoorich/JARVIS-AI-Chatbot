"""LLM provider layer.

A small, dependency-light abstraction so JARVIS can talk to different LLMs
without the rest of the app caring. The default `offline` provider uses the
local rule-based engine — that means the app works out of the box with no
API keys. Switching to a real model is a one env-var change.

Selection (env var `LLM_PROVIDER`):
  - "offline" (default) — local rule-based replies
  - "openai"            — OpenAI Chat Completions API
  - "anthropic"         — Anthropic Messages API
  - "ollama"            — Ollama local server (http://localhost:11434)

Streaming providers expose `stream(...)`; everything implements the
synchronous `generate(...)`.

Failure handling: when a remote provider raises, the caller (chat
endpoint) catches and falls back to the offline engine. We never let the
app break because an upstream is having a bad day.
"""
from __future__ import annotations
import os
import json
import asyncio
import logging
from typing import AsyncIterator, List, Optional

logger = logging.getLogger("jarvis.llm")


# --------------------------------------------------------------------------- #
# Base class
# --------------------------------------------------------------------------- #
class LLMProvider:
    name: str = "base"
    supports_streaming: bool = False

    # Whether this provider needs network/API access (used by tests/UI hints).
    is_remote: bool = False

    def generate(
        self,
        messages: List[dict],
        system_prompt: Optional[str] = None,
    ) -> str:
        raise NotImplementedError

    async def stream(
        self,
        messages: List[dict],
        system_prompt: Optional[str] = None,
    ) -> AsyncIterator[str]:
        """Yield text deltas. Default fallback for non-streaming providers
        just yields the full `generate(...)` output once. Override for real
        streaming."""
        full = self.generate(messages, system_prompt)
        yield full


# --------------------------------------------------------------------------- #
# Offline (default) — wraps the existing rule-based engine
# --------------------------------------------------------------------------- #
class OfflineProvider(LLMProvider):
    name = "offline"
    is_remote = False

    def generate(self, messages, system_prompt=None):
        # Last user message is what the rule-based engine needs
        last_user = next(
            (m["content"] for m in reversed(messages) if m.get("role") == "user"),
            "",
        )
        from ai_engine import generate_response
        return generate_response(last_user)


# --------------------------------------------------------------------------- #
# OpenAI
# --------------------------------------------------------------------------- #
class OpenAIProvider(LLMProvider):
    name = "openai"
    supports_streaming = True
    is_remote = True

    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY", "")
        self.model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        self.base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
        self.timeout = int(os.getenv("LLM_TIMEOUT_SECONDS", "60"))
        if not self.api_key:
            raise RuntimeError("OPENAI_API_KEY is not set")

    def _build_payload(self, messages, system_prompt, stream):
        # Prepend system message if provided; otherwise let the model use its default
        msgs = []
        if system_prompt:
            msgs.append({"role": "system", "content": system_prompt})
        msgs.extend(messages)
        payload = {
            "model": self.model,
            "messages": msgs,
            "temperature": float(os.getenv("LLM_TEMPERATURE", "0.7")),
        }
        if stream:
            payload["stream"] = True
        return payload

    def generate(self, messages, system_prompt=None):
        import httpx
        payload = self._build_payload(messages, system_prompt, stream=False)
        r = httpx.post(
            f"{self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json=payload, timeout=self.timeout,
        )
        r.raise_for_status()
        data = r.json()
        return data["choices"][0]["message"]["content"]

    async def stream(self, messages, system_prompt=None):
        import httpx
        payload = self._build_payload(messages, system_prompt, stream=True)
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async with client.stream(
                "POST", f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json=payload,
            ) as r:
                r.raise_for_status()
                async for line in r.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    chunk = line[5:].strip()
                    if chunk == "[DONE]":
                        return
                    try:
                        obj = json.loads(chunk)
                    except json.JSONDecodeError:
                        continue
                    delta = obj.get("choices", [{}])[0].get("delta", {})
                    text = delta.get("content")
                    if text:
                        yield text


# --------------------------------------------------------------------------- #
# Anthropic
# --------------------------------------------------------------------------- #
class AnthropicProvider(LLMProvider):
    name = "anthropic"
    supports_streaming = True
    is_remote = True

    def __init__(self):
        self.api_key = os.getenv("ANTHROPIC_API_KEY", "")
        self.model = os.getenv("ANTHROPIC_MODEL", "claude-3-5-haiku-20241022")
        self.base_url = os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com/v1")
        self.timeout = int(os.getenv("LLM_TIMEOUT_SECONDS", "60"))
        if not self.api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not set")

    def _build_payload(self, messages, system_prompt, stream):
        # Anthropic wants `system` as a top-level string, and messages without
        # any system role inside.
        payload = {
            "model": self.model,
            "max_tokens": int(os.getenv("LLM_MAX_TOKENS", "1024")),
            "messages": [m for m in messages if m.get("role") != "system"],
            "temperature": float(os.getenv("LLM_TEMPERATURE", "0.7")),
        }
        if system_prompt:
            payload["system"] = system_prompt
        if stream:
            payload["stream"] = True
        return payload

    def _headers(self):
        return {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }

    def generate(self, messages, system_prompt=None):
        import httpx
        r = httpx.post(
            f"{self.base_url}/messages",
            headers=self._headers(),
            json=self._build_payload(messages, system_prompt, stream=False),
            timeout=self.timeout,
        )
        r.raise_for_status()
        data = r.json()
        # Anthropic returns content as a list of blocks; concatenate text blocks
        return "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")

    async def stream(self, messages, system_prompt=None):
        import httpx
        payload = self._build_payload(messages, system_prompt, stream=True)
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async with client.stream(
                "POST", f"{self.base_url}/messages",
                headers=self._headers(), json=payload,
            ) as r:
                r.raise_for_status()
                # SSE events: lines like `event: content_block_delta` / `data: {...}`
                async for line in r.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    chunk = line[5:].strip()
                    try:
                        obj = json.loads(chunk)
                    except json.JSONDecodeError:
                        continue
                    if obj.get("type") == "content_block_delta":
                        delta = obj.get("delta", {})
                        text = delta.get("text")
                        if text:
                            yield text


# --------------------------------------------------------------------------- #
# Ollama (local)
# --------------------------------------------------------------------------- #
class OllamaProvider(LLMProvider):
    name = "ollama"
    supports_streaming = True
    is_remote = True  # Technically local, but still a network call

    def __init__(self):
        self.model = os.getenv("OLLAMA_MODEL", "llama3.2")
        self.base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self.timeout = int(os.getenv("LLM_TIMEOUT_SECONDS", "120"))

    def _build_payload(self, messages, system_prompt, stream):
        msgs = []
        if system_prompt:
            msgs.append({"role": "system", "content": system_prompt})
        msgs.extend(messages)
        return {
            "model": self.model,
            "messages": msgs,
            "stream": stream,
            "options": {"temperature": float(os.getenv("LLM_TEMPERATURE", "0.7"))},
        }

    def generate(self, messages, system_prompt=None):
        import httpx
        r = httpx.post(
            f"{self.base_url}/api/chat",
            json=self._build_payload(messages, system_prompt, stream=False),
            timeout=self.timeout,
        )
        r.raise_for_status()
        return r.json().get("message", {}).get("content", "")

    async def stream(self, messages, system_prompt=None):
        import httpx
        payload = self._build_payload(messages, system_prompt, stream=True)
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async with client.stream(
                "POST", f"{self.base_url}/api/chat", json=payload,
            ) as r:
                r.raise_for_status()
                async for line in r.aiter_lines():
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if obj.get("done"):
                        return
                    text = obj.get("message", {}).get("content")
                    if text:
                        yield text


# --------------------------------------------------------------------------- #
# Provider singleton + selection
# --------------------------------------------------------------------------- #
_PROVIDER_CLASSES = {
    "offline":  OfflineProvider,
    "openai":   OpenAIProvider,
    "anthropic": AnthropicProvider,
    "ollama":   OllamaProvider,
}

_current_provider: Optional[LLMProvider] = None


def get_provider() -> LLMProvider:
    """Return the configured provider. Falls back to OfflineProvider if
    the configured one can't be constructed (e.g. missing API key)."""
    global _current_provider
    if _current_provider is not None:
        return _current_provider

    name = os.getenv("LLM_PROVIDER", "offline").lower().strip()
    cls = _PROVIDER_CLASSES.get(name)
    if cls is None:
        logger.warning("Unknown LLM_PROVIDER=%r, falling back to offline", name)
        _current_provider = OfflineProvider()
        return _current_provider
    try:
        _current_provider = cls()
        logger.info("LLM provider initialised: %s", _current_provider.name)
    except Exception as exc:
        logger.warning(
            "Could not initialise provider %r (%s); falling back to offline",
            name, exc,
        )
        _current_provider = OfflineProvider()
    return _current_provider


def reset_provider() -> None:
    """Test helper: re-read env on next get_provider() call."""
    global _current_provider
    _current_provider = None
