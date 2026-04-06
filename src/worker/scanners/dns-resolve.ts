import type { IScanner, ScanResult, ScannerOptions } from "./interface.js";

interface DnsAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

const DNS_TYPE_MAP: Record<string, number> = {
  A: 1,
  AAAA: 28,
  CNAME: 5,
  MX: 15,
  TXT: 16,
  NS: 2,
  SOA: 6,
};

const DNS_TYPE_REVERSE: Record<number, string> = Object.fromEntries(
  Object.entries(DNS_TYPE_MAP).map(([k, v]) => [v, k]),
);

export class DnsResolveScanner implements IScanner {
  name = "dns-resolve";
  private resolver = "https://cloudflare-dns.com/dns-query";
  private recordTypes = ["A", "AAAA", "CNAME"];
  private timeout = 3000;
  private retries = 2;

  async init(options: ScannerOptions): Promise<void> {
    this.resolver = (options.resolver as string) ?? this.resolver;
    this.recordTypes = (options.recordTypes as string[]) ?? this.recordTypes;
    this.timeout = options.timeout ?? this.timeout;
    this.retries = options.retries ?? this.retries;
  }

  async scan(target: string): Promise<ScanResult> {
    const domain = target.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const records: Array<{ type: string; value: string; ttl: number }> = [];

    for (const recordType of this.recordTypes) {
      const typeNum = DNS_TYPE_MAP[recordType];
      if (!typeNum) continue;

      for (let attempt = 0; attempt <= this.retries; attempt++) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), this.timeout);

          const url = `${this.resolver}?name=${encodeURIComponent(domain)}&type=${recordType}`;
          const res = await fetch(url, {
            headers: { Accept: "application/dns-json" },
            signal: controller.signal,
          });
          clearTimeout(timer);

          if (!res.ok) continue;

          const data = (await res.json()) as {
            Answer?: DnsAnswer[];
            Status: number;
          };

          if (data.Answer) {
            for (const answer of data.Answer) {
              records.push({
                type: DNS_TYPE_REVERSE[answer.type] ?? String(answer.type),
                value: answer.data,
                ttl: answer.TTL,
              });
            }
          }
          break;
        } catch {
          if (attempt === this.retries) break;
        }
      }
    }

    return {
      target,
      domain,
      records,
      resolved: records.length > 0,
      ips: records
        .filter((r) => r.type === "A" || r.type === "AAAA")
        .map((r) => r.value),
      cnames: records.filter((r) => r.type === "CNAME").map((r) => r.value),
    };
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
