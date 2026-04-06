import type { IScanner, ScanResult, ScannerOptions } from "./interface.js";

export class HttpProbeScanner implements IScanner {
  name = "http-probe";
  private timeout = 5000;
  private followRedirects = true;
  private maxRedirects = 5;
  private method = "GET";
  private userAgent = "Mozilla/5.0 (compatible; Storm/1.0)";
  private headers: Record<string, string> = {};

  async init(options: ScannerOptions): Promise<void> {
    this.timeout = options.timeout ?? this.timeout;
    this.followRedirects = options.followRedirects ?? this.followRedirects;
    this.maxRedirects = options.maxRedirects ?? this.maxRedirects;
    this.method = options.method ?? this.method;
    this.userAgent = options.userAgent ?? this.userAgent;
    this.headers = options.headers ?? this.headers;
  }

  async scan(target: string): Promise<ScanResult> {
    const url = target.startsWith("http") ? target : `https://${target}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    const start = Date.now();

    try {
      const res = await fetch(url, {
        method: this.method,
        headers: {
          "User-Agent": this.userAgent,
          ...this.headers,
        },
        redirect: this.followRedirects ? "follow" : "manual",
        signal: controller.signal,
      });

      const duration = Date.now() - start;
      const body = await res.text();

      const titleMatch = body.match(/<title[^>]*>([^<]*)<\/title>/i);
      const title = titleMatch?.[1]?.trim() ?? "";

      return {
        target,
        url: res.url,
        statusCode: res.status,
        title,
        contentLength: body.length,
        contentType: res.headers.get("content-type") ?? "",
        server: res.headers.get("server") ?? "",
        duration,
        redirected: res.redirected,
        finalUrl: res.url,
      };
    } catch (err) {
      return {
        target,
        url,
        statusCode: 0,
        title: "",
        contentLength: 0,
        contentType: "",
        server: "",
        duration: Date.now() - start,
        error: String(err),
        redirected: false,
        finalUrl: "",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async scanBatch(
    targets: string[],
    concurrency: number,
  ): Promise<ScanResult[]> {
    const results: ScanResult[] = [];
    const queue = [...targets];
    const running: Promise<void>[] = [];

    const runNext = async (): Promise<void> => {
      while (queue.length > 0) {
        const target = queue.shift()!;
        const result = await this.scan(target);
        results.push(result);
      }
    };

    for (let i = 0; i < Math.min(concurrency, targets.length); i++) {
      running.push(runNext());
    }

    await Promise.all(running);
    return results;
  }
}
