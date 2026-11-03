# EDUKORS Common UX

The shared foundation of the EDUKORS desktop apps: the application shell, file handling, formatting controls, icons, translations, the document package format, the Electron host, and the AI assistant.

Common is never installed or released by itself. It is a dependency of each app: the app supplies its page, configuration, document, and main process, and Common supplies everything they share. This repository also holds a demo app, built the same way an app is, for developing and checking the shared parts.

## Using Common in an app

### Dependency

Add Common to the app's `package.json`, pointing at the `main` branch of this public repository:

```json
"dependencies": {
  "edukors-common-ux": "git+https://github.com/mgarlabx/edukors_common_ux.git#main"
}
```

- Use the `git+https` form, not `github:`. With `github:` the lock file records an SSH address, and `npm ci` fails on CI machines without an SSH key.
- npm 12 refuses git dependencies by default. Add an `.npmrc` to the app with:

  ```
  allow-git=root
  ```

  This allows only the git dependencies named in the app's own `package.json`.
- The app receives only `src/` and `desktop/` (`files` in Common's `package.json`). Common's development dependencies (Electron, electron-builder) are not installed; the app declares its own.
- To work on Common and an app together, run `npm link ../edukors_common_ux` in the app, so it uses the sibling folder live.

There are no versions or tags: every app follows the latest commit of Common's `main`. Push to `main` only what is ready for every app.

### What the app supplies

An app supplies four things. The full contract, with every option, is in [App integration](docs/common-shell.md#app-integration).

1. **Its page** (`index.html`): its configuration, then Common's single entry point with the app's own scripts:

   ```html
   <script src="app-config.js"></script>
   <script src="node_modules/edukors-common-ux/src/shell/boot.js" data-app="document.js assistant.js"></script>
   ```

   `boot.js` adds the stylesheet and the markup (title bar, toolbar, tabs, side panels, status bar, Settings, Help) and loads Common's libraries, the shell, the AI screens, and then the app's scripts, in the right order. When Common adds or reorders a file, apps do not change.
2. **Its configuration** (`EdukorsAppConfig`, in `app-config.js`): name, version, terms version, Help texts (Markdown per language), file extension, export and import formats, Insert buttons, and, for a canvas app, what the canvas allows (`canvas`) and which formatting groups each kind of selection shows (`contextualToolbar`).
3. **Its document** (`EdukorsAppDocument`): how to write and read its file (`toBytes`, `fromBytes`), put content into a tab (`adopt`), and, optionally, export, import, and select all.
4. **Its main process** (`desktop/main.mjs`):

   ```js
   import { fileURLToPath } from "node:url";
   import { startDesktopApp } from "edukors-common-ux/desktop/host.mjs";

   startDesktopApp({
     appId: "text",
     name: "Edukors Text Editor",
     root: fileURLToPath(new URL("..", import.meta.url)),
     documentExtensions: [".etex"],
     exportFormats: ["html", "pdf", "md", "txt", "docx"],
   });
   ```

   The host runs everything the apps share: the AI assistant, files, Recent, import and export (only the extensions the app lists), documents the system opens (double-click, Open With), the macOS menu, the title bar, terms of use, and update checks.

Apps built on Common today: the Text Editor (`mgarlabx/edukors_text_editor`) and the Slides editor (`edukors_slides_editor`). Use them as examples; the demo in `demo/` follows the same contract.

### What Common provides

| Area | Where | Notes |
| --- | --- | --- |
| Shell: toolbar, tabs, side panels, status bar, Settings, Help | `src/shell/` | See [Common application shell](docs/common-shell.md) |
| Save, Open, Recent, Import, Export, Show in folder, close prompts, notices, opening indicator | `src/files/file-dialogs.js`, `src/shell/files.js`, `desktop/` | Real in the desktop app; simulated in memory in a browser |
| Formatting controls (block style, text, shape, alignment, lists, link, image, arrange) | `src/format/format-controls.js` | `EdukorsFormat.render(container, { groups, state, t, onChange, options })`; the app applies the changes and passes the selection's values back as `state` |
| Shapes catalog and picker | `src/shapes/shapes.js` | `EdukorsShapes.svg(style, width, height)` draws a shape as standalone SVG |
| Context menu | `src/menu/context-menu.js` | |
| Icons | `src/icons/` | [Icon library](src/icons/README.md); browse them in `demo/icons.html` |
| Markdown renderer (Help texts) | `src/markdown/markdown.js` | Builds DOM nodes, not HTML strings; links limited to http, https, mailto |
| QR codes | `src/qr/qr.js` | No dependencies |
| Document package (zip, OPC-like) | `src/package/package.js` | See [Edukors document package](docs/document-package.md) |
| Translations | `src/i18n/translations.js` | See [Translations](#translations) |
| AI assistant: runtime, host protocol, screens | `src/ai/` | See [AI assistant](docs/ai.md) |
| Electron host | `desktop/host.mjs`, `desktop/preload.cjs` | `startDesktopApp(options)` |

Shared UI code never calls Electron directly: desktop operations go through the host interface (`EdukorsDesktop` in the page).

## Rules every app follows

- **Every platform.** Apps run on macOS, Windows, and Linux. Labels never name a platform's tool ("Show in folder", not "Show in Finder"). Shortcuts use ⌘ on macOS and Ctrl elsewhere, and their labels follow the platform.
- **Desktop runtime: Electron.** One rendering engine everywhere, native JavaScript for the AI and MCP code, and the color eyedropper.
- **Documents are packages.** Every Edukors document is a zipped folder structured like DOCX/PPTX (Open Packaging Conventions): an XML skeleton, JSON content parts, and an `.e??x` extension (`.etex`, `.eslx`, `.egrx`). Use `EdukorsPackage`; see [Edukors document package](docs/document-package.md) and, as an example, [The Common demo's document file](docs/common-document-format.md).
- **Interface language is not content language.** The language preference changes only the interface (menus, buttons, tooltips, settings). It never translates or decides the language of documents, exports, or AI output.
- **Versions are release dates.** The app shows `v.YY.MM.DD` (for example `v.26.11.01`), set in `EdukorsAppConfig.version`; `package.json` holds the same date as `26.11.1`. Keep both the same.
- **Document commands** are hidden when no document is open, and disabled (visible, dimmed, focusable) when a document is open but the command cannot act. Edit commands start disabled; the app's editor enables them (`aria-disabled` on `#edit-actions .tool`) and handles their clicks.

## Translations

`src/i18n/translations.js` defines `EdukorsLanguages`: one entry per language with its native name (`name`) and its messages (`messages`), with the same keys in every language and one entry per line. The Settings language list is derived from it; to add a language, copy an entry, set its code and native name, and translate it.

On first use the interface follows the system locale (`pt-BR` → `pt`), falling back to English; a saved choice wins. Common owns the shared vocabulary (Save, Open, Settings, export format names, …). Composing app-specific dictionaries with namespaced keys and per-key English fallback is the agreed direction but is not implemented yet; for now an app reads `EdukorsLanguages` directly for its own lookups.

## Releasing an app

Releases happen only in the app's repository; Common has no secrets, releases, or installers. Each release uses the latest commit of Common's `main` and runs the app's tests against it first, so a Common change that breaks the app stops the release:

```yaml
- run: npm ci
- run: npm install --no-save "edukors-common-ux@git+https://github.com/mgarlabx/edukors_common_ux.git#main"   # latest Common
- run: npm ls edukors-common-ux                                                                             # which commit went in
- run: npm test
```

The app's workflow then builds, signs, notarizes, and publishes with the app's own secrets (see `.github/workflows/release.yml` in the Text Editor).

- **Packaging.** Common's `electron-builder.yml`, `tools/package.mjs`, and `build/` (icon, entitlements, MSIX tiles) are the model each app copies and adapts. Installers: DMG on macOS (universal), MSIX on Windows, AppImage on Linux. Declare the document types the app opens in `fileAssociations`. The Claude CLI bundled in the SDK is left out; the runtime uses the CLI the person installed.
- **Updates** are on by default and need nothing from the user. Name the app's repository in its `package.json`:

  ```json
  "edukors": { "updates": "owner/repo" }
  ```

  A packaged app checks GitHub's latest release ten seconds after starting and every six hours; a newer one shows a notice with Download, which opens the release page (nothing is downloaded or installed automatically). Not checked: unpackaged runs, Microsoft Store installs, and `EDUKORS_NO_UPDATES=1`.
- **Terms of use.** On first launch, and whenever `termsVersion` changes, the desktop app shows the terms (`help.termsOfUse`) with Decline and quit or Accept. `EDUKORS_ACCEPT_TERMS=1` skips them in automated tests of an unpackaged app.

## Working on Common

Requires Node.js 22.12 or later.

| Command | Does |
| --- | --- |
| open `demo/index.html` in a browser | The demo, with no installation; everything works except the AI assistant |
| `npm install` | Once, for the AI runtime and the desktop host |
| `npm run dev` | The demo served to a browser with the AI assistant connected (open the address it prints). Uses a development account registry with a fake AI service; `-- --shared` uses the real shared accounts |
| `npm run desktop` | The demo in an Electron window (`--shared`, `--data-dir <dir>`, `--verbose`) |
| `npm test` | All tests (`node --test`); no account needed |
| `npm run package` | A local installer of the demo in `release/`, to check packaging |
| `npm run icons` | Renders `build/icon.png` and the MSIX tiles from `build/icon.svg` |

- Automated tests that drive the AI must use `--data-dir` with an empty folder, never the person's development or shared accounts.
- CI (`.github/workflows/ci.yml`) runs the tests on every push to `main` and every pull request, because every commit on `main` reaches the next release of every app.
- Write documentation and code comments in English.

## Documentation

- [Common application shell](docs/common-shell.md): the shell's parts and the full [app integration](docs/common-shell.md#app-integration) contract.
- [AI assistant](docs/ai.md): layers, the agent's folder, settings, panel, conversations in the document, hosts, and testing without an account.
- [AI runtime](src/ai/runtime/README.md): the Node.js runtime API.
- [Edukors document package](docs/document-package.md): the package format and `EdukorsPackage`.
- [The Common demo's document file](docs/common-document-format.md): a complete example of an app's format.
- [Icon library](src/icons/README.md).

## License

MIT (`license` in `package.json`).
