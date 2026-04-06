import { writeFileSync } from "fs";
import type { ScanResult } from "./types.js";

export function mergeResults(
  results: ScanResult[][],
  format: "txt" | "jsonl" | "csv" | "json",
  fields?: string[],
): string {
  const flat = results.flat();

  switch (format) {
    case "txt":
      return mergeTxt(flat);
    case "jsonl":
      return mergeJsonl(flat);
    case "csv":
      return mergeCsv(flat, fields);
    case "json":
      return mergeJson(flat);
    default:
      return mergeJsonl(flat);
  }
}

function mergeTxt(results: ScanResult[]): string {
  return results
    .map((r) => {
      if (r.url) return r.url as string;
      if (r.domain) return r.domain as string;
      return r.target;
    })
    .join("\n");
}

function mergeJsonl(results: ScanResult[]): string {
  return results.map((r) => JSON.stringify(r)).join("\n");
}

function mergeCsv(results: ScanResult[], fields?: string[]): string {
  if (results.length === 0) return "";

  const cols = fields ?? Object.keys(results[0]);
  const header = cols.join(",");
  const rows = results.map((r) =>
    cols
      .map((col) => {
        const val = r[col];
        if (val === undefined || val === null) return "";
        const str = String(val);
        return str.includes(",") || str.includes('"')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      })
      .join(","),
  );

  return [header, ...rows].join("\n");
}

function mergeJson(results: ScanResult[]): string {
  return JSON.stringify(results, null, 2);
}

export function writeOutput(content: string, outputPath: string): void {
  writeFileSync(outputPath, content + "\n");
}
