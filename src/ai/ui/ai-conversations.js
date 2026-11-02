// A document's AI conversations, kept inside its package (the document's ZIP): each document has its own history.
//
//   <app>/ai/conversations/<conversation id>.json    one JSON part per conversation
//
// Each part is reached from the main part through a relationship of type RELATIONSHIP, as OPC requires (a part
// nothing points to is an orphan). The app adds the parts and relationships when it saves, and gives the parts back
// when it opens the document:
//
//   const { parts, relationships } = EdukorsAiConversations.toPackage('common', conversations);
//   EdukorsPackage.write({ ..., main: { ..., relationships: [...own, ...relationships] }, parts: [...own, ...parts] });
//
//   const pkg = await EdukorsPackage.read(bytes);
//   const conversations = EdukorsAiConversations.fromPackage(pkg);   // [] when the document has none
//
// Only what the conversation shows is kept: messages (with the skill named and the names of attached files, not
// their text), tool and MCP results, questions with their answers, notes, and errors, with the account, the service's resume id, and the token totals. Pending approvals are not kept.
// No credentials are stored. A conversation is limited to its last MAX_ITEMS items; a document keeps MAX_CONVERSATIONS.
// Pure functions without DOM or Node APIs, so the same code runs in the page and in tests.
globalThis.EdukorsAiConversations = (() => {
  const RELATIONSHIP = 'https://edukors.org/package/relationships/ai-conversation';
  const CONTENT_TYPE = 'application/vnd.edukors.ai.conversation+json';
  const FORMAT = 1;
  const MAX_ITEMS = 400;
  const MAX_CONVERSATIONS = 40;
  const ID = /^[A-Za-z0-9-]{1,64}$/;
  const text = (value, max = 100_000) => (typeof value === 'string' ? value.slice(0, max) : '');

  // The items a saved conversation may hold, each reduced to the fields it needs.
  const KEEP = {
    // The skills and MCP servers chosen with + and the names of attached files (their text is not kept).
    user: item => ({ kind: 'user', text: text(item.text), ...(Array.isArray(item.skills) && item.skills.length ? { skills: item.skills.slice(0, 20).map(n => text(n, 200)) } : {}), ...(Array.isArray(item.servers) && item.servers.length ? { servers: item.servers.slice(0, 20).map(n => text(n, 64)) } : {}), ...(Array.isArray(item.attachments) && item.attachments.length ? { attachments: item.attachments.slice(0, 20).map(n => text(n, 255)) } : {}) }),
    assistant: item => ({ kind: 'assistant', text: text(item.text) }),
    tool: item => ({ kind: 'tool', tool: text(item.tool, 200), state: item.state === 'failed' ? 'failed' : 'ok', ...(item.errorCode ? { errorCode: text(item.errorCode, 64) } : {}) }),
    mcp: item => ({ kind: 'mcp', server: text(item.server, 64), status: item.status === 'connected' ? 'connected' : 'failed', ...(Number.isFinite(item.tools) ? { tools: item.tools } : {}) }),
    question: item => ({ kind: 'question', prompt: text(item.prompt, 2000), options: Array.isArray(item.options) ? item.options.map(o => text(o, 200)).slice(0, 20) : [], answer: typeof item.answer === 'string' ? text(item.answer, 2000) : null }),
    note: item => ({ kind: 'note', text: text(item.text, 2000) }),
    error: item => ({ kind: 'error', text: text(item.text, 2000) })
  };
  const cleanItems = items => (Array.isArray(items) ? items : []).filter(item => KEEP[item?.kind]).map(item => KEEP[item.kind](item)).slice(-MAX_ITEMS);
  const count = value => (Number.isFinite(value) && value >= 0 ? Math.round(value) : 0);

  /** A conversation as saved: plain data, no pending state. */
  function serialize(conv) {
    return {
      format: FORMAT,
      id: conv.id,
      updated: conv.updated || new Date().toISOString(),
      accountId: conv.accountId || null,
      resumeId: conv.resumeId || null,
      tokens: { input: count(conv.tokens?.input), output: count(conv.tokens?.output), cached: count(conv.tokens?.cached), known: !!conv.tokens?.known },
      items: cleanItems(conv.items)
    };
  }

  /** A saved conversation, checked; null when it cannot be used. Questions without an answer are closed. */
  function deserialize(data) {
    if (!data || typeof data !== 'object' || !ID.test(String(data.id)) || data.format !== FORMAT) return null;
    const items = cleanItems(data.items).map(item => (item.kind === 'question' && item.answer === null ? { ...item, answer: '' } : item));
    if (!items.some(item => item.kind === 'user')) return null;
    return {
      id: data.id,
      updated: typeof data.updated === 'string' && !Number.isNaN(Date.parse(data.updated)) ? data.updated : null,
      accountId: typeof data.accountId === 'string' ? data.accountId.slice(0, 64) : null,
      resumeId: typeof data.resumeId === 'string' ? data.resumeId.slice(0, 200) : null,
      tokens: { input: count(data.tokens?.input), output: count(data.tokens?.output), cached: count(data.tokens?.cached), known: !!data.tokens?.known },
      items
    };
  }

  /** Parts and main-part relationships for a document's conversations (empty ones and pending state are left out). */
  function toPackage(appName, conversations) {
    const saved = conversations.filter(conv => ID.test(String(conv.id)) && (conv.items || []).some(item => item.kind === 'user'))
      .map(serialize)
      .sort((a, b) => b.updated.localeCompare(a.updated))
      .slice(0, MAX_CONVERSATIONS);
    const parts = saved.map(conv => ({ name: `${appName}/ai/conversations/${conv.id}.json`, contentType: CONTENT_TYPE, content: conv }));
    // Targets are relative to the main part's folder (<app>/), as OPC relationships are.
    const relationships = saved.map(conv => ({ type: RELATIONSHIP, target: `ai/conversations/${conv.id}.json` }));
    return { parts, relationships };
  }

  /** The conversations of a package read with EdukorsPackage.read, newest first. Damaged parts are skipped. */
  function fromPackage(pkg) {
    const out = [];
    for (const rel of pkg.relationships(pkg.main.name)) {
      if (rel.type !== RELATIONSHIP || rel.external) continue;
      try {
        const conv = deserialize(pkg.json(rel.target));
        if (conv) out.push(conv);
      } catch { /* a damaged conversation is left out; the document still opens */ }
    }
    return out.sort((a, b) => String(b.updated).localeCompare(String(a.updated))).slice(0, MAX_CONVERSATIONS);
  }

  return Object.freeze({ RELATIONSHIP, CONTENT_TYPE, FORMAT, MAX_ITEMS, MAX_CONVERSATIONS, serialize, deserialize, toPackage, fromPackage });
})();
