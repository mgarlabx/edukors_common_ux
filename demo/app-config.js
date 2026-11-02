// Each consuming application supplies its own name, release version, and help texts.
// Help texts are Markdown, keyed by interface language; a missing language falls back to English.
// A tab whose text is missing in every language is hidden.
// The texts below are demo placeholders, not real guides or legal terms.
globalThis.EdukorsAppConfig = {
  name: 'Edukors Common',
  version: 'v.26.11.01',            // the release date; package.json's version is the same date as 26.11.1
  // Version of the terms of use below (help.termsOfUse). The desktop app asks once per version; change it when the terms change.
  termsVersion: '2026-11-02',
  // Contextual toolbar: for each kind of selection, the shared formatting groups to show, in order.
  // Available groups: 'text', 'align', 'valign', 'lists', 'link', 'shape', 'image' (see src/format/format-controls.js).
  // With nothing selected, or a kind not listed here, the toolbar is hidden. When shown, it lies over the top of the content.
  contextualToolbar: {
    text: ['text', 'align', 'valign', 'lists', 'link', 'arrange'],
    shape: ['shape', 'arrange'],
    // Editing text inside a shape (double-click): text and shape controls together.
    shapeText: ['text', 'align', 'valign', 'shape'],
    image: ['image', 'arrange']
  },
  // Files: the extension of this app's documents and the formats Export offers, in order (demo placeholders).
  // The first one is always preselected; Export keeps the document's name and folder.
  // Export formats listed here need a name and description in the shared translations (export<Id>, export<Id>Desc).
  // Import formats: each id needs a converter in demo/importers.js and a name in the shared translations (import<Id>).
  // The desktop host accepts only the extensions it lists itself (desktop/main.mjs, IMPORT_EXTENSIONS).
  file: {
    extension: '.ecmx', exportFormats: ['html', 'pdf', 'png'],
    importFormats: [
      { id: 'image', extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'] },
      { id: 'markdown', extensions: ['.md', '.markdown', '.txt'] }
    ]
  },
  // Canvas capabilities. Each app turns on only what it supports; menus and toolbars follow these settings.
  canvas: {
    move: true,        // drag objects (and move them with the arrow keys)
    resize: true,      // resize handles
    arrange: true,     // bring to front / send to back
    contextMenu: true, // right-click menu with the main actions
    multiSelect: true, // Shift/Cmd/Ctrl-click and rectangle selection
    insert: ['text', 'shape', 'image'] // Insert group (toolbar and context menu); an empty list hides it
  },
  help: {
    quickGuide: {
      en: `This is **placeholder text** supplied by the demo application. Each Edukors application provides its own quick guide.

1. A real quick guide lists a few first steps.
2. It may also list the main keyboard shortcuts.

### Shortcuts available in this demo

| Keys | Action |
| --- | --- |
| ⌘⇧+ / ⌘⇧− (macOS); Ctrl+Shift++ / Ctrl+Shift+− (Windows, Linux) | Increase / decrease interface font size |
| Esc | Close the open dialog or menu |`
    },
    fullGuide: {
      en: `# Full guide

This is **placeholder text** supplied by the demo application. Each Edukors application provides its own full guide, written in Markdown.

## Sections

A full guide can contain sections, lists, tables, quotes, \`code\`, and [links](https://edukors.org), which open in a new tab.`
    },
    termsOfUse: {
      en: `# Terms of use

This is **placeholder text** supplied by the demo application. Each Edukors application provides its own terms of use.

> No terms are defined by this demo.`
    }
  }
};
