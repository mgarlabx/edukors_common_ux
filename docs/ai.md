# AI assistant

Every EDUKORS app shares one AI experience: choose a service, connect an account, select it, and work on the open document with an agent. Common owns the runtime, the host interface, and the screens; each app supplies its instructions, tools, and document context.

## Layers

| Layer | Where | Runs in |
| --- | --- | --- |
| Runtime: CLIs, shared accounts, sessions, MCP, skills, events, errors | `src/ai/runtime` (from `edukors_ai_cli` 0.2.2; see its README) | Node.js |
| Host protocol: requests, events, tool calls, MCP authorization | `src/ai/runtime/host/dispatcher.js` | Node.js |
| App-host requests: this app's AI settings (instructions, MCP, default account, model, effort, mode), MCP test, skills (list, add from ZIP, delete), provider catalog | `src/ai/host/app-methods.js` | Node.js |
| Transport | `desktop/main.mjs` + `desktop/preload.cjs` (Electron IPC); `tools/dev-host.mjs` (HTTP + server-sent events, for a browser) | Node.js |
| Host interface for the screens | `src/ai/ui/ai-host.js` (`EdukorsAiHost`) | page |
| Shared state | `src/ai/ui/ai-store.js` | page |
| Conversations in the document package | `src/ai/ui/ai-conversations.js` | page and Node.js |
| Screens | `src/ai/ui/ai-settings.js`, `src/ai/ui/ai-assistant.js`, helpers in `ai-ui.js` | page |
| App configuration | `demo/assistant.js` (instructions, tools, context) | page |

The screens never call Electron or a server directly. `EdukorsAiHost` picks a transport at start: `globalThis.EdukorsDesktop.ai` (`send`, `onMessage`) when the Electron preload provides it; the development host when the page comes from `127.0.0.1` with a token; otherwise none, and the screens say the assistant needs the desktop app.

## The agent's folder

The agent works with the provider's own tools (read, create, and edit files; run commands; search the web), confined to one folder per document:

- once the document is saved, the folder of its file; the document file itself is protected and changes only through the app's tools;
- before that, a private folder of the app (`<app data>/apps/<app>/workspaces/<hash of the document id>`; in the development host, under `EDUKORS-dev` or `--data-dir`).

The host prepares it (`workspace.prepare` in `src/ai/host/app-methods.js`; the app may give `documentPath(doc)` to EdukorsAiAssistant.configure; the demo does once the document has a file, and `EdukorsAiAssistant.documentSaved(doc)` closes the document's idle sessions after a save so the next request opens in the file's folder). Confinement: Claude Code's restricted mode and permission rules, and its sandbox for commands (macOS, Linux; on native Windows, files and web only); Codex only on macOS, inside the system sandbox. Where the provider cannot confine a folder (Codex on Windows and Linux), the session has no folder: no files, commands, or web. MCP servers are outside this limit.

In **Review before applying** mode, creating or editing a file and running a command wait in a card ("Create this file in the document's folder?", "Change this file…?", "Run this command…?") with Approve and Decline; reading and the web never ask. In **Apply changes** mode they go ahead (still confined).

## Settings → AI assistant

Same sections, names, and order in every app (the rule from `edukors_ai_cli/docs/roadmap.md`):

Accounts, MCP servers, and skills share one pattern: a + in the heading adds, a list with one line per item, and a trash icon on the right of each line removes.

1. **Accounts** (shared by every EDUKORS app on the computer), one line each (+ in the heading opens Add account):
   - a radio button on the left chooses the account this app uses. This is the only place where the assistant's account changes; changing it starts a new conversation, and the current one goes to the history;
   - the name (double-click to rename; Enter or leaving the field saves, Escape cancels), service and identity, and status (Signed in, Signed out, Sign in again, Could not be checked);
   - Sign in, only while the account is signed out;
   - a trash icon on the right that removes the account after confirmation (the confirmation says it affects every app; documents and conversations are kept).
   - The sign-in panel, the removal confirmation, and errors open below the line.
   - **Add account**: choose a service (each shows whether its CLI is installed), name the account, then sign in. While signing in, the screen offers the sign-in address (open or copy) and, when the service ends with a code, a field to paste it. A missing or outdated CLI shows the official guide and the install command for the system, with Copy and Check again; nothing is installed by the app.
