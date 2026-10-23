import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";

const Router = process.env.REACT_APP_PREVIEW === "true" ? HashRouter : BrowserRouter;
import "./index.css";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import { api } from "./lib/api";
import { prepareDemo } from "./lib/demo";
import DemoBanner from "./components/DemoBanner";
import { refreshIfStale } from "./lib/build";

// iPhone Safari ignores user-scalable=no, so block its pinch gesture directly (touch screens only).
if (typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0)) {
  ["gesturestart", "gesturechange", "gestureend"].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
  document.addEventListener("touchmove", (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
}

async function start() {
  // The demo swaps the server for the in-browser practice copy (loaded only when someone asks for it).
  if (prepareDemo()) {
    const mock = await import("./preview/mock");
    mock.install(api);
  }
  createRoot(document.getElementById("root")).render(
    <Router>
      <AuthProvider>
        <DemoBanner />
        <App />
      </AuthProvider>
    </Router>
  );
}
start();
refreshIfStale();
