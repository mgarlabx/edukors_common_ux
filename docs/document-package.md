# Edukors document package

Every Edukors document is a zipped folder (a package) organized like the Microsoft Office files (DOCX, PPTX, XLSX), which follow the Open Packaging Conventions (OPC, ECMA-376 Part 2). The aim is to make import and export with Office straightforward: Slides from and to PPTX, Texts (a future app) from and to DOCX. The same skeleton, the same folder pattern, the same relationship mechanism, and the same metadata files mean that a converter maps one part to one part and copies pictures, metadata, and relationship ids across instead of reorganizing the whole file.

Common owns the package layer (`src/package/package.js`, global `EdukorsPackage`). Each app owns the schemas of its own parts and its converters to and from Office formats.

This document was rewritten from the code on 2026-11-02; the original was lost.

## Decisions

- **Office's skeleton, JSON content.** The package files that Office reads (`[Content_Types].xml`, `_rels/*.rels`, `docProps/core.xml`, `docProps/app.xml`) are XML exactly as in OPC. The content parts (the document itself, slides, conversations) are JSON, which the apps already use. So an Edukors file is not an Office file and Office cannot open it directly; converters translate the content parts between JSON and Office's XML, and everything else carries over.
- **Extensions `.e??x`**, lowercase on disk, in the pattern of `.docx`/`.pptx`: `.eslx` Slides, `.egrx` Graph, `.etex` Texts, `.ecmx` the Common demo (`EdukorsPackage.EXTENSIONS`, `extensionFor(app)`; an unknown app gets `.e` + its first two letters + `x`).
- **Namespaces** (decided in session 3):
  - Edukors relationship types: `https://edukors.org/package/relationships/<name>` (for example `…/main`, `…/ai-conversation`).
  - Edukors content types: `application/vnd.edukors.<app>.<part>+json` (`EdukorsPackage.contentType(app, part)`; for example `application/vnd.edukors.common.document+json`).
  - Where Office already has a relationship type for the same meaning, use Office's: core properties, extended properties, thumbnail, and images (`http://schemas.openxmlformats.org/officeDocument/2006/relationships/image`). That keeps the relationships of a converted file valid without changes.
- **One folder per app at the root**, like `ppt/` in PPTX and `word/` in DOCX, holding the main part and everything it owns. The folder is the app's name (`common/`, `slides/`, `text/`, `graph/`).
- **Legacy files are not touched now.** The Slides editor's `.esf` is a ZIP but not OPC (it has a `manifest.json`); the Graph editor's `.egf` is a plain JSON file. Migrating them is deferred.

## Layout

```
[Content_Types].xml                 content type of every part (a Default per extension, Overrides where needed)
_rels/.rels                         the package's relationships: main part, core and extended properties, thumbnail
docProps/core.xml                   title, creator, language of the content, created, modified (Dublin Core, as in Office)
docProps/app.xml                    Application "Edukors <app>", AppVersion
docProps/thumbnail.png              optional preview
<app>/<main part>.json              the document (reached from _rels/.rels by the type …/relationships/main)
<app>/_rels/<main part>.json.rels   relationships of the main part (to its media, sub-parts, conversations)
<app>/media/image1.png, …           pictures, each reached by a relationship, never by a raw path
<app>/ai/conversations/<id>.json    the document's AI conversations (src/ai/ui/ai-conversations.js)
```

Example: the Common demo's `.ecmx` (see [The Common demo's document file](common-document-format.md)):

```
[Content_Types].xml
_rels/.rels
docProps/core.xml
docProps/app.xml
common/document.json
common/_rels/document.json.rels
common/media/image1.png
common/ai/conversations/<id>.json
```

### Matching Office, part by part

The proposal for the apps that convert to Office (each app decides its own part names when it adopts the package; these keep Office's names so the converters stay one-to-one):

| PPTX (PresentationML) | Slides (`.eslx`) | DOCX (WordprocessingML) | Texts (`.etex`) |
| --- | --- | --- | --- |
| `ppt/presentation.xml` | `slides/presentation.json` | `word/document.xml` | `text/document.json` |
| `ppt/slides/slide1.xml` | `slides/slides/slide1.json` | `word/styles.xml` | `text/styles.json` |
| `ppt/slideLayouts/slideLayout1.xml` | `slides/slideLayouts/slideLayout1.json` | `word/numbering.xml` | `text/numbering.json` |
| `ppt/slideMasters/slideMaster1.xml` | `slides/slideMasters/slideMaster1.json` | `word/footnotes.xml` | `text/footnotes.json` |
| `ppt/theme/theme1.xml` | `slides/theme/theme1.json` | `word/theme/theme1.xml` | `text/theme/theme1.json` |
| `ppt/media/image1.png` | `slides/media/image1.png` | `word/media/image1.png` | `text/media/image1.png` |
| `ppt/slides/_rels/slide1.xml.rels` | `slides/slides/_rels/slide1.json.rels` | `word/_rels/document.xml.rels` | `text/_rels/document.json.rels` |
| `docProps/core.xml`, `app.xml`, `thumbnail.*` | the same | the same | the same |

What a converter does: renames the app folder (`slides/` ↔ `ppt/`, `text/` ↔ `word/`), translates each content part between JSON and Office's XML, rewrites the content types of those parts, and copies the rest (media bytes, relationship files with their ids, `docProps`). Edukors-only parts (AI conversations, anything Office has no place for) are left out when exporting; Office-only parts the app does not understand are dropped when importing.

## Rules

- **Parts reach each other only through relationships** (`Id`, `Type`, `Target`, optionally `TargetMode="External"`), never by paths written inside the content. A relationship's target is relative to the folder of the part that owns it; `/x` is relative to the package root. Content refers to a relationship by its id (the Common demo's image objects keep `imageRel: "rIdImg1"`).
- **Part names** are relative, unique ignoring case, at most 240 characters (120 per segment), with no `.` or `..` segments, no empty segments, no backslash or `< > : " | ? *` or control characters, no encoded separators (`%2F`, `%5C`), no segment ending in a dot or space, and no names Windows reserves (`CON`, `NUL`, `COM1`, …). So a package unpacks the same on macOS, Windows, and Linux.
- **Reserved names:** `[Content_Types].xml`, any `_rels/` folder, `docProps/core.xml`, and `docProps/app.xml` belong to the package; apps cannot name parts there.
- **Compression:** formats that are already compressed (PNG, JPEG, GIF, WebP, AVIF, WOFF, MP3, M4A, MP4, WebM, ZIP) are stored; everything else is deflated, unless deflating would make it larger. `[Content_Types].xml` is the first entry, as Office writes it.
- **Language** in `docProps/core.xml` (`dc:language`) is the language of the content, never the interface language.
- **Orphans:** parts no relationship reaches are not part of the document. Reading reports them (`orphans`); apps ignore them.

