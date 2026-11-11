import { cssString } from "./html";
import { fontFaceCss } from "./fonts";

/** All CSS of the report document: A4 print layout, logical properties only, no external resources. */
export function reportCss(opts: { runningTitle: string; pageWord: string; ofWord: string }): string {
  const running = cssString(opts.runningTitle);
  const pageWord = cssString(`${opts.pageWord} `);
  const ofWord = cssString(` ${opts.ofWord} `);
  return `${fontFaceCss()}
:root{--ink:#1a2230;--muted:#586273;--line:#c9d0da;--soft:#f3f5f8;--ok:#1f6b3f;--warn:#9a4a07;--crit:#a3201a;--neutral:#4d5666;--accent:#0b4f7c}
*{box-sizing:border-box}
@page{size:A4;margin:20mm 14mm 20mm 14mm;
  @top-center{content:${running};font:400 8pt "IBM Plex Sans Arabic",sans-serif;color:#586273;vertical-align:bottom;padding-bottom:3mm}
  @bottom-center{content:${pageWord} counter(page) ${ofWord} counter(pages);font:400 8pt "IBM Plex Sans Arabic",sans-serif;color:#586273;vertical-align:top;padding-top:3mm}}
@page :first{@top-center{content:none}}
@media screen{body{padding:14mm 12mm}}
html{font-family:"IBM Plex Sans Arabic",sans-serif;font-size:10pt;color:var(--ink);background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;line-height:1.55;font-variant-numeric:lining-nums tabular-nums;overflow-wrap:anywhere}
.num{unicode-bidi:isolate;direction:ltr;white-space:nowrap}
.user{unicode-bidi:plaintext}
h1,h2,h3{margin:0;font-weight:700;line-height:1.35;break-after:avoid;page-break-after:avoid}
header.doc{border-block-end:2px solid var(--ink);padding-block-end:10pt;margin-block-end:14pt}
header.doc .sys{color:var(--muted);font-size:9pt;margin-block-end:2pt}
header.doc h1{font-size:17pt}
dl.meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6pt 14pt;margin:10pt 0 0}
dl.meta div{min-width:0}
dl.meta dt{font-size:8pt;color:var(--muted)}
dl.meta dd{margin:0;font-weight:600}
section{margin-block:0 16pt}
section>h2{font-size:12.5pt;border-block-end:1px solid var(--line);padding-block-end:3pt;margin-block:14pt 8pt}
section>h2 .sn{display:inline-block;min-width:1.6em;color:var(--accent)}
h3{font-size:10.5pt;margin-block:10pt 4pt}
p{margin:0 0 6pt}
.muted{color:var(--muted)}
.small{font-size:8.5pt}
table{width:100%;border-collapse:collapse;margin-block:0 8pt;font-size:9pt}
thead{display:table-header-group}
th,td{border:1px solid var(--line);padding:3.5pt 5pt;text-align:start;vertical-align:top}
thead th{background:var(--soft);font-weight:600}
tbody th{background:var(--soft);font-weight:600;width:22%}
tr,.block{break-inside:avoid;page-break-inside:avoid}
td.n,th.n{text-align:end}
table.obs th:nth-child(1){width:52%}table.obs th:nth-child(2){width:14%}table.obs th:nth-child(3){width:34%}
table.act th:nth-child(1){width:9%}table.act th:nth-child(3){width:30%}table.act th:nth-child(4){width:21%}
table.res th:nth-child(1){width:8%}table.res th:nth-child(3){width:11%}table.res th:nth-child(4){width:27%}table.res th:nth-child(5){width:14%}table.res th:nth-child(6){width:13%}
table.trend{font-size:7.5pt}
table.trend th,table.trend td{padding:2.5pt 2.5pt;text-align:center}
table.trend th:first-child,table.trend td:first-child{text-align:start;width:26%}
.st{display:inline-flex;align-items:center;gap:4pt;white-space:nowrap}
.st svg,.mk svg{flex:none;vertical-align:middle}
.s-ok{color:var(--ok)}.s-warning{color:var(--warn)}.s-critical{color:var(--crit)}.s-insufficient_data,.s-no_limits{color:var(--neutral)}
.cell-warning{font-weight:600}.cell-critical{font-weight:700}
.tag{display:inline-block;border:1px solid var(--line);border-radius:3pt;padding:0 4pt;font-size:8pt;color:var(--muted);margin-inline-start:4pt}
.lines div{white-space:normal}
.counts{width:auto;min-width:50%}
svg.chart{display:block;margin-block:4pt 8pt;max-width:100%;height:auto;font-family:"IBM Plex Sans Arabic",sans-serif}
svg.chart .grid{stroke:#dfe3ea;stroke-width:.6}
svg.chart .axis{stroke:#586273;stroke-width:.9}
svg.chart .line{stroke:var(--accent);stroke-width:1.8;stroke-linejoin:round}
svg.chart .dot{fill:#fff;stroke:var(--accent);stroke-width:1.8}
svg.chart .tick{font-size:9px;fill:#586273}
svg.chart .val{font-size:9.5px;font-weight:600;fill:#1a2230}
ul{margin:0 0 6pt;padding-inline-start:16pt}
li{margin-block:0 2pt}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:26pt;margin-block-start:14pt;break-inside:avoid;page-break-inside:avoid}
.sign .box{border-block-start:1px solid var(--ink);padding-block-start:5pt;min-height:50pt}
.sign .label{font-size:8.5pt;color:var(--muted)}
.sign .who{font-weight:700;font-size:11pt}
.sign .line{display:inline-block;min-width:110pt;border-block-end:1px dotted var(--ink);height:1em;vertical-align:bottom}
.sign .gap{height:22pt}
`;
}
