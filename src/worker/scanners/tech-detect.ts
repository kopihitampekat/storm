import type { IScanner, ScanResult, ScannerOptions } from "./interface.js";

interface TechSignature {
  name: string;
  category: string;
  headers?: Record<string, string>;
  cookies?: string[];
  html?: string[];
  meta?: Record<string, string>;
  scripts?: string[];
  implies?: string[];
}

const TECH_SIGNATURES: TechSignature[] = [
  { name: "Nginx", category: "Web Server", headers: { server: "nginx" } },
  { name: "Apache", category: "Web Server", headers: { server: "apache" } },
  { name: "Cloudflare", category: "CDN", headers: { server: "cloudflare" } },
  { name: "Express", category: "Framework", headers: { "x-powered-by": "express" } },
  { name: "Next.js", category: "Framework", headers: { "x-powered-by": "next.js" }, html: ["__NEXT_DATA__", "_next/static"] },
  { name: "React", category: "JavaScript", html: ["__REACT_DEVTOOLS", "react-root", "data-reactroot"] },
  { name: "Vue.js", category: "JavaScript", html: ["__VUE__", "data-v-", "Vue.js"] },
  { name: "Angular", category: "JavaScript", html: ["ng-version", "ng-app", "angular.js"] },
  { name: "WordPress", category: "CMS", html: ["wp-content", "wp-includes", "wp-json"] },
  { name: "jQuery", category: "JavaScript", scripts: ["jquery.min.js", "jquery.js"] },
  { name: "Bootstrap", category: "CSS", html: ["bootstrap.min.css", "bootstrap.min.js"] },
  { name: "Tailwind CSS", category: "CSS", html: ["tailwindcss", "tw-"] },
  { name: "PHP", category: "Language", headers: { "x-powered-by": "php" } },
  { name: "ASP.NET", category: "Framework", headers: { "x-powered-by": "asp.net", "x-aspnet-version": "" } },
  { name: "Django", category: "Framework", headers: { "x-frame-options": "deny" }, cookies: ["csrftoken", "sessionid"] },
  { name: "Ruby on Rails", category: "Framework", headers: { "x-powered-by": "phusion passenger" }, cookies: ["_rails_session"] },
  { name: "Laravel", category: "Framework", cookies: ["laravel_session", "XSRF-TOKEN"] },
  { name: "Varnish", category: "Cache", headers: { via: "varnish", "x-varnish": "" } },
  { name: "AWS", category: "Cloud", headers: { server: "amazons3", "x-amz-request-id": "" } },
  { name: "Google Cloud", category: "Cloud", headers: { server: "gws", "x-goog-": "" } },
];

export class TechDetectScanner implements IScanner {
  name = "tech-detect";
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
        headers: { "User-Agent": this.userAgent },
        redirect: "follow",
        signal: controller.signal,
      });
      clearTimeout(timer);

      const body = await res.text();
      const headers = Object.fromEntries(res.headers.entries());
      const detected: Array<{ name: string; category: string; confidence: string }> = [];

      for (const sig of TECH_SIGNATURES) {
        let matched = false;

        // Check headers
        if (sig.headers) {
          for (const [key, val] of Object.entries(sig.headers)) {
            const headerVal = headers[key.toLowerCase()];
            if (headerVal && (val === "" || headerVal.toLowerCase().includes(val.toLowerCase()))) {
              matched = true;
              break;
            }
          }
        }

        // Check HTML patterns
        if (!matched && sig.html) {
          for (const pattern of sig.html) {
            if (body.includes(pattern)) {
              matched = true;
              break;
            }
          }
        }

        // Check scripts
        if (!matched && sig.scripts) {
          for (const script of sig.scripts) {
            if (body.includes(script)) {
              matched = true;
              break;
            }
          }
        }

        // Check cookies
        if (!matched && sig.cookies) {
          const setCookie = headers["set-cookie"] ?? "";
          for (const cookie of sig.cookies) {
            if (setCookie.toLowerCase().includes(cookie.toLowerCase())) {
              matched = true;
              break;
            }
          }
        }

        if (matched) {
          detected.push({
            name: sig.name,
            category: sig.category,
            confidence: "high",
          });
        }
      }

      return {
        target,
        url: res.url,
        statusCode: res.status,
        technologies: detected,
        techCount: detected.length,
        server: headers.server ?? "",
      };
    } catch (err) {
      return {
        target,
        url,
        statusCode: 0,
        technologies: [],
        techCount: 0,
        server: "",
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
