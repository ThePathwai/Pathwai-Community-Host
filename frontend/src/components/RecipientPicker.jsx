import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Avatar, cx } from "./ui";

// Gmail-style "To" field: type a member's name, pick from the matches, repeat to address several
// people at once. Selected people show as removable chips; Backspace on an empty box drops the last
// one, same as Gmail. Used by ComposeModal (new message from the Messages tab) and could grow into
// ReachOutModal's single-recipient case later if that ever needs picking more than one person.
// `bare` drops the boxed/bordered look so it can sit flush inside a compose window's own "To" row
// (the row itself draws the separator line, the way an email client's To field has no border of its
// own) — the default keeps the self-contained input-box look for use outside a compose chrome.
export function RecipientPicker({ value = [], onChange, autoFocus, bare = false }) {
  const { user } = useAuth();
  const [all, setAll] = useState(null);
  const [q, setQ] = useState("");
  // Who to search: everyone, just regular members, or just admin/community-team accounts (role
  // "admin" -- the one persona running the community, whatever its title there: founder, pastor,
  // host, coach). Lets you narrow the "To" field the same way the inbox's own filter bar narrows
  // the thread list by who a conversation is with.
  const [who, setWho] = useState("all");
  const [focused, setFocused] = useState(false);
  const [hi, setHi] = useState(0);
  const inputRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => { api.get("/users").then((r) => setAll(r.data)).catch(() => setAll([])); }, []);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    const picked = new Set(value.map((v) => v.id));
    let pool = (all || []).filter((u) => u.id !== user.id && !picked.has(u.id));
    if (who === "admin") pool = pool.filter((u) => u.role === "admin");
    else if (who === "member") pool = pool.filter((u) => u.role !== "admin");
    const filtered = s ? pool.filter((u) => (u.name || "").toLowerCase().includes(s) || (u.title || "").toLowerCase().includes(s)) : pool;
    return filtered.slice(0, 8);
  }, [all, q, value, user.id, who]);

  useEffect(() => { setHi(0); }, [q, focused]);

  const add = (u) => { onChange([...value, u]); setQ(""); inputRef.current?.focus(); };
  const removeLast = () => { if (value.length) onChange(value.slice(0, -1)); };

  const onKeyDown = (e) => {
    if (e.key === "Backspace" && !q) { removeLast(); return; }
    if ((e.key === "Enter" || e.key === ",") && matches[hi]) { e.preventDefault(); add(matches[hi]); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    if (e.key === "Escape") { inputRef.current?.blur(); }
  };

  // Shown whenever the field is focused (not just when there are matches) so the Members/Admin
  // filter pills stay reachable even if the current filter+search combination has no results —
  // otherwise there'd be no way to see why, or switch back, without clearing the search first.
  const showDropdown = focused;

  return (
    <div className="relative" ref={boxRef}>
      <div className={cx("flex flex-wrap items-center gap-1.5", bare ? "min-h-[2rem] py-1" : "input min-h-[2.75rem] !py-1.5")} onClick={() => inputRef.current?.focus()}>
        {value.map((u) => (
          <span key={u.id} className="flex items-center gap-1.5 rounded-full bg-ink/[.07] py-0.5 pl-1 pr-2 text-xs font-medium" data-testid="recipient-chip">
            <Avatar src={u.avatar_url} name={u.name} size={18} />
            {u.name}
            <button type="button" className="text-muted hover:text-ink" aria-label={`Remove ${u.name}`}
              onClick={(e) => { e.stopPropagation(); onChange(value.filter((x) => x.id !== u.id)); }}>×</button>
          </span>
        ))}
        <input ref={inputRef} data-testid="recipient-input" className="min-w-[8rem] flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted"
          value={q} autoFocus={autoFocus} placeholder={value.length ? "" : "Type a member's name..."}
          onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 120)} />
      </div>
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-lg">
          <div className="flex gap-1 border-b border-line p-1 pb-1.5">
            {[["all", "Everyone"], ["member", "Members"], ["admin", "Admin & team"]].map(([v, l]) => (
              <button type="button" key={v} data-testid={`recipient-filter-${v}`}
                className={cx("rounded-full px-2.5 py-1 text-xs font-medium", who === v ? "bg-ink text-paper" : "text-muted hover:bg-ink/5")}
                onMouseDown={(e) => e.preventDefault()} onClick={() => setWho(v)}>{l}</button>
            ))}
          </div>
          {matches.length === 0 && <p className="px-2.5 py-3 text-center text-xs text-muted">No one matches here.</p>}
          {matches.map((u, i) => (
            <button type="button" key={u.id} data-testid="recipient-option"
              className={"flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm " + (i === hi ? "bg-ink/[.07]" : "hover:bg-ink/5")}
              onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setHi(i)} onClick={() => add(u)}>
              <Avatar src={u.avatar_url} name={u.name} size={26} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{u.name}</span>
                {u.title && <span className="block truncate text-xs text-muted">{u.title}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
