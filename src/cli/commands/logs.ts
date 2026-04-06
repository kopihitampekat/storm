import { Command } from "commander";
import chalk from "chalk";
import { loadAccount } from "../../core/config.js";
import { createProvider } from "../../providers/index.js";

export function logsCommand(): Command {
  const cmd = new Command("logs");

  cmd
    .description("View worker logs")
    .argument("<name>", "Worker name")
    .option("-f, --follow", "Follow log output")
    .action(async (name, options) => {
      try {
        const account = loadAccount();
        const provider = createProvider(account);

        console.log(chalk.gray(`Fetching logs for '${name}'...\n`));

        for await (const line of provider.logs(name, options.follow)) {
          process.stdout.write(line);
        }
      } catch (err) {
        console.error(chalk.red(String(err)));
        process.exit(1);
      }
    });

  return cmd;
}
