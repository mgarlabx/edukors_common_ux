# AI runtime

The Node.js side of the Edukors AI assistant: provider CLI discovery (Claude Code, Codex), the account registry shared by every Edukors app, sessions, the app's tools, the user's MCP servers and skills, normalized events, and stable error codes (`AiError`). `createAiRuntime` (`engine.js`) is the entry point; the hosts (`desktop/host.mjs` in Electron, `tools/dev-host.mjs` for a browser) create one per window and serve it to the page through the host protocol (`host/dispatcher.js`), which has no transport of its own.

## Direction

The agent may do everything the native CLIs (Claude Code, Codex) allow, with one limit: it works only inside the document's folder (MCP servers excepted). Confinement comes from the workspace rules and the system sandboxes, never from prompts alone.

## Layout

- `engine.js`: the runtime (accounts, sessions, providers, events); `session.js`: one conversation with a provider; `errors.js`: `AiError` and its codes.
- `providers/claude`, `providers/codex`: the adapters; `provider.d.ts` is their contract. `testing/fakeProvider.js` and `fixtures/` give a deterministic provider for tests and the development host.
- `registry/`: the account registry shared by the Edukors apps (versioned by `schemaVersion` and `minReaderVersion`, so apps of different ages can share it).
- `host/dispatcher.js`: the host protocol (requests, events, tool calls, MCP authorization), with `methods` for requests that belong to the embedding host.
- `mcp/`, `skills.js`, `workspace.js`, `platform/`: the user's MCP servers, skills, the working folder's rules, and processes, paths, and sign-in per system.

The modules are plain JavaScript (four-space indentation), run without a build step. Each has a declaration file (`*.d.ts`) beside it that documents its types: when you change a `.js` file, update its `.d.ts` by hand.

## Behavior worth knowing

- **Attached files** (`session.send(text, { attachments: [{ name, mimeType, data }] })`, protocol `session.send.attachments` with base64 data): saved in the session's `attachments/<request>/` folder, which every workspace session reads (never writes); the request lists their paths for the agent, which opens them with its own tools (images and PDFs are read natively by the model). `withAttachments` and `saveAttachments` in `session.js`; the folder is created in `engine.js`.
- **Native actions put to the application**: creating or editing a file and running a command go through `authorize({ kind: "native", action: "create" | "edit" | "command", tool, path, relativePath, command, description })` (the sink's `authorizeNative`). Claude: writing tools and `Bash` are not pre-allowed in the session settings (`autoAllowBashIfSandboxed: false`); `canUseTool` checks the folder rules, then asks (`nativeAction`). Codex: `approvalPolicy: "untrusted"` and its approval requests are forwarded. Without an authorizer, native actions go ahead (the folder and sandbox still confine them). Reading and the web are never put.
- The fake provider's CLI (`fixtures/fake-ai.mjs`) reads its keywords from the person's words, ignoring the `<document>` context and the list of attached files the adapters append, and asks before a `write` (message `native`).

## Tests

`tests/ai/*.test.mjs`, run with `node --test` through `tests/ai/vitest-shim.mjs`; `tests/ai/helpers.mjs` plays the application's side of the host protocol over a pair of streams (`pipeHost`).

## Dependencies

`@anthropic-ai/claude-agent-sdk` 0.3.287, `@modelcontextprotocol/sdk` 1.31.0, and `zod` 4.6.7, pinned in the root `package.json`. Node.js 22.12 or later. The version the runtime reports (`version.js`) is Common's own, from its `package.json`.

## License

MIT (see `LICENSE` in this folder).
