import { createTranslator } from "next-intl";
import type { Limits, Status } from "@/lib/evaluation";
import { limitCrossed, type ProblemStage } from "@/lib/problems/stage";
import {
  addMonthsToKey,
  changeView,
  describeLimits,
  formatDateTime,
  formatNumber,
  monthName,
  parseMonthKey,
  periodLabel,
  periodShortLabel,
} from "@/components/assessments/results/helpers";
import type { DocMessages, ReportLocale } from "../messages";
import type {
  ReportAction,
  ReportData,
  ReportIndicator,
  ReportObstacleLabel,
  ReportProblem,
  TrendPeriod,
} from "../types";
import { chartSvg } from "./chart";
import { esc, num, userBlock, userText } from "./html";
import { reportCss } from "./styles";

/**
 * PURE renderer: report data + messages of ONE language -> one complete, self-contained HTML
 * document (inline CSS, base64 fonts, inline SVG, no scripts, no external URLs). Every
 * interpolated value goes through `esc` / `userText` / `userBlock` / `num`. No React.
 *
 * Client note 15: this is a work report. There is no institution header, no researcher or
 * supervisor line, no demo wording, and no RII / correlation / priority / importance / codes
 * of obstacles or actions anywhere in the data it receives.
 */

export type RenderOptions = {
  locale: ReportLocale;
  /** the `doc` messages of that language (see loadDocMessages) */
  messages: DocMessages;
  preparedBy: { name: string; jobTitle: string };
  /** 'YYYY-MM-DD' */
  issuedOn: string;
};

type T = (key: string, values?: Record<string, string | number>) => string;

const STATUS_ORDER: Status[] = ["ok", "warning", "critical", "insufficient_data", "no_limits"];

/** Status mark: a distinct SHAPE per status (readable in black and white), always next to its text. */
function mark(status: Status): string {
  const s = 11;
  const open = `<svg width="${s}" height="${s}" viewBox="0 0 12 12" aria-hidden="true" focusable="false">`;
  switch (status) {
    case "ok":
      return `${open}<circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3.3 6.2l1.9 1.9 3.5-3.8" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`;
    case "warning":
      return `${open}<path d="M6 1.2L11.2 10.6H0.8Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6 4.6v2.6M6 8.6v.1" stroke="currentColor" stroke-width="1.4"/></svg>`;
    case "critical":
      return `${open}<rect x="1" y="1" width="10" height="10" fill="currentColor"/><path d="M3.6 3.6l4.8 4.8M8.4 3.6l-4.8 4.8" stroke="#fff" stroke-width="1.4"/></svg>`;
    case "insufficient_data":
      return `${open}<circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="2 1.6"/><path d="M4.6 4.6c0-1.6 2.8-1.6 2.8 0 0 1-1.4 1.1-1.4 2.2M6 8.9v.1" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>`;
    default:
      return `${open}<rect x="1" y="1" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="2 1.6"/><path d="M3.5 6h5" stroke="currentColor" stroke-width="1.4"/></svg>`;
  }
}

/** Triangle / square marker used inside the trend cells. */
function cellMark(status: Status | null): string {
  if (status === "warning") return `<span class="s-warning">${mark("warning").replace(/="11"/g, '="8"')}</span> `;
  if (status === "critical") return `<span class="s-critical">${mark("critical").replace(/="11"/g, '="8"')}</span> `;
  return "";
}

