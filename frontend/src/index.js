import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";

const Router = process.env.REACT_APP_PREVIEW === "true" ? HashRouter : BrowserRouter;
import "./index.css";
import App from "./App";
import { AuthProvider } from "./lib/auth";

createRoot(document.getElementById("root")).render(
  <Router>
    <AuthProvider>
      <App />
    </AuthProvider>
  </Router>
);
