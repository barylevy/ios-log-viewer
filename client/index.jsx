import React from "react";
import ReactDOM from "react-dom/client";
import App from "./src/App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

// Register the no-op service worker so Chrome treats the site as installable.
// Installing it as an app is what registers the log file types with the OS, so
// "Open With > Cato Client Log Viewer" appears in Finder / Explorer.
if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
}
