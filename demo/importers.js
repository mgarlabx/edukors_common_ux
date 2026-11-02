// The demo app's import converters: each turns a file of another format into the content of a new document, in the
// same form a document file has (objects with boxes in percent of the page; pictures named by relationship id and
// given as Blobs). files.js then checks that content with EdukorsSampleDocument.parseState, exactly as for a file
// being opened, so a converter cannot put anything into a document that a saved file could not.
//   convert({ name, extension, bytes, t }) → { objects, images: Map<rel, Blob> }; throws an Error with a message.
// Common owns the Import command and screens (files.js); each app supplies converters for its own formats.
globalThis.EdukorsImporters = (() => {
  const PAGE_ASPECT = 16 / 9; // the sample page (demo/shell.css, .document-placeholder)
  const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

  // The picture's width / height, or 1 when the browser cannot tell (some SVGs); rejects what is not an image.
  const aspectOf = blob => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob), probe = new Image();
    probe.onload = () => { URL.revokeObjectURL(url); const a = probe.naturalWidth / probe.naturalHeight; resolve(Number.isFinite(a) && a > 0 ? Math.min(100, Math.max(0.01, a)) : 1); };
    probe.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image')); };
    probe.src = url;
  });

  // An image becomes one picture, centered, as large as fits in 80 % of the page with its proportions.
  async function image({ extension, bytes, t }) {
    const blob = new Blob([bytes], { type: IMAGE_TYPES[extension] || 'application/octet-stream' });
    let aspect;
    try { aspect = await aspectOf(blob); } catch { throw new Error(t('importNotImage')); }
    let w = 80, h = w * PAGE_ASPECT / aspect;
    if (h > 80) { h = 80; w = h * aspect / PAGE_ASPECT; }
    const object = { id: 1, kind: 'image', x: (100 - w) / 2, y: (100 - h) / 2, w, h, state: { imageRel: 'rIdImg1', imageAspect: aspect } };
    return { objects: [object], images: new Map([['rIdImg1', blob]]) };
  }

  // Markdown (or plain text) becomes one text box filling the page: headings, paragraphs, lists, quotes, tables as
  // lines, bold, italic, code, and links, through the shared Markdown renderer and only the tags the editor writes.
  function markdown({ bytes, t }) {
    const source = new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
    if (!source.trim()) throw new Error(t('importEmpty'));
    const size = n => `font-size:${EdukorsSampleDocument.fontSizeCss(n)}`;
    const el = (tag, children = [], style) => { const node = document.createElement(tag); if (style) node.setAttribute('style', style); node.append(...children); return node; };
    const inline = node => [...node.childNodes].map(child => {
      if (child.nodeType === 3) return document.createTextNode(child.data);
      const kids = inline(child);
      switch (child.tagName) {
        case 'STRONG': return el('b', kids);
        case 'EM': return el('i', kids);
        case 'CODE': return el('span', kids, "font-family:'Courier New', monospace");
        case 'A': { const a = el('a', kids); a.setAttribute('href', child.getAttribute('href') || ''); return a; }
        default: return el('span', kids);
      }
    });
    const blocks = [];
    for (const block of EdukorsMarkdown.render(source).children) {
      const heading = /^H([1-3])$/.exec(block.tagName);
      if (heading) blocks.push(el('div', [el('b', [el('span', inline(block), size([0, 52, 40, 32][heading[1]]))])]));
      else if (block.tagName === 'UL' || block.tagName === 'OL') blocks.push(el(block.tagName.toLowerCase(), [...block.children].map(li => el('li', inline(li)))));
      else if (block.tagName === 'BLOCKQUOTE') for (const p of block.children) blocks.push(el('div', [el('i', inline(p))]));
      else if (block.tagName === 'TABLE') for (const row of block.querySelectorAll('tr')) {
        const cells = [...row.children].flatMap((cell, i) => [...(i ? [document.createTextNode(' | ')] : []), ...inline(cell)]);
        blocks.push(el('div', row.closest('thead') ? [el('b', cells)] : cells));
      }
      else blocks.push(el('div', inline(block)));
    }
    // An empty line between blocks, as in the source.
    const html = blocks.map(block => block.outerHTML).join('<div><br></div>');
    const object = { id: 1, kind: 'text', x: 6, y: 6, w: 88, h: 88, state: { fontSize: 28, valign: 'top', html } };
    return { objects: [object], images: new Map() };
  }

  return Object.freeze({ image, markdown });
})();
