import { Command } from "commander";
import chalk from "chalk";
import { loadAccount } from "../../core/config.js";
import { createProvider } from "../../providers/index.js";

export function execCommand(): Command {
  const cmd = new Command("exec");

  cmd
    .description("Send a request to a worker")
    .argument("<name>", "Worker name")
    .argument("[path]", "Request path", "/health")
    .option("-X, --method <method>", "HTTP method", "GET")
    .option("-d, --data <json>", "Request body (JSON)")
    .option("--timeout <ms>", "Request timeout in ms", parseInt)
    .action(async (name, path, options) => {
      try {
        const account = loadAccount();
        const provider = createProvider(account);
        const worker = await provider.info(name);

        let payload: unknown = null;
        if (options.data) {
          try {
            payload = JSON.parse(options.data);
          } catch {
            console.error(chalk.red("Invalid JSON data"));
            process.exit(1);
          }
        }

        const result = await provider.invoke(worker, payload, {
          method: options.method,
          timeout: options.timeout,
        });

        console.log(chalk.gray(`Status: ${result.statusCode}`));
        console.log(chalk.gray(`Duration: ${result.duration}ms`));
        console.log();

        if (typeof result.body === "object") {
          console.log(JSON.stringify(result.body, null, 2));
        } else {
          console.log(result.body);
        }
      } catch (err) {
        console.error(chalk.red(String(err)));
        process.exit(1);
      }
    });

  return cmd;
}
