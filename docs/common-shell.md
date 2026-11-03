# Common application shell — initial proposal

Status: reference analysis and proposal; not an implementation commitment.

## Reference observations

The original screenshots were deleted at the user's request on 2026-11-01; these observations remain the record. The closed-workspace screenshot showed an application with no open documents: a compact top toolbar, a muted branded workspace, and a bottom status bar with a version label. The open-workspace screenshot added document tabs, a contextual toolbar, left navigation, an editing workspace, and a right AI assistant panel.

The references used white surfaces, pale gray workspace backgrounds, thin borders, compact outline icons, and purple active accents. These are initial visual references rather than finalized design tokens.

## Proposed ownership

The common shell owns placement, visibility, focus behavior, and visual styling for shared regions. Each application supplies its identity, commands, document content, and contextual controls.

| Region | Common responsibility | Application contribution |
| --- | --- | --- |
| Application identity | Name, logo, version placement | Identity values and assets |
| Main menu | Menu structure and command presentation | Additional commands and handlers |
| Main toolbar | Shared groups, separators, enabled states | App-specific actions |
| Document tabs | Selection, close controls, modified indicator | Document identity and lifecycle handlers |
| Contextual toolbar | Optional placement | Formatting or editing controls |
| Left panel | Optional container and visibility | Navigation content |
| Workspace | Available space and empty state | Actual editor |
| Right sidebar | Optional container and toggle | Inspector or other app content |
| AI assistant | Proposed shared panel presentation | Context and future provider integration |
| Status bar | Layout | Save status, selection information, version |

The right sidebar and AI assistant have separate toolbar controls. In the demo both start closed and may coexist: the sidebar opens on the left of the workspace, the assistant on the right.

Labels are cross-platform (macOS, Windows, Linux): the notes' "Show in finder" is labeled "Show in folder".

## Menu inventory

Transcribed from the original menu notes (since deleted; this transcription is complete).

- App name: About, Settings, Quit.
- File: New, Open, Recent; Save, Save as; Show in folder, Export, Import; Close tab.
- Edit: Undo, Redo; Cut, Copy, Paste; Duplicate, Delete; Select all.
- View: contents to be defined.
- Insert: application-provided contents.
- Window: contents to be defined.
- Help: Quick guide, Full guide, Terms of use (a tabbed modal sheet, as in Slides; the website is reached through the toolbar logo).

