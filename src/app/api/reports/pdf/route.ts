import { PdfError, htmlToPdf } from "@/lib/reports/pdf";
import { NO_STORE, json, load } from "../_shared";

export const dynamic = "force-dynamic";

const encode5987 = (s: string) =>
  encodeURIComponent(s).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** GET /api/reports/pdf?type=period&assessment=<uuid>&lang=ar|en  or  ?type=history&plant=<uuid>&months=<n>&lang=... */
export async function GET(request: Request) {
  const r = await load(request);
  if ("error" in r) return r.error;
  try {
    const pdf = await htmlToPdf(r.report.html);
    return new Response(pdf as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.byteLength),
        "Content-Disposition": `attachment; filename="${r.report.asciiFilename}"; filename*=UTF-8''${encode5987(r.report.filename)}`,
        "Cache-Control": NO_STORE,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof PdfError) return json(e.code === "unavailable" ? 503 : 502, e.code);
    return json(500, "failed");
  }
}
