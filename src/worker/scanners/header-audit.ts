import type { IScanner, ScanResult, ScannerOptions } from "./interface.js";

interface HeaderCheck {
  header: string;
  description: string;
  severity: "high" | "medium" | "low" | "info";
  check: (value: string | null) => { pass: boolean; detail: string };
}

const SECURITY_CHECKS: HeaderCheck[] = [
  {
    header: "strict-transport-security",
    description: "HTTP Strict Transport Security",
    severity: "high",
    check: (v) =>
      v
        ? { pass: true, detail: v }
        : { pass: false, detail: "Missing HSTS header" },
  },
  {
    header: "content-security-policy",
    description: "Content Security Policy",
    severity: "high",
    check: (v) =>
      v
        ? { pass: true, detail: v.slice(0, 100) + (v.length > 100 ? "..." : "") }
        : { pass: false, detail: "Missing CSP header" },
  },
  {
    header: "x-content-type-options",
    description: "Content Type Options",
    severity: "medium",
    check: (v) =>
      v?.toLowerCase() === "nosniff"
        ? { pass: true, detail: v }
        : { pass: false, detail: v ?? "Missing X-Content-Type-Options" },
  },
  {
    header: "x-frame-options",
    description: "Clickjacking Protection",
    severity: "medium",
    check: (v) =>
      v
        ? { pass: true, detail: v }
        : { pass: false, detail: "Missing X-Frame-Options" },
  },
  {
    header: "x-xss-protection",
    description: "XSS Protection",
    severity: "low",
    check: (v) =>
      v
        ? { pass: true, detail: v }
        : { pass: false, detail: "Missing (deprecated but still checked)" },
  },
  {
    header: "referrer-policy",
    description: "Referrer Policy",
    severity: "low",
    check: (v) =>
      v
        ? { pass: true, detail: v }
        : { pass: false, detail: "Missing Referrer-Policy" },
  },
  {
    header: "permissions-policy",
    description: "Permissions Policy",
    severity: "medium",
    check: (v) =>
      v
        ? { pass: true, detail: v.slice(0, 100) + (v.length > 100 ? "..." : "") }
        : { pass: false, detail: "Missing Permissions-Policy" },
  },
  {
    header: "x-powered-by",
    description: "Technology Disclosure",
    severity: "info",
    check: (v) =>
      v
        ? { pass: false, detail: `Exposes: ${v}` }
        : { pass: true, detail: "Not disclosed" },
  },
  {
    header: "server",
    description: "Server Header Disclosure",
    severity: "info",
    check: (v) =>
      v
        ? { pass: false, detail: `Exposes: ${v}` }
        : { pass: true, detail: "Not disclosed" },
  },
];

export class HeaderAuditScanner implements IScanner {
  name = "header-audit";
  private timeout = 5000;
  private userAgent = "Mozilla/5.0 (compatible; Storm/1.0)";

  async init(options: ScannerOptions): Promise<void> {
    this.timeout = options.timeout ?? this.timeout;
    this.userAgent = options.userAgent ?? this.userAgent;
  }

  async scan(target: string): Promise<ScanResult> {
    const url = target.startsWith("http") ? target : `https://${target}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(url, {
        method: "HEAD",
        headers: { "User-Agent": this.userAgent },
        redirect: "follow",
        signal: controller.signal,
      });
      clearTimeout(timer);

      const headers = Object.fromEntries(res.headers.entries());
      const findings: Array<{
        header: string;
        description: string;
        severity: string;
        pass: boolean;
        detail: string;
      }> = [];

      let passed = 0;
      let failed = 0;

      for (const check of SECURITY_CHECKS) {
        const value = headers[check.header] ?? null;
        const result = check.check(value);
        findings.push({
          header: check.header,
          description: check.description,
          severity: check.severity,
          ...result,
        });
        if (result.pass) passed++;
        else failed++;
      }

      const score = Math.round((passed / SECURITY_CHECKS.length) * 100);
      const grade =
        score >= 90 ? "A" :
        score >= 80 ? "B" :
        score >= 60 ? "C" :
        score >= 40 ? "D" : "F";

      return {
        target,
        url: res.url,
        statusCode: res.status,
        findings,
        score,
        grade,
        passed,
        failed,
        total: SECURITY_CHECKS.length,
      };
    } catch (err) {
      return {
        target,
        url,
        statusCode: 0,
        findings: [],
        score: 0,
        grade: "F",
        passed: 0,
        failed: 0,
        total: SECURITY_CHECKS.length,
        error: String(err),
      };
    }
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