export function renderReportHtml(data: ReportData, opts: RenderOptions): string {
  const { locale } = opts;
  const rtl = locale === "ar";
  const t = createTranslator({
    locale,
    messages: { doc: opts.messages } as never,
    namespace: "doc" as never,
    onError: () => undefined,
  }) as unknown as T;

  /** Numbers inside translated sentences are marked, then isolated left-to-right after escaping. */
  const w = (x: string | number) => `\u27e6${x}\u27e7`;
  const html = (s: string) => esc(s).replace(/\u27e6(.*?)\u27e7/g, (_m, n: string) => `<bdi class="num" dir="ltr">${n}</bdi>`);

  const nameOf = (x: { nameAr: string; nameEn: string | null }) => (!rtl && x.nameEn ? x.nameEn : x.nameAr);
  const unitText = (unit: string) => (unit === "%" ? "%" : (opts.messages.units as Record<string, string>)?.[unit] ?? unit);
  const valueText = (v: number | null, unit: string): string => {
    if (v === null) return "—";
    return unit === "%" ? `${num(`${formatNumber(v)}%`)}` : `${num(formatNumber(v))} ${esc(unitText(unit))}`;
  };
  const status = (s: Status) => `<span class="st s-${s}">${mark(s)}<span>${esc(t(`status.${s}`))}</span></span>`;
  const indicatorLabel = (x: { code: string | null; nameAr: string; nameEn: string | null }) =>
    `${x.code ? `${num(x.code)} — ` : ""}${userText(nameOf(x))}`;
  const periodText = (start: string, months: number) => periodLabel(start, months, locale);

  const limitPhrase = (key: string, values: Record<string, string>) => {
    const map: Record<string, string> = {
      targetHigher: "higherT",
      targetLower: "lowerT",
      targetRange: "rangeT",
      below: "below",
      above: "above",
      outside: "outside",
    };
    return t(`limit.${map[key] ?? key}`, Object.fromEntries(Object.entries(values).map(([k, v]) => [k, w(v)])));
  };
  const limitLines = (limits: Limits | null, unit: string): string => {
    if (!limits) return `<span class="muted">${esc(t("limit.none"))}</span>`;
    const d = describeLimits(limits, unit);
    const line = (kind: "target" | "warning" | "critical") =>
      `<div>${html(t(`limit.${kind}`, { v: limitPhrase(d[kind].key, d[kind].values) }))}</div>`;
    return `<div class="lines">${line("target")}${line("warning")}${line("critical")}</div>`;
  };
  const changeText = (r: ReportIndicator): string => {
    const c = changeView({ value: r.value, previousValue: r.previousValue, change: r.change });
    if (!c) return esc(t("change.none"));
    if (c.judgement === "unchanged") return esc(t("change.unchanged"));
    return html(t(`change.${c.judgement}`, { delta: w(formatNumber(c.delta)) }));
  };

  const L = data.latest;
  const rows = data.groups.flatMap((g) => g.rows);
  const latestLabel = periodText(L.periodStart, L.months);
  const isHistory = data.kind === "history";
  const title = t(isHistory ? "titleHistory" : "titlePeriod");
  const issued = opts.issuedOn;
  const plantLabel = data.plant.name;

  // ---- header ---------------------------------------------------------------------------------
  const first = data.periods[0];
  const last = data.periods[data.periods.length - 1];
  const headerPeriod = isHistory
    ? `${esc(t("period.included", {
        count: data.periods.length,
        first: periodText(first.periodStart, first.months),
        last: periodText(last.periodStart, last.months),
      }))}`
    : esc(latestLabel);
  const header = `<header class="doc">
<div class="sys">${esc(t("systemName"))}</div>
<h1>${esc(title)}</h1>
<dl class="meta">
<div><dt>${esc(t("meta.plant"))}</dt><dd>${userText(plantLabel)}</dd></div>
<div><dt>${esc(t(isHistory ? "meta.periods" : "meta.period"))}</dt><dd>${headerPeriod}</dd></div>
<div><dt>${esc(t("meta.issuedOn"))}</dt><dd>${num(issued)}</dd></div>
</dl></header>`;

  const section = (n: number, key: string, body: string) =>
    `<section><h2><span class="sn">${num(n)}</span>${esc(t(`sections.${key}`))}</h2>${body}</section>`;
  const kv = (label: string, value: string) => `<tr><th scope="row">${esc(label)}</th><td>${value}</td></tr>`;

  // ---- 1 plant --------------------------------------------------------------------------------
  const p = data.plant;
  const gov = (opts.messages.governorates as Record<string, string>)?.[p.governorate] ?? p.governorate;
  const src = (opts.messages.sources as Record<string, string>)?.[p.waterSource] ?? p.waterSource;
  const cap = (n: number | null) => (n === null ? "—" : `${num(formatNumber(n))} ${esc(t("plant.unit"))}`);
  const s1 = section(
    1,
    "plant",
    `<table><tbody>
${kv(t("plant.name"), userText(p.name))}
${kv(t("plant.location"), `${esc(gov)}${p.location ? ` — ${userText(p.location)}` : ""}`)}
${kv(t("plant.source"), esc(src))}
${kv(t("plant.engineer"), p.engineer ? userText(p.engineer) : "—")}
${kv(t("plant.design"), cap(p.designCapacity))}
${kv(t("plant.actual"), cap(p.actualCapacity))}
</tbody></table>`,
  );

  // ---- 2 period -------------------------------------------------------------------------------
  const periodRows = [
    kv(t("period.type"), esc(t(`period.length.${L.months}`))),
    kv(t("meta.period"), esc(latestLabel)),
    kv(t("period.dates"), esc(t("period.dateRange", { from: "@@P1@@", to: "@@P2@@" })).replace("@@P1@@", num(L.startDate)).replace("@@P2@@", num(L.endDate))),
    kv(t("period.enteredBy"), userText(L.enteredBy)),
    kv(t("period.approvedAt"), L.approvedAt ? num(formatDateTime(L.approvedAt)) : "—"),
    kv(
      t("period.completeness"),
      html(t("period.completenessText", { withValue: w(L.completeness.withValue), total: w(L.completeness.total), percent: w(formatNumber(Math.round(L.completeness.percent))) })),
    ),
  ];
  if (isHistory) {
    periodRows.unshift(
      kv(
        t("meta.periods"),
        esc(t("period.included", { count: data.periods.length, first: periodText(first.periodStart, first.months), last: periodText(last.periodStart, last.months) })),
      ),
    );
  }
  const s2 = section(2, "period", `${isHistory ? `<p class="muted small">${esc(t("period.latestNote", { period: latestLabel }))}</p>` : ""}<table><tbody>${periodRows.join("")}</tbody></table>`);

  // ---- 3 results ------------------------------------------------------------------------------
  const resultTable = (g: (typeof data.groups)[number]) => `<h3>${userText(nameOf(g))}</h3>
<table class="res"><thead><tr><th>${esc(t("table.code"))}</th><th>${esc(t("table.indicator"))}</th><th>${esc(t("table.value"))}</th><th>${esc(t("table.limits"))}</th><th>${esc(t("table.status"))}</th><th>${esc(t("table.change"))}</th></tr></thead><tbody>
${g.rows
  .map(
    (r) =>
      `<tr><td>${r.code ? num(r.code) : "—"}</td><td>${userText(nameOf(r))}</td><td>${valueText(r.value, r.unit)}</td><td>${limitLines(r.limits, r.unit)}</td><td>${status(r.status)}</td><td>${changeText(r)}</td></tr>`,
  )
  .join("\n")}
</tbody></table>`;
  const countsTable = (c: Record<Status, number>) => {
    const total = STATUS_ORDER.reduce((a, s) => a + c[s], 0);
    return `<table class="counts"><caption class="small muted" style="text-align:start">${esc(t("counts"))}</caption><tbody>${STATUS_ORDER.map(
      (s) => `<tr><td>${status(s)}</td><td class="n">${num(c[s])}</td></tr>`,
    ).join("")}<tr><th scope="row">${esc(t("countsTotal"))}</th><td class="n">${num(total)}</td></tr></tbody></table>`;
  };
  const s3 = section(3, "results", `${data.groups.map(resultTable).join("\n")}`);

  // ---- 4 limits -------------------------------------------------------------------------------
  const deviations = rows.filter((r) => r.status === "warning" || r.status === "critical");
  const devTable = deviations.length
    ? `<table><thead><tr><th>${esc(t("table.indicator"))}</th><th>${esc(t("table.value"))}</th><th>${esc(t("table.status"))}</th><th>${esc(t("table.limitCrossed"))}</th><th>${esc(t("table.deviation"))}</th></tr></thead><tbody>${deviations
        .map((r) => {
          const c = limitCrossed(r.limits, r.status, r.value);
          let crossed = "—";
          let by = "—";
          if (c && r.value !== null) {
            const phrase = t(r.value < c.limit ? "limit.below" : "limit.above", { v: w(formatNumber(c.limit)) });
            crossed = html(t("limitsSection.crossedText", { limit: phrase, kind: t(c.status === "critical" ? "limitsSection.kindCritical" : "limitsSection.kindWarning") }));
            by = valueText(Math.round(Math.abs(r.value - c.limit) * 1000) / 1000, r.unit);
          }
          return `<tr><td>${indicatorLabel(r)}</td><td>${valueText(r.value, r.unit)}</td><td>${status(r.status)}</td><td>${crossed}</td><td>${by}</td></tr>`;
        })
        .join("")}</tbody></table>`
    : `<p>${esc(t("limitsSection.none"))}</p>`;
  const s4 = section(4, "limits", `<p class="muted small">${esc(t("limitsSection.intro"))}</p>${countsTable(L.counts)}${devTable}`);

  // ---- 5 trends -------------------------------------------------------------------------------
  const multiYear = new Set(data.periods.map((x) => parseMonthKey(x.periodStart).year)).size > 1;
  const shortLabel = (x: TrendPeriod) => {
    const s = periodShortLabel(x.periodStart, x.months, locale);
    return multiYear ? `${s} ${String(parseMonthKey(x.periodStart).year).slice(2)}` : s;
  };
  const trendHead = `<tr><th>${esc(t("table.indicator"))}</th>${data.periods.map((x) => `<th>${esc(shortLabel(x))}</th>`).join("")}</tr>`;
  const trendBody = data.trends
    .map(
      (r) =>
        `<tr><td>${indicatorLabel(r)}</td>${r.cells
          .map((c) =>
            c && c.value !== null
              ? `<td class="cell-${c.status}">${cellMark(c.status)}${num(formatNumber(c.value))}</td>`
              : `<td>${esc(t("trends.noValue"))}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");
  const shares = data.periods.map((x) => x.withinShare);
  const chart =
    data.periods.length > 1
      ? chartSvg({
          values: shares,
          labels: data.periods.map(shortLabel),
          rtl,
          title: t("trends.chartTitle"),
          desc: t("trends.chartDesc"),
          valueText: (v) => `${formatNumber(Math.round(v * 10) / 10)}%`,
        })
      : `<p class="muted">${esc(t("trends.singlePeriod"))}</p>`;
  const shareTable = `<table class="counts"><thead><tr><th>${esc(t("table.period"))}</th><th>${esc(t("table.within"))}</th><th>${esc(t("table.evaluated"))}</th><th>${esc(t("table.share"))}</th></tr></thead><tbody>${data.periods
    .map(
      (x) =>
        `<tr><td>${esc(periodText(x.periodStart, x.months))}</td><td class="n">${num(x.counts.ok)}</td><td class="n">${num(x.evaluated)}</td><td class="n">${x.withinShare === null ? "—" : num(`${formatNumber(Math.round(x.withinShare * 10) / 10)}%`)}</td></tr>`,
    )
    .join("")}</tbody></table>`;
  const s5 = section(
    5,
    "trends",
    `<div class="block"><p class="muted small">${esc(t("trends.intro", { length: t(`period.length.${data.months}`) }))}</p>
<table class="trend"><thead>${trendHead}</thead><tbody>${trendBody}</tbody></table></div>
<div class="block"><h3>${esc(t("trends.chartTitle"))}</h3>${chart}${shareTable}</div>`,
  );

  // ---- 6 problems -----------------------------------------------------------------------------
  const problemTitle = (pr: ReportProblem) =>
    `${indicatorLabel(pr.indicator)}${isHistory ? ` · ${esc(periodText(pr.periodStart, pr.months))}` : ""}`;
  const stageText = (s: ProblemStage) => esc(t(`stage.${s}`));
  const s6 = section(
    6,
    "problems",
    data.problems.length
      ? `<p class="muted small">${esc(t("problems.intro", { count: data.problems.length }))}</p>
<table><thead><tr><th>${esc(t("problems.indicator"))}</th><th>${esc(t("problems.value"))}</th><th>${esc(t("problems.detected"))}</th><th>${esc(t("problems.origin"))}</th><th>${esc(t("problems.stage"))}</th></tr></thead><tbody>${data.problems
          .map(
            (pr) =>
              `<tr><td>${problemTitle(pr)}</td><td>${pr.value === null ? esc(t("problems.noValue")) : valueText(pr.value, pr.indicator.unit)}</td><td>${num(pr.detectedOn)}</td><td>${esc(t(`problems.${pr.origin}`))}</td><td>${stageText(pr.stage)}</td></tr>`,
          )
          .join("")}</tbody></table>`
      : `<p>${esc(t("problems.none"))}</p>`,
  );

  // ---- 7 obstacles ----------------------------------------------------------------------------
  const obstacleText = (o: ReportObstacleLabel): string =>
    o.kind === "system"
      ? `<span>${userText(rtl ? o.axisNameAr : o.axisNameEn)}</span> — ${num(o.seqInAxis)} — <span>${userText(rtl ? o.textAr : o.textEn)}</span>`
      : `${userText(o.name)}<span class="tag">${esc(t("obstacles.unlisted"))}</span>`;
  const withObstacles = data.problems.filter((x) => x.obstacles.length);
  const s7 = section(
    7,
    "obstacles",
    withObstacles.length
      ? withObstacles
          .map(
            (pr) =>
              `<div class="block"><h3>${esc(t("obstacles.forProblem", { indicator: "@@P1@@" })).replace("@@P1@@", problemTitle(pr))}</h3><table class="obs"><thead><tr><th>${esc(t("obstacles.obstacle"))}</th><th>${esc(t("obstacles.classification"))}</th><th>${esc(t("obstacles.notes"))}</th></tr></thead><tbody>${pr.obstacles
                .map(
                  (o) =>
                    `<tr><td>${obstacleText(o)}</td><td>${esc(t(`obstacles.${o.classification}`))}</td><td>${o.note.trim() ? userBlock(o.note) : esc(t("obstacles.noNote"))}</td></tr>`,
                )
                .join("")}</tbody></table></div>`,
          )
          .join("")
      : `<p>${esc(t("obstacles.none"))}</p>`,
  );

  // ---- 8 actions ------------------------------------------------------------------------------
  const actionStatus = (a: ReportAction): string => {
    const parts: string[] = [];
    if (a.chosen) parts.push(esc(a.implementedOn ? t("actions.implemented", { date: "@@P1@@" }) : t("actions.chosen")).replace("@@P1@@", num(a.implementedOn ?? "")));
    if (a.needsStudy) parts.push(esc(t("actions.needsStudy")));
    return parts.map((x) => `<div>${x}</div>`).join("");
  };
  const withActions = data.problems.filter((x) => x.actions.length);
  const documentedOnly = data.problems.filter((x) => x.stage === "documented");
  const s8 = section(
    8,
    "actions",
    (withActions.length
      ? withActions
          .map(
            (pr) =>
              `<div class="block"><h3>${esc(t("obstacles.forProblem", { indicator: "@@P1@@" })).replace("@@P1@@", problemTitle(pr))}</h3><table class="act"><thead><tr><th class="n">${esc(t("actions.rank"))}</th><th>${esc(t("actions.action"))}</th><th>${esc(t("actions.obstacle"))}</th><th>${esc(t("actions.status"))}</th></tr></thead><tbody>${pr.actions
                .map((a) => {
                  const text =
                    a.kind === "system"
                      ? userText(rtl ? a.textAr : a.textEn)
                      : `${userText(a.name)}<span class="tag">${esc(t("actions.caseSpecific"))}</span>`;
                  const rank = a.kind === "system" && a.rank !== null ? num(a.rank) : "—";
                  return `<tr><td class="n">${rank}</td><td>${text}</td><td>${a.linkedObstacle ? obstacleText(a.linkedObstacle) : esc(t("actions.noObstacle"))}</td><td>${actionStatus(a)}</td></tr>`;
                })
                .join("")}</tbody></table></div>`,
          )
          .join("")
      : `<p>${esc(t("actions.none"))}</p>`) +
      (documentedOnly.length
        ? `<p>${esc(t("actions.docOnly", { list: "@@P1@@" })).replace("@@P1@@", documentedOnly.map(problemTitle).join(esc(t("actions.separator"))))}</p>`
        : ""),
  );

  // ---- 9 missing ------------------------------------------------------------------------------
  const missing = rows.filter((r) => r.status === "insufficient_data" || r.status === "no_limits");
  const s9 = section(
    9,
    "missing",
    missing.length
      ? `<p class="muted small">${esc(t("missing.intro", { period: latestLabel }))}</p><ul>${missing
          .map((r) => `<li>${indicatorLabel(r)}: ${esc(t(r.status === "no_limits" ? "missing.noLimits" : "missing.insufficient"))}</li>`)
          .join("")}</ul>`
      : `<p>${esc(t("missing.none"))}</p>`,
  );

  // ---- 10 notes -------------------------------------------------------------------------------
  const sep = t("notes.separator");
  const evaluated = L.counts.ok + L.counts.warning + L.counts.critical;
  const total = STATUS_ORDER.reduce((a, s) => a + L.counts[s], 0);
  const allObstacles = data.problems.flatMap((x) => x.obstacles);
  const allActions = data.problems.flatMap((x) => x.actions.filter((a) => a.chosen));
  const summary = [
    `<p>${html(t("notes.summary", { total: w(total), period: latestLabel, evaluated: w(evaluated), ok: w(L.counts.ok), warning: w(L.counts.warning), critical: w(L.counts.critical) }))}${
      deviations.length ? ` ${esc(t("notes.deviations", { list: "@@P1@@" })).replace("@@P1@@", deviations.map((r) => `${userText(nameOf(r))} (${esc(t(`status.${r.status}`))})`).join(esc(sep)))}` : ""
    }</p>`,
    data.problems.length
      ? `<p>${html(
          t(isHistory ? "notes.problemsAll" : "notes.problems", {
            count: w(data.problems.length),
            obstacles: w(allObstacles.length),
            confirmed: w(allObstacles.filter((o) => o.classification === "confirmed").length),
            actions: w(allActions.length),
            implemented: w(allActions.filter((a) => a.implementedOn).length),
          }),
        )}</p>`
      : "",
  ].join("");
  const notes = rows.filter((r) => r.note.trim());
  const described = data.problems.filter((x) => x.description.trim());
  const s10 = section(
    10,
    "notes",
    `${summary}${
      notes.length
        ? `<h3>${esc(t("notes.engineerNotes"))}</h3><ul>${notes.map((r) => `<li>${indicatorLabel(r)}: ${userBlock(r.note)}</li>`).join("")}</ul>`
        : ""
    }${
      described.length
        ? `<h3>${esc(t("notes.problemDescriptions"))}</h3><ul>${described.map((x) => `<li>${problemTitle(x)}: ${userBlock(x.description)}</li>`).join("")}</ul>`
        : ""
    }<p class="muted small">${esc(t("notes.disclaimer"))}</p>
<div class="sign">
<div class="box"><div class="label">${esc(t("signature.preparedBy"))}</div><div class="who">${userText(opts.preparedBy.name)}</div>${opts.preparedBy.jobTitle ? `<div>${userText(opts.preparedBy.jobTitle)}</div>` : ""}<div class="small muted">${esc(t("signature.date"))}: ${num(issued)}</div></div>
<div class="box"><div class="label">${esc(t("signature.approval"))}</div><div class="gap"></div><div class="small muted">${esc(t("signature.date"))}: <span class="line"></span></div></div>
</div>`,
  );
  void total;

  const runningTitle = `${title} — ${plantLabel} — ${isHistory ? `${periodText(first.periodStart, first.months)} – ${periodText(last.periodStart, last.months)}` : latestLabel}`;
  void addMonthsToKey;
  void monthName;
  return `<!doctype html>
<html lang="${rtl ? "ar" : "en"}" dir="${rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — ${esc(plantLabel)}</title>
<style>${reportCss({ runningTitle, pageWord: t("pageWord"), ofWord: t("ofWord") })}</style></head>
<body>${header}${s1}${s2}${s3}${s4}${s5}${s6}${s7}${s8}${s9}${s10}</body></html>`;
}
