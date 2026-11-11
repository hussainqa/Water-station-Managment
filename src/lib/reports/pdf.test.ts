import { describe, expect, it } from "vitest";
import { PdfError, htmlToPdf } from "./pdf";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("htmlToPdf", () => {
  it("posts the HTML as index.html and returns the PDF bytes", async () => {
    let url = "";
    let form: FormData | null = null;
    const fetchImpl = (async (u: string, init: RequestInit) => {
      url = u;
      form = init.body as FormData;
      return new Response(bytes("%PDF-1.7 fake"), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await htmlToPdf("<p>x</p>", { url: "http://gotenberg.test:3000/", fetchImpl });
    expect(url).toBe("http://gotenberg.test:3000/forms/chromium/convert/html");
    expect((form as unknown as FormData).get("preferCssPageSize")).toBe("true");
    expect(((form as unknown as FormData).get("files") as File).name).toBe("index.html");
    expect(new TextDecoder().decode(out.slice(0, 4))).toBe("%PDF");
  });
  it("reports an unreachable service as 'unavailable'", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(htmlToPdf("x", { fetchImpl })).rejects.toMatchObject({ name: "PdfError", code: "unavailable" });
  });
  it("reports a real connection failure as 'unavailable' (nothing listens on the port)", async () => {
    await expect(htmlToPdf("x", { url: "http://127.0.0.1:9", timeoutMs: 3000 })).rejects.toBeInstanceOf(PdfError);
    await expect(htmlToPdf("x", { url: "http://127.0.0.1:9", timeoutMs: 3000 })).rejects.toMatchObject({ code: "unavailable" });
  });
  it("reports 503 as unavailable, other errors and non-PDF bodies as failed", async () => {
    const make = (status: number, body = "x") => (async () => new Response(bytes(body), { status })) as unknown as typeof fetch;
    await expect(htmlToPdf("x", { fetchImpl: make(503) })).rejects.toMatchObject({ code: "unavailable" });
    await expect(htmlToPdf("x", { fetchImpl: make(400) })).rejects.toMatchObject({ code: "failed" });
    await expect(htmlToPdf("x", { fetchImpl: make(200, "<html>") })).rejects.toMatchObject({ code: "failed" });
  });
});
