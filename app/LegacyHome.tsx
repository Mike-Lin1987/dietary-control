"use client";

import { useEffect, useState } from "react";

export default function LegacyHome() {
  const [markup, setMarkup] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    fetch("/legacy/index.html", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("無法載入 NutriLens 介面");
        return response.text();
      })
      .then((html) => {
        if (cancelled) return;
        const parsed = new DOMParser().parseFromString(html, "text/html");
        parsed.querySelectorAll("script").forEach((script) => script.remove());
        setMarkup(parsed.body.innerHTML);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "介面載入失敗");
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!markup) return;
    const script = document.createElement("script");
    script.type = "module";
    script.src = "/legacy/js/app.js";
    document.body.appendChild(script);
    return () => script.remove();
  }, [markup]);

  return (
    <main id="legacy-root">
      {error ? <p className="site-load-error">{error}</p> : null}
      {!error && !markup ? <p className="site-load-status">NutriLens 載入中…</p> : null}
      {markup ? <div dangerouslySetInnerHTML={{ __html: markup }} /> : null}
    </main>
  );
}
