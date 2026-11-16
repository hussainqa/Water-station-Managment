"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatDate, formatDateTime } from "@/components/assessments/results/helpers";
import { describeProblemAudit, type AuditResolvers } from "./audit";
import { sectionCard } from "./bits";
import { useProblem } from "./problem-context";

/** The change log of the problem, newest first, in sentences. */
export function AuditTrail() {
  const t = useTranslations("problems");
  const locale = useLocale();
  const { problem, pick, obstacleByCode, actionByCode } = useProblem();

  const resolvers = useMemo<AuditResolvers>(() => {
    const customObstacles = new Map(
      problem.obstacles.flatMap((o) => (o.kind === "custom" ? [[o.id, o.name] as const] : [])),
    );
    const customActions = new Map(problem.customActions.map((a) => [a.id, a.name] as const));
    return {
      obstacle: (code, customId) => {
        if (code) {
          const o = obstacleByCode.get(code);
          return o ? pick(o.textAr, o.textEn) : code;
        }
        return (customId && customObstacles.get(customId)) || t("audit.unlistedObstacle");
      },
      action: (code, customId) => {
        if (code) {
          const a = actionByCode.get(code);
          return a ? pick(a.textAr, a.textEn) : t("audit.unknownAction");
        }
        return (customId && customActions.get(customId)) || t("audit.unlistedAction");
      },
      customObstacle: (id) => (id && customObstacles.get(id)) || t("audit.unlistedObstacle"),
      customAction: (id) => (id && customActions.get(id)) || t("audit.unlistedAction"),
      classification: (c) => (c === "confirmed" || c === "possible" ? t(`obstacles.${c}`) : c),
      stage: (s) => (t.has(`stage.${s}`) ? t(`stage.${s}`) : s),
      date: (day) => formatDate(day, locale),
    };
  }, [problem.obstacles, problem.customActions, obstacleByCode, actionByCode, pick, t, locale]);

  return (
    <section className={sectionCard} aria-labelledby="audit-h" data-testid="audit">
      <h2 id="audit-h" className="m-0 text-[17px] font-bold">
        {t("audit.title")}
      </h2>
      {problem.audit.length ? (
        <ol className="m-0 mt-3 flex list-none flex-col p-0">
          {problem.audit.map((e) => {
            const d = describeProblemAudit(e, resolvers);
            return (
              <li
                key={e.id}
                data-testid="audit-entry"
                data-action={e.action}
                className="relative flex gap-3 border-s border-border pb-4 ps-4 last:pb-0"
              >
                <i aria-hidden="true" className="absolute -start-[5px] top-1.5 size-2.5 rounded-full bg-primary" />
                <div className="min-w-0">
                  <p className="m-0 text-[14px] font-medium">{t(`audit.${d.key}`, d.values)}</p>
                  <p className="m-0 mt-0.5 text-[12.5px] text-fg-3">
                    {e.actor} · <span className="whitespace-nowrap">{formatDateTime(e.at, locale)}</span>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="m-0 mt-3 text-[13px] text-fg-3">{t("audit.empty")}</p>
      )}
    </section>
  );
}
