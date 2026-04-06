import { Command } from "commander";
import chalk from "chalk";
import {
  loadConfig,
  loadAccount,
  saveAccount,
  listAccounts,
  setActiveAccount,
  ensureStormDirs,
} from "../../core/config.js";
import { createProvider, listProviders } from "../../providers/index.js";

export function accountCommand(): Command {
  const cmd = new Command("account");

  cmd.description("Manage provider accounts");

  // Switch account
  cmd
    .argument("[name]", "Account name to switch to")
    .action((name) => {
      if (!name) {
        // List accounts
        const config = loadConfig();
        const accounts = listAccounts();

        if (accounts.length === 0) {
          console.log(
            chalk.yellow(
              "No accounts configured. Run 'storm account setup' to add one.",
            ),
          );
          return;
        }

        console.log(chalk.cyan("\n  Accounts:\n"));
        for (const acc of accounts) {
          const active = acc === config.active_account ? chalk.green(" (active)") : "";
          console.log(`    ${acc}${active}`);
        }
        console.log();
        return;
      }

      try {
        setActiveAccount(name);
        console.log(chalk.green(`Switched to account '${name}'`));
      } catch (err) {
        console.error(chalk.red(String(err)));
        process.exit(1);
      }
    });

  // Setup subcommand
  const setup = new Command("setup");
  setup
    .description("Interactive account setup")
    .action(async () => {
      const readline = await import("readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const ask = (q: string): Promise<string> =>
        new Promise((resolve) => rl.question(q, resolve));

      try {
        ensureStormDirs();

        console.log(chalk.cyan("\n  Storm Account Setup\n"));
        console.log(
          chalk.gray(
            `  Available providers: ${listProviders().join(", ")}\n`,
          ),
        );

        const provider = await ask("  Provider: ");
        if (!listProviders().includes(provider)) {
          console.error(chalk.red(`  Unknown provider: ${provider}`));
          process.exit(1);
        }

        const name = await ask("  Account name: ");

        const config: Record<string, unknown> = { provider };

        switch (provider) {
          case "cloudflare": {
            config.account_id = await ask("  Account ID: ");
            config.api_token = await ask("  API Token: ");
            config.worker_prefix = (await ask("  Worker prefix [storm]: ")) || "storm";
            break;
          }
          case "vercel": {
            config.token = await ask("  Vercel Token: ");
            config.team_id = (await ask("  Team ID (optional): ")) || undefined;
            config.project_prefix = (await ask("  Project prefix [storm]: ")) || "storm";
            break;
          }
          case "fly": {
            config.api_token = await ask("  API Token: ");
            config.org = (await ask("  Organization (optional): ")) || undefined;
            config.region = (await ask("  Default region [iad]: ")) || "iad";
            break;
          }
          case "heroku": {
            config.api_key = await ask("  API Key: ");
            config.team = (await ask("  Team (optional): ")) || undefined;
            break;
          }
          case "firebase": {
            config.project_id = await ask("  Project ID: ");
            break;
          }
          case "gae": {
            config.project_id = await ask("  Project ID: ");
            config.region = (await ask("  Region [us-central]: ")) || "us-central";
            break;
          }
        }

        rl.close();

        // Validate credentials
        const providerInstance = createProvider(config as any);
        process.stdout.write(chalk.gray("  Validating credentials... "));
        const valid = await providerInstance.validateCredentials();

        if (valid) {
          console.log(chalk.green("OK"));
        } else {
          console.log(chalk.red("FAILED"));
          console.log(
            chalk.yellow(
              "  Warning: Could not validate credentials. Saving anyway.\n",
            ),
          );
        }

        saveAccount(name, config as any);
        setActiveAccount(name);

        console.log(
          chalk.green(`\n  Account '${name}' saved and set as active\n`),
        );
      } catch (err) {
        rl.close();
        console.error(chalk.red(String(err)));
        process.exit(1);
      }
    });

  cmd.addCommand(setup);
  return cmd;
}
