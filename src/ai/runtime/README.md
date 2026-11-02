# AI runtime (from edukors_ai_cli)

The Node.js side of the EDUKORS AI assistant: provider CLI discovery (Claude Code, Codex), the account registry shared by every EDUKORS app, sessions, the app's tools, the user's MCP servers and skills, normalized events, and stable error codes. Its guarantees and adapter contract started as those of `edukors_ai_cli` (its README and `docs/roadmap.md` explain them); this runtime now evolves on its own (see Direction and the differences below).

## Direction

`edukors_ai_cli` is legacy: it was the starting point and will be deactivated (it is still not modified). This runtime may and should differ from it: it aims to let the agent do everything the native CLIs (Claude Code, Codex) allow, with one limit: it works only inside the document's folder (MCP servers excepted). Confinement comes from the workspace rules and the system sandboxes, never from prompts alone.

## Origin

Copied on 2026-11-01 from `edukors_ai_cli` 0.2.2 (commit `93524c5`), which was left unchanged. The TypeScript sources were compiled with that repository's own `tsc` (ES2023, NodeNext, comments kept) into plain JavaScript modules, so Common runs them without a build step. Each module's declaration file (`*.d.ts`, generated from the same sources) sits beside it and documents the types; `provider.d.ts` is the adapter contract, which has no JavaScript of its own. Formatting is the compiler's (four-space indentation).

When you change a `.js` file, update its `.d.ts` by hand. Fixes made in `edukors_ai_cli` after 0.2.2 are not picked up automatically: port them deliberately, and note them below.

## Differences from edukors_ai_cli 0.2.2

- `cli/` (the `edukors-ai` terminal tool) was not copied. The screens replace it for testing.
- `packages/ui` (`@edukors/ai-ui`, React) was not copied. Common's screens are in `src/ai/ui` (plain JavaScript, five languages).
- `host/stdio.js` was split: `host/dispatcher.js` holds the application-host protocol without a transport, with `methods` for requests that belong to the embedding host. `host/stdio.js` is now only the JSON-lines pipe. The development host (`tools/dev-host.mjs`) and, later, the Electron host use the dispatcher.
- `fixtures/` moved inside the runtime (`runtime/fixtures`); `testing/fakeProvider.js` points there.
- `fixtures/fake-ai.mjs` reads its keywords from the person's words, ignoring the `<document>` context the adapters append after them (0.2.2 read the last paragraph, which is the context when there is one).
- **Attached files** (`session.send(text, { attachments: [{ name, mimeType, data }] })`, protocol `session.send.attachments` with base64 data): saved in the session's `attachments/<request>/` folder, which every workspace session reads (never writes); the request lists their paths for the agent, which opens them with its own tools (images and PDFs are read natively by the model). `withAttachments` and `saveAttachments` in `session.js`; the folder is created in `engine.js`.
- **Native actions put to the application**: creating or editing a file and running a command go through `authorize({ kind: "native", action: "create" | "edit" | "command", tool, path, relativePath, command, description })` (the sink's `authorizeNative`). Claude: writing tools and `Bash` are no longer pre-allowed in the session settings (`autoAllowBashIfSandboxed: false`); `canUseTool` checks the folder rules, then asks (`nativeAction`). Codex: `approvalPolicy: "untrusted"` and its approval requests are forwarded. Without an authorizer, native actions go ahead (the folder and sandbox still confine them). Reading and the web are never put.
- The fake CLI asks before a `write` (message `native`) and ignores the list of attached files when reading keywords.
- Tests are in `tests/ai/*.test.mjs`, compiled from the vitest suites and run with `node --test` through `tests/ai/vitest-shim.mjs`.

## Dependencies

`@anthropic-ai/claude-agent-sdk` 0.3.287, `@modelcontextprotocol/sdk` 1.31.0, and `zod` 4.6.7, pinned in the root `package.json` to the versions 0.2.2 was tested with. Node.js 22.12 or later.

## License

MIT, as in `edukors_ai_cli` (see `LICENSE` in this folder).
