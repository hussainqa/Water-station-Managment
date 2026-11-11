"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "cn";

const PAGE_WIDTH = 794; // A4 at 96 dpi

/**
 * The report document in a sandboxed iframe (no scripts; the endpoint also sends a strict
 * CSP). It is laid out at A4 width and scaled down on narrow screens, so the preview is the
 * same document the PDF is made from.
 */
export function ReportPreview({ query, printKey, className }: { query: string; printKey: number; className?: string }) {
  const t = useTranslations("reports");
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(1100);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [loadedQuery, setLoadedQuery] = useState(query);
  if (loadedQuery !== query) {
    setLoadedQuery(query);
    setState("loading");
  }

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setScale(Math.min(1, el.clientWidth / PAGE_WIDTH));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (printKey > 0) frame.current?.contentWindow?.print();
  }, [printKey]);

  // The iframe is part of the server-rendered HTML, so it can finish loading before React
  // hydrates and attaches onLoad: look at the document once on mount and when the query changes.
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (doc?.readyState === "complete" && doc.querySelector("header.doc")) {
      setHeight(doc.documentElement.scrollHeight);
      setState("ready");
    }
  }, [query]);

  function onLoad() {
    const doc = frame.current?.contentDocument;
    if (!doc || !doc.body) {
      setState("failed");
      return;
    }
    // an error response is JSON, not the report
    if (!doc.querySelector("header.doc")) {
      setState("failed");
      return;
    }
    setHeight(doc.documentElement.scrollHeight);
    setState("ready");
  }

  return (
    <section aria-label={t("preview.title")} className={cn("rounded-2xl border border-border bg-muted/40 p-2 sm:p-4", className)}>
      <div ref={box} className="relative mx-auto w-full" style={{ maxWidth: PAGE_WIDTH, height: height * scale }}>
        {state === "loading" ? (
          <p role="status" className="absolute inset-x-0 top-6 text-center text-sm text-muted-foreground">
            {t("preview.loading")}
          </p>
        ) : null}
        {state === "failed" ? (
          <p role="alert" className="absolute inset-x-0 top-6 text-center text-sm text-critical">
            {t("preview.failed")}
          </p>
        ) : null}
        <iframe
          ref={frame}
          key={query}
          data-testid="report-preview"
          title={t("preview.title")}
          src={`/api/reports/html?${query}`}
          sandbox="allow-same-origin allow-modals"
          onLoad={onLoad}
          className={cn("absolute start-0 top-0 origin-top-left border-0 bg-white shadow-(--shadow-card) rtl:origin-top-right", state !== "ready" && "invisible")}
          style={{ width: PAGE_WIDTH, height, transform: `scale(${scale})` }}
        />
      </div>
    </section>
  );
}
