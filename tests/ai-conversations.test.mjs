// AI conversations inside a document package, and the plain ZIP reader used for skills. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/package/package.js';
import '../src/ai/ui/ai-conversations.js';

const P = globalThis.EdukorsPackage;
const C = globalThis.EdukorsAiConversations;

const conversation = (id, updated, extra = {}) => ({
  id, updated, accountId: 'acc1', resumeId: 'r-' + id, running: null, sessionId: 'live-session',
  tokens: { input: 1200, output: 340, cached: 0, known: true },
  items: [
    { kind: 'user', text: 'Add a title' },
    { kind: 'tool', tool: 'insert_text', state: 'ok', callId: 'x' },
    { kind: 'approve', tool: 'insert_text', decision: null, resolve() {} },
    { kind: 'assistant', text: 'Done.', requestId: 'q' },
    { kind: 'question', questionId: 'k', prompt: 'Which color?', options: ['red'], answer: null }
  ],
  ...extra
});

test('conversations travel inside the package, one part per conversation, reached from the main part', async () => {
  const list = [conversation('c-1', '2026-11-01T10:00:00Z'), conversation('c-2', '2026-11-01T12:00:00Z'), { id: 'empty', items: [] }];
  const { parts, relationships } = C.toPackage('common', list);
  assert.deepEqual(parts.map(p => p.name), ['common/ai/conversations/c-2.json', 'common/ai/conversations/c-1.json']);
  const bytes = await P.write({
    app: { name: 'common' },
    main: { name: 'common/document.json', contentType: P.contentType('common', 'document'), content: { objects: [] }, relationships },
    parts
  });
  const pkg = await P.read(bytes);
  assert.deepEqual(pkg.orphans, []);
  const back = C.fromPackage(pkg);
  assert.deepEqual(back.map(c => c.id), ['c-2', 'c-1']);
  const first = back[0];
  assert.equal(first.resumeId, 'r-c-2');
  assert.deepEqual(first.tokens, { input: 1200, output: 340, cached: 0, known: true });
  // Live state and pending approvals are not kept; an unanswered question is closed.
  assert.deepEqual(first.items.map(i => i.kind), ['user', 'tool', 'assistant', 'question']);
  assert.equal(first.items[3].answer, '');
  assert.equal('sessionId' in first, false);
});

test('a document without conversations, or with a damaged one, still opens', async () => {
  const plain = await P.read(await P.write({ app: { name: 'common' }, main: { name: 'common/document.json', contentType: P.contentType('common', 'document'), content: {} } }));
  assert.deepEqual(C.fromPackage(plain), []);
  const bad = await P.read(await P.write({
    app: { name: 'common' },
    main: { name: 'common/document.json', contentType: P.contentType('common', 'document'), content: {}, relationships: [{ type: C.RELATIONSHIP, target: 'ai/conversations/x.json' }] },
    parts: [{ name: 'common/ai/conversations/x.json', contentType: C.CONTENT_TYPE, content: '{not json' }]
  }));
  assert.deepEqual(C.fromPackage(bad), []);
  assert.equal(C.deserialize({ format: 99, id: 'a', items: [{ kind: 'user', text: 'hi' }] }), null);
});

test('unzip reads a plain ZIP with the package limits', async () => {
  const bytes = await P.write({ app: { name: 'common' }, main: { name: 'common/document.json', contentType: P.contentType('common', 'document'), content: { a: 1 } } });
  const entries = await P.unzip(bytes);
  assert.ok(entries.some(e => e.name === 'common/document.json'));
  await assert.rejects(P.unzip(bytes, { maxEntries: 2 }), e => e.code === 'limit');
  await assert.rejects(P.unzip(new Uint8Array([1, 2, 3])), e => e.code === 'zip');
});
