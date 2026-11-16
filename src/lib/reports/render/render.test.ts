import { describe, expect, it } from "vitest";
import { loadDocMessages, type ReportLocale } from "../messages";
import { fixtureReport } from "./fixture";
import { renderReportHtml } from ".";

const render = (locale: ReportLocale, kind: "period" | "history" = "period", name = "سارة الجبوري") =>
  renderReportHtml(fixtureReport(kind), {
    locale,
    messages: loadDocMessages(locale),
    preparedBy: { name, jobTitle: "مهندسة" },
    issuedOn: "2026-11-11",
  });

/** The text of the document body, tags removed (what a reader sees). */
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const FORBIDDEN = [
  "RII", "معامل", "correlation", "priority", "importance",
  "وزارة التعليم", "جامعة بغداد", "كلية الهندسة", "Ministry", "University of Baghdad",
  "الحسين عبد الخالق عبد العزيز", "عباس محمد برهان", "Alhussien", "Abdalkhaliq", "Abbas Mohammed Burhan",
  "رسالة ماجستير", "Master", "تجريبي", "Demo", "Illustrative", "<script", "http://", "https://",
];

describe.each(["ar", "en"] as const)("renderReportHtml (%s)", (locale) => {
  const html = render(locale);
  const m = loadDocMessages(locale) as { sections: Record<string, string> };

  it("sets lang and dir", () => {
    expect(html).toContain(`<html lang="${locale}" dir="${locale === "ar" ? "rtl" : "ltr"}">`);
  });

  it("contains every section title, in order", () => {
    const keys = ["plant", "period", "results", "limits", "trends", "problems", "obstacles", "actions", "missing", "notes"];
    let at = 0;
    for (const k of keys) {
      const i = html.indexOf(`</span>${m.sections[k]}</h2>`, at);
      expect(i, `section ${k}`).toBeGreaterThan(at);
      at = i;
    }
  });

  it("has the signature block with the prepared-by name and an empty approval line", () => {
    const sign = html.slice(html.indexOf('<div class="sign">'));
    expect(sign).toContain("سارة الجبوري");
    expect(sign).toMatch(/11 (تشرين الثاني|November) 2026/);
    expect(sign).toMatch(/<span class="line"><\/span>/);
    expect(sign.indexOf("class=\"gap\"")).toBeGreaterThan(sign.indexOf(">" + (locale === "ar" ? "المصادقة" : "Approval")));
  });

  it("renders obstacles as axis, number and text, without codes", () => {
    const t = text(html);
    const axis = locale === "ar" ? "العوائق الإدارية" : "Administrative obstacles";
    const body = locale === "ar" ? "ضعف التنسيق بين الإدارات" : "Weak coordination between departments";
    expect(t).toContain(`${axis} — 3 — ${body}`);
    expect(html).not.toMatch(/\b[AO]-\d{2}\b/);
  });

  it("shows a rank only for an action that has one, and marks case-specific actions", () => {
    const html2 = html.slice(html.indexOf('<table class="act">'));
    const rows = html2.split("<tr>").slice(2).slice(0, 3);
    expect(rows[0]).toMatch(/<td class="n"><bdi[^>]*>2<\/bdi><\/td>/);
    expect(rows[1]).toMatch(/<td class="n">—<\/td>/);
    expect(rows[2]).toMatch(/<td class="n">—<\/td>/);
    expect(rows[2]).toContain("tag");
  });

  it("includes the chosen action text in the document language", () => {
    expect(text(html)).toContain(locale === "ar" ? "تنفيذ جولات تفتيش ميدانية دورية" : "Carry out periodic field inspection rounds");
  });

  it("escapes malicious user text", () => {
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/<\/style><b>/);
    expect(html).toContain("&lt;img src&#61;x onerror&#61;alert(1)&gt;");
  });

  it("is self-contained: one style block, inline SVG, no external references or scripts", () => {
    expect(html.match(/<style>/g)).toHaveLength(1);
    expect(html).toContain("<svg");
    expect(html).toContain("@font-face");
    expect(html).not.toMatch(/<link|<script|src="http|url\(http|<iframe|<img/i);
  });

  it("contains none of the removed items", () => {
    const visible = text(html);
    for (const bad of FORBIDDEN) expect(visible + html.replace(/data:font[^)]*/g, ""), bad).not.toContain(bad);
  });
});

describe("report content", () => {
  it("English document states the stage and the limit crossed in English", () => {
    const t = text(render("en"));
    expect(t).toContain("Treated");
    expect(t).toContain("Critical: Above 6");
    expect(t).toContain("Needs further study");
    expect(t).toContain("Implemented on 20 October 2026");
  });
  it("Arabic document uses the owner's stage wording", () => {
    expect(text(render("ar"))).toContain("تمت المعالجة");
  });
  it("history report summarises the latest period and lists the periods included", () => {
    const t = text(render("en", "history"));
    expect(t).toContain("Periods included");
    expect(t).toContain("Service quality history report");
    expect(t).toContain("Sections 2 to 4 summarise the latest period");
  });
  it("neutralises bidi overrides in a user name", () => {
    const html = render("ar", "period", "‮evil");
    expect(html).not.toContain("‮");
  });
});
