import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { Button, Card, Chip, Input, Modal, Spinner } from "./ui";

const copy = async (text) => {
  try { await navigator.clipboard.writeText(text); toast.success("Link copied"); }
  catch { toast.message("Press and hold the link, then Copy."); }
};

// Shows a one-time password-reset link an admin can text or DM to someone who's locked out.
export function ResetLinkModal({ info, onClose }) {
  return (
    <Modal open={!!info} onClose={onClose} title="Password reset link">
      {info && (
        <div className="space-y-4" data-testid="reset-link-modal">
          <p className="text-sm">Send this to <b>{info.name || info.email}</b>. When they open it they choose a new password and can sign in straight away.</p>
          <Input readOnly value={info.link} onFocus={(e) => e.target.select()} data-testid="reset-link-url" />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => copy(info.link)} data-testid="copy-reset-link">Copy link</Button>
            <Button variant="ghost" onClick={onClose}>Done</Button>
          </div>
          <p className="text-xs text-muted">Works once, and expires in {info.expires_in_days} days. Anyone who has the link can set the password, so only send it to {info.name || "them"} directly.</p>
        </div>)}
    </Modal>
  );
}

// Platform admins only: find anyone on Pathwai by name or email, send a reset link, or delete their account everywhere.
export function PlatformAccounts() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null);
  const [link, setLink] = useState(null);
  const [del, setDel] = useState(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(null);
  const load = useCallback(() => api.get("/hub/admin/accounts", { params: { q } }).then((r) => setRows(r.data)).catch((e) => toast.error(errMsg(e))), [q]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const reset = async (a) => {
    setBusy(a.email + "r");
    try { const { data } = await api.post("/hub/admin/accounts/reset-link", { email: a.email }); setLink({ ...data, email: a.email, name: a.name }); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  };
  const remove = async () => {
    setBusy(del.email + "d");
    try {
      await api.post("/hub/admin/accounts/delete", { email: del.email, confirm: typed });
      toast.success(`${del.name} was deleted`); setDel(null); setTyped(""); load();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  };

  return (
    <Card className="mb-8 space-y-4" data-testid="platform-accounts">
      <div>
        <p className="font-medium">Accounts</p>
        <p className="text-sm text-muted">Everyone on Pathwai. Use this when someone forgot their password or needs their account removed.</p>
      </div>
      <Input placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} data-testid="accounts-search" />
      {!rows ? <Spinner /> : rows.accounts.length === 0 ? <p className="text-sm text-muted">No one matches.</p> : (
        <ul className="divide-y divide-line">
          {rows.accounts.map((a) => (
            <li key={a.email} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3" data-testid="account-row">
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate text-sm font-medium">{a.name}{a.platform_admin && <Chip accent className="ml-2">Platform admin</Chip>}</p>
                <p className="truncate text-xs text-muted">{a.email} · {a.communities.length} communit{a.communities.length === 1 ? "y" : "ies"}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => reset(a)} loading={busy === a.email + "r"} data-testid="account-reset">Reset link</Button>
                {!a.platform_admin && <Button variant="ghost" onClick={() => { setDel(a); setTyped(""); }} data-testid="account-delete">Delete</Button>}
              </div>
            </li>))}
        </ul>)}
      {rows && rows.total > rows.accounts.length && <p className="text-xs text-muted">Showing {rows.accounts.length} of {rows.total}. Search to narrow it down.</p>}

      <ResetLinkModal info={link} onClose={() => setLink(null)} />
      <Modal open={!!del} onClose={() => setDel(null)} title="Delete this account?">
        {del && (
          <div className="space-y-4">
            <p className="text-sm">This permanently deletes <b>{del.name}</b> ({del.email}) and their profile and activity in {del.communities.length} communit{del.communities.length === 1 ? "y" : "ies"}. They can sign up again later with the same email. It can't be undone.</p>
            <Input placeholder="Type DELETE to confirm" value={typed} onChange={(e) => setTyped(e.target.value)} data-testid="account-delete-confirm" />
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDel(null)}>Cancel</Button>
              <Button onClick={remove} loading={busy === del.email + "d"} disabled={typed.trim().toUpperCase() !== "DELETE"} data-testid="account-delete-go">Delete account</Button>
            </div>
          </div>)}
      </Modal>
    </Card>
  );
}
