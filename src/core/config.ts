import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { StormConfig, AccountConfig } from "./types.js";

const STORM_DIR = join(homedir(), ".storm");
const CONFIG_FILE = join(STORM_DIR, "storm.json");
const ACCOUNTS_DIR = join(STORM_DIR, "accounts");
const MODULES_DIR = join(STORM_DIR, "modules");

const DEFAULT_CONFIG: StormConfig = {
  active_account: "",
  provider: "cloudflare",
  default_instances: 5,
  default_region: "auto",
  worker_prefix: "storm",
  log_level: "info",
};

export function getStormDir(): string {
  return STORM_DIR;
}

export function getAccountsDir(): string {
  return ACCOUNTS_DIR;
}

export function getModulesDir(): string {
  return MODULES_DIR;
}

export function ensureStormDirs(): void {
  for (const dir of [STORM_DIR, ACCOUNTS_DIR, MODULES_DIR]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

export function loadConfig(): StormConfig {
  ensureStormDirs();
  if (!existsSync(CONFIG_FILE)) {
    saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }
  const raw = readFileSync(CONFIG_FILE, "utf-8");
  return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
}

export function saveConfig(config: StormConfig): void {
  ensureStormDirs();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
}

export function loadAccount(name?: string): AccountConfig {
  const config = loadConfig();
  const accountName = name ?? config.active_account;
  if (!accountName) {
    throw new Error(
      "No active account. Run 'storm account-setup' to configure one.",
    );
  }
  const accountFile = join(ACCOUNTS_DIR, `${accountName}.json`);
  if (!existsSync(accountFile)) {
    throw new Error(`Account '${accountName}' not found at ${accountFile}`);
  }
  const raw = readFileSync(accountFile, "utf-8");
  return JSON.parse(raw);
}

export function saveAccount(name: string, account: AccountConfig): void {
  ensureStormDirs();
  const accountFile = join(ACCOUNTS_DIR, `${name}.json`);
  writeFileSync(accountFile, JSON.stringify(account, null, 2) + "\n");
}

export function listAccounts(): string[] {
  ensureStormDirs();
  if (!existsSync(ACCOUNTS_DIR)) return [];
  return readdirSync(ACCOUNTS_DIR)
    .filter((f: string) => f.endsWith(".json"))
    .map((f: string) => f.replace(".json", ""));
}

export function setActiveAccount(name: string): void {
  const config = loadConfig();
  const account = loadAccount(name);
  config.active_account = name;
  config.provider = account.provider;
  saveConfig(config);
}
