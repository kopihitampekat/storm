import type { IProvider, AccountConfig } from "../core/types.js";
import { CloudflareProvider } from "./cloudflare.js";
import { VercelProvider } from "./vercel.js";
import { FlyProvider } from "./fly.js";
import { HerokuProvider } from "./heroku.js";
import { FirebaseProvider } from "./firebase.js";
import { GaeProvider } from "./gae.js";

const PROVIDERS: Record<
  string,
  new (config: AccountConfig) => IProvider
> = {
  cloudflare: CloudflareProvider as unknown as new (config: AccountConfig) => IProvider,
  vercel: VercelProvider as unknown as new (config: AccountConfig) => IProvider,
  fly: FlyProvider as unknown as new (config: AccountConfig) => IProvider,
  heroku: HerokuProvider as unknown as new (config: AccountConfig) => IProvider,
  firebase: FirebaseProvider as unknown as new (config: AccountConfig) => IProvider,
  gae: GaeProvider as unknown as new (config: AccountConfig) => IProvider,
};

export function createProvider(config: AccountConfig): IProvider {
  const ProviderClass = PROVIDERS[config.provider];
  if (!ProviderClass) {
    throw new Error(
      `Unknown provider '${config.provider}'. Available: ${Object.keys(PROVIDERS).join(", ")}`,
    );
  }
  return new ProviderClass(config);
}

export function listProviders(): string[] {
  return Object.keys(PROVIDERS);
}
