import React, { useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Empty, PageHeader, Spinner, Tabs } from "../components/ui";
import { ProgramCard, when } from "../components/Learning";

export default function Learning() {
  const { config } = useAuth();
  const label = (config?.nav || []).find((n) => n.key === "learning")?.label || "Learning";
  const [all, setAll] = useState(null);
  const [mine, setMine] = useState(null);
  const [tab, setTab] = useState(null);
  useEffect(() => {
    api.get("/learning/programs").then((r) => setAll(r.data));
    api.get("/learning/mine").then((r) => setMine(r.data));
  }, []);
  useEffect(() => { if (all && mine && !tab) setTab(mine.programs.length ? "mine" : "all"); }, [all, mine, tab]);
  if (!all || !mine || !tab) return <Spinner />;
  const list = tab === "mine" ? mine.programs : all.programs;
  const s = mine.summary || {};
  return (
    <div data-testid="learning-page">
      <PageHeader title={label} subtitle={all.source === "disco" ? "Your programs from Disco, with your progress, kept up to date here." : "The programs members are taking, and where you are in them."} />
      {mine.programs.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted" data-testid="learning-summary">
          <span><b className="stat text-ink">{s.enrolled}</b> in progress</span>
          <span><b className="stat text-ink">{s.completed}</b> completed</span>
          {s.next_session_at && <span>Next live session <b className="text-ink">{when(s.next_session_at)}</b></span>}
        </div>)}
      <Tabs tabs={[{ value: "mine", label: "My programs" }, { value: "all", label: "All programs" }]} value={tab} onChange={setTab} />
      {list.length === 0 ? <Empty title={tab === "mine" ? "You're not in a program yet" : "No programs yet"} hint={tab === "mine" ? "Programs you join will show up here with your progress." : "Once your community's learning platform is connected, its programs appear here."} />
        : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{list.map((p) => <ProgramCard key={p.id} p={p} />)}</div>}
    </div>
  );
}
