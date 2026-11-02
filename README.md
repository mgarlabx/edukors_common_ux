# EDUKORS Common UX

Shared application foundation for EDUKORS apps.

## Confirmed direction

- Develop the common foundation first. Work on `edukors_text_editor` is deferred.
- Keep shared code in this repository and application-specific code in separate repositories.
- Combine shared and application-specific code locally when building an application bundle.
- Do not require publishing packages to npm. Integration (decided 2026-11-02): Common is a public GitHub repository (`mgarlabx/edukors_common_ux`) and is never installed by itself; it is only the base of the apps. Each app depends on it as `"edukors-common-ux": "git+https://github.com/mgarlabx/edukors_common_ux.git#main"`: the latest commit of Common's `main` branch (decided 2026-11-02; no tags needed, so every change pushed to `main` reaches the next deploy of every app). Use the `git+https` form, not `github:`: with `github:` the lock file records an SSH address, and `npm ci` fails on CI machines without an SSH key. npm 12 refuses git dependencies by default, so each app also needs an `.npmrc` with `allow-git=root` (only git dependencies named in the app's own `package.json`). Checked 2026-11-02 with a throwaway app: install from `main`, the lock file pins the commit over HTTPS, `npm ci` works without SSH, and Common's development dependencies (Electron, electron-builder) are not installed. Locally, `npm link ../edukors_common_ux` makes the app use the sibling folder live.
- Deploying an app happens only in the app's repository, and every deploy uses the latest commit of Common's `main` (nothing to change in the app, no pull requests). Push to Common's `main` only what is ready for the apps. The app's release workflow builds, signs, notarizes, and publishes with the app's own GitHub secrets (Apple, Partner Center); Common has no secrets, releases, or installers. Before building, the workflow replaces the locked Common with the latest `main` commit and runs the app's tests, so a Common change that breaks the app stops the deploy:

  ```yaml
  - run: npm ci
  - run: npm install --no-save "edukors-common-ux@git+https://github.com/mgarlabx/edukors_common_ux.git#main"   # latest Common commit
  - run: npm ls edukors-common-ux                                                                             # which Common commit went in
  - run: npm test
  ```
 Each app checks for updates against its own releases (`"edukors": { "updates": "owner/repo" }` in its `package.json`). What Common hands to apps (paths under `node_modules/edukors-common-ux/`, the Electron host modules the app's main process imports, a `files` list in `package.json`) is settled with the first app that consumes it.
- Keep local development and visual inspection simple.
- All applications automatically check for updates by default; users should not need to enable this behavior.
- Premise: every application runs on macOS, Windows, and Linux. Interface labels must not name platform-specific tools (for example, "Show in folder", not "Show in Finder"). Shortcuts use ⌘ on macOS and Ctrl on Windows and Linux, and their labels follow the platform. In the desktop app the page's title bar is the window's title bar, with the system's own buttons over it (macOS traffic lights on the left; minimize, maximize, and close on the right on Windows and Linux); the decorative macOS-style controls remain only in the browser preview.
- Every Edukors document is a zipped folder (package) structured like DOCX/PPTX (Open Packaging Conventions) to ease import and export: an XML package skeleton, JSON content parts, and `.e??x` extensions (`.egrx`, `.eslx`, `.etex`). See [Edukors document package](docs/document-package.md); the package layer exists in `src/package/package.js` (tested with `node --test`), and the demo's document uses it (`demo/document-file.js`, `.ecmx`; see [The Common demo's document file](docs/common-document-format.md)) when run in the desktop app.
- Use `edukors_graph_editor` and `edukors_slide_editor` as references; migrate legacy applications later.
- Desktop runtime: Electron (decided 2026-11-01). One rendering engine (Chromium) on macOS, Windows, and Linux, native JavaScript for the AI and MCP code, and full support for the color eyedropper. The cost is a larger install. The Graph editor currently uses Tauri; its migration is out of scope for now. Shared UI code must stay independent of direct Electron calls: desktop operations go through a small host interface.
- Write project documentation and development notes in English; discuss the project with the user in Portuguese.

