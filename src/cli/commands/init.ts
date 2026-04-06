import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { loadAccount } from "../../core/config.js";
import { createProvider } from "../../providers/index.js";

export function initCommand(): Command {
  const cmd = new Command("init");

  cmd
    .description("Deploy a single worker")
    .argument("[name]", "Worker name", `storm-${Date.now().toString(36)}`)
    .option("--region <region>", "Deployment region")
    .option("--provider <name>", "Override provider")
    .action(async (name, options) => {
      const spinner = ora(`Deploying worker '${name}'...`).start();

      try {
        const account = loadAccount();
        const provider = createProvider(account);

        const worker = await provider.deploy({
          name,
          region: options.region,
        });

        spinner.succeed(`Worker deployed: ${chalk.cyan(worker.name)}`);
        console.log(chalk.gray(`  URL:      ${worker.url}`));
        console.log(chalk.gray(`  Provider: ${worker.provider}`));
        console.log(chalk.gray(`  Region:   ${worker.region ?? "auto"}`));
        console.log(chalk.gray(`  Status:   ${worker.status}`));
      } catch (err) {
        spinner.fail(String(err));
        process.exit(1);
      }
    });

  return cmd;
}
