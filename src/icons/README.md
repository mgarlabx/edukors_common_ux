# EDUKORS icon library

A local, framework-independent SVG collection. No package publication or external assets are required.

## Sources

Imported on 2026-11-01 without changing the original path geometry:

- `edukors_graph_editor/src/ui/icons.tsx`: 53 icons.
- `edukors_slides_editor/src/ui/App.tsx`, the `icons` map: 46 icons.

`common-alignJustify`, `common-alignTop`, `common-alignMiddle`, `common-alignBottom`, `common-eyedropper`, `common-bringFront`, `common-sendBack`, `common-fontIncrease`, `common-fontDecrease`, and `common-interface` (Settings → Interface) were drawn in Common on 2026-11-01, matching the Slides alignment icons, because neither source had them.

Source-prefixed identifiers preserve variants for visual comparison. Similar icons have not been silently discarded. These are local snapshots; no runtime dependency on either legacy repository exists. Future edits belong here. Legacy repositories have not been modified.

## Usage

Load `icons.js` with a classic script tag, then use `EdukorsIcons.svg(name, size)` to produce decorative SVG markup. The default size is 18 px. Geometry uses a 24 × 24 viewBox, currentColor, a 1.75 stroke, and round caps and joins. The enclosing button or link must provide an accessible name and tooltip.

The closed-workspace aliases are New, Open, History, Save, and Settings from Graph; Export, Reveal, and Help from Slides. Inspect `EdukorsIcons.aliases` for their exact identifiers. Unknown names throw an error.

Open `../../demo/icons.html` directly in a browser to inspect and filter all source variants at 18 and 24 px. This initial collection is intentionally broader than the common shell; app-specific icons remain catalogued by source pending selection.
