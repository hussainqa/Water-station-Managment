/**
 * HTML -> PDF through Gotenberg 8 (Chromium). The HTML must be self-contained: the container
 * runs with JavaScript disabled and blocks every network request.
 */

export type PdfErrorCode = "unavailable" | "failed";

export class PdfError extends Error {
  constructor(
    public readonly code: PdfErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "PdfError";
  }
}

export function gotenbergUrl(): string {
  return (process.env.GOTENBERG_URL?.trim() || "http://localhost:54327").replace(/\/+$/, "");
}

export type HtmlToPdfOptions = { timeoutMs?: number; url?: string; fetchImpl?: typeof fetch };

/** Returns the PDF bytes. Throws PdfError("unavailable") when the service cannot be reached or times out. */
export async function htmlToPdf(html: string, opts: HtmlToPdfOptions = {}): Promise<Uint8Array> {
  const base = (opts.url ?? gotenbergUrl()).replace(/\/+$/, "");
  const form = new FormData();
  form.append("files", new Blob([html], { type: "text/html; charset=utf-8" }), "index.html");
  form.append("preferCssPageSize", "true");
  form.append("printBackground", "true");
  form.append("paperWidth", "8.27");
  form.append("paperHeight", "11.7");
  form.append("marginTop", "0");
  form.append("marginBottom", "0");
  form.append("marginLeft", "0");
  form.append("marginRight", "0");
  form.append("waitDelay", "0s");

  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(`${base}/forms/chromium/convert/html`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    });
  } catch (e) {
    throw new PdfError("unavailable", "The PDF service could not be reached.", { cause: e });
  }
  if (res.status >= 502 && res.status <= 504) throw new PdfError("unavailable", `PDF service answered ${res.status}.`);
  if (!res.ok) throw new PdfError("failed", `PDF conversion failed (${res.status}).`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length < 5 || String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") {
    throw new PdfError("failed", "The PDF service returned something that is not a PDF.");
  }
  return bytes;
}
