"use client";

import { useEffect, useState } from "react";

type AccessState = "checking" | "required" | "authorized";

export default function LegacyHome() {
  const [accessState, setAccessState] = useState<AccessState>("checking");
  const [markup, setMarkup] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/access", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setAccessState(data?.authorized ? "authorized" : "required");
      })
      .catch(() => {
        if (!cancelled) setAccessState("required");
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (accessState !== "authorized") return;
    let cancelled = false;
    fetch("/legacy/index.html", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("無法載入 NouriLens 介面");
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
  }, [accessState]);

  useEffect(() => {
    if (!markup) return;
    const script = document.createElement("script");
    script.type = "module";
    script.src = "/legacy/js/app.js";
    document.body.appendChild(script);
    return () => script.remove();
  }, [markup]);

  async function activate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = String(form.get("accessCode") || "");
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.authorized) throw new Error(data?.error || "無法啟用此裝置");
      setAccessState("authorized");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "無法啟用此裝置");
    } finally {
      setSubmitting(false);
    }
  }

  if (accessState === "required") {
    return (
      <main id="access-gate" className="access-gate-shell">
        <section className="access-gate-panel" aria-labelledby="access-title">
          <div className="access-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="access-brand-mark" src="/nourilens-mark.webp" alt="" width="28" height="28" />
            <strong>NouriLens</strong>
          </div>
          <p className="access-eyebrow">啟用這個瀏覽器</p>
          <h1 id="access-title">輸入允許碼</h1>
          <p className="access-copy">啟用後，餐點、常吃清單與目標只保存在這個瀏覽器，不會同步到其他手機。</p>
          <form className="access-form" onSubmit={activate}>
            <label htmlFor="access-code">允許碼</label>
            <input id="access-code" name="accessCode" type="password" minLength={12} autoComplete="current-password" required />
            {error ? <p className="access-error" role="alert">{error}</p> : null}
            <button type="submit" disabled={submitting}>{submitting ? "驗證中…" : "啟用此裝置"}</button>
          </form>
          <div className="access-notice">
            <p>照片與補充文字會暫時傳給 AI 辨識，NouriLens 不會保存照片。</p>
            <p>不同瀏覽器、一般模式與無痕模式是不同資料空間；清除網站資料會移除紀錄。</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main id="legacy-root">
      {error ? <p className="site-load-error">{error}</p> : null}
      {!error && (accessState === "checking" || !markup) ? <p className="site-load-status">NouriLens 載入中…</p> : null}
      {markup ? <div dangerouslySetInnerHTML={{ __html: markup }} /> : null}
    </main>
  );
}
