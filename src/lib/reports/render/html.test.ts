import { describe, expect, it } from "vitest";
import { cssString, esc, num, userBlock, userText } from "./html";

describe("esc", () => {
  it("escapes tags, quotes, ampersands and backticks", () => {
    expect(esc(`<script>alert("x")</script>`)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(esc(`a & b 'c' \`d\``)).toBe("a &amp; b &#39;c&#39; &#96;d&#96;");
    expect(esc("</style><img src=x onerror=alert(1)>")).not.toMatch(/[<>]/);
  });
  it("removes bidi override, embedding and isolate characters", () => {
    const dirty = `a‮b‪c⁦d⁩e‭f‫‬`;
    expect(esc(dirty)).toBe("abcdef");
  });
  it("drops control characters but keeps tab and newline, and handles null", () => {
    expect(esc("a\u0000b\u0007c\td\ne")).toBe("abc\td\ne");
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
    expect(esc(6.5)).toBe("6.5");
  });
  it("leaves Arabic text alone", () => {
    expect(esc("محطة الكرخ")).toBe("محطة الكرخ");
  });
});

describe("cssString / userText / userBlock / num", () => {
  it("quotes CSS strings safely", () => {
    const s = cssString(`a"b\\c</style>\nd`);
    expect(s.startsWith('"')).toBe(true);
    expect(s).not.toMatch(/<|>/);
    expect(s).toContain('\\"');
    expect(s).toContain("\\\\");
  });
  it("wraps user text in an isolating element and escapes it", () => {
    expect(userText("<b>x</b>")).toBe('<bdi dir="auto">&lt;b&gt;x&lt;/b&gt;</bdi>');
    expect(userText("   ")).toBe("");
    expect(userBlock("a\nb")).toContain("<br>");
    expect(userBlock("‮a")).not.toContain("‮");
  });
  it("marks numbers as left-to-right", () => {
    expect(num("2026-09-01")).toContain('dir="ltr"');
  });
});
