// What the AI screens share: the host's information, this app's AI settings (default account, model, effort,
// instructions, MCP servers), and the accounts of the shared registry with their status. The settings screen
// changes it; the assistant panel reads it. Listeners are called after every change.
globalThis.EdukorsAiStore = (() => {
  const host = EdukorsAiHost;
  const listeners = new Set();
  const state = {
    info: null,            // host.info
    settings: null,        // settings.read: { instructions, mcp, defaultAccountId, model, effort }
    providers: [],         // [{ id, displayName, detection, capabilities }]
    accounts: [],          // registry accounts: { id, providerId, label, supported }
    statuses: {},          // accountId → { state, identity? } | { checking: true } | { error }
    usage: {},             // accountId → { windows, observedAt } (limit windows, from usage.read and from events)
    loaded: false,
    error: null
  };
  const notify = () => { for (const fn of listeners) { try { fn(state); } catch (error) { console.error(error); } } };

  async function loadProviders(refresh = false) {
    const [list, detections] = await Promise.all([host.call('providers.list'), host.call('providers.detect', { refresh })]);
    const byId = Object.fromEntries(detections.map(d => [d.providerId, d]));
    state.providers = await Promise.all(list.map(async provider => {
      const detection = byId[provider.id] || { status: 'error' };
      let capabilities = null;
      if (detection.status === 'ready') capabilities = await host.call('providers.capabilities', { providerId: provider.id }).catch(() => null);
      return { ...provider, detection, capabilities };
    }));
  }

  async function refreshStatus(accountId) {
    state.statuses[accountId] = { ...state.statuses[accountId], checking: true };
    notify();
    try {
      state.statuses[accountId] = await host.call('accounts.status', { accountId });
    } catch (error) {
      state.statuses[accountId] = { state: 'unknown', error };
    }
    notify();
  }

  async function loadAccounts() {
    state.accounts = await host.call('accounts.list');
    for (const id of Object.keys(state.statuses)) if (!state.accounts.some(a => a.id === id)) delete state.statuses[id];
    notify();
    await Promise.all(state.accounts.filter(a => a.supported !== false).map(a => refreshStatus(a.id)));
  }

  /** Everything, again: other EDUKORS apps may have changed the shared accounts meanwhile. */
  async function load({ refreshProviders = false } = {}) {
    try {
      await host.ready();
      state.info = await host.hostInfo();
      state.settings = await host.call('settings.read');
      await loadProviders(refreshProviders);
      state.loaded = true;
      state.error = null;
      notify();
      await loadAccounts();
    } catch (error) {
      state.error = error;
      notify();
    }
  }

  async function saveSettings(patch) {
    state.settings = await host.call('settings.write', { settings: patch });
    notify();
    return state.settings;
  }

  const provider = id => state.providers.find(p => p.id === id);
  /** The account this app uses: the chosen default if it still exists, otherwise the first signed-in one. */
  function activeAccount() {
    const usable = state.accounts.filter(a => a.supported !== false);
    return usable.find(a => a.id === state.settings?.defaultAccountId)
      || usable.find(a => state.statuses[a.id]?.state === 'connected')
      || null;
  }

  // The user's MCP servers as saved in this app's settings (settings.mcp, JSON in the common mcpServers format).
  /** [{ name, spec }] from the saved JSON; an unreadable JSON gives no servers and `mcpInvalid`. */
  function mcpServers() {
    const text = (state.settings?.mcp || '').trim();
    if (!text) return { servers: [], invalid: false };
    try {
      const raw = JSON.parse(text);
      const list = raw && typeof raw === 'object' && raw.mcpServers && typeof raw.mcpServers === 'object' ? raw.mcpServers : raw;
      if (!list || typeof list !== 'object' || Array.isArray(list)) return { servers: [], invalid: true };
      return { servers: Object.entries(list).map(([name, spec]) => ({ name, spec })), invalid: false };
    } catch {
      return { servers: [], invalid: true };
    }
  }
  /** Saves a new list of servers ([{ name, spec }]) as the app's MCP JSON. */
  function saveMcpServers(servers) {
    const json = servers.length ? JSON.stringify({ mcpServers: Object.fromEntries(servers.map(s => [s.name, s.spec])) }, null, 2) : '';
    return saveSettings({ mcp: json });
  }
  // Each server's connection and tools, checked by connecting once (host method mcp.test). Kept for the same JSON,
  // so Settings and the assistant's "/" list share one check; `refresh` checks again.
  let mcpCheck = { text: null, promise: null, result: null };
  function mcpStatus({ refresh = false } = {}) {
    const text = state.settings?.mcp || '';
    if (!text.trim()) return Promise.resolve({ problems: [], statuses: [] });
    if (!refresh && mcpCheck.text === text && mcpCheck.promise) return mcpCheck.promise;
    const promise = host.call('mcp.test', { text }).then(result => {
      if (mcpCheck.promise === promise) { mcpCheck.result = result; notify(); }
      return result;
    });
    mcpCheck = { text, promise, result: null };
    promise.catch(() => { if (mcpCheck.promise === promise) mcpCheck = { text: null, promise: null, result: null }; });
    return promise;
  }
  const mcpResult = () => (mcpCheck.text === (state.settings?.mcp || '') ? mcpCheck.result : null);

  /** The account's limit windows, when the service reports them. */
  async function readUsage(accountId) {
    const usage = await host.call('usage.read', { accountId });
    if (usage?.windows?.length) state.usage[accountId] = usage;
    notify();
    return usage;
  }
  // Services also report their limit windows during conversations.
  host.on('event', event => {
    if (event.type !== 'usageUpdated' || !event.usage?.windows?.length) return;
    state.usage[event.accountId] = { windows: event.usage.windows, observedAt: event.usage.observedAt };
    notify();
  });

  host.on('status', () => notify());
  return Object.freeze({
    state, load, loadAccounts, readUsage, mcpServers, saveMcpServers, mcpStatus, mcpResult, loadProviders: async refresh => { await loadProviders(refresh); notify(); }, refreshStatus, saveSettings, provider, activeAccount,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    notify
  });
})();