Semicolons indicate the separator groups in the source notes. Decided 2026-11-02: no full menu. macOS gets a minimal application menu (app menu, Edit, Window; see [AI assistant](ai.md#electron-host), "Menu"), because Electron's default would close the window on Cmd+W and text fields need the Edit menu for their shortcuts; Windows and Linux get no menu bar. The toolbar holds File and Insert. Import is a toolbar command (see the README, "Save, Open, Export, and Show in folder").

## Toolbar inventory

Transcribed from the original toolbar notes (since deleted; this transcription is complete).

- File group: New, Open, Recent, Save, Show in folder, Export.
- Edit group: Undo, Redo; Cut, Copy, Paste, Duplicate, Delete.
- Trailing common actions: Settings, Help.
- Right-aligned actions: Right sidebar, AI assistant.

Applications may contribute additional actions. Slide playback and slide-specific controls visible in the screenshot do not belong in the mandatory common toolbar.

## Proposed first local demo

Build a standalone shell with two inspectable states:

1. No document: application identity, basic toolbar, empty workspace, status bar.
2. Sample document: tabs, optional contextual toolbar, placeholder navigation and workspace, toggleable right panels.

The sample document is only a shell fixture, not a text editor. Opening and closing sample tabs, switching tabs, and toggling panels should work. Document commands are hidden when no document is open. With a document open, commands unavailable in the current state are shown disabled: Export and Show in folder until the first save, and Edit commands without history, selection, or clipboard content. In the closed workspace, hide Save, Export, and Show in folder; keep New, Open, Recent, Settings, and Help visible. During the visual prototype stage, these visible controls may remain placeholders with explanatory tooltips. The AI assistant is real since session 4 (see [AI assistant](ai.md)); it needs the development host or, later, Electron. Saving and exporting are simulated in memory only, since session 3, to define their screens (see the README, "Save, Export, and Show in folder"); nothing is written to disk.

Start by validating layout and interaction locally. File formats, real editing, AI execution, packaging, and legacy migrations remain outside this first demo.

## Architecture constraints and open decisions

- No npm publication is required for local consumption.
- Keep the shell independent of direct Electron or Tauri calls; desktop operations should be supplied through a small host interface when needed.
- Use a shared command definition for menu and toolbar actions so labels and availability stay consistent.
- Select the frontend stack and local development command before implementing the demo.
- Select cross-repository dependency and bundling mechanics later, with a real consumer.
- Runtime: Electron, decided 2026-11-01. Reasons: a single rendering engine (Chromium) on every platform, so the editors' `contenteditable`/`execCommand` text, SVG shadows and filters, and slider panels behave the same everywhere; the color eyedropper (EyeDropper API) works; the AI and MCP code runs in JavaScript in the main process. Cost: install size (about 100 MB or more per app) and memory. The Slides editor already uses Electron; the Graph editor uses Tauri 2 (WKWebView, WebView2, WebKitGTK) and is not migrated now. If an app ever runs on Tauri, hide the eyedropper there (as the library already does) and re-test rich text and visual details in WebKit.
- Confirm panel coexistence, resizing, and persistence behavior incrementally.

## Canvas objects and contextual toolbars

The demo canvas and its contextual toolbars are described in the README ("Sample canvas, editing, and context menu" and "Shared formatting controls"). Ownership: Common owns the object behaviors shared by apps (selection, move, resize, crop, align and distribute, context menu, formatting groups, shapes, QR images); each app chooses what it enables through `EdukorsAppConfig.canvas` and `contextualToolbar` and supplies the real content model.

## Document package

Documents are zipped packages structured like DOCX/PPTX. See [Edukors document package](document-package.md).

## Confirmed update policy

All apps automatically check for updates by default, without requiring users to enable the feature. The shared foundation owns this policy; each application's release source and runtime integration will be supplied later. Automatic downloading and installation are not yet specified. No update checking is implemented in the visual demo.

## Interface language and content language

The application language preference applies only to interface text, such as menus, buttons, tooltips, and settings. It must not translate, rewrite, or determine the language of documents, slides, generated content, or exports. Users may work with content in any language regardless of their interface language. For example, an English interface may be used to author and export Portuguese slides.

Future spellchecking, document language metadata, and AI output language must be configured or inferred independently from the interface preference. Do not use the interface locale as an implicit instruction for generated content.

## Shared and application-specific translations and icons

Confirmed direction for future app integration:

- The common repository owns translations for shared interface elements, such as Settings, Open, Save, appearance, and interface language.
- Each application owns dictionaries for its domain-specific vocabulary, with translations organized by language.
- Compose the common and application dictionaries locally. Use namespaced keys such as `common.save`, `slides.newSlide`, and `graph.newNode` to prevent collisions.
- If a key is missing in the selected language, fall back to that key's English text without changing the rest of the interface language. Each dictionary must provide English text for its keys.
- The common icon library owns shared interface icons. Each application may supply its own domain-specific icons using distinct identifiers.
- Promote an app-specific icon to the common library when it becomes useful across applications.
- The current 99-icon collection is a reference catalog imported from Graph and Slides. Its final division into shared and app-specific assets is still pending.

Implementation status: the common translation registry and icon catalog exist. Dictionary composition, namespaced translation lookup, per-key English fallback, and app-specific icon registration are not implemented yet. These are requirements for the future integration layer, not claims about current behavior.

## App integration

Decided 2026-11-02, with the Text Editor as the first app built on Common. An app installs Common from GitHub (`"edukors-common-ux": "git+https://github.com/mgarlabx/edukors_common_ux.git#main"`, with `allow-git=root` in its `.npmrc`; see the README) and gets only `src/` and `desktop/` (`files` in Common's `package.json`). It supplies four things:

1. **Its page** (`index.html`): its configuration, then the shell's entry point with the app's own scripts:

   ```html
   <script src="app-config.js"></script>
   <script src="node_modules/edukors-common-ux/src/shell/boot.js" data-app="document.js assistant.js"></script>
   ```

   `src/shell/boot.js` adds the stylesheet and the markup (title bar, toolbar, tabs, panels, status bar, Settings, Help) and loads, in order: Common's libraries, the shell (`src/shell/*.js`), the AI screens, the app's scripts, and the shell scripts that need the app (`desktop-menu.js`, `desktop-app.js`). When Common adds or reorders a file, apps do not change.
2. **Its configuration** (`EdukorsAppConfig`): `name`, `version` (`v.YY.MM.DD`), `termsVersion`, `help` (Markdown by language), `file` (`extension`, `exportFormats`, `importFormats`), `insert` (the Insert buttons it offers: `text`, `shape`, `image`), and, for a canvas, `canvas` and `contextualToolbar` (a canvas app may name its Insert buttons in `canvas.insert`). Without either list the Insert group is left out; without `exportFormats` Export is hidden. Insert buttons start unavailable and the app handles their clicks.
3. **Its document** (`EdukorsAppDocument`, defined by one of its scripts):

   | Member | Used by | Does |
   | --- | --- | --- |
   | `toBytes(doc, { name })` → `{ bytes }` | Save | the document as a package (`EdukorsPackage.write`) |
   | `fromBytes(bytes)` → content | Open, Recent | reads and checks a file; throws an Error with a message for the person |
   | `adopt(doc, content)` | Open, Recent, Import | puts content into a new document tab (and its AI conversations) |
   | `exportPage({ title })` → `{ html, width, height }` | Export (optional) | the page as one self-contained HTML document |
| `exportFile({ doc, format, title })` → `{ html, width, height }` or `{ data }` | Export (optional, takes precedence) | HTML for `html`, `pdf`, `png` (the host prints PDF and PNG), or ready text or bytes for `md`, `txt`, `docx` |
   | `importFile({ format, name, extension, bytes, t })` → content | Import (optional) | converts another format, checked as strictly as a file |
   | `selectAll()` | Select All (optional) | selects everything in the document |

   Export formats Common knows: `html`, `pdf`, `png` (from the page's HTML; the host prints PDF and PNG) and `md`, `txt`, `docx` (bytes or text the app makes); the host writes only the formats the app lists in `startDesktopApp({ exportFormats })`, and the Export screen names them with the shared translations (`export<Id>`, `export<Id>Desc`). Import formats are the app's own ids (`import<Id>` names them; Common has names for `image`, `markdown`, `md`, `html`, `text`, `docx`, `pdf`).

   `sidebar: false` leaves out the left sidebar (its panel and its toolbar toggle) in an app that has nothing to show there.

   `file.importCommand: false` hides Import while keeping `importFormats` (an app that opens those formats directly with `openExtensions` needs no Import). Open, Import, and the Save screen start in the last folder a file was opened from or saved to, which the desktop host keeps across sessions (`last-folder.json` in the app's data folder; the documents folder at first or when it is gone).

   Edit commands start unavailable; the app's editor enables them (`aria-disabled` on `#edit-actions .tool`) and handles their clicks.
4. **Its main process** (`desktop/main.mjs`):

   ```js
   import { startDesktopApp } from "edukors-common-ux/desktop/host.mjs";
   startDesktopApp({ appId: "text", name: "Edukors Text Editor", root: <the app folder>, documentExtensions: [".etex"], exportFormats: [] });
   ```

   With `openExtensions` (for example `[".docx", ".md", ".txt", ".pdf"]`), Open and Recent also accept files of those formats: the page converts them with `EdukorsAppDocument.importFile` (the format found in `file.importFormats`) into a document named after the file, in its folder. Formats the app can write back are saved into that same file: the app maps import formats to export formats in `file.saveOriginal` (for example `{ docx: 'docx', md: 'md', text: 'txt' }`) and lists their extensions in `startDesktopApp({ saveExtensions })`; the first Save of such a document asks ("Save as DOCX", or "Save as .etex…", or Cancel), and the host writes a foreign format only into a file that was opened (it is in Recent). Other formats (a PDF opened as text) have no file of their own: Save asks for a name and saves in the app's format, and the original is never written.

   Documents the system opens (double-click in Finder or Explorer, Open With, a file dropped on the app's icon) open in a tab, like a file picked in Open (and enter Recent): the host takes macOS's `open-file` and, on Windows and Linux, the paths in the arguments; a packaged app runs as one copy, which receives the paths of later launches. The installers declare the association (`fileAssociations` in the app's `electron-builder.yml`).

   `desktop/host.mjs` runs everything the apps share: AI, files, Recent, import and export (only the extensions the app lists), the macOS menu, the title bar, terms, and update checks (the app's `package.json`: `"edukors": { "updates": "owner/repo" }`). Unpackaged runs accept `--shared`, `--data-dir <dir>`, and `--verbose`; `EDUKORS_ACCEPT_TERMS=1` skips the terms in automated tests of an unpackaged app.

### Shared behaviour apps rely on

- **Opening indicator** (`EdukorsLoading`, `src/shell/files.js`): from the moment a file is chosen (Open, Recent, Import, or a document the system opens) until the document is open or the attempt failed, an animated "Opening “name”…" card shows in the middle of the window (after 150 ms, so small files do not flash). The host announces the file (`edukors:files:loading`, `EdukorsDesktop.files.onLoading`); the page ends it. An app with a long load of its own calls `const end = EdukorsLoading.begin(name)` and `end()` when done; several may overlap.
- **Side panel widths**: both side panels have a handle on their inner edge (drag; arrows, Shift for 40 px, Home, End; double click restores the default). The sidebar goes from 200 to 520 px, the assistant from 300 to 900 px, and the workspace keeps at least 360 px. Widths are remembered per panel (`localStorage`, `edukors.common.panel-width.<panel>`).
- **Export and existing files**: when the exported file already exists, the Export screen says so and offers Replace or Cancel (the name is the document's, so there is no other name to choose); `commit` is called again with `replace: true`. The desktop host checks before rendering. An app with its own export `commit` returns `{ exists: true }` when the file exists and `replace` is not set.
- **Menus and pickers close on a press outside them** (context menu, shapes, format bar, assistant menus) through a `pointerdown` listener on the page. A press inside an `<iframe>` never reaches the page, so an app whose canvas is an iframe relays it: it dispatches a `pointerdown` (bubbling) on the iframe element when the frame reports a press. Slides does this.

The Common demo is built the same way (`demo/index.html`, `demo/app-config.js`, `demo/document-file.js` with its `EdukorsAppDocument`, `desktop/main.mjs`).
