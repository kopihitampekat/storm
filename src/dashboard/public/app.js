function dashboard() {
  return {
    currentTab: 'overview',
    status: {},
    accounts: [],
    activeAccount: '',
    workers: [],
    modules: [],
    selectedWorkers: [],
    scanHistory: [],
    toasts: [],
    scanning: false,
    deploying: false,
    showDeployModal: false,
    lastScanResults: null,
    lastScanStats: null,

    scanForm: {
      targets: '',
      module: '',
      fleetPrefix: '',
      instances: null,
    },

    deployForm: {
      prefix: 'storm',
      count: 5,
      region: '',
    },

    async init() {
      await Promise.all([
        this.fetchStatus(),
        this.fetchWorkers(),
        this.fetchModules(),
      ]);

      // Auto-refresh workers every 30s
      setInterval(() => {
        if (this.currentTab === 'workers' || this.currentTab === 'overview') {
          this.fetchWorkers();
        }
      }, 30000);
    },

    // ── API Helpers ──

    async api(path, opts = {}) {
      try {
        const res = await fetch('/api' + path, {
          headers: { 'Content-Type': 'application/json' },
          ...opts,
          body: opts.body ? JSON.stringify(opts.body) : undefined,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        return data;
      } catch (err) {
        this.toast(err.message, 'error');
        throw err;
      }
    },

    toast(message, type = 'info') {
      this.toasts.push({ message, type });
    },

    // ── Data Fetching ──

    async fetchStatus() {
      try {
        const data = await this.api('/status');
        this.status = data;
        this.accounts = data.accounts || [];
        this.activeAccount = data.config?.active_account || '';
      } catch { /* handled by api() */ }
    },

    async fetchWorkers() {
      try {
        const data = await this.api('/workers');
        this.workers = data.workers || [];
      } catch { /* handled by api() */ }
    },

    async fetchModules() {
      try {
        const data = await this.api('/modules');
        this.modules = data.modules || [];
        if (this.modules.length > 0 && !this.scanForm.module) {
          this.scanForm.module = this.modules[0].name;
        }
      } catch { /* handled by api() */ }
    },

    // ── Account Actions ──

    async switchAccount() {
      try {
        await this.api('/accounts/switch', {
          method: 'POST',
          body: { name: this.activeAccount },
        });
        this.toast(`Switched to ${this.activeAccount}`, 'success');
        await this.fetchStatus();
        await this.fetchWorkers();
      } catch { /* handled */ }
    },

    // ── Worker Actions ──

    async refreshWorkers() {
      await this.fetchWorkers();
      this.toast(`Found ${this.workers.length} workers`, 'info');
    },

    async deployFleet() {
      this.deploying = true;
      try {
        const data = await this.api('/workers/deploy', {
          method: 'POST',
          body: {
            prefix: this.deployForm.prefix || 'storm',
            count: this.deployForm.count,
            region: this.deployForm.region || undefined,
          },
        });
        this.toast(`Deployed ${data.workers.length} workers`, 'success');
        this.showDeployModal = false;
        await this.fetchWorkers();
      } catch { /* handled */ }
      this.deploying = false;
    },

    async removeWorker(name) {
      if (!confirm(`Remove worker '${name}'?`)) return;
      try {
        await this.api('/workers/remove', {
          method: 'POST',
          body: { names: [name] },
        });
        this.toast(`Removed ${name}`, 'success');
        this.workers = this.workers.filter(w => w.name !== name);
      } catch { /* handled */ }
    },

    async removeSelected() {
      if (!confirm(`Remove ${this.selectedWorkers.length} workers?`)) return;
      try {
        await this.api('/workers/remove', {
          method: 'POST',
          body: { names: this.selectedWorkers },
        });
        this.toast(`Removed ${this.selectedWorkers.length} workers`, 'success');
        this.selectedWorkers = [];
        await this.fetchWorkers();
      } catch { /* handled */ }
    },

    async checkHealth(name) {
      try {
        const data = await this.api('/workers/health', {
          method: 'POST',
          body: { name },
        });
        if (data.healthy) {
          this.toast(`${name}: healthy (${data.duration}ms)`, 'success');
        } else {
          this.toast(`${name}: unhealthy (HTTP ${data.statusCode})`, 'error');
        }
      } catch { /* handled */ }
    },

    toggleSelectAll(event) {
      if (event.target.checked) {
        this.selectedWorkers = this.workers.map(w => w.name);
      } else {
        this.selectedWorkers = [];
      }
    },

    // ── Scan Actions ──

    async runScan() {
      this.scanning = true;
      this.lastScanResults = null;
      this.lastScanStats = null;

      try {
        const targets = this.scanForm.targets
          .split('\n')
          .map(l => l.trim())
          .filter(l => l.length > 0);

        const data = await this.api('/scan', {
          method: 'POST',
          body: {
            targets,
            module: this.scanForm.module,
            fleetPrefix: this.scanForm.fleetPrefix || undefined,
            instances: this.scanForm.instances || undefined,
          },
        });

        this.lastScanStats = data.stats;
        this.lastScanResults = data.results || 'No results';

        this.scanHistory.unshift({
          module: this.scanForm.module,
          ...data.stats,
          results: data.results || 'No results',
          _expanded: false,
        });

        this.toast(`Scan complete: ${data.stats.totalResults} results`, 'success');
      } catch { /* handled */ }

      this.scanning = false;
    },

    async copyResults() {
      if (!this.lastScanResults) return;
      try {
        await navigator.clipboard.writeText(this.lastScanResults);
        this.toast('Copied to clipboard', 'success');
      } catch {
        this.toast('Failed to copy', 'error');
      }
    },
  };
}
