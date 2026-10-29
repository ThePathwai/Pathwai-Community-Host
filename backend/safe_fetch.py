"""Fetch a link an admin pasted (a published Google Sheet, a calendar feed) without letting it reach inside our network.

An admin can paste any address, so before connecting we resolve the host and refuse anything that points at a private,
loopback, link-local or otherwise internal address (the cloud metadata service, the database, other services on the
same network). We then connect to the address we checked, not the name, so the name cannot change its answer between
the check and the connection. Redirects are followed by hand and each hop is checked the same way. Only https is
fetched, the answer is capped in size and time, and a web page where a data file was expected is reported plainly."""
from __future__ import annotations

import asyncio
import ipaddress
import re
import socket
from typing import List, Tuple
from urllib.parse import parse_qs, urlparse, urlunparse

import httpx

MAX_BYTES = 5_000_000
MAX_REDIRECTS = 4
TIMEOUT = 12


class FetchError(Exception):
    """A problem that is safe and useful to show the admin as-is."""


def _public(ip: str) -> bool:
    a = ipaddress.ip_address(ip)
    return not (a.is_private or a.is_loopback or a.is_link_local or a.is_multicast or a.is_reserved or a.is_unspecified)


async def resolve_public(host: str) -> List[str]:
    """Every address for `host`; raises FetchError unless ALL of them are public."""
    try:
        ipaddress.ip_address(host)
        addrs = [host]
    except ValueError:
        try:
            infos = await asyncio.get_running_loop().getaddrinfo(host, 443, type=socket.SOCK_STREAM)
        except OSError:
            raise FetchError("I couldn't find that address. Check the link and try again.")
        addrs = list(dict.fromkeys(i[4][0] for i in infos))
    if not addrs or not all(_public(a) for a in addrs):
        raise FetchError("That link points somewhere I'm not allowed to read. Use a public link (anyone with the link can view).")
    return addrs


def friendly_url(raw: str) -> str:
    """Turn the link people actually copy into one that returns data, or explain why it can't be read."""
    u = (raw or "").strip()
    if not u:
        raise FetchError("Paste a link first.")
    if u.lower().startswith("webcal://"):
        u = "https://" + u[9:]
    if not re.match(r"^https?://", u, re.I):
        u = "https://" + u
    p = urlparse(u)
    host = (p.hostname or "").lower()
    if not host or " " in u:
        raise FetchError("That doesn't look like a link.")
    if host.endswith("airtable.com"):
        raise FetchError("Airtable doesn't let other apps read a shared view. In Airtable open the view, choose Download CSV, then upload that file here.")
    if host == "docs.google.com" and "/spreadsheets/d/" in p.path:
        m = re.search(r"/spreadsheets/d/(?:e/)?([A-Za-z0-9_-]+)", p.path)
        if m and "/d/e/" not in p.path and not p.path.endswith("/pub"):
            gid = (parse_qs(p.query).get("gid") or re.findall(r"gid=(\d+)", p.fragment or ""))
            gid = gid[0] if gid else "0"
            return f"https://docs.google.com/spreadsheets/d/{m.group(1)}/export?format=csv&gid={gid}"
        if "output=" not in p.query:  # a "published to the web" link needs to ask for CSV
            sep = "&" if p.query else "?"
            return u + f"{sep}output=csv"
    return u


BOT_UA = "PathwaiEventsBot/1.0 (+https://pathwai-production-17f6.up.railway.app; lists public events and links back to the organizer)"


async def _get_once(url: str, ua: str = "Pathwai-import/1.0", accept: str = "text/csv,text/calendar,text/plain,*/*;q=0.5") -> Tuple[httpx.Response, bytes]:
    p = urlparse(url)
    if p.scheme != "https":
        raise FetchError("Only secure (https) links can be read.")
    host = p.hostname or ""
    ip = (await resolve_public(host))[0]
    pinned = urlunparse(p._replace(netloc=(f"[{ip}]" if ":" in ip else ip) + (f":{p.port}" if p.port else "")))
    headers = {"Host": host if not p.port else f"{host}:{p.port}", "User-Agent": ua, "Accept": accept}
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=False) as client:
            async with client.stream("GET", pinned, headers=headers, extensions={"sni_hostname": host}) as r:
                if r.is_redirect:
                    return r, b""
                chunks, size = [], 0
                async for part in r.aiter_bytes():
                    size += len(part)
                    if size > MAX_BYTES:
                        raise FetchError("That file is too big to read (over 5 MB). Download it and upload the file in pieces instead.")
                    chunks.append(part)
                return r, b"".join(chunks)
    except FetchError:
        raise
    except httpx.HTTPError:
        raise FetchError("I couldn't reach that link. Check it opens for anyone and try again.")


async def fetch_text(raw_url: str) -> str:
    """Download a public link and return its text. Raises FetchError with a message fit to show."""
    url = friendly_url(raw_url)
    for _ in range(MAX_REDIRECTS + 1):
        r, body = await _get_once(url)
        if r.is_redirect:
            loc = r.headers.get("location")
            if not loc:
                raise FetchError("That link redirected somewhere I couldn't follow.")
            nxt = httpx.URL(url).join(loc)
            url = str(nxt)
            continue
        if r.status_code in (401, 403):
            raise FetchError("That link isn't public. Share it so anyone with the link can view, then try again.")
        if r.status_code == 404:
            raise FetchError("That link doesn't exist any more. Check it and try again.")
        if r.status_code >= 400:
            raise FetchError(f"That link answered with an error (HTTP {r.status_code}).")
        text = body.decode(r.encoding or "utf-8", errors="replace").lstrip("﻿")
        head = text[:400].lstrip().lower()
        if head.startswith("<!doctype html") or head.startswith("<html") or "<head" in head[:200]:
            raise FetchError("That link opened a web page, not a data file. For Google Sheets use File > Share > anyone with the link can view (or File > Share > Publish to web > CSV).")
        return text
    raise FetchError("That link redirected too many times.")


async def fetch_page(raw_url: str, *, ua: str = BOT_UA) -> str:
    """Download a public web page (HTML allowed) with the same protections as fetch_text. Used by the events reader, which says who it is."""
    url = friendly_url(raw_url)
    for _ in range(MAX_REDIRECTS + 1):
        r, body = await _get_once(url, ua=ua, accept="text/html,application/xhtml+xml,text/calendar,text/plain;q=0.8,*/*;q=0.5")
        if r.is_redirect:
            loc = r.headers.get("location")
            if not loc:
                raise FetchError("That link redirected somewhere I couldn't follow.")
            url = str(httpx.URL(url).join(loc))
            continue
        if r.status_code == 429:
            raise FetchError("The site asked us to slow down (HTTP 429). We will try again at the next run.")
        if r.status_code in (401, 403):
            raise FetchError(f"The site refused the request (HTTP {r.status_code}).")
        if r.status_code == 404:
            raise FetchError("That page does not exist (HTTP 404). The address may have changed.")
        if r.status_code >= 400:
            raise FetchError(f"The site answered with an error (HTTP {r.status_code}).")
        return body.decode(r.encoding or "utf-8", errors="replace").lstrip("\ufeff")
    raise FetchError("That link redirected too many times.")
