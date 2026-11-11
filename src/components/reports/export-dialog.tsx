"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; queryFor: (lang: "ar" | "en") => string };

function fileNameOf(header: string | null): string {
  if (!header) return "report.pdf";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* fall through */
    }
  }
  return /filename="([^"]+)"/i.exec(header)?.[1] ?? "report.pdf";
}

export function ExportDialog({ open, onOpenChange, queryFor }: Props) {
  const t = useTranslations("reports.dialog");
  const uiLocale = useLocale();
  const [lang, setLang] = useState<"ar" | "en">(uiLocale === "en" ? "en" : "ar");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "done"; text: string } | null>(null);

  async function download() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/reports/pdf?${queryFor(lang)}`, { credentials: "same-origin" });
      if (!res.ok) {
        const key = res.status === 503 ? "unavailable" : res.status === 404 ? "notFound" : "failed";
        setMessage({ kind: "error", text: t(`errors.${key}`) });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileNameOf(res.headers.get("Content-Disposition"));
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMessage({ kind: "done", text: t("done") });
    } catch {
      setMessage({ kind: "error", text: t("errors.failed") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => (busy ? undefined : onOpenChange(o))}>
      <ResponsiveDialogContent closeLabel={t("close")} size="sm">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t("title")}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{t("description")}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogBody>
          <fieldset className="flex flex-col gap-2" disabled={busy}>
            <legend className="mb-2 text-[13px] font-medium text-muted-foreground">{t("language")}</legend>
            {(["ar", "en"] as const).map((l) => (
              <label key={l} className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-xl border border-border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent">
                <input type="radio" name="report-lang" value={l} checked={lang === l} onChange={() => setLang(l)} className="accent-primary" />
                <span lang={l}>{t(l)}</span>
              </label>
            ))}
          </fieldset>
          {message ? (
            <p role={message.kind === "error" ? "alert" : "status"} data-testid="export-message" className={message.kind === "error" ? "mt-3 text-sm text-critical" : "mt-3 text-sm text-ok"}>
              {message.text}
            </p>
          ) : null}
        </ResponsiveDialogBody>
        <ResponsiveDialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button type="button" disabled={busy} onClick={download} data-testid="export-download">
            {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            {busy ? t("busy") : t("download")}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