## Proposed starting point

Provide a standalone local demo within this repository so shared interface elements can be viewed and developed before any application consumes them. This is a proposal, not an implemented feature.

Candidate shared elements include the application shell, menus, toolbars, panels, dialogs, themes, and preferences. Their exact scope will be agreed incrementally.

Keep application-specific editing behavior outside the common foundation. Consider isolating desktop capabilities such as file access and window management from shared UI code.

## Next steps

1. Review the visual reference observations and the menu and toolbar inventories in [Common application shell](docs/common-shell.md).
2. Agree on a small first version of the common interface and its local demo.
3. Choose the minimum tooling needed to run and inspect that version locally.
4. Define local cross-repository integration when a consuming application is introduced.

## Reference material

The original screenshots (closed and open workspace) and the menu and toolbar notes were deleted at the user's request on 2026-11-01. Their observations and full transcriptions are kept in [Common application shell](docs/common-shell.md).

The initial analysis and proposed demo scope are recorded in [Common application shell](docs/common-shell.md). No implementation stack or desktop runtime has been chosen.

## Local visual preview

Open `demo/index.html` directly in a browser. No installation, build, network access, or npm publication is required. Everything works this way except the AI assistant, which needs Node.js: run `npm install` once and `npm run dev`, then open the address it prints (see [AI assistant](#ai-assistant)).

The first preview implements only the closed workspace appearance, based on the original closed-workspace screenshot (see [Common application shell](docs/common-shell.md#reference-observations)). In the closed workspace, document-dependent commands (Save, Export, Show in folder) are hidden. New, Open, Recent, Settings, and Help remain visible (Open and Recent are real in the desktop app; see "Save, Open, Export, and Show in folder"). Settings opens the preferences dialog. In the browser preview the window controls are decorative; in the desktop app they are the system's own. The logo was copied from `edukors_slides_editor/src/ui/edukors-logo.svg`. The title is Common and the preview version is v.26.11.01.

This dependency-free HTML/CSS/JavaScript fixture does not select the eventual application framework or desktop runtime.

The main toolbar wraps onto more rows when space runs out (narrow windows or large font sizes), so every command stays reachable (checked down to 360 px at 200%). A tab shows a dot instead of its close icon while the document has unsaved changes, that is, differs from its saved content; hovering or focusing the tab shows the close icon again, and undoing back to the saved content clears the dot. Visible toolbar icons show their English action labels in tooltips on pointer hover and keyboard focus.

The enlarged toolbar logo links to `https://edukors.org` in a new tab and includes a hover/focus tooltip.

## Open documents preview

New (toolbar) and the + button in the tab row open sample document fixtures named Untitled, Untitled 2, and so on (translated). Nothing is created on disk. While a document is open, a tab row appears below the toolbar, the watermark is replaced by a neutral placeholder page, and Save, Export, and Show in folder appear (still placeholders). Export and Show in folder need a file on disk, so they stay disabled (visible, dimmed, focusable, with a "Save the document first" tooltip) until the document has been saved once. The same applies to the Edit group (Undo, Redo; Cut, Copy, Paste, Duplicate, Delete), which appears between the File and Settings groups while a document is open, with each command disabled when unavailable. Each command is enabled when it can act on the selection, history, or clipboard of the sample canvas (see below). Rule: document commands are hidden when no document is open, and disabled (visible, dimmed, focusable, inactive) when a document is open but the command is unavailable. Sample documents are never saved because saving is not simulated. Each tab has a close button (tooltip "Close"; accessible name "Close <document>"); middle click also closes. Left/Right arrows, Home, and End move between tabs. Closing the active tab selects its right neighbor, or its left one; closing the last tab returns to the closed workspace and resets numbering. Tabs shrink with ellipsis when space runs out, showing the full name on hover. The left side of the status bar shows the save state of the active document ("Unsaved", with an amber file icon; "Saved" once real saving exists). It does not repeat the document name, which appears only in the tab, and it is empty with no document open. Below the tabs, a full-width contextual toolbar appears only while something is selected, and shows only the groups for that kind of selection. It lies over the top of the content with a light shadow instead of pushing the content down, and slides in and out (200 ms; no animation when reduced motion is requested); the content never moves. Apps map selection kinds to shared formatting groups with `contextualToolbar` in `demo/app-config.js`; the demo uses text → text, alignment, vertical alignment, lists, link; shape → shape; image → image. The sample page (`demo/sample-document.js`) has three selectable objects (text, shape, image). Click or Enter selects; Esc or a click on an empty area deselects. Text can be selected and edited to test that toolbar controls keep the text selection. Control changes are reflected on the sample objects so their effect is visible, and each document keeps its own selection and values.

## Shared formatting controls

Formatting patterns repeat across apps, so Common owns them in `src/format/format-controls.js` (`EdukorsFormat.render(container, { groups, state, t, onChange, options })`), modeled on the Slides format bar:

- `text`: bold, italic, underline, strikethrough, subscript and superscript (one at a time), font size, font family, text color.
- `shape`: line width, line style (solid, dashed, dotted), line color, fill (including no fill), shadow, keep proportions, opacity.
- `align`: left, center, right, justify (one at a time).
- `lists`: bulleted or numbered (one at a time; pressing the active one turns lists off).
- `link`: a popover with the link address, Apply, Remove link, and Create QR code. Create QR code does not touch the text: it reports the `createQr` action with the address, and the app adds a QR image (`src/qr/qr.js`, no dependencies) that behaves like any other image. The panel slides left so it stays inside the window. Only http, https, and mailto are accepted; a bare domain such as `edukors.org` becomes `https://edukors.org`. Other schemes, such as `javascript:`, are rejected with a message. The address field takes focus, so the app must keep its selection while the popover is open.
- `valign`: top, middle, bottom (one at a time).
- `image`: Replace image (reported to the app as the `replaceImage` action; the demo opens the system file browser), Crop (toggle), keep proportions, border (line width, style, and color, as in `shape`), shadow, and opacity.
- `arrange`: bring to front, send to back (actions the app handles). The bar shows them at its right end.

Controls use icons with tooltips instead of text labels (line width, line color, fill, shadow, keep proportions, opacity). Opacity, font size, and line width choose their value in a panel with a vertical slider (largest value at the top) that opens on click: the slider reports while dragging and applies on release; font size and line width can still be typed. Keep proportions is on by default for images and shapes and is observed while resizing. When the contextual toolbar wraps at large font sizes, a separator can land at the start of a row.

Font size and line width are combo boxes: type a value (Enter or leaving the field applies; decimal commas accepted; values are rounded and clamped to 1–400 for font size and 0–50 px in 0.5 steps for line width; invalid input restores the previous value) or open the slider panel with the arrow beside the field. Colors come from a shared 15-color palette, a #RRGGBB code field, and an eyedropper that picks a color anywhere on the screen. The eyedropper uses the EyeDropper API, available in Chromium (Electron, Windows WebView2) but not in WebKit (Tauri on macOS and Linux); the button is hidden where the API is missing, which no longer matters for the runtime, because Electron is chosen (it would matter again only if an app moved to Tauri). Dropdowns are custom listboxes, not native selects. With the mouse, buttons and menus never take the focus, so an app's text selection stays selected (verified with the editable sample text). With the keyboard, focus moves into menus and returns to the control after a change. Typed fields (sizes, color code, link, alt text) necessarily take the focus. Keyboard: arrows, Home, End, Enter, and Escape (focus returns to the trigger). The library only reports changes through `onChange`; each app applies them to its content and passes the selection's values back as `state`. Apps may override font sizes, font families, line widths, and line styles through `options`. The toolbar wraps onto a second row when space runs out. 

## Save, Open, Export, and Show in folder

These screens define how the commands look and behave. In the desktop app (`npm run desktop`) the work is real: Save and Open write and read the document as an Edukors package (`.ecmx`, see [The Common demo's document file](docs/common-document-format.md)), Choose opens the system's folder picker, Export writes the web page, PDF, or PNG next to the document, Show in folder opens the system's file manager, and closing the window with unsaved changes asks first. In a browser the work is simulated in memory (`src/shell/files.js`), and nothing is written to disk. The screens are shared in `src/files/file-dialogs.js` (`save`, `exportAs`, `confirmClose`, `toast`); the host supplies a `commit` function and, later, the real folder picker. Choose in the Save screen is a disabled placeholder for that picker (Export has no folder choice).

- **Save** (toolbar, Cmd/Ctrl+S): the first save opens a screen with the name (and the app's extension, `.ecmx` here), the folder, a hint, Cancel, and Save. Later saves ask nothing and show a notice. Cmd/Ctrl+Shift+S opens the same screen as Save as. Names are checked for characters and reserved names the systems do not allow; an existing file asks "Replace it?" (Replace or Choose another name); a failure keeps the screen open and says why. After saving, the tab takes the file name, the status bar reads Saved, the tab's dot goes away, and Export and Show in folder become available.
- **Export**: a list of the formats the app offers, in the order of `EdukorsAppConfig.file.exportFormats` (the demo uses web page, PDF, and PNG as placeholders). The first one, web page (HTML), is always preselected, even after another format was used before. The screen has no name or folder fields: an export always goes next to the original file, with the same name and the format's extension. There is a progress bar while it works, and exporting again overwrites the previous export without asking. A failure keeps the screen open and says why. It stays disabled until the document is saved once.
- **Recent** (toolbar): a menu under the button with the ten documents saved or opened most recently, newest first: the name, and the folder below it (the home folder shown as `~`; the full path in the tooltip), then Clear list. With none, it says "No recent documents". Choosing a document that is already open switches to its tab; otherwise it opens. A file that is no longer there is marked "Not found"; choosing it says so and removes it from the list. In the desktop app the host keeps the list (`recent.json` in this app's data folder), adds a file only after a real save or open, and opens from it only paths it holds, so the page cannot use Recent to read other files. In a browser the menu lists what was "saved" while the page is open and can only switch to a document that is still open. The list is the app's own; the system's recent-documents lists (macOS Dock, Windows jump lists) are not filled yet.
- **Import** (toolbar, after Recent; works in the desktop app and in the browser): opens another kind of file as a new, unsaved document named after it. The app lists its formats in `EdukorsAppConfig.file.importFormats` and supplies a converter for each (`demo/importers.js`, `EdukorsImporters`); the converted content is checked like a document file being opened (`parseState`), so an import cannot put into a document anything a saved file could not. The demo imports images (PNG, JPEG, GIF, WebP, SVG; one picture, centered, as large as fits in 80 % of the page with its proportions; animations play) and Markdown or plain text (one text box with headings, paragraphs, lists, quotes, table rows as lines, bold, italic, code, and links; raw HTML stays text). In the desktop app the system's dialog offers "All supported files" and one filter per format; the host reads only the extensions it lists itself (`IMPORT_EXTENSIONS` in `desktop/main.mjs`, 50 MB) and never tells the page the folder. The imported file does not enter Recent (the document has no file until it is saved). Without formats or converters the button is hidden. Other apps add their own converters (for example PPTX in Slides).
- **Show in folder**: no screen of its own. A notice says what would happen (the browser cannot open a file manager); notices from Save and Export carry a Show in folder button.
- **Closing a document with unsaved changes** asks "Save changes to …?" with Don't save, Cancel, and Save (Save opens the Save screen first if the document has no file yet). A document with no changes closes without asking.
- **Status bar**: Unsaved (never saved), Saved, or Unsaved changes (saved, then edited).
- **Notices** (toast): bottom centre, announced to screen readers, closable, six seconds; a new one replaces the previous one.
- To see the other states in this preview, save the document as `existing` (replace prompt) or `error` (failure; a document saved as `error` also fails to export).

## Side panels

While a document is open, two right-aligned toolbar toggles show the Sidebar and the AI assistant. Both start closed. The Sidebar opens on the left of the workspace (its icon shows a left panel) and holds a placeholder for application content; the assistant opens on the right. Both may be open together and both have close buttons. The document name appears only in its tab. The assistant panel holds the conversation with the AI agent (see [AI assistant](#ai-assistant)). Panels slide open and closed (220 ms width transition; content keeps its final width so it does not reflow). Closed panels are inert. The animation is disabled when the system requests reduced motion. Panel state is kept in memory only.

## Shapes

Insert shape opens a grid of ten shapes (rectangle, rounded rectangle, ellipse, triangle, right triangle, diamond, pentagon, hexagon, arrow, star), as in Slides. The catalog and picker live in `src/shapes/shapes.js`; the picker opens under the toolbar button or at the pointer when started from the context menu. Shape objects keep their type in `shapeType`. Changing the type of an existing shape is not available yet.

## Shared icons

The toolbar now consumes the local [icon library](src/icons/README.md), imported from Graph and Slides. Open [the icon gallery](demo/icons.html) to compare all 99 imported source variants and the icons drawn in Common and filter them by name or app.

## Version format

The footer version uses `v.YY.MM.DD`, with two digits per field and the `v.` prefix (for example, `v.26.11.01` for November 1, 2026). It represents the release date, not the date on which the application is opened.

## Settings preview

Settings is a native HTML modal dialog with keyboard focus containment, Escape dismissal, and focus return to its trigger. Theme (System, Light, Dark), interface font size (80–200%, adjusted in 10-point increments with minus/plus buttons or Cmd+Shift+Minus/Plus), and language (English, Portuguese, Spanish, Simplified Chinese, Hindi) apply immediately. Preferences are stored in browser localStorage under `edukors.common.preferences`; saving is silent, and only storage failures are reported in the dialog. Font size affects interface text, not document content or branding. System theme follows OS changes. This is browser-local persistence, pending future desktop integration.

Settings uses the Slides editor’s wide dialog layout with a left navigation sidebar and independently scrolling content. Interface (formerly Application) contains theme, font size, and language, without a section heading. AI assistant contains Accounts and Advanced (instructions, MCP servers, skills); see [AI assistant](#ai-assistant).

Interface icons and their button areas follow the font-size percentage, including toolbar, Settings navigation, close control, and assistant placeholder. The toolbar Edukors logo also follows it, at the user's request; the workspace watermark remains fixed.

The font percentage is directly editable. Enter or leaving the field applies and saves the value; values are rounded to whole percentages and clamped to 80–200%. Empty or invalid input restores the previous value.

Theme selection uses three mutually exclusive buttons (System, Light, Dark), with the selected preference visually pressed and exposed through aria-pressed.

## AI assistant

Common owns the AI assistant shared by every app: the runtime refactored from `edukors_ai_cli` 0.2.2 (`src/ai/runtime`, plain JavaScript; that repository is unchanged), a host protocol independent of its transport, and the screens (`src/ai/ui`): Settings → AI assistant (the account used in this app; shared accounts, one line each, with sign-in, status, usage, rename, remove, and installation help; this app's instructions, MCP servers with validation and a connection test, and skills added from ZIP files or deleted) and the assistant panel, laid out as in Slides (conversation history per document, review-before-applying or apply mode, model and effort menu, the app's tools as undoable changes, authorization of every MCP call, questions, Stop, usage and tokens). Skills belong to the app; conversations belong to the document and are saved inside its package. The demo lets the agent read and change the sample page, including inserting and replacing images and animations (from a file in the document's folder, a web address, or SVG markup).

To try it: `npm install` once, then `npm run dev`, and open the address it prints. By default the accounts are kept in a development registry apart from the other EDUKORS apps, with a fake service for testing without an account; `npm run dev -- --shared` uses the real shared accounts. `npm run desktop` opens the same demo in an Electron window with the assistant connected (see [AI assistant](docs/ai.md#electron-host)). Opened as a file in a browser, the demo explains that the assistant needs the desktop app. Details, test keywords, and the next step (the Electron host) are in [AI assistant](docs/ai.md).

## Installers, updates, and terms of use

Common is never installed by itself; its packaging files are the model each app copies and adapts, and `npm run package` builds the demo only to test the shared base locally. It builds the installer of the system it runs on into `release/` (`electron-builder.yml`, `tools/package.mjs`; the app is assembled in a temporary folder because Dropbox's file attributes break code signing): a DMG on macOS (universal), an MSIX on Windows, an AppImage on Linux. The icon is drawn in `build/icon.svg`; `npm run icons` renders `build/icon.png` and the MSIX tiles in `build/appx/`. The CLI copy bundled in the Claude SDK is left out (the runtime uses the CLI the person installed).

- **Signing:** on macOS the "Developer ID Application" certificate in the keychain signs the app; notarization runs when `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` are set in the environment (never in files). The MSIX needs the Microsoft Store identity (Partner Center) in `electron-builder.yml` (the values there are placeholders) or a code-signing certificate.
- **Versions** are release dates: `package.json` 26.11.1 is `v.26.11.01` in the app (`demo/app-config.js`); keep both the same.
- **Updates** (on by default in every app, nothing to enable): a packaged app asks GitHub for the latest release of the repository it names in its `package.json` (`"edukors": { "updates": "owner/repo" }`; Common names none, so its demo never checks) ten seconds after starting and every six hours (`desktop/updates.mjs`); a newer release shows a notice with Download, which opens the release page. The app downloads and installs nothing. Not checked: unpackaged runs, Microsoft Store installs (the Store updates them), and `EDUKORS_NO_UPDATES=1`. Drafts, pre-releases, and links outside the repository are ignored.
- **Terms of use:** on first launch, and again whenever `termsVersion` in `demo/app-config.js` changes, the desktop app shows the app's terms (`help.termsOfUse`) in a window with Decline and quit and Accept; it has no close button and ignores Escape. The accepted version is kept in the app's data folder (`terms.json`). The browser preview does not ask.

## Translations

Edit `src/i18n/translations.js` to update shared interface translations. Each language entry contains its native display name (`name`) and translations (`messages`), with matching message keys and one entry per line. To add a language, copy an entry, set its language code and native name, and translate its messages. The language selector and accepted preference values are derived automatically from this registry; no HTML or Settings changes are required. Settings and toolbar labels, descriptions, status messages, section titles, and font-size accessibility labels are read from this catalog. The HTML retains initial English fallback text before scripts apply the selected language. Load the catalog before `settings.js`; no server or fetch is required.

On first use, the interface defaults to the host locale exposed by `navigator.language`. Regional variants resolve to their base language (for example, `pt-BR` → `pt`). If unsupported, English is used. A valid saved user selection takes priority. Native desktop locale detection can replace the browser locale when the runtime is integrated.

## Interface language and content language

The application language preference applies only to interface text, such as menus, buttons, tooltips, and settings. It must not translate, rewrite, or determine the language of documents, slides, generated content, or exports. Users may work with content in any language regardless of their interface language. For example, an English interface may be used to author and export Portuguese slides.

Future spellchecking, document language metadata, and AI output language must be configured or inferred independently from the interface preference. Do not use the interface locale as an implicit instruction for generated content.

## Application extensions

Future applications will supply their own namespaced translation dictionaries and specific icons, composed locally with the common libraries. Shared interface vocabulary and icons belong here; domain-specific assets belong in the consuming app. Missing translations will fall back per key to English. See [Shared and application-specific translations and icons](docs/common-shell.md#shared-and-application-specific-translations-and-icons) for the agreed direction and implementation status.

## Help

The toolbar Help button opens a modal sheet modeled on the Slides editor: Quick guide, Full guide, and Terms of use tabs, with the application name and version on the right of the tab bar. Texts are Markdown supplied by the consuming application in `demo/app-config.js` (this prototype), keyed by interface language with English fallback. A tab without text is hidden; if no tab has text, the Help button is hidden. The demo texts are explicitly labeled placeholders, not real guides or legal terms. The shared renderer `src/markdown/markdown.js` supports headings, paragraphs, lists, tables, quotes, bold, italic, code, and links; it builds DOM nodes rather than HTML strings, and links (http, https, mailto only) open in a new tab. Arrow keys, Home, and End switch tabs; Escape and the close button dismiss the dialog and restore focus. The Edukors.org website remains reachable through the toolbar logo, as in Slides.

The application name and footer version are also read from `demo/app-config.js`. The window title and titlebar show only the application name.

## Sample canvas, editing, and context menu

The demo document (`demo/sample-document.js`) is a small canvas fixture for testing shared behavior, not an editor. Each document keeps its own objects, selection, history, and clipboard.

- **Objects:** text, shape, and image, positioned in percent of the canvas. They can be moved (drag or arrow keys; Shift for larger steps), resized with 8 handles (one object at a time), multi-selected (Shift/Cmd/Ctrl-click, a rectangle, or Cmd/Ctrl+A), and stacked (bring to front, send to back).
- **Edit and Insert groups:** Cut, Copy, Paste, Duplicate, Delete work on objects and on selected text; unavailable commands are disabled. Insert offers text, shape, and image. Links are not inserted separately: they live inside text, through the link control.
- **Undo/redo:** a per-document history (up to 100 steps; typing and arrow moves group by a 700 ms pause). Shortcuts are ⌘/Ctrl+Z and ⇧⌘Z (Ctrl+Y on Windows and Linux).
- **Context menu** (`src/menu/context-menu.js`): right-click, the ContextMenu key, or Shift+F10. On objects: Cut, Copy, Paste, Duplicate, Delete, Bring to front, Send to back, Edit text. With several objects selected it also offers Align top, middle, bottom; left, center, right; Distribute horizontally and vertically (distribute needs three objects; with two it is disabled). On an empty canvas: Paste and the Insert items (Insert shape opens the shape picker at the pointer).
- **Rich text** in text and shape objects, with formatting applied to the selected part (implemented with `document.execCommand`, deprecated but available in Chromium and WebKit). Double-click a shape, or press Enter or F2, to add or edit its text; any shape type accepts text. Links open on a plain click when the text is not being edited, and with Cmd/Ctrl+click while editing.
- **Images:** Insert image and Replace image open the system file browser. A new image fits its box to the picture's proportions. With keep proportions on, resizing keeps them. Crop mode turns the corner handles off and the side handles into bars; dragging a bar crops that edge, and dragging inside the box moves the picture within it. Clicking outside the image ends crop mode. Images also have a border, a shadow, and opacity.
- **QR code:** the link panel's Create QR code makes an ordinary image object (SVG, 1-module white margin) from the address, without changing the text. The generator is `src/qr/qr.js` (byte mode, level M, versions 1–20; checked against the Chromium barcode detector).
- **Document sheet:** the sheet stays white in the dark theme, because document content does not follow the interface theme.

Each app enables only what it supports through `EdukorsAppConfig.canvas` (`move`, `resize`, `arrange`, `contextMenu`, `multiSelect`, `insert`) and `EdukorsAppConfig.contextualToolbar` (selection kinds → format groups; with mixed kinds only the groups shared by all show). The toolbar, the context menu, and the shortcuts follow it.

## Building an app on Common

Apps load the shared shell through one script (`src/shell/boot.js`), describe their document through `EdukorsAppDocument`, and start the shared Electron host with `startDesktopApp` (`desktop/host.mjs`). See [App integration](docs/common-shell.md#app-integration). The demo in `demo/` is built the same way.

## Continuing work

Read [Session handoff](docs/session-handoff.md) for the current implementation, user decisions, validation limits, and pending work before continuing in a new session.
