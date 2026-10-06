import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, errMsg } from "../lib/api";
import { applyBrand } from "../lib/theme";
import { PoweredBy, Spinner } from "../components/ui";

// The external share link (GET /hub/communities/{slug}/public, no auth) -- what an admin's "Copy
// invite link" on their own community hands to anyone, on or off Pathwai. Deliberately its own
// full page rather than reusing the Discover card or CommunityDetailModal from Hub.jsx: those are
// gated behind an account and a logged-in theme, where the whole point here is to look and feel
// like this ONE community's own site to someone who has never heard of Pathwai, with a single
// obvious way in.
export default function CommunityLanding() {
  const { slug } = useParams();
  const nav = useNavigate();
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get(`/hub/communities/${slug}/public`)
      .then((r) => { setInfo(r.data); applyBrand({ community_name: r.data.name, brand: r.data.brand }); document.title = r.data.name || "Pathwai"; })
      .catch((e) => setErr(errMsg(e)));
  }, [slug]);

  if (!info && !err) return <Spinner />;
  if (!info) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold sm:text-3xl">Community not found</h1>
        <p className="mt-2 text-muted" data-testid="community-landing-error">{err}</p>
        <Link className="mt-4 inline-block underline" to="/login">Go to Pathwai</Link>
      </div>
    );
  }

  const col = info.brand?.colors || {};
  const btn = info.brand?.button_shape === "pill" ? "9999px" : info.brand?.button_shape === "square" ? "2px" : "0.5rem";

  return (
    <div className="min-h-screen" data-testid="community-landing" style={{ background: col.background, color: col.text, fontFamily: `"${info.brand?.font}", system-ui, sans-serif` }}>
      <div className="relative h-56 sm:h-72" style={{ background: col.surface || col.background }}>
        {info.cover && <img src={info.cover} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${col.background}, transparent 70%)` }} />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-2xl px-4 pb-5">
          {info.brand?.logo_url ? <img src={info.brand.logo_url} alt="" className="h-12 w-auto max-w-[11rem] object-contain" /> : <span className="text-2xl font-black">{info.name}</span>}
        </div>
      </div>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <span className="inline-block rounded-full px-3 py-1 text-[10px] font-bold uppercase" style={{ background: col.accent, color: col.on_accent || "#fff", letterSpacing: "0.12em" }}>{info.kind}</span>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{info.name}</h1>
        {info.tagline && <p className="mt-2 text-lg" style={{ color: col.muted }}>{info.tagline}</p>}
        {info.about && <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed sm:text-base" style={{ opacity: 0.85 }}>{info.about}</p>}
        <p className="mt-6 text-sm" style={{ color: col.muted }}>
          {info.members} member{info.members === 1 ? "" : "s"} · {info.upcoming_events} upcoming event{info.upcoming_events === 1 ? "" : "s"}
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {/* Every community requires admin approval now -- no community can auto-approve a join request. */}
          <button type="button" data-testid="community-landing-join" onClick={() => nav(`/signup?join=${slug}`)}
            className="px-6 py-3 text-sm font-semibold" style={{ background: col.accent, color: col.on_accent || "#fff", borderRadius: btn }}>
            Request to join
          </button>
          <Link to={`/login?join=${slug}`} data-testid="community-landing-signin" className="px-6 py-3 text-center text-sm font-semibold underline" style={{ color: col.text }}>
            Already on Pathwai? Sign in
          </Link>
        </div>
        <PoweredBy className="mt-16" />
      </div>
    </div>
  );
}
