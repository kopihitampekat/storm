import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { loadAccount } from "../../core/config.js";
import { createProvider } from "../../providers/index.js";

export function fleetCommand(): Command {
  const cmd = new Command("fleet");

  cmd
    .description("Deploy multiple workers")
    .argument("[prefix]", "Worker name prefix", "storm")
    .requiredOption("-i, --instances <count>", "Number of workers to deploy", parseInt)
    .option("--region <region>", "Deployment region")
    .action(async (prefix, options) => {
      const count = options.instances;
      const spinner = ora(`Deploying fleet of ${count} workers...`).start();

      try {
        const account = loadAccount();
        const provider = createProvider(account);

        const deployOpts = Array.from({ length: count }, (_, i) => ({
          name: `${prefix}-${String(i + 1).padStart(3, "0")}`,
          region: options.region,
        }));

        const workers = await provider.deployMany(deployOpts);

        spinner.succeed(
          `Fleet deployed: ${chalk.cyan(workers.length)} workers`,
        );
        console.log();

        for (const w of workers) {
          console.log(
            `  ${chalk.green("●")} ${chalk.white(w.name)} ${chalk.gray(w.url)}`,
          );
        }
        console.log();
      } catch (err) {
        spinner.fail(String(err));
        process.exit(1);
      }
    });

  return cmd;
}
