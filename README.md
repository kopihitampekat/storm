# Storm

Distributed serverless scanning framework for bug hunters and penetration testers.

Storm deploys scanning workers across serverless platforms (Cloudflare Workers, Vercel, Fly.io, Heroku, Firebase, Google App Engine) and distributes targets across them for parallel HTTP-based reconnaissance at scale — no VMs, no SSH, no infrastructure to manage.

Inspired by [ax](https://github.com/attacksurge/ax), reimagined for serverless.

## Why Serverless?

| | Traditional (ax) | Serverless (Storm) |
|---|---|---|
| **Infrastructure** | Spin up VMs, manage SSH keys | Zero-config deploy via CLI |
| **Cost** | Pay per hour, even idle | Pay per invocation |
| **Scale** | Limited by VM count | Scales to thousands of invocations |
| **Distribution** | Single region per VM | 300+ edge locations (Cloudflare) |
| **Setup time** | Build images, configure cloud | `storm fleet -i 10` and go |
| **Cleanup** | Manual teardown | `storm rm "storm-*"` or `--rm-when-done` |

**Trade-off**: Serverless can't run binary tools (nmap, nuclei, masscan) or open raw sockets. Storm focuses on HTTP-based scanning operations using the `fetch()` API available in all serverless runtimes.

## Installation

```bash
git clone https://github.com/youruser/storm.git
cd storm
npm install
```

To run directly during development:

```bash
npx tsx bin/storm.ts --help
```

To build and link globally:

```bash
npm run build
npm link
storm --help
```

## Quick Start

```bash
# 1. Configure a provider account
storm account setup

# 2. Deploy a fleet of workers
storm fleet -i 10

# 3. Create a target list
echo -e "example.com\nhackthebox.com\nbugcrowd.com" > targets.txt

# 4. Run a scan
storm scan targets.txt -m http-probe -o results.jsonl

# 5. View results
cat results.jsonl | jq .

# 6. Cleanup
storm rm "storm-*" -f
```

## Supported Providers

| Provider | Deploy Method | Regions | Best For |
|---|---|---|---|
| **Cloudflare Workers** | wrangler CLI + REST API | 300+ edge locations | Global distribution, free tier |
| **Vercel** | vercel CLI | Edge + regional | Quick deploys, generous free tier |
| **Fly.io** | flyctl CLI | 35+ regions | Low latency, persistent apps |
| **Heroku** | REST API | US + EU | Simple setup, team support |
| **Firebase Functions** | firebase CLI | 10+ regions | GCP integration |
| **Google App Engine** | gcloud CLI | 20+ regions | GCP ecosystem |

### Account Setup

```bash
# Interactive setup
storm account setup

# Or manually create ~/.storm/accounts/<name>.json
# See accounts/*.json.example for templates

# Switch between accounts
storm account my-cf-account
storm account my-vercel-account

# List accounts
storm account
```

**Cloudflare example** (`~/.storm/accounts/cf.json`):

```json
{
  "provider": "cloudflare",
  "account_id": "your-account-id",
  "api_token": "your-api-token",
  "worker_prefix": "storm"
}
```

## Commands

### Worker Lifecycle

```bash
# Deploy a single worker
storm init my-worker

# Deploy a fleet
storm fleet -i 10                    # 10 workers named storm-001..storm-010
storm fleet recon -i 5               # 5 workers named recon-001..recon-005
storm fleet recon -i 5 --region iad  # Specify region (provider-dependent)

# List deployed workers
storm ls                             # All workers
storm ls storm                       # Filter by prefix
storm ls --json                      # JSON output

# Remove workers
storm rm "storm-*"                   # Interactive confirmation
storm rm "storm-*" -f                # Force remove

# View logs
storm logs my-worker
storm logs my-worker -f              # Follow
```

### Scanning

```bash
# Basic scan
storm scan targets.txt -m http-probe -o results.jsonl

# Use specific fleet
storm scan targets.txt -m dns-resolve --fleet recon -o dns.jsonl

# Limit worker count
storm scan targets.txt -m tech-detect -i 3 -o tech.jsonl

# Deploy workers on-the-fly and remove after
storm scan targets.txt -m header-audit --spinup 10 --rm-when-done -o audit.jsonl

# Pass extra scanner options
storm scan targets.txt -m http-probe --extra-args '{"timeout": 10000, "method": "HEAD"}'

# Don't randomize targets
storm scan targets.txt -m http-probe --dont-shuffle -o results.jsonl

# Send full list to every worker (fan-out)
storm scan targets.txt -m dns-resolve --dont-split -o dns.jsonl
```

### Execution

```bash
# Health check a worker
storm exec my-worker /health

# Send custom request
storm exec my-worker /scan -X POST -d '{"scanId":"test","module":"http-probe","targets":["example.com"],"options":{},"outputFormat":"jsonl"}'
```

## Scan Modules

| Module | Scanner | Description |
|---|---|---|
| `http-probe` | http-probe | Probe HTTP endpoints — status codes, titles, headers, redirects, timing |
| `dns-resolve` | dns-resolve | Resolve subdomains via DNS-over-HTTPS (Cloudflare/Google resolvers) |
| `tech-detect` | tech-detect | Fingerprint web technologies, frameworks, CDNs, and servers |
| `dir-brute` | dir-brute | Brute-force common directories and files (admin, .git, .env, etc.) |
| `header-audit` | header-audit | Audit security headers, generate A-F grade and findings report |
| `port-probe` | port-probe | Probe common HTTP/HTTPS ports via fetch (80, 443, 8080, 8443, etc.) |

```bash
# List available modules
storm modules

# List as JSON
storm modules --json
```

### Module Format

Modules are JSON files in `modules/` or `~/.storm/modules/` (user modules override built-in):

```json
{
  "name": "http-probe",
  "description": "Probe HTTP endpoints for status codes, titles, and response details",
  "scanner": "http-probe",
  "options": {
    "timeout": 5000,
    "followRedirects": true,
    "maxRedirects": 5,
    "method": "GET",
    "userAgent": "Mozilla/5.0 (compatible; Storm/1.0)"
  },
  "output": {
    "format": "jsonl",
    "fields": ["target", "url", "statusCode", "title", "contentLength", "server", "duration"]
  },
  "concurrency": {
    "targetsPerWorker": 100,
    "maxConcurrentPerWorker": 10
  }
}
```

### Writing Custom Modules

1. Create a JSON file in `~/.storm/modules/my-module.json`
2. Set `scanner` to one of the built-in scanners: `http-probe`, `dns-resolve`, `tech-detect`, `dir-brute`, `header-audit`, `port-probe`
3. Override `options` to customize behavior

Example — aggressive HTTP probe with short timeout:

```json
{
  "name": "fast-probe",
  "description": "Fast HTTP probe with 2s timeout, HEAD only",
  "scanner": "http-probe",
  "options": {
    "timeout": 2000,
    "method": "HEAD",
    "followRedirects": false
  },
  "output": { "format": "txt" },
  "concurrency": {
    "targetsPerWorker": 200,
    "maxConcurrentPerWorker": 20
  }
}
```

## Architecture

```
                         ┌──────────────────────────────┐
                         │        storm CLI             │
                         │  scan, fleet, ls, rm, exec   │
                         └──────────┬───────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
              ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
              │  Worker 1  │  │  Worker 2  │  │  Worker N  │
              │ CF/Vercel/ │  │ CF/Vercel/ │  │ CF/Vercel/ │
              │ Fly/Heroku │  │ Fly/Heroku │  │ Fly/Heroku │
              └─────┬──────┘  └─────┬──────┘  └─────┬──────┘
                    │               │               │
              targets[0..99]  targets[100..199] targets[200..N]
                    │               │               │
                    ▼               ▼               ▼
               ┌─────────┐   ┌─────────┐    ┌─────────┐
               │ Scanner  │   │ Scanner  │    │ Scanner  │
               │ (fetch)  │   │ (fetch)  │    │ (fetch)  │
               └────┬─────┘   └────┬─────┘    └────┬─────┘
                    │               │               │
                    └───────────────┼───────────────┘
                                    │
                              ┌─────▼─────┐
                              │   Merger   │
                              │ txt/jsonl/ │
                              │  csv/json  │
                              └────────────┘
```

### Scan Flow

1. **Read** target file, shuffle (optional)
2. **Discover** healthy workers via health check, or **spin up** new ones
3. **Split** targets evenly across workers (same algorithm as ax)
4. **Invoke** each worker via HTTP POST with its target chunk
5. **Collect** results from all workers (parallel, with timeout)
6. **Merge** results by output format (txt, jsonl, csv, json)
7. **Cleanup** workers if `--rm-when-done`

### Project Structure

```
storm/
├── bin/storm.ts                     # CLI entry point
├── src/
│   ├── cli/
│   │   ├── index.ts                 # Commander program setup
│   │   └── commands/                # scan, init, fleet, ls, rm, exec, logs, account, modules
│   ├── core/
│   │   ├── types.ts                 # TypeScript interfaces
│   │   ├── config.ts                # ~/.storm/ config management
│   │   ├── orchestrator.ts          # Scan orchestration engine
│   │   ├── splitter.ts              # Target splitting & shuffling
│   │   ├── merger.ts                # Result aggregation
│   │   └── module-loader.ts         # Module JSON loader
│   ├── providers/
│   │   ├── index.ts                 # Provider registry
│   │   ├── interface.ts             # IProvider contract
│   │   ├── cloudflare.ts            # Cloudflare Workers
│   │   ├── vercel.ts                # Vercel Serverless Functions
│   │   ├── fly.ts                   # Fly.io
│   │   ├── heroku.ts                # Heroku
│   │   ├── firebase.ts              # Firebase Functions
│   │   └── gae.ts                   # Google App Engine
│   └── worker/
│       ├── handler.ts               # Universal scan request handler
│       ├── scanners/                # Scanner implementations
│       │   ├── interface.ts
│       │   ├── http-probe.ts
│       │   ├── dns-resolve.ts
│       │   ├── tech-detect.ts
│       │   ├── dir-brute.ts
│       │   ├── header-audit.ts
│       │   └── port-probe.ts
│       └── adapters/                # Platform-specific entry points
│           ├── cloudflare.ts        # CF Workers fetch handler
│           ├── vercel.ts            # Vercel GET/POST exports
│           └── fly.ts               # Bun/Node.js HTTP server
├── modules/                         # Built-in scan module definitions
├── accounts/                        # Example account configs
└── templates/                       # Platform config templates
```

## Configuration

Storm stores config in `~/.storm/`:

```
~/.storm/
├── storm.json              # Global config (active account, defaults)
├── accounts/               # Provider account credentials
│   ├── cf-personal.json
│   └── vercel-work.json
└── modules/                # User-defined modules (override built-in)
```

### Global Config (`~/.storm/storm.json`)

```json
{
  "active_account": "cf-personal",
  "provider": "cloudflare",
  "default_instances": 5,
  "default_region": "auto",
  "worker_prefix": "storm",
  "log_level": "info"
}
```

## Output Formats

| Format | Extension | Merge Strategy | Use Case |
|---|---|---|---|
| `jsonl` | `.jsonl` | Concatenate lines | Structured data, piping to jq |
| `txt` | `.txt` | Concatenate | Simple URL/domain lists |
| `csv` | `.csv` | Merge with shared header | Spreadsheet import |
| `json` | `.json` | Combine into array | API consumption |

## Comparison with ax

| Feature | ax | Storm |
|---|---|---|
| Language | Bash | TypeScript |
| Infrastructure | Cloud VMs | Serverless functions |
| Connection | SSH | HTTP |
| Binary tools | nmap, nuclei, ffuf, etc. | fetch()-based scanners |
| Port scanning | Full (masscan, nmap) | HTTP ports only |
| Cost model | Per-hour VM pricing | Per-invocation |
| Providers | DO, AWS, Azure, GCP, etc. | CF, Vercel, Fly, Heroku, etc. |
| Setup | Build Packer image (~15min) | `storm fleet -i 10` (~30s) |
| Module format | JSON (command-based) | JSON (scanner-based) |
| Distribution | Split file + SCP + SSH | Split targets + HTTP POST |

## Development

```bash
# Run in dev mode
npx tsx bin/storm.ts <command>

# Build worker for Cloudflare
npm run build:worker:cf

# Build CLI
npm run build

# Run tests
npm test
```

### Adding a New Scanner

1. Create `src/worker/scanners/my-scanner.ts` implementing `IScanner`
2. Register it in `src/worker/handler.ts` `SCANNER_REGISTRY`
3. Create `modules/my-scanner.json` with default options
4. Rebuild workers: `npm run build:worker:cf`

### Adding a New Provider

1. Create `src/providers/my-provider.ts` implementing `IProvider`
2. Add the provider type to `src/core/types.ts`
3. Register it in `src/providers/index.ts`
4. Create `accounts/my-provider.json.example`
5. Add setup flow in `src/cli/commands/account.ts`

## License

MIT
