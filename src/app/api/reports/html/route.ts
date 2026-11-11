import { NO_STORE, load } from "../_shared";

export const dynamic = "force-dynamic";

/** The report document for the preview iframe: exactly the HTML that becomes the PDF. */
export async function GET(request: Request) {
  const r = await load(request);
  if ("error" in r) return r.error;
  return new Response(r.report.html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": NO_STORE,
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; frame-ancestors 'self'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
