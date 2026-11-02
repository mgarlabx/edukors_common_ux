// Local SVG library imported from EDUKORS Graph and Slides. See README.md.
(() => {
  const catalog = {
  "graph-Logo": {
    "source": "Graph",
    "name": "Logo",
    "body": "<circle cx=\"6\" cy=\"6\" r=\"2.5\" /> <circle cx=\"18\" cy=\"6\" r=\"2.5\" /> <circle cx=\"12\" cy=\"18\" r=\"2.5\" /> <path d=\"M8.5 6h7M7.2 8.2l3.6 7.6M16.8 8.2l-3.6 7.6\" />"
  },
  "graph-NewFile": {
    "source": "Graph",
    "name": "NewFile",
    "body": "<path d=\"M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z\" /> <path d=\"M14 3v5h5M12 11v6M9 14h6\" />"
  },
  "graph-Open": {
    "source": "Graph",
    "name": "Open",
    "body": "<path d=\"M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1\" /> <path d=\"M3 7v10a2 2 0 0 0 2 2h12.4a2 2 0 0 0 1.9-1.4l1.6-5A1.5 1.5 0 0 0 19.5 10.6H7.6a2 2 0 0 0-1.9 1.4L3 19\" />"
  },
  "graph-Save": {
    "source": "Graph",
    "name": "Save",
    "body": "<path d=\"M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z\" /> <path d=\"M7 3v5h8V3M7 21v-7h10v7\" />"
  },
  "graph-Undo": {
    "source": "Graph",
    "name": "Undo",
    "body": "<path d=\"M9 14 4 9l5-5\" /> <path d=\"M4 9h10.5a5.5 5.5 0 0 1 0 11H11\" />"
  },
  "graph-Redo": {
    "source": "Graph",
    "name": "Redo",
    "body": "<path d=\"m15 14 5-5-5-5\" /> <path d=\"M20 9H9.5a5.5 5.5 0 0 0 0 11H13\" />"
  },
  "graph-Json": {
    "source": "Graph",
    "name": "Json",
    "body": "<path d=\"M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2v0a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1\" /> <path d=\"M16 3h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2v0a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1\" />"
  },
  "graph-Preview": {
    "source": "Graph",
    "name": "Preview",
    "body": "<path d=\"M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z\" /> <circle cx=\"12\" cy=\"12\" r=\"3\" />"
  },
  "graph-MapPlayer": {
    "source": "Graph",
    "name": "MapPlayer",
    "body": "<rect x=\"2.5\" y=\"4\" width=\"19\" height=\"16\" rx=\"2\" /> <path d=\"M12 4v16M6 9.5v5l4-2.5z\" /> <circle cx=\"15.5\" cy=\"9\" r=\"1.3\" /> <circle cx=\"18\" cy=\"15.5\" r=\"1.3\" /> <path d=\"M16 10.3l1.5 3.9\" />"
  },
  "graph-Fullscreen": {
    "source": "Graph",
    "name": "Fullscreen",
    "body": "<path d=\"M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4\" />"
  },
  "graph-ExitFullscreen": {
    "source": "Graph",
    "name": "ExitFullscreen",
    "body": "<path d=\"M9 4v4a1 1 0 0 1-1 1H4M20 9h-4a1 1 0 0 1-1-1V4M15 20v-4a1 1 0 0 1 1-1h4M4 15h4a1 1 0 0 1 1 1v4\" />"
  },
  "graph-Globe": {
    "source": "Graph",
    "name": "Globe",
    "body": "<circle cx=\"12\" cy=\"12\" r=\"9\" /> <path d=\"M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18\" />"
  },
  "graph-Layout": {
    "source": "Graph",
    "name": "Layout",
    "body": "<rect x=\"9\" y=\"3\" width=\"6\" height=\"5\" rx=\"1.2\" /> <rect x=\"3\" y=\"16\" width=\"6\" height=\"5\" rx=\"1.2\" /> <rect x=\"15\" y=\"16\" width=\"6\" height=\"5\" rx=\"1.2\" /> <path d=\"M12 8v4M6 16v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2\" />"
  },
  "graph-CheckCircle": {
    "source": "Graph",
    "name": "CheckCircle",
    "body": "<circle cx=\"12\" cy=\"12\" r=\"9\" /> <path d=\"m8 12.5 2.5 2.5L16 9.5\" />"
  },
  "graph-Error": {
    "source": "Graph",
    "name": "Error",
    "body": "<circle cx=\"12\" cy=\"12\" r=\"9\" /> <path d=\"m9 9 6 6M15 9l-6 6\" />"
  },
  "graph-Warning": {
    "source": "Graph",
    "name": "Warning",
    "body": "<path d=\"M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z\" /> <path d=\"M12 9v4M12 17h.01\" />"
  },
  "graph-Settings": {
    "source": "Graph",
    "name": "Settings",
    "body": "<circle cx=\"12\" cy=\"12\" r=\"3\" /> <path d=\"M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z\" />"
  },
  "graph-Key": {
    "source": "Graph",
    "name": "Key",
    "body": "<circle cx=\"8\" cy=\"15\" r=\"4.5\" /> <path d=\"m11.2 11.8 8.8-8.8M16.5 6.5l2.5 2.5M14 9l2 2\" />"
  },
  "graph-Help": {
    "source": "Graph",
    "name": "Help",
    "body": "<circle cx=\"12\" cy=\"12\" r=\"9\" /> <path d=\"M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01\" />"
  },
  "graph-Cut": {
    "source": "Graph",
    "name": "Cut",
    "body": "<circle cx=\"6\" cy=\"18\" r=\"3\" /> <circle cx=\"18\" cy=\"18\" r=\"3\" /> <path d=\"M8.1 15.9 19 4M15.9 15.9 5 4\" />"
  },
  "graph-Copy": {
    "source": "Graph",
    "name": "Copy",
    "body": "<rect x=\"8\" y=\"8\" width=\"13\" height=\"13\" rx=\"2\" /> <path d=\"M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3\" />"
  },
  "graph-Paste": {
    "source": "Graph",
    "name": "Paste",
    "body": "<rect x=\"8\" y=\"2\" width=\"8\" height=\"4\" rx=\"1\" /> <path d=\"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2\" /> <path d=\"M9 12h6M9 16h4\" />"
  },
  "graph-Plus": {
    "source": "Graph",
    "name": "Plus",
    "body": "<path d=\"M12 5v14M5 12h14\" />"
  },
  "graph-Close": {
    "source": "Graph",
    "name": "Close",
    "body": "<path d=\"M6 6l12 12M18 6L6 18\" />"
  },
  "graph-Sidebar": {
    "source": "Graph",
    "name": "Sidebar",
    "body": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\" /> <path d=\"M15 4v16\" />"
  },
  "graph-Ai": {
    "source": "Graph",
    "name": "Ai",
    "body": "<path d=\"M10 3.5c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7z\" /> <path d=\"M18.5 2.5c.25 1.7.95 2.4 2.5 2.6-1.55.2-2.25.9-2.5 2.6-.25-1.7-.95-2.4-2.5-2.6 1.55-.2 2.25-.9 2.5-2.6z\" /> <path d=\"M18 15.5c.2 1.3.75 1.85 2 2-1.25.15-1.8.7-2 2-.2-1.3-.75-1.85-2-2 1.25-.15 1.8-.7 2-2z\" />"
  },
  "graph-NewChat": {
    "source": "Graph",
    "name": "NewChat",
    "body": "<path d=\"M20 12.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5.5\" /> <path d=\"M17.5 3.5a2.1 2.1 0 0 1 3 3L13 14l-4 1 1-4z\" />"
  },
  "graph-History": {
    "source": "Graph",
    "name": "History",
    "body": "<path d=\"M3 12a9 9 0 1 0 2.6-6.4L3 8\" /> <path d=\"M3 3v5h5M12 7.5V12l3 2\" />"
  },
  "graph-Send": {
    "source": "Graph",
    "name": "Send",
    "body": "<path d=\"M12 19V5M6 11l6-6 6 6\" />"
  },
  "graph-Stop": {
    "source": "Graph",
    "name": "Stop",
    "body": "<rect x=\"6.5\" y=\"6.5\" width=\"11\" height=\"11\" rx=\"2\" fill=\"currentColor\" stroke=\"none\" />"
  },
  "graph-ChevronDown": {
    "source": "Graph",
    "name": "ChevronDown",
    "body": "<path d=\"m6 9 6 6 6-6\" />"
  },
  "graph-ChevronRight": {
    "source": "Graph",
    "name": "ChevronRight",
    "body": "<path d=\"m9 6 6 6-6 6\" />"
  },
  "graph-Paperclip": {
    "source": "Graph",
    "name": "Paperclip",
    "body": "<path d=\"m20.5 11.5-8.2 8.2a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8\" />"
  },
  "graph-Trash": {
    "source": "Graph",
    "name": "Trash",
    "body": "<path d=\"M4 7h16M10 11v6M14 11v6\" /> <path d=\"M5.5 7l1 12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2l1-12M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7\" />"
  },
  "graph-Hand": {
    "source": "Graph",
    "name": "Hand",
    "body": "<path d=\"M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V14\" /> <path d=\"M8 13a1.5 1.5 0 0 0-3 0v1a7 7 0 0 0 7 7h1a5 5 0 0 0 5-5v-4.5a1.5 1.5 0 0 0-3 0\" />"
  },
  "graph-Bolt": {
    "source": "Graph",
    "name": "Bolt",
    "body": "<path d=\"M13 2.5 4.5 13.5H12L11 21.5l8.5-11H12z\" />"
  },
  "graph-Plan": {
    "source": "Graph",
    "name": "Plan",
    "body": "<rect x=\"5\" y=\"4\" width=\"14\" height=\"17\" rx=\"2\" /> <path d=\"M9 4V3h6v1M9 10h6M9 14h6M9 18h3\" />"
  },
  "graph-Target": {
    "source": "Graph",
    "name": "Target",
    "body": "<circle cx=\"12\" cy=\"12\" r=\"8\" /> <circle cx=\"12\" cy=\"12\" r=\"3\" /> <path d=\"M12 2v3M12 19v3M2 12h3M19 12h3\" />"
  },
  "graph-Search": {
    "source": "Graph",
    "name": "Search",
    "body": "<circle cx=\"11\" cy=\"11\" r=\"6.5\" /> <path d=\"m20 20-4.2-4.2\" />"
  },
  "graph-Check": {
    "source": "Graph",
    "name": "Check",
    "body": "<path d=\"m5 12.5 4.5 4.5L19 7.5\" />"
  },
  "graph-Gauge": {
    "source": "Graph",
    "name": "Gauge",
    "body": "<path d=\"M4 18a8.5 8.5 0 1 1 16 0\" /> <path d=\"m12 14 4-5\" />"
  },
  "graph-Refresh": {
    "source": "Graph",
    "name": "Refresh",
    "body": "<path d=\"M20 11a8 8 0 0 0-14.3-4.9L4 8\" /> <path d=\"M4 3.5V8h4.5M4 13a8 8 0 0 0 14.3 4.9L20 16\" /> <path d=\"M20 20.5V16h-4.5\" />"
  },
  "graph-Map": {
    "source": "Graph",
    "name": "Map",
    "body": "<path d=\"M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z\" /> <path d=\"M9 4v13.5M15 6.5V20\" />"
  },
  "graph-Edit": {
    "source": "Graph",
    "name": "Edit",
    "body": "<path d=\"M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z\" /> <path d=\"m14.5 5.5 3 3\" />"
  },
  "graph-Heading": {
    "source": "Graph",
    "name": "Heading",
    "body": "<path d=\"M6 4v16M18 4v16M6 12h12\" />"
  },
  "graph-Paragraph": {
    "source": "Graph",
    "name": "Paragraph",
    "body": "<path d=\"M13 4v16M17 4v16M19 4h-9.5a4.5 4.5 0 0 0 0 9H13\" />"
  },
  "graph-Bold": {
    "source": "Graph",
    "name": "Bold",
    "body": "<path d=\"M7 4h7a4 4 0 0 1 0 8H7zM7 12h8a4 4 0 0 1 0 8H7z\" />"
  },
  "graph-Italic": {
    "source": "Graph",
    "name": "Italic",
    "body": "<path d=\"M10 4h9M5 20h9M15 4 9 20\" />"
  },
  "graph-List": {
    "source": "Graph",
    "name": "List",
    "body": "<path d=\"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01\" />"
  },
  "graph-ListOrdered": {
    "source": "Graph",
    "name": "ListOrdered",
    "body": "<path d=\"M10 6h10M10 12h10M10 18h10M4 4.5h1.2V9M4 9h2.4M4 15.2c.3-.7.9-1.2 1.6-1.2.8 0 1.4.5 1.4 1.3 0 1.3-3 2-3 3.7h3\" />"
  },
  "graph-Link": {
    "source": "Graph",
    "name": "Link",
    "body": "<path d=\"M10 13.5a4.5 4.5 0 0 0 6.4.4l2.8-2.8a4.5 4.5 0 0 0-6.4-6.4l-1.4 1.4\" /> <path d=\"M14 10.5a4.5 4.5 0 0 0-6.4-.4l-2.8 2.8a4.5 4.5 0 0 0 6.4 6.4l1.4-1.4\" />"
  },
  "graph-Image": {
    "source": "Graph",
    "name": "Image",
    "body": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\" /> <circle cx=\"9\" cy=\"10\" r=\"1.8\" /> <path d=\"m21 16-4.6-4.6a1.5 1.5 0 0 0-2.1 0L6 20\" />"
  },
  "graph-Wrap": {
    "source": "Graph",
    "name": "Wrap",
    "body": "<path d=\"M4 6h16M4 12h13.5a3 3 0 0 1 0 6H13M4 18h5\" /> <path d=\"m15 16-2 2 2 2\" />"
  },
  "slides-poll": {
    "source": "Slides",
    "name": "poll",
    "body": "<path d=\"M4 20h16M6 16v-5M12 16V4M18 16V8\"/><circle cx=\"6\" cy=\"7\" r=\"1\"/>"
  },
  "slides-settings": {
    "source": "Slides",
    "name": "settings",
    "body": "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z\"/>"
  },
  "slides-spark": {
    "source": "Slides",
    "name": "spark",
    "body": "<path d=\"M10 3.5c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7z\"/><path d=\"M18.5 2.5c.25 1.7.95 2.4 2.5 2.6-1.55.2-2.25.9-2.5 2.6-.25-1.7-.95-2.4-2.5-2.6 1.55-.2 2.25-.9 2.5-2.6z\"/><path d=\"M18 15.5c.2 1.3.75 1.85 2 2-1.25.15-1.8.7-2 2-.2-1.3-.75-1.85-2-2 1.25-.15 1.8-.7 2-2z\"/>"
  },
  "slides-plus": {
    "source": "Slides",
    "name": "plus",
    "body": "<path d=\"M12 5v14M5 12h14\"/>"
  },
  "slides-panel": {
    "source": "Slides",
    "name": "panel",
    "body": "<rect x=\"3.5\" y=\"4.5\" width=\"17\" height=\"15\" rx=\"2\"/><path d=\"M9 4.5v15\"/>"
  },
  "slides-more": {
    "source": "Slides",
    "name": "more",
    "body": "<circle cx=\"5.5\" cy=\"12\" r=\".9\"/><circle cx=\"12\" cy=\"12\" r=\".9\"/><circle cx=\"18.5\" cy=\"12\" r=\".9\"/>"
  },
  "slides-slides": {
    "source": "Slides",
    "name": "slides",
    "body": "<rect x=\"3.5\" y=\"5\" width=\"13\" height=\"9\" rx=\"1.5\"/><path d=\"M7.5 18h10a2 2 0 0 0 2-2V9\"/>"
  },
  "slides-close": {
    "source": "Slides",
    "name": "close",
    "body": "<path d=\"M6 6l12 12M18 6 6 18\"/>"
  },
  "slides-play": {
    "source": "Slides",
    "name": "play",
    "body": "<path d=\"M7.5 4.8v14.4a1 1 0 0 0 1.5.86l11.6-7.2a1 1 0 0 0 0-1.72L9 3.94a1 1 0 0 0-1.5.86z\"/>"
  },
  "slides-export": {
    "source": "Slides",
    "name": "export",
    "body": "<path d=\"M12 15V3.5M7.5 8 12 3.5 16.5 8\"/><path d=\"M5 12.5V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.5\"/>"
  },
  "slides-undo": {
    "source": "Slides",
    "name": "undo",
    "body": "<path d=\"M9 14 4 9l5-5\"/><path d=\"M4 9h10.5a5.5 5.5 0 0 1 0 11H11\"/>"
  },
  "slides-redo": {
    "source": "Slides",
    "name": "redo",
    "body": "<path d=\"m15 14 5-5-5-5\"/><path d=\"M20 9H9.5a5.5 5.5 0 0 0 0 11H13\"/>"
  },
  "slides-folder": {
    "source": "Slides",
    "name": "folder",
    "body": "<path d=\"M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1\"/><path d=\"M3 7v10a2 2 0 0 0 2 2h12.4a2 2 0 0 0 1.9-1.4l1.6-5A1.5 1.5 0 0 0 19.5 10.6H7.6a2 2 0 0 0-1.9 1.4L3 19\"/>"
  },
  "slides-file": {
    "source": "Slides",
    "name": "file",
    "body": "<path d=\"M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z\"/><path d=\"M14 3v5h5M9 13h6M9 17h4\"/>"
  },
  "slides-clock": {
    "source": "Slides",
    "name": "clock",
    "body": "<path d=\"M3 12a9 9 0 1 0 2.6-6.4L3 8\"/><path d=\"M3 3v5h5M12 7.5V12l3 2\"/>"
  },
  "slides-image": {
    "source": "Slides",
    "name": "image",
    "body": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><circle cx=\"9\" cy=\"10\" r=\"1.8\"/><path d=\"m21 16-4.6-4.6a1.5 1.5 0 0 0-2.1 0L6 20\"/>"
  },
  "slides-link": {
    "source": "Slides",
    "name": "link",
    "body": "<path d=\"M10 13.5a4.5 4.5 0 0 0 6.4.4l2.8-2.8a4.5 4.5 0 0 0-6.4-6.4l-1.4 1.4\"/><path d=\"M14 10.5a4.5 4.5 0 0 0-6.4-.4l-2.8 2.8a4.5 4.5 0 0 0 6.4 6.4l1.4-1.4\"/>"
  },
  "slides-text": {
    "source": "Slides",
    "name": "text",
    "body": "<path d=\"M5 7V5.5A1.5 1.5 0 0 1 6.5 4h11A1.5 1.5 0 0 1 19 5.5V7M12 4v16M9 20h6\"/>"
  },
  "slides-shape": {
    "source": "Slides",
    "name": "shape",
    "body": "<circle cx=\"8.5\" cy=\"8.5\" r=\"5\"/><path d=\"M14 11h5.5a1.5 1.5 0 0 1 1.5 1.5V19a1.5 1.5 0 0 1-1.5 1.5H13a1.5 1.5 0 0 1-1.5-1.5v-5.2\"/>"
  },
  "slides-crop": {
    "source": "Slides",
    "name": "crop",
    "body": "<path d=\"M6 2.5V16a2 2 0 0 0 2 2h13.5\"/><path d=\"M18 21.5V8a2 2 0 0 0-2-2H2.5\"/>"
  },
  "slides-copy": {
    "source": "Slides",
    "name": "copy",
    "body": "<rect x=\"8\" y=\"8\" width=\"13\" height=\"13\" rx=\"2\"/><path d=\"M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3\"/>"
  },
  "slides-trash": {
    "source": "Slides",
    "name": "trash",
    "body": "<path d=\"M4 7h16M10 11v6M14 11v6\"/><path d=\"M5.5 7l1 12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2l1-12M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7\"/>"
  },
  "slides-send": {
    "source": "Slides",
    "name": "send",
    "body": "<path d=\"M12 19V5M6 11l6-6 6 6\"/>"
  },
  "slides-check": {
    "source": "Slides",
    "name": "check",
    "body": "<path d=\"m5 12.5 4.5 4.5L19 7.5\"/>"
  },
  "slides-back": {
    "source": "Slides",
    "name": "back",
    "body": "<path d=\"M19 12H5M11 18l-6-6 6-6\"/>"
  },
  "slides-chevron": {
    "source": "Slides",
    "name": "chevron",
    "body": "<path d=\"m9 6 6 6-6 6\"/>"
  },
  "slides-globe": {
    "source": "Slides",
    "name": "globe",
    "body": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18\"/>"
  },
  "slides-account": {
    "source": "Slides",
    "name": "account",
    "body": "<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4.5 20.5a7.5 7.5 0 0 1 15 0\"/>"
  },
  "slides-grid": {
    "source": "Slides",
    "name": "grid",
    "body": "<rect x=\"3.5\" y=\"3.5\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"13.5\" y=\"3.5\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"3.5\" y=\"13.5\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"13.5\" y=\"13.5\" width=\"7\" height=\"7\" rx=\"1.5\"/>"
  },
  "slides-help": {
    "source": "Slides",
    "name": "help",
    "body": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M9.6 9.3a2.5 2.5 0 0 1 4.9.7c0 1.7-2.5 2.2-2.5 3.8M12 17.2h.01\"/>"
  },
  "slides-info": {
    "source": "Slides",
    "name": "info",
    "body": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 11v5.5M12 7.8h.01\"/>"
  },
  "slides-save": {
    "source": "Slides",
    "name": "save",
    "body": "<path d=\"M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z\"/><path d=\"M7 3v5h8V3M7 21v-7h10v7\"/>"
  },
  "slides-arrowUp": {
    "source": "Slides",
    "name": "arrowUp",
    "body": "<path d=\"M12 19V5M6 11l6-6 6 6\"/>"
  },
  "slides-arrowDown": {
    "source": "Slides",
    "name": "arrowDown",
    "body": "<path d=\"M12 5v14M18 13l-6 6-6-6\"/>"
  },
  "slides-cut": {
    "source": "Slides",
    "name": "cut",
    "body": "<circle cx=\"6\" cy=\"18\" r=\"3\"/><circle cx=\"18\" cy=\"18\" r=\"3\"/><path d=\"M8.1 15.9 19 4M15.9 15.9 5 4\"/>"
  },
  "slides-paste": {
    "source": "Slides",
    "name": "paste",
    "body": "<rect x=\"8\" y=\"2\" width=\"8\" height=\"4\" rx=\"1\"/><path d=\"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2\"/><path d=\"M9 12h6M9 16h4\"/>"
  },
  "slides-clip": {
    "source": "Slides",
    "name": "clip",
    "body": "<path d=\"m20.5 11.5-8.2 8.2a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8\"/>"
  },
  "slides-duplicate": {
    "source": "Slides",
    "name": "duplicate",
    "body": "<rect x=\"8\" y=\"8\" width=\"13\" height=\"13\" rx=\"2\"/><path d=\"M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3M14.5 12v5M12 14.5h5\"/>"
  },
  "slides-newFile": {
    "source": "Slides",
    "name": "newFile",
    "body": "<path d=\"M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z\"/><path d=\"M14 3v5h5M12 11v6M9 14h6\"/>"
  },
  "slides-master": {
    "source": "Slides",
    "name": "master",
    "body": "<rect x=\"3\" y=\"3\" width=\"18\" height=\"8\" rx=\"2\"/><rect x=\"3\" y=\"14\" width=\"7.5\" height=\"7\" rx=\"1.5\"/><rect x=\"13.5\" y=\"14\" width=\"7.5\" height=\"7\" rx=\"1.5\"/>"
  },
  "slides-newSlide": {
    "source": "Slides",
    "name": "newSlide",
    "body": "<rect x=\"2.5\" y=\"4\" width=\"14\" height=\"10\" rx=\"2\"/><path d=\"M19 13.5v7M15.5 17h7\"/>"
  },
  "slides-reveal": {
    "source": "Slides",
    "name": "reveal",
    "body": "<path d=\"M11 19H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1.5\"/><circle cx=\"16.5\" cy=\"16.5\" r=\"3\"/><path d=\"m21 21-2.4-2.4\"/>"
  },
  "slides-dot": {
    "source": "Slides",
    "name": "dot",
    "body": "<circle cx=\"12\" cy=\"12\" r=\"2.5\"/>"
  },
  "slides-alignLeft": {
    "source": "Slides",
    "name": "alignLeft",
    "body": "<path d=\"M4 6h16M4 12h10M4 18h13\"/>"
  },
  "slides-alignCenter": {
    "source": "Slides",
    "name": "alignCenter",
    "body": "<path d=\"M4 6h16M7 12h10M5.5 18h13\"/>"
  },
  "slides-alignRight": {
    "source": "Slides",
    "name": "alignRight",
    "body": "<path d=\"M4 6h16M10 12h10M7 18h13\"/>"
  },
  "common-alignJustify": {
    "source": "Common",
    "name": "alignJustify",
    "body": "<path d=\"M4 6h16M4 12h16M4 18h16\"/>"
  },
  "common-alignTop": {
    "source": "Common",
    "name": "alignTop",
    "body": "<path d=\"M4 4h16\"/><rect x=\"6.5\" y=\"7.5\" width=\"4\" height=\"12\" rx=\"1\"/><rect x=\"13.5\" y=\"7.5\" width=\"4\" height=\"7\" rx=\"1\"/>"
  },
  "common-alignMiddle": {
    "source": "Common",
    "name": "alignMiddle",
    "body": "<path d=\"M4 12h2.5M10.5 12h3M17.5 12H20\"/><rect x=\"6.5\" y=\"5\" width=\"4\" height=\"14\" rx=\"1\"/><rect x=\"13.5\" y=\"8\" width=\"4\" height=\"8\" rx=\"1\"/>"
  },
  "common-alignBottom": {
    "source": "Common",
    "name": "alignBottom",
    "body": "<path d=\"M4 20h16\"/><rect x=\"6.5\" y=\"4.5\" width=\"4\" height=\"12\" rx=\"1\"/><rect x=\"13.5\" y=\"9.5\" width=\"4\" height=\"7\" rx=\"1\"/>"
  },
  "common-interface": {
    "source": "Common",
    "name": "interface",
    "body": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M3 8.5h18\"/><path d=\"M6 6.25h.01M8.5 6.25h.01\"/><rect x=\"6.5\" y=\"11.5\" width=\"5\" height=\"5.5\" rx=\"1\"/><path d=\"M14.5 12h3M14.5 14.5h3M14.5 17h2\"/>"
  },
  "common-table": {
    "source": "Common",
    "name": "table",
    "body": "<rect x=\"3.5\" y=\"4.5\" width=\"17\" height=\"15\" rx=\"2\"/><path d=\"M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10M14.5 9.5v10\"/>"
  },
  "common-import": {
    "source": "Common",
    "name": "import",
    "body": "<path d=\"M12 3.5V15M7.5 10.5 12 15l4.5-4.5\"/><path d=\"M5 12.5V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.5\"/>"
  },
  "common-eyedropper": {
    "source": "Common",
    "name": "eyedropper",
    "body": "<g transform=\"rotate(45 12 12)\"><rect x=\"9.5\" y=\"2\" width=\"5\" height=\"6.5\" rx=\"2.5\"/><path d=\"M7.5 8.5h9\"/><path d=\"M10.5 8.5V17l1.5 4 1.5-4V8.5\"/></g>"
  },
  "common-bringFront": {
    "source": "Common",
    "name": "bringFront",
    "body": "<path d=\"M8 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V8\" stroke-dasharray=\"1.5 2.5\"/><rect x=\"8\" y=\"8\" width=\"13\" height=\"13\" rx=\"1.5\"/><path d=\"M11.5 12.5h6M11.5 16.5h6\"/>"
  },
  "common-sendBack": {
    "source": "Common",
    "name": "sendBack",
    "body": "<rect x=\"3\" y=\"3\" width=\"13\" height=\"13\" rx=\"1.5\"/><path d=\"M6.5 7.5h6M6.5 11.5h6\"/><path d=\"M16 9h3.5A1.5 1.5 0 0 1 21 10.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 9 19.5V16\" stroke-dasharray=\"1.5 2.5\"/>"
  },
  "common-lineWidth": {
    "source": "Common",
    "name": "lineWidth",
    "body": "<path d=\"M4 6h16\"/><path d=\"M4 12h16\" stroke-width=\"2.6\"/><path d=\"M4 18.5h16\" stroke-width=\"4.2\"/>"
  },
  "common-fill": {
    "source": "Common",
    "name": "fill",
    "body": "<path d=\"m6 12.5 6.5-6.5 6 6-6.5 6.5a1.8 1.8 0 0 1-2.5 0L6 15a1.8 1.8 0 0 1 0-2.5z\"/><path d=\"M12.5 6 9.5 3\"/><path d=\"M20 16.5c0 1.1-.9 2-2 2s-2-.9-2-2c0-.9 2-3 2-3s2 2.1 2 3z\"/>"
  },
  "common-opacity": {
    "source": "Common",
    "name": "opacity",
    "body": "<path d=\"M12 3.5s6 6 6 10.2a6 6 0 0 1-12 0C6 9.5 12 3.5 12 3.5z\"/><path d=\"M6.4 14h11.2\"/>"
  },
  "common-shadow": {
    "source": "Common",
    "name": "shadow",
    "body": "<rect x=\"6\" y=\"3.5\" width=\"12\" height=\"11\" rx=\"2\"/><ellipse cx=\"12\" cy=\"19.5\" rx=\"6.5\" ry=\"1.7\" fill=\"currentColor\" fill-opacity=\".4\" stroke=\"none\"/>"
  },
  "common-keepRatio": {
    "source": "Common",
    "name": "keepRatio",
    "body": "<rect x=\"3.5\" y=\"6\" width=\"17\" height=\"12\" rx=\"1.8\"/><path d=\"M9.5 14.5 14.5 9.5M9.5 14.5v-2.8M9.5 14.5h2.8M14.5 9.5v2.8M14.5 9.5h-2.8\"/>"
  },
  "common-fontIncrease": {
    "source": "Common",
    "name": "fontIncrease",
    "body": "<path d=\"M3 19 8.5 5 14 19M5.2 14h6.6\"/><path d=\"M18.5 14V5M15.5 8l3-3 3 3\"/>"
  },
  "common-fontDecrease": {
    "source": "Common",
    "name": "fontDecrease",
    "body": "<path d=\"M3 19 8.5 5 14 19M5.2 14h6.6\"/><path d=\"M18.5 5v9M15.5 11l3 3 3-3\"/>"
  }
};
  const aliases = {"new": "graph-NewFile", "open": "graph-Open", "recent": "graph-History", "import": "common-import", "save": "graph-Save", "export": "slides-export", "reveal": "slides-reveal", "settings": "graph-Settings", "help": "slides-help"};
  function svg(name, size = 18) {
    const entry = catalog[aliases[name] || name];
    if (!entry) throw new Error(`Unknown icon: ${name}`);
    if (!Number.isFinite(size) || size <= 0) throw new Error('Invalid icon size');
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${entry.body}</svg>`;
  }
  globalThis.EdukorsIcons = Object.freeze({ svg, catalog: Object.freeze(catalog), aliases: Object.freeze(aliases) });
})();