## Using the layer

The layer turns a document into bytes and back and never touches the file system, so it works the same in Electron and in a browser; the host reads and writes files (atomically: a temporary file renamed over the target, `desktop/files-core.mjs`).

```js
const bytes = await EdukorsPackage.write({
  app: { name: 'common', version: 'v.26.11.01' },          // lowercase letters, digits, hyphens
  main: {
    name: 'common/document.json',
    contentType: EdukorsPackage.contentType('common', 'document'),
    content: { format: 'edukors.common.document', version: 1, objects: [] },   // objects become JSON; strings and bytes are kept as they are
    relationships: [{ id: 'rIdImg1', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', target: 'media/image1.png' }]
  },
  parts: [{ name: 'common/media/image1.png', contentType: 'image/png', content: pngBytes }],
  properties: { title: 'Untitled', creator: 'Ana', language: 'pt-BR' },   // created and modified default to now
  thumbnail: pngBytes                                                       // optional, becomes docProps/thumbnail.png
});

const doc = await EdukorsPackage.read(bytes);    // throws PackageError with a code when the file is unsafe or malformed
doc.main                                         // { name, contentType } of the main part
doc.json(doc.main.name)                          // also doc.text(name), doc.bytes(name)
doc.relationships(doc.main.name)                 // [{ id, type, target (resolved to a part name), external }]
doc.properties                                   // { title, creator, language, created, modified }
doc.app                                          // { name: 'Edukors common', version }
doc.parts, doc.orphans
```

Ids left out of `relationships` are generated (`rId1`, `rId2`, …). Writing checks every name, refuses duplicates and reserved names, and refuses a relationship whose target is not in the package. `EdukorsPackage.unzip(bytes)` reads a plain ZIP (not a document) with the same limits, for things people add as ZIP files, such as skills.

## Reading is strict

A file is untrusted input. Reading never trusts the sizes the ZIP declares and stops at the first problem, with a `PackageError` whose `code` says what kind:

| Code | When |
| --- | --- |
| `zip` | not a ZIP; damaged central directory or part header; encrypted; multi-disk or ZIP64; a compression method other than stored or deflate; a checksum or size mismatch; a part name that is not UTF-8 |
| `limit` | more than 5000 parts; a part over 512 MB; over 1 GB in total; a part over 1 MB that expands more than 1000 times (a "zip bomb"); a part that inflates past its declared size |
| `part-name` | an unsafe or non-portable part name; two names differing only in case |
| `xml` | a DOCTYPE or entity declaration (refused outright, so nothing expands); malformed XML |
| `package` | no `[Content_Types].xml`; a part with no content type; no main part |
| `relationship` | a target outside the package or missing; a repeated id; an incomplete relationship |
| `part` | asking for a part that does not exist; text that is not UTF-8; JSON that does not parse |
| `input` | (writing) a bad app name or a part without a name or content type |

Hosts may pass other limits (`read(bytes, { limits: { maxTotalBytes } })`). What a part's content means is checked by the app that owns it (the Common demo rebuilds every object it reads; see [The Common demo's document file](common-document-format.md)).

## Tests

`tests/package.test.mjs` (`npm test`): round trip of content, properties, relationships, and bytes; content types; orphans; files made by the layer open in Python's `zipfile`, and files made by Python (with folder entries and deflate) open in the layer; part names; bad input when writing; targets leaving the package; damaged, truncated, encrypted, and forged packages; size, count, and ratio limits; DOCTYPE and entities; missing main part, missing target, repeated id; the extension rule. `demo/package-check.html` runs a round trip in a browser.

## Open

- **Working state:** whether a document saves view state (open panels, selection, zoom) and where; today nothing of it is saved.
- **Signatures and custom properties:** OPC has places for both (`_xmlsignatures/`, `docProps/custom.xml`); neither is used yet.
- **Converters:** none exists yet. PPTX belongs to Slides and DOCX to Texts; each app writes its own when it adopts the package.
- **Legacy migration:** opening `.esf` (Slides) and `.egf` (Graph) and saving them as packages, when those apps move to Common.
