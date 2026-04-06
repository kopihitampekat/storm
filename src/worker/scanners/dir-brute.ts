import type { IScanner, ScanResult, ScannerOptions } from "./interface.js";

const DEFAULT_PATHS = [
  "admin", "login", "dashboard", "api", "wp-admin", "wp-login.php",
  ".git", ".env", ".htaccess", "robots.txt", "sitemap.xml",
  "backup", "config", "uploads", "images", "assets", "static",
  "js", "css", "fonts", "media", "files", "docs", "documentation",
  "swagger", "graphql", "health", "status", "info", "debug",
  "test", "dev", "staging", "console", "panel", "manager",
  "phpmyadmin", "adminer", "wp-content", "wp-includes",
  ".well-known", "favicon.ico", "crossdomain.xml",
  "server-status", "server-info", ".DS_Store", "web.config",
  "xmlrpc.php", "feed", "rss", "atom", "api/v1", "api/v2",
  "graphiql", "playground", "__debug__", "metrics", "prometheus",
];

export class DirBruteScanner implements IScanner {
  name = "dir-brute";
  private timeout = 5000;
  private userAgent = "Mozilla/5.0 (compatible; Storm/1.0)";
  private paths: string[] = DEFAULT_PATHS;
  private statusCodes = [200, 201, 202, 204, 301, 302, 307, 308, 401, 403, 405];

  async init(options: ScannerOptions): Promise<void> {
    this.timeout = options.timeout ?? this.timeout;
    this.userAgent = options.userAgent ?? this.userAgent;
    if (options.statusCodes) {
      this.statusCodes = options.statusCodes;
    }
    if (options.wordlist && typeof options.wordlist === "string") {
      // If wordlist is provided as comma-separated paths or JSON array
      try {
        this.paths = JSON.parse(options.wordlist);
      } catch {
        this.paths = options.wordlist.split(",").map((p) => p.trim());
      }
    }
  }

  async scan(target: string): Promise<ScanResult> {
    const baseUrl = target.startsWith("http") ? target : `https://${target}`;
    const base = baseUrl.replace(/\/+$/, "");

    const found: Array<{
      path: string;
      statusCode: number;
      contentLength: number;
      redirect?: string;
    }> = [];

    const checkPath = async (path: string): Promise<void> => {
      const url = `${base}/${path}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);

      try {
        const res = await fetch(url, {
          method: "GET",
          headers: { "User-Agent": this.userAgent },
          redirect: "manual",
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (this.statusCodes.includes(res.status)) {
          const body = await res.text();
          found.push({
            path: `/${path}`,
            statusCode: res.status,
            contentLength: body.length,
            redirect: res.headers.get("location") ?? undefined,
          });
        }
      } catch {
        clearTimeout(timer);
      }
    };

    // Run all path checks with concurrency
    const concurrency = 10;
    const queue = [...this.paths];
    const running: Promise<void>[] = [];

    const runNext = async (): Promise<void> => {
      while (queue.length > 0) {
        const path = queue.shift()!;
        await checkPath(path);
      }
    };

    for (let i = 0; i < Math.min(concurrency, this.paths.length); i++) {
      running.push(runNext());
    }
    await Promise.all(running);

    return {
      target,
      url: base,
      found,
      totalChecked: this.paths.length,
      totalFound: found.length,
    };
  }

  async scanBatch(targets: string[], concurrency: number): Promise<ScanResult[]> {
    const results: ScanResult[] = [];
    const queue = [...targets];
    const running: Promise<void>[] = [];

    const runNext = async (): Promise<void> => {
      while (queue.length > 0) {
        const target = queue.shift()!;
        results.push(await this.scan(target));
      }
    };

    for (let i = 0; i < Math.min(concurrency, targets.length); i++) {
      running.push(runNext());
    }
    await Promise.all(running);
    return results;
  }
}
