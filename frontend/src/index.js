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

async function start() {
  // The demo swaps the server for the in-browser practice copy (loaded only when someone asks for it).
  if (prepareDemo()) {
    const mock = await import("./preview/mock");
    mock.install(api);
  }
  createRoot(document.getElementById("root")).render(
    <Router>
      <DemoBanner />
      <AuthProvider>
        <App />
      </AuthProvider>
    </Router>
  );
}
start();
