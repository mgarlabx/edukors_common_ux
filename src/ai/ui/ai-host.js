// The AI host as the interface sees it: requests to the AI runtime, its events, and the questions it asks the
// application (run a tool, authorize a call to one of the user's MCP servers). The screens never talk to Electron
// or to a server directly; they use EdukorsAiHost.
//
// Transports, chosen at start:
// - Electron (future): the preload script exposes globalThis.EdukorsDesktop.ai = { send(message), onMessage(fn) }.
// - Development host (tools/dev-host.mjs): the page is served from 127.0.0.1 and opened with #ai=<token>; messages go
//   by POST and come back as server-sent events.
// - None (the demo opened as a file): status 'unavailable'; the screens say the assistant needs the desktop app.
//
// Messages are those of src/ai/runtime/host/dispatcher.js.
globalThis.EdukorsAiHost = (() => {
  const TOKEN_KEY = 'edukors.common.aiToken';
  const listeners = { status: new Set(), event: new Set(), login: new Set() };
  const pending = new Map();
  let handlers = { tool: null, authorize: null };
  let status = 'unavailable'; // unavailable | connecting | ready | lost
  let info = null;
  let nextId = 1;
  let transport = null;

  const emit = (kind, value) => { for (const fn of listeners[kind]) { try { fn(value); } catch (error) { console.error(error); } } };
  const setStatus = next => { if (status !== next) { status = next; emit('status', status); } };

  // An error answer keeps the runtime's stable code (AiCliError.toJSON: { code, message, meta }).
  class HostError extends Error {
    constructor(error) { super(error?.message || 'The AI host failed.'); this.code = error?.code || 'INTERNAL'; this.meta = error?.meta; }
  }

  async function receive(message) {
    if (message.ready) { setStatus('ready'); return; }
    if (message.event) { emit('event', message.event); return; }
    if (message.login) { emit('login', message.login); return; }
    // The host asks the application something.
    if (typeof message.id === 'string' && message.method) {
      const handler = message.method === 'tool.call' ? handlers.tool : message.method === 'tool.authorize' ? handlers.authorize : null;
      let reply;
      try {
        if (!handler) throw new Error('The application cannot answer this request.');
        reply = { id: message.id, result: await handler(message.params) };
      } catch (error) {
        reply = { id: message.id, error: { message: error?.message || String(error) } };
      }
      transport?.send(reply);
      return;
    }
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new HostError(message.error)); else waiter.resolve(message.result);
  }

  function lost() {
    setStatus('lost');
    for (const waiter of pending.values()) waiter.reject(new HostError({ code: 'HOST_LOST', message: 'The connection to the AI host was lost.' }));
    pending.clear();
  }

  function devToken() {
    const match = /(?:^|[#&])ai=([A-Za-z0-9_-]{16,})/.exec(location.hash);
    if (match) {
      try { sessionStorage.setItem(TOKEN_KEY, match[1]); } catch {}
      history.replaceState(null, '', location.pathname + location.search);
      return match[1];
    }
    try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
  }

  function connectDev(token) {
    let connection = null;
    const queue = [];
    const source = new EventSource(`/ai/events?token=${encodeURIComponent(token)}`);
    const post = message => fetch(`/ai/send?connection=${encodeURIComponent(connection)}`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-edukors-token': token }, body: JSON.stringify(message)
    }).then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); });
    transport = {
      send(message) {
        if (!connection) { queue.push(message); return; }
        post(message).catch(() => {
          const waiter = pending.get(message.id);
          if (waiter) { pending.delete(message.id); waiter.reject(new HostError({ code: 'HOST_LOST', message: 'The AI host did not accept the request.' })); }
        });
      }
    };
    source.onmessage = event => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.connection) {
        connection = message.connection;
        for (const queued of queue.splice(0)) transport.send(queued);
        return;
      }
      receive(message);
    };
    // The development host stopped (or restarted with a new token): the page must be reopened from its address.
    source.onerror = () => { if (source.readyState === EventSource.CLOSED || status === 'ready') { source.close(); lost(); } };
  }

  function start() {
    const desktop = globalThis.EdukorsDesktop?.ai;
    if (desktop) {
      setStatus('connecting');
      transport = { send: message => desktop.send(message) };
      desktop.onMessage(receive);
      return;
    }
    if (location.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(location.hostname)) return;
    const token = devToken();
    if (!token) return;
    setStatus('connecting');
    connectDev(token);
  }

  function call(method, params = {}) {
    if (!transport || status === 'unavailable' || status === 'lost') return Promise.reject(new HostError({ code: 'HOST_UNAVAILABLE', message: 'The AI host is not available.' }));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      transport.send({ id, method, params });
    });
  }

  /** Like call, but returns the request id too, so a long request (accounts.connect) can be cancelled. */
  function callCancellable(method, params = {}) {
    const id = nextId;
    const promise = call(method, params);
    return { id, promise, cancel: () => call('cancel', { requestId: id }).catch(() => {}) };
  }

  /** Resolves once the host is ready, or rejects when it is not available. */
  function ready() {
    if (status === 'ready') return Promise.resolve();
    if (status === 'unavailable' || status === 'lost') return Promise.reject(new HostError({ code: 'HOST_UNAVAILABLE', message: 'The AI host is not available.' }));
    return new Promise((resolve, reject) => {
      const off = on('status', next => {
        if (next === 'ready') { off(); resolve(); }
        else if (next !== 'connecting') { off(); reject(new HostError({ code: 'HOST_UNAVAILABLE', message: 'The AI host is not available.' })); }
      });
    });
  }

  function on(kind, fn) {
    listeners[kind].add(fn);
    return () => listeners[kind].delete(fn);
  }

  async function hostInfo() {
    if (!info) info = await call('host.info');
    return info;
  }

  start();
  return Object.freeze({
    get status() { return status; },
    call, callCancellable, ready, on, hostInfo,
    /** The application's answers to the host: tool(params) → { content, isError? }; authorize(params) → { allow, message? }. */
    handle(next) { handlers = { ...handlers, ...next }; }
  });
})();