2. Then, without a heading (this app only; saved automatically, used by new conversations):
   - **Instructions**: added after the app's own instructions.
   - **MCP servers**: one line per server (name, address, and its connection: "connected, N tools" or "could not connect"; the tools in the address's tooltip), a trash icon to remove one after confirmation, and a + in the heading that opens a form with **Name** and **Address (URL)**, with the Edukors book (`edukors-book`, `https://mcp.edukors.org/mcp`, from `MCP_EXAMPLE` in `src/ai/host/app-methods.js`) as placeholders. A server added here is saved as `{ "type": "http", "url" }`: the engine reaches it directly, with nothing else installed (servers that need an OAuth sign-in are not supported this way). The connection check runs once per configuration and is shared with the assistant's "/" list (`EdukorsAiStore.mcpStatus`). Servers saved earlier in other forms (a local `command`, headers) still work and are listed; they cannot be edited here.
   - **Skills**: the skills of the app (its skills folder, `<name>/SKILL.md`), one line each with name and description. The + in the heading adds a skill from a ZIP file (SKILL.md at the root or inside one folder; up to 25 MB; the folder takes the skill's name; an existing skill is replaced only after confirmation). The trash icon deletes a skill after confirmation. Only these skills are offered to the agent. Skills belong to the app, not to a document.

Opening Settings reads everything again, because another EDUKORS app may have changed the shared accounts.

## Assistant panel

Laid out as in the Slides editor.

- **Header**: Conversations (history), New conversation, Close.
- **Conversations belong to the document.** Each open document has its current conversation and its earlier ones. New conversation moves the current one to the history. The history lists the document's conversations by day (Today, Yesterday, Earlier) with search; opening one continues it (the service resumes the conversation when the account is the same); the trash icon deletes one after confirmation. Closing a document ends its conversations in the panel.
- **Composer**: chips (the chosen skill or MCP server and attached files), the text, then a row with + on the left and, on the right, the mode, the model, and Send (a round button with a square, Stop, while working). The composer shows no status: the phases and seconds appear as steps in the conversation. The + and Stop have no tooltip.
- **The + menu** (left of the composer's bottom row, replacing the earlier "/" list and the paperclip): Add files; Skills ›; MCP servers ›; Search the web (a check, on by default: not a chip; turned off, the session has no web search. Saved as the app setting `web`; changing it closes the open sessions so the next request reopens them, resuming; disabled where the provider has no folder mode). The submenus list names only, with the same icons as Settings (skills: bolt; MCP servers: globe), and open beside the item (to the left when there is no room on the right). Several skills and servers can be chosen for one request (choosing one twice changes nothing); each becomes a chip with its ×, and Backspace in an empty field removes the last one. On sending, the request starts with one line per choice: `Use the skill "<name>" for this request.` or `Use the MCP server "<server>" (its tools are named mcp__<server>__<tool>) for this request.` The agent may also choose skills and tools by itself. Keyboard: arrows, → or Enter opens a submenu, ← back, Escape closes.
- **Attachments**: + → Add files attaches any kind of file (up to 10 files of 20 MB per request). The runtime saves them where the agent can open them with its own tools; images and PDFs are read natively by the model. The message shows their names, and the saved conversation keeps only the names.
- **Mode** (menu opening upward; hand icon for review, play icon for apply): **Review before applying** (default; each change to the document waits in a card with Approve and Decline, and details) or **Apply changes** (applied at once; each one can be undone). Reading the document never asks. The choice is saved with the app's AI settings.
- **Model** (menu opening upward, when the service lists models): the service's models and a discrete effort slider when the model has effort levels (a model without them, such as Claude's Haiku 4.5, says "This model has no effort levels"). The choice is kept per account (`choices` in the app's AI settings), so the model always belongs to the account's service: changing the account in Settings shows that account's model; a saved model the service no longer offers is replaced by the service's default model (or its first one). Claude's "default" pseudo-model ("Default (recommended)", meaning the account's default) is not listed. Changes apply to the open session where the service allows it, otherwise to the next one.
- **Usage** (below the composer): the account's session limit (the 5-hour window, "Session limit") as one bar with the percentage used (the reset time in its tooltip). A service without that window shows its most used window; with no window, nothing is shown. Tokens are not shown (each conversation still counts them and saves them in the package).
- **Steps in the conversation**: while the agent works, each phase appears as a line in the conversation: Starting the service, Preparing, Thinking, Reading, Researching, Applying changes, with a spinner and the seconds; when it ends, a check and its duration ("Thought · 6 s"). Text, tools, and cards end the running step. After 3 seconds with no event (and no card waiting for the person), a Thinking step appears, so the conversation is never silent for long. Steps that end in under a second leave no line. Steps are not saved with the conversation.
- Every request carries the latest document state (`context`), unsaved edits included. Tools appear as chips with their result; the app names its own tools ("Added text"). Calls to the user's MCP servers stop at a card: Allow, Always allow (later calls to that server in the same conversation go ahead without asking; a new conversation asks again), or Decline. Questions from the agent appear as cards with the offered answers and a free answer. Stop interrupts and declines anything still waiting; changes already applied stay and can be undone. Errors appear in words from the stable error codes.

## Conversations inside the document package

Each document keeps its own conversations in its package (`src/ai/ui/ai-conversations.js`):

```
<app>/ai/conversations/<conversation id>.json     one JSON part per conversation (content type application/vnd.edukors.ai.conversation+json)
```

The main part points to each one with a relationship of type `https://edukors.org/package/relationships/ai-conversation`, so none is an orphan. A part keeps the messages, tool and MCP results, questions with their answers, notes, errors, the account id, the service's resume id, and the token totals; pending approvals, live sessions, and credentials are never saved. Limits: the last 400 items of a conversation, the 40 most recent conversations of a document. A damaged conversation part is skipped and the document still opens.

`EdukorsAiAssistant.conversationsOf(doc)` gives a document's conversations when it is saved, and `EdukorsAiAssistant.restoreConversations(doc, list)` puts them back when it opens; `EdukorsAiConversations.toPackage` and `fromPackage` convert them to and from package parts. In the desktop app, Save writes them with the document and Open restores them as its history (`demo/document-file.js`); in the browser preview the history lasts while the page is open. Covered by `tests/ai-conversations.test.mjs`.

## The demo's tools

`demo/assistant.js` gives the agent the sample page: `read_document`, `insert_text`, `insert_shape`, `insert_image`, `replace_image`, `set_text`, `update_object`, `delete_object`. Arguments are checked against their schema before `EdukorsSampleDocument` (in `demo/sample-document.js`) applies them; each change is one undo step of the document the conversation belongs to, even when another tab is active.

**Putting files into the document.** Common allows everything; each app limits what it cannot do by declaring only the tools it supports. The agent can make or download any file in its folder, so the host offers two requests that hand a file to the app, which decides what to do with it:

- `workspace.readFile { documentId, path }`: a file in the document's folder (the one remembered from `workspace.prepare`) or an attachment of this app's sessions; anything else, including `..` paths and links that leave those folders, is refused; 50 MB at most.
- `workspace.fetchUrl { url }`: an http or https address (30 s, 50 MB); other schemes such as `file:` are refused.

Both return `{ name, mimeType, data }` with `data` in base64. `insert_image` and `replace_image` take exactly one source: `path` (through `workspace.readFile`), `url` (through `workspace.fetchUrl`), or `svg` (markup the agent writes, which needs no file). They are changes, so review mode asks first. The picture's box fits inside the given width and height (percent of the page) with the picture's proportions; a replacement keeps the old box's center. Animated GIF, WebP, APNG, and SVG animations play as images. Video and audio are not needed for now (user decision); other kinds, such as HTML embeds, would need new object kinds in the sample page, which are not built.

## Electron host

```sh
npm run desktop                                   # or: npx electron . [--shared | --data-dir <dir>] [--verbose]
```

`desktop/main.mjs` (main process) opens `demo/index.html` in a window and runs the same dispatcher as the development host, one per window, with `createAppMethods`. `desktop/preload.cjs` (sandboxed, context isolation on, no Node in the page) exposes only `EdukorsDesktop.ai = { send, onMessage }`; `ai-host.js` picks it first. Registering `onMessage` is what starts the session: the main process creates the window's dispatcher, which announces `{ ready }`, only after the page can hear it, and reloading the page replaces the dispatcher. IPC from any frame other than the app's own page is ignored. Links with http, https, or mailto open in the system; every other new window or navigation is refused.

- Unpackaged, the data folders match the development host: a development registry with the fake service, `--shared` for the real accounts, `--data-dir` for another folder (tests use an empty one). Packaged, the shared registry is used and this app's settings, skills (`skills`), and workspaces live in the user data folder (written, not yet run: there is no packaging).
- The page is loaded from `file:`, so it is the same files the browser preview uses.
- Title bar: the system's title bar is hidden (`titleBarStyle: "hidden"`) and the page's bar takes its place (`demo/desktop-window.js`, `EdukorsDesktop.window`): dragging it moves the window; on macOS the traffic lights sit on its left, vertically centered for any interface font size (`setWindowButtonPosition`), and their room is given back in full screen; on Windows and Linux the system draws minimize, maximize, and close on the right (`titleBarOverlay`) in the bar's background and text colors, updated with the theme and the font size. Interactive elements inside the bar are excluded from dragging.
- Menu: on macOS a minimal application menu (app menu with About, Settings…, Services, Hide, Quit; Edit; Window with Close Tab on Cmd+W), labelled in the interface language by the page (`EdukorsDesktop.menu.setLabels`, `demo/desktop-menu.js`) and running the page's commands (`onCommand`). Without it, Electron's default menu would close the whole window on Cmd+W, and text fields would lose Cmd+C/V/A. Undo, Redo, Delete, and Select All act on a focused text field natively and on the document otherwise; keys the page already handled (`preventDefault`) do not reach the menu. Windows and Linux have no menu bar (the page handles Ctrl+W). Unpackaged, Cmd+Option+I, Ctrl+Shift+I, or F12 opens the developer tools. AI sessions now end on `will-quit`, so cancelling the unsaved-changes prompt while quitting keeps them.
- Checked with Playwright's Electron driver (isolated `--data-dir`, fake service): the bridge exposes only `ai.send` and `ai.onMessage`; add account and sign in, an echo, `insert_image` adding an object, no console errors. Not checked: real Claude or Codex in Electron, Windows and Linux, the packaged paths, window close with a running request.

## Development host

```sh
npm install          # once: the runtime's three dependencies
npm run dev          # or: node tools/dev-host.mjs [--port 8765] [--shared | --data-dir <dir>] [--verbose]
```

Open the address it prints (`http://127.0.0.1:8765/demo/#ai=…`). The token in the address is random per start; after restarting the host, open the new address.

- Without `--shared`, accounts live in a development registry next to the shared one (`~/Library/Application Support/EDUKORS-dev` on macOS), separate from the Slides and Graph editors, and the fake service ("Fake AI") is offered. With `--shared`, the real shared registry is used and the fake service is not.
- This app's AI settings are stored in `EDUKORS-dev/apps/common/ai-settings.json`. Nothing of the AI data is written inside the repository, which may sit in a synced folder (account folders hold the services' credentials).
- Skills come from `demo/skills` (two sample skills).
- `--data-dir <dir>` keeps the accounts and this app's AI settings in another folder, with the fake service. Automated browser tests must use it with an empty folder, never the person's development or shared registry (they refuse to run when accounts already exist).
- The host binds to 127.0.0.1, checks the Host and Origin headers, and requires the token on every request.

### Testing without an account

Add a **Fake AI** account (signs in at once). In the panel, these words drive it (see `src/ai/runtime/fixtures/fake-ai.mjs`):

| Type | Result |
| --- | --- |
| anything | an echo |
| `tool insert_text {"text":"Hello"}` | calls an app tool (any of the eight above, for example `tool insert_image {"svg":"<svg viewBox='0 0 10 10'><circle cx='5' cy='5' r='4'/></svg>"}`); in Review mode, approve it first |
| `mcp glossary lookup {"term":"OPC"}` | calls the runtime's test MCP server; asks for authorization. Configure it first in MCP servers as `{"mcpServers":{"glossary":{"command":"node","args":["<repo>/src/ai/runtime/fixtures/fake-mcp-server.mjs"]}}}` |
| `mcp edukors-book chapters {}` | calls the Edukors book server (after Use example) |
| `ask` | a question card |
| `slow` | streams for two seconds; try Stop |
| `crash`, `rate-limit` | errors |

Claude and Codex accounts sign in through the services' own pages and need the user's CLIs installed.

## Tests

`npm test` (or `node --test`) runs the runtime's suites (`tests/ai`), the package tests, and the conversation-package tests (135 in all). They use fake CLIs and need no account. The screens were checked in headless Chrome (Playwright from `edukors_slides_editor`): every flow above with the fake service, dark theme, Portuguese, Chinese, 150–200% font size, and the page opened as a file.

## Next

- Port later `edukors_ai_cli` fixes deliberately (see `src/ai/runtime/README.md`).
