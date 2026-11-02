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
