# The Common demo's document file (`.ecmx`)

The demo document is saved as an Edukors package (the structure described in [Edukors document package](document-package.md): a ZIP with an XML skeleton and JSON content parts). `demo/document-file.js` turns a document into bytes and back; the host (Electron) only reads and writes the file. In a browser nothing is written.

## Parts

| Part | Content type | Role |
| --- | --- | --- |
| `common/document.json` | `application/vnd.edukors.common.document+json` | Main part: `{ format: "edukors.common.document", version: 1, nextId, objects }` |
| `common/media/image<n>.<ext>` | the picture's own type (`image/png`, `image/gif`, `image/webp`, `image/svg+xml`, …) | One part per distinct picture |
| `common/ai/conversations/<id>.json` | `application/vnd.edukors.ai.conversation+json` | The document's AI conversations (see [AI assistant](ai.md)) |
| `docProps/core.xml`, `docProps/app.xml` | package skeleton | Title (the document's name), application `Edukors common`, version |

Pictures are reached only through relationships of the main part (type `…/relationships/image`, id `rIdImg<n>`); each image object names its picture with `state.imageRel`. Conversations use the relationship type of `ai-conversations.js`.

Each object is `{ id, kind: "text" | "shape" | "image", x, y, w, h, state }`, with the box in percent of the page and `state` as the formatting controls describe it (font, colors, line, shadow, opacity, crop, text as restricted HTML). Selection, undo history, and clipboard are not saved.

## Reading is strict

A file is untrusted input. `EdukorsDocumentFile.fromBytes` reads the package with the package layer's limits, then `EdukorsSampleDocument.parseState` rebuilds every object:

- the kind, ids (unique positive integers), and the number of objects (2000 at most) are checked; boxes are clamped to the page;
- every state field is kept only if it has the expected type and range (colors as `#RRGGBB`, enumerations from fixed lists, shape types from the catalog, links only `http`, `https`, `mailto`); anything else falls back to the default;
- text markup goes through a sanitizer that keeps only the tags and styles the editor itself produces (`b i u s strike strong em sub sup span a br div p font ul ol li`; styles `color`, `font-*`, `text-decoration`, …; no `url()` or `var()`, except the editor's own font-size form `calc(<n>px * var(--font-scale))`), and drops scripts, frames, SVG, and event attributes. (Before 2026-11-02 that font-size form was dropped, so sizes set on part of a text were lost on opening.);
- pictures must have an `image/*` content type and at most 50 MB; a missing or invalid picture leaves the placeholder; crop mode is always off on opening;
- a document of another app, another format, or a newer `version` is refused with a message.

A damaged conversation part is skipped and the document still opens.

## Host interface

The Electron preload exposes `EdukorsDesktop.files` (`desktop/preload.cjs`, implemented in `desktop/main.mjs` and `desktop/files-core.mjs`): `info`, `chooseFolder`, `save`, `open`, `import`, `recent`, `openRecent`, `forgetRecent`, `export`, `reveal`, `setDirty`. `open` always shows the system's dialog (the page cannot name a path); `openRecent` accepts only a path that the host's recent list holds (`createRecentList` in `desktop/files-core.mjs`, kept in `<app data>/recent.json`, updated only after a successful save or open; a missing file leaves the list). The host checks names (plain file names, no reserved names), the folder (an existing absolute folder), and the extensions (`.ecmx` for documents; `.html`, `.pdf`, `.png` for exports). Documents are written to a temporary file in the target folder and then moved over the target, so an interrupted save never leaves a half-written file; without replace, an existing file is never overwritten. The page never receives a path it did not ask for.

## Export

`EdukorsSampleDocument.exportPage()` renders the active page as one self-contained HTML document (styles inline, pictures as data URLs, selection marks and handles left out). HTML is written as is. PDF and PNG are made from that page in a hidden window without a preload script, with JavaScript off and the network blocked (PNG at twice the size, PDF at the page's size). Exporting again overwrites the earlier export.
