import React from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { cx } from "./ui";

// "My profile" is one place with two views: the account-level Pathwai profile (photo, bio, your startup) that follows you everywhere, and how
// you appear in the community you are in. They used to be two separate menu items; now they are two tabs at the top of the same page.
export default function ProfileTabs() {
  const { config } = useAuth();
  const name = config?.community_name;
  if (!name) return null;
  const tabs = [["/me", "Pathwai profile"], ["/profile", `In ${name}`]];
  return (
    <nav aria-label="Profile" className="mx-auto mb-4 flex w-full max-w-5xl" data-testid="profile-tabs">
      <div className="inline-flex max-w-full rounded-full bg-ink/[.06] p-1">
        {tabs.map(([to, label]) => (
          <NavLink key={to} to={to} end className={({ isActive }) => cx("truncate rounded-full px-4 py-1.5 text-sm transition", isActive ? "bg-surface font-semibold shadow-sm" : "text-muted hover:text-ink")}>{label}</NavLink>
        ))}
      </div>
    </nav>
  );
}
