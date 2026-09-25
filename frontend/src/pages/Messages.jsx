import React from "react";
import { PageHeader } from "../components/ui";
import BlastComposer from "../components/BlastComposer";
import { useNavigate } from "react-router-dom";

export default function Messages() {
  const nav = useNavigate();
  return (
    <div>
      <PageHeader title="Messages" subtitle="Reach your members by text, email, or both." />
      <BlastComposer goIntegrations={() => { try { sessionStorage.setItem("pathwai.admintab", "integrations"); } catch {} nav("/admin"); }} />
    </div>
  );
}
