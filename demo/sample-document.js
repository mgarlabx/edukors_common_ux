// Sample document fixture: a small canvas with objects (text, shape, image) for testing the shared shell features.
// It is not a production editor; each app supplies its own. What it exercises:
// - Selection-driven contextual toolbar (EdukorsAppConfig.contextualToolbar): hidden with nothing selected. With several
//   objects of one kind selected, that kind's groups apply to all of them; with mixed kinds, only the shared groups show.
// - Canvas capabilities per app (EdukorsAppConfig.canvas): move (drag, arrow keys), resize (handles, one object),
//   arrange (bring to front / send to back), multiSelect (Shift/Cmd/Ctrl-click, rectangle), contextMenu, insert.
// - Edit group: Cut, Copy, Paste, Duplicate, Delete for objects; Cut, Copy, Paste, Delete for selected text;
//   Undo and Redo for every change (per document history).
// - Insert group: text, shape, image (opens the file browser). Links live inside text, through the link control.
// - Text: click the sample text to edit it; double-click a shape (or Enter / F2) to add or edit centered text.
//   Character formatting applies to the selected part of the text, or to all of it when objects are selected.
//   Paragraph formatting (alignment, lists) applies to whole objects.
// Character formatting uses document.execCommand (deprecated, still implemented by Chromium and WebKit).
(() => {
  const page = document.getElementById('document-placeholder');
  const slot = document.getElementById('context-slot');
  const bar = document.getElementById('context-toolbar');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const scale = 0.36;            // sample text is drawn at 36% of the nominal size so it fits the small canvas
  const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const minSize = 5;             // percent of the canvas
  let active = null;             // active document
  let settleTimer = 0, typingTimer = 0;
  let toolbar = null;            // EdukorsFormat handle (refresh)
  let savedRange = null;         // last selection inside the editing field
  let clipboard = null;          // { type: 'objects', objects } or { type: 'text', text, html }
  let gesture = null;            // pointer move, resize, or rectangle selection in progress
  let menuTarget = null;         // element under the pointer when the right button went down

  const capability = name => EdukorsAppConfig.canvas?.[name] !== false;
  const insertKinds = () => EdukorsAppConfig.canvas?.insert ?? ['text', 'shape', 'image'];
  const messages = () => (EdukorsLanguages[document.documentElement.lang] || EdukorsLanguages.en).messages;
  const message = key => messages()[key] || EdukorsLanguages.en.messages[key];
  const label = kind => message({ text: 'sampleText', shape: 'sampleShape', image: 'sampleImage' }[kind]);
  const clone = value => structuredClone(value);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const charDefaults = { bold: false, italic: false, underline: false, strike: false, script: 'none', fontFamily: 'Arial', color: '#172033' };
  const charKeys = new Set(['bold', 'italic', 'underline', 'strike', 'script', 'fontFamily', 'fontSize', 'color', 'link']);
  const sizeCss = size => `calc(${size * scale}px * var(--font-scale))`;
  const justify = valign => ({ top: 'flex-start', middle: 'center', bottom: 'flex-end' }[valign]);
  const defaults = {
    text: () => ({ ...charDefaults, fontSize: 48, align: 'left', valign: 'middle', list: 'none', link: '', html: null }),
    shape: () => ({ keepRatio: true, shapeType: 'rect', lineWidth: 2, lineStyle: 'solid', lineColor: '#6156db', fill: '#e9e7fb', shadow: false, opacity: 100, ...charDefaults, fontSize: 32, align: 'center', valign: 'middle', html: '' }),
    image: () => ({ keepRatio: true, crop: false, shadow: false, lineWidth: 0, lineStyle: 'solid', lineColor: '#6156db', imageOpacity: 100 })
  };

  // ---------- Model ----------
  function sampleOf(doc) {
    if (!doc.sample) {
      doc.sample = {
        nextId: 4, selection: null, past: [], future: [],
        objects: [
          { id: 1, kind: 'text', x: 6, y: 18, w: 28, h: 30, state: defaults.text() },
          { id: 2, kind: 'shape', x: 38, y: 18, w: 26, h: 30, state: defaults.shape() },
          { id: 3, kind: 'image', x: 68, y: 18, w: 26, h: 30, state: defaults.image() }
        ]
      };
      doc.sample.committed = snapshot(doc.sample);
      doc.sample.baseline = doc.sample.committed; // the content when the document was last saved (never, in the demo)
    }
    return doc.sample;
  }
  const sample = () => sampleOf(active);
  const snapshot = s => JSON.stringify({ objects: s.objects, nextId: s.nextId });
  const objectById = id => sample().objects.find(object => object.id === id);
  const selectedObjects = () => (sample().selection?.ids || []).map(objectById).filter(Boolean);
  const selected = () => { const list = selectedObjects(); return list.length === 1 ? list[0] : null; };   // single selection
  const primary = () => selectedObjects()[0] || null;
  const editing = () => !!sample().selection?.editing;
  const isSelected = object => !!object && !!sample().selection?.ids.includes(object.id);
  function selectionKind() {
    const list = selectedObjects();
    if (!list.length) return null;
    if (list.length === 1 && list[0].kind === 'shape' && editing()) return 'shapeText';
    return new Set(list.map(object => object.kind)).size === 1 ? list[0].kind : 'mixed';
  }
  const nodeOf = object => page.querySelector(`.sample-object[data-id="${object.id}"]`);
  const fieldOf = object => nodeOf(object)?.querySelector('.sample-field');

  // ---------- History (undo / redo) ----------
  // Every change is committed as a snapshot of the objects. Typing and arrow-key moves are grouped until a pause.
  function commit() {
    clearTimeout(typingTimer);
    if (!active) return;
    const s = sample(), now = snapshot(s);
    if (now === s.committed) return;
    s.past.push(s.committed);
    if (s.past.length > 100) s.past.shift();
    s.future = [];
    s.committed = now;
    markModified();
    updateEditButtons();
  }
  // A tab shows a dot while the document differs from its saved content; undoing back to it clears the dot.
  function markModified() {
    const s = sample(), dirty = s.committed !== s.baseline;
    if (active.modified === dirty) return;
    active.modified = dirty;
    document.dispatchEvent(new CustomEvent('edukors:document-modified', { detail: { id: active.id } }));
  }
  const scheduleCommit = () => { clearTimeout(typingTimer); typingTimer = setTimeout(commit, 700); };
  function restore(from, to) {
    commit();
    const s = sample();
    if (!from.length) return;
    to.push(s.committed);
    const data = JSON.parse(from.pop());
    s.objects = data.objects;
    s.nextId = data.nextId;
    s.committed = snapshot(s);
    markModified();
    if (s.selection) {
      s.selection.ids = s.selection.ids.filter(id => objectById(id));
      s.selection.editing = false;
      if (!s.selection.ids.length) s.selection = null;
    }
    renderPage();
    renderBar();
    updateEditButtons();
    (primary() ? nodeOf(primary()) : page)?.focus({ preventScroll: true });
  }
  const undo = () => restore(sample().past, sample().future);
  const redo = () => restore(sample().future, sample().past);

  // ---------- Rendering ----------
  function place(object, node = nodeOf(object)) {
    if (node) Object.assign(node.style, { left: `${object.x}%`, top: `${object.y}%`, width: `${object.w}%`, height: `${object.h}%` });
  }

  // Paragraph formatting and object styles. Character formatting lives in the field's HTML.
  function paint(object, node = nodeOf(object)) {
    if (!node) return;
    const state = object.state;
    if (object.kind === 'text') {
      node.querySelector('.sample-text-line').style.textAlign = state.align;
      node.style.justifyContent = justify(state.valign);
      node.querySelector('.sample-list-mark').textContent = state.list === 'bulleted' ? '• ' : state.list === 'numbered' ? '1. ' : '';
    } else if (object.kind === 'shape') {
      const box = node.querySelector('.sample-shape-box');
      const type = state.shapeType || 'rect';
      const path = EdukorsShapes.paths[type];
      // Rectangles, rounded rectangles, and ellipses are drawn with the box itself; the other shapes with an SVG path.
      const line = state.lineWidth ? `${state.lineWidth}px ${state.lineStyle} ${state.lineColor}` : '1px dashed transparent';
      Object.assign(box.style, {
        border: path ? 'none' : line,
        background: path ? 'none' : state.fill,
        borderRadius: type === 'ellipse' ? '50%' : type === 'rounded' ? '28px' : '0',
        overflow: path ? 'visible' : 'hidden',
        boxShadow: state.shadow && !path ? '0 16px 36px #1720339e' : 'none',
        filter: state.shadow && path ? 'drop-shadow(0 14px 18px #1720339e)' : 'none',
        justifyContent: justify(state.valign),
        opacity: (state.opacity ?? 100) / 100
      });
      let art = box.querySelector('.sample-shape-art');
      if (!path) art?.remove();
      else {
        if (!art) {
          art = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          art.setAttribute('class', 'sample-shape-art');
          art.setAttribute('viewBox', '0 0 100 100');
          art.setAttribute('preserveAspectRatio', 'none');
          art.setAttribute('aria-hidden', 'true');
          art.append(document.createElementNS('http://www.w3.org/2000/svg', 'path'));
          box.prepend(art);
        }
        const outline = art.firstChild;
        outline.setAttribute('d', path);
        outline.setAttribute('vector-effect', 'non-scaling-stroke');
        outline.setAttribute('fill', state.fill);
        outline.setAttribute('stroke', state.lineWidth ? state.lineColor : 'none');
        outline.setAttribute('stroke-width', state.lineWidth);
        outline.setAttribute('stroke-linejoin', 'round');
        outline.setAttribute('stroke-linecap', state.lineStyle === 'dotted' ? 'round' : 'butt');
        outline.setAttribute('stroke-dasharray', { solid: '', dashed: '8 5', dotted: '0.1 5' }[state.lineStyle] || '');
      }
      node.querySelector('.sample-field').style.textAlign = state.align;
    } else {
      const art = node.querySelector('.sample-image-art');
      art.style.opacity = state.imageOpacity / 100;
      art.style.border = state.lineWidth ? `${state.lineWidth}px ${state.lineStyle} ${state.lineColor}` : 'none';
      art.style.boxShadow = state.shadow ? '0 16px 36px #1720339e' : 'none';
      const url = imageUrls.get(state.imageSrc);
      let picture = art.querySelector('img');
      if (url && !picture) { picture = document.createElement('img'); picture.alt = ''; picture.draggable = false; art.replaceChildren(picture); }
      if (url) {
        picture.src = url;
        // The box shows only the uncropped part: the picture is scaled up and shifted so that part fills the box.
        const c = cropOf(state), fw = 1 - c.l - c.r, fh = 1 - c.t - c.b;
        Object.assign(picture.style, { width: `${100 / fw}%`, height: `${100 / fh}%`, left: `${-c.l / fw * 100}%`, top: `${-c.t / fh * 100}%` });
      }
      art.classList.toggle('has-picture', !!url);
      node.classList.toggle('is-cropping', state.crop);
    }
  }

  function buildObject(object) {
    const node = document.createElement('div');
    node.className = `sample-object sample-${object.kind}`;
    node.dataset.id = object.id;
    node.dataset.kind = object.kind;
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', label(object.kind));
    if (object.kind === 'image') node.innerHTML = `<span class="sample-image-art">${EdukorsIcons.svg('slides-image', 40)}</span>`;
    if (object.kind === 'text') node.innerHTML = '<span class="sample-text-line"><span class="sample-list-mark" aria-hidden="true"></span><span class="sample-field sample-text-content"></span></span>';
    if (object.kind === 'shape') node.innerHTML = '<span class="sample-shape-box"><span class="sample-field sample-shape-text"></span></span>';
    const field = node.querySelector('.sample-field');
    if (field) {
      Object.assign(field.style, { fontFamily: charDefaults.fontFamily, color: charDefaults.color, fontSize: sizeCss(object.state.fontSize) });
      field.spellcheck = false;
      field.setAttribute('aria-label', object.kind === 'text' ? label('text') : message('sampleShapeText'));
      if (object.kind === 'text' && object.state.html === null) field.textContent = label('text'); else field.innerHTML = object.state.html;
      fitBaseSize(object, field);
      field.addEventListener('input', () => { object.state.html = field.innerHTML; scheduleCommit(); });
      field.addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault(); });
      field.addEventListener('paste', event => {
        event.preventDefault();
        document.execCommand('insertText', false, (event.clipboardData.getData('text/plain') || '').replace(/\s+/g, ' '));
      });
      for (const type of ['copy', 'cut']) field.addEventListener(type, () => { clipboard = { type: 'text', text: String(getSelection()), html: selectionHtml() }; updateEditButtons(); });
    }
    if (capability('resize')) for (const handle of handles) {
      const grip = document.createElement('span');
      grip.className = `sample-handle handle-${handle}`;
      grip.dataset.handle = handle;
      grip.setAttribute('aria-hidden', 'true');
      node.append(grip);
    }
    place(object, node);
    paint(object, node);
    return node;
  }

  function renderPage() {
    if (!active) { page.replaceChildren(); return; }
    page.replaceChildren(...sample().objects.map(buildObject));
    markSelection();
  }

  // Selection marks, stacking order, and editability, without rebuilding (a caret or text selection survives).
  function markSelection() {
    const s = sample();
    const single = (s.selection?.ids.length || 0) === 1;
    s.objects.forEach((object, index) => {
      const node = nodeOf(object);
      if (!node) return;
      const on = isSelected(object);
      const isEditing = on && single && s.selection.editing;
      node.style.zIndex = index + 1;
      node.classList.toggle('is-selected', on);
      node.classList.toggle('is-single', on && single);
      node.classList.toggle('is-editing', isEditing);
      node.setAttribute('aria-pressed', String(on));
      const field = node.querySelector('.sample-field');
      if (field) {
        field.contentEditable = isEditing ? 'true' : 'false';
        if (isEditing) field.setAttribute('role', 'textbox'); else field.removeAttribute('role');
      }
    });
  }

  // ---------- Selection and editing ----------
  // setSelection(ids, { edit, focus, point, bar }): edit only applies to a single object.
  function setSelection(ids, { edit = false, focus = true, point = null, bar = true } = {}) {
    if (!active) return;
    const s = sample();
    const unique = [...new Set(ids)].filter(id => objectById(id));
    edit = edit && unique.length === 1;
    const previous = s.selection;
    const same = previous && previous.ids.length === unique.length && previous.ids.every((id, i) => id === unique[i]) && !!previous.editing === edit;
    if (same) return;
    if (previous?.editing && !(edit && previous.ids[0] === unique[0])) finishEdit(objectById(previous.ids[0]));
    s.selection = unique.length ? { ids: unique, editing: edit } : null;
    // Crop mode ends when the selection moves away from the image.
    for (const other of s.objects) if (other.kind === 'image' && other.state.crop && !unique.includes(other.id)) { other.state.crop = false; paint(other); }
    savedRange = null;
    markSelection();
    const object = selected();
    if (object && edit) startEdit(object, point);
    else if (focus && primary()) nodeOf(primary())?.focus({ preventScroll: true });
    if (bar) renderBar();
    updateEditButtons();
  }
  const select = (id, options) => setSelection(id === null ? [] : [id], options);
  const toggle = id => {
    const ids = sample().selection?.ids || [];
    setSelection(ids.includes(id) ? ids.filter(other => other !== id) : [...ids, id]);
  };

  function startEdit(object, point) {
    const field = fieldOf(object);
    if (!field) return;
    field.focus({ preventScroll: true });
    const selection = getSelection();
    selection.removeAllRanges();
    const range = point && point !== 'all' && document.caretRangeFromPoint?.(point.x, point.y);
    if (point === 'all') { const all = document.createRange(); all.selectNodeContents(field); selection.addRange(all); }
    else if (range && field.contains(range.startContainer)) selection.addRange(range);
    else { const end = document.createRange(); end.selectNodeContents(field); end.collapse(false); selection.addRange(end); }
  }

  function finishEdit(object) {
    const field = object && fieldOf(object);
    if (!field) return;
    if (!field.textContent.trim()) {
      object.state.html = object.kind === 'text' ? null : '';
      if (object.kind === 'text') field.textContent = label('text'); else field.innerHTML = '';
    } else object.state.html = field.innerHTML;
    commit();
  }

  // ---------- Character formatting ----------
  const rgbToHex = value => {
    const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value || '');
    return match ? `#${match.slice(1, 4).map(n => Number(n).toString(16).padStart(2, '0')).join('')}` : null;
  };
  const insideField = field => { const s = getSelection(); return s.rangeCount > 0 && field.contains(s.getRangeAt(0).commonAncestorContainer); };
  function selectionHtml() {
    const s = getSelection();
    if (!s.rangeCount) return '';
    const holder = document.createElement('div');
    holder.append(s.getRangeAt(0).cloneContents());
    return holder.innerHTML;
  }
  // Puts the selection back into the field: the current one, the saved one (a typed control took the focus), or all
  // of the text when objects themselves are selected.
  function targetSelection(field, whole) {
    const s = getSelection();
    if (!whole && document.activeElement === field && insideField(field)) return;
    field.focus({ preventScroll: true });
    s.removeAllRanges();
    if (!whole && savedRange && field.contains(savedRange.commonAncestorContainer)) s.addRange(savedRange);
    else { const range = document.createRange(); range.selectNodeContents(field); s.addRange(range); }
  }

  // Line spacing follows the text. Each line is at least as tall as the field's own font size (the browser's "strut"),
  // so after the text was made smaller the lines kept the spacing of the old size. The field's own size is therefore
  // kept at the smallest size of its text: one size everywhere → that size on the field and no size on the runs;
  // mixed sizes → every run carries its size and the field takes the smallest. Text nodes are moved, never recreated,
  // so the selection is put back on the same characters.
  function fitBaseSize(object, field) {
    const sizeIn = node => {
      const match = /calc\(([\d.]+)px/.exec(node.style?.fontSize || '');
      return match ? Math.round(Number(match[1]) / scale * 100) / 100 : null;
    };
    const sizedAncestor = text => { for (let node = text.parentElement; node && node !== field; node = node.parentElement) if (sizeIn(node) !== null) return node; return null; };
    const runs = [];
    const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT);
    for (let text; (text = walker.nextNode());) if (text.data.length) runs.push({ text, sized: sizedAncestor(text) });
    if (!runs.length) return;
    const base = sizeIn(field) ?? object.state.fontSize;
    const sizes = runs.map(run => run.sized ? sizeIn(run.sized) : base);
    const smallest = Math.min(...sizes);

    const selection = getSelection();
    const range = selection.rangeCount && field.contains(selection.getRangeAt(0).commonAncestorContainer) ? selection.getRangeAt(0) : null;
    const point = (container, offset) => {
      if (container.nodeType === Node.TEXT_NODE) return [container, offset];
      const after = container.childNodes[offset];
      const inside = after ? document.createTreeWalker(after, NodeFilter.SHOW_TEXT).nextNode() || (after.nodeType === Node.TEXT_NODE ? after : null) : null;
      if (inside) return [inside, 0];
      const last = runs.filter(run => container.contains(run.text)).at(-1);
      return last ? [last.text, last.text.data.length] : null;
    };
    const saved = range && [point(range.startContainer, range.startOffset), point(range.endContainer, range.endOffset)];

    if (sizes.every(size => size === smallest)) {
      for (const node of field.querySelectorAll('[style]')) {
        node.style.removeProperty('font-size');
        if (!node.getAttribute('style')) node.removeAttribute('style');
        if (node.localName === 'span' && !node.attributes.length) node.replaceWith(...node.childNodes);
      }
    } else {
      runs.forEach((run, index) => {
        if (run.sized) return;
        const span = document.createElement('span');
        span.style.fontSize = sizeCss(sizes[index]);
        run.text.replaceWith(span);
        span.append(run.text);
      });
    }
    field.style.fontSize = sizeCss(smallest);
    // A text object's field sits in a line box of its own: that box (and the list mark in it) takes the same size.
    if (object.kind === 'text') field.parentElement.style.fontSize = sizeCss(smallest);

    if (saved?.[0] && saved[1] && field.contains(saved[0][0]) && field.contains(saved[1][0])) {
      const again = document.createRange();
      again.setStart(...saved[0]); again.setEnd(...saved[1]);
      selection.removeAllRanges(); selection.addRange(again);
    }
  }

  function applyCharacter(object, property, value) {
    const field = fieldOf(object);
    if (!field) return;
    const whole = !editing();
    if (whole) {
      // Objects themselves are selected: format all of the text, then leave them selected (not editing).
      if (object.kind === 'text' && object.state.html === null) object.state.html = field.innerHTML;
      if (!field.textContent.trim()) return;
      field.contentEditable = 'true';
    }
    targetSelection(field, whole);
    const toggleCommand = (command, on) => { if (document.queryCommandState(command) !== on) document.execCommand(command); };
    document.execCommand('styleWithCSS', false, true);
    if (property === 'bold') toggleCommand('bold', value);
    if (property === 'italic') toggleCommand('italic', value);
    if (property === 'underline') toggleCommand('underline', value);
    if (property === 'strike') toggleCommand('strikeThrough', value);
    if (property === 'script') {
      // <sub>/<sup> elements (not CSS) so the text also gets smaller, as expected for sub/superscript.
      document.execCommand('styleWithCSS', false, false);
      toggleCommand('subscript', value === 'sub');
      toggleCommand('superscript', value === 'super');
    }
    if (property === 'color') document.execCommand('foreColor', false, value);
    if (property === 'fontFamily') document.execCommand('fontName', false, value);
    if (property === 'fontSize') {
      // execCommand only knows sizes 1–7: apply 7, then replace that marker with the requested size.
      document.execCommand('fontSize', false, '7');
      for (const node of field.querySelectorAll('[style*="xxx-large"], font[size="7"]')) { node.style.fontSize = sizeCss(value); node.removeAttribute('size'); }
      fitBaseSize(object, field);
    }
    if (property === 'link') {
      document.execCommand('styleWithCSS', false, false);
      if (!value && getSelection().rangeCount) {
        // With only a caret, unlink does nothing: remove the whole link the caret is in.
        const range = getSelection().getRangeAt(0);
        const anchor = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement)?.closest('a');
        if (range.collapsed && anchor && field.contains(anchor)) { range.selectNodeContents(anchor); getSelection().removeAllRanges(); getSelection().addRange(range); }
      }
      document.execCommand(value ? 'createLink' : 'unlink', false, value || undefined);
    }
    object.state.html = field.innerHTML;
    if (whole) {
      getSelection().removeAllRanges();
      field.contentEditable = 'false';
    } else if (insideField(field)) savedRange = getSelection().getRangeAt(0).cloneRange();
  }

  // Reads the formatting at the caret or selection, so the toolbar shows it.
  function readCharacter(object) {
    const field = fieldOf(object);
    if (!field || !insideField(field)) return false;
    const at = getSelection().getRangeAt(0).startContainer;
    const element = at.nodeType === 1 ? at : at.parentElement;
    const fontScale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--font-scale')) || 1;
    const sizeOf = node => Math.round(parseFloat(getComputedStyle(node).fontSize) / fontScale / scale);
    const script = document.queryCommandState('subscript') ? 'sub' : document.queryCommandState('superscript') ? 'super' : 'none';
    const next = {
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strike: document.queryCommandState('strikeThrough'),
      script,
      fontFamily: getComputedStyle(element).fontFamily.split(',')[0].replace(/["']/g, '').trim(),
      color: rgbToHex(getComputedStyle(element).color) || object.state.color,
      // Sub/superscript text is drawn smaller; report the size of the surrounding text.
      fontSize: sizeOf(script === 'none' ? element : (element.closest('sub, sup')?.parentElement || element)),
      link: element.closest('a')?.getAttribute('href') || ''
    };
    let changed = false;
    for (const [key, value] of Object.entries(next)) if (object.state[key] !== value) { object.state[key] = value; changed = true; }
    return changed;
  }

  document.addEventListener('selectionchange', () => {
    if (!active || !editing()) return;
    const object = selected(), field = object && fieldOf(object);
    if (!field || document.activeElement !== field) return;
    if (insideField(field)) savedRange = getSelection().getRangeAt(0).cloneRange();
    if (readCharacter(object)) toolbar?.refresh();
    updateEditButtons();
  });

  // ---------- Object actions ----------
  // Inserts copies (offset a little) above the given index, or at the top, and selects them.
  function insertCopies(sources, { offset = 3, after = null } = {}) {
    const s = sample();
    const copies = sources.map(source => {
      const copy = { ...clone(source), id: s.nextId++ };
      copy.x = clamp(copy.x + offset, 0, 100 - copy.w);
      copy.y = clamp(copy.y + offset, 0, 100 - copy.h);
      return copy;
    });
    const index = after === null ? s.objects.length - 1 : after;
    s.objects.splice(index + 1, 0, ...copies);
    renderPage();
    setSelection(copies.map(copy => copy.id));
    commit();
    return copies;
  }
  const topIndex = list => Math.max(...list.map(object => sample().objects.indexOf(object)));
  function textAction(command) {
    const object = selected(), field = fieldOf(object);
    targetSelection(field, false);
    if (command === 'copy' || command === 'cut') clipboard = { type: 'text', text: String(getSelection()), html: selectionHtml() };
    if (command === 'copy') document.execCommand('copy');
    if (command === 'cut' || command === 'delete') document.execCommand('delete');
    if (command === 'paste') document.execCommand('insertHTML', false, clipboard.html || clipboard.text);
    object.state.html = field.innerHTML;
    commit();
    updateEditButtons();
  }
  const actions = {
    copy() {
      if (editing()) return textAction('copy');
      if (selectedObjects().length) clipboard = { type: 'objects', objects: clone(selectedObjects()) };
      updateEditButtons();
    },
    cut() { if (editing()) return textAction('cut'); actions.copy(); actions.delete(); },
    paste() {
      if (editing()) { if (clipboard?.type === 'text') textAction('paste'); return; }
      if (clipboard?.type !== 'objects') return;
      const copies = insertCopies(clipboard.objects, { after: selectedObjects().length ? topIndex(selectedObjects()) : null });
      clipboard = { type: 'objects', objects: clone(copies) }; // the next paste offsets again
    },
    duplicate() {
      const list = selectedObjects();
      if (editing() || !list.length) return;
      insertCopies(list, { after: topIndex(list) });
    },
    delete() {
      if (editing()) return textAction('delete');
      const list = selectedObjects();
      if (!list.length) return;
      sample().objects = sample().objects.filter(object => !list.includes(object));
      sample().selection = null;
      renderPage();
      renderBar();
      commit();
      page.focus({ preventScroll: true });
    },
    // Stacking order keeps the selected objects' relative order.
    bringToFront() {
      const list = selectedObjects();
      if (!list.length || !capability('arrange')) return;
      sample().objects = [...sample().objects.filter(o => !list.includes(o)), ...sample().objects.filter(o => list.includes(o))];
      markSelection(); commit();
    },
    sendToBack() {
      const list = selectedObjects();
      if (!list.length || !capability('arrange')) return;
      sample().objects = [...sample().objects.filter(o => list.includes(o)), ...sample().objects.filter(o => !list.includes(o))];
      markSelection(); commit();
    },
    alignTop: () => alignObjects('top'), alignMiddle: () => alignObjects('middle'), alignBottom: () => alignObjects('bottom'),
    alignLeft: () => alignObjects('left'), alignRight: () => alignObjects('right'), alignCenter: () => alignObjects('center'),
    distributeH: () => distributeObjects('x'), distributeV: () => distributeObjects('y'),
    undo, redo,
    insertText() { insertNew('text', { edit: true }); },
    // Insert → shape opens a grid of shapes (under the toolbar button, or at the pointer for the context menu).
    insertShape(point) {
      if (!insertKinds().includes('shape') || !active) return;
      const anchor = document.querySelector('[data-command="insertShape"]').getBoundingClientRect();
      const doc = active;
      EdukorsShapes.pick({
        x: point?.x ?? anchor.left, y: point?.y ?? anchor.bottom + 6, t: message,
        restoreFocus: primary() ? nodeOf(primary()) : page,
        onPick: type => { if (doc === active) insertNew('shape', { shapeType: type }); }
      });
    },
    // Insert → image asks for the file first; cancelling the browser inserts nothing.
    insertImage() { if (insertKinds().includes('image')) pickImage(async file => {
      const holder = { state: defaults.image() };
      if (await setPicture(holder, file)) insertNew('image', { picture: holder.state });
    }); },
    replaceImage() {
      const target = selected();
      if (!target || target.kind !== 'image') return;
      pickImage(async file => {
        if (!await setPicture(target, file)) return;
        // The new picture fits inside the old box, keeping the center and its own proportions.
        const { w, h } = fitBox(target.state.imageAspect, target.w, target.h);
        Object.assign(target, { x: target.x + (target.w - w) / 2, y: target.y + (target.h - h) / 2, w, h });
        place(target); paint(target); renderBar(); commit();
      });
    }
  };
  // Opens the system file browser. Pictures live in `imageUrls`; object state keeps only a short key,
  // so history snapshots stay small. A real host would copy the file into the document package instead.
  function pickImage(onPick) {
    const doc = active;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file && file.type.startsWith('image/') && doc === active) onPick(file);
    });
    input.click();
  }
  // A QR code is an ordinary image object made from the address; the text and its link are not changed.
  function createQr(url) {
    if (!active) return;
    let svg;
    try { svg = EdukorsQr.svgText(url, { margin: 1 }); } catch { return; }
    const key = `img${++imageCounter}`;
    imageUrls.set(key, URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })));
    insertNew('image', { picture: { ...defaults.image(), imageSrc: key, imageAspect: 1, cropBox: null }, max: [18, 40] });
  }

  // Crop: the fractions (0–1) removed from each side of the picture. Without a picture there is nothing to crop.
  const cropOf = state => ({ l: 0, t: 0, r: 0, b: 0, ...state.cropBox });
  // Width ÷ height, in pixels, of the part of the picture the box shows. Undefined for the placeholder.
  function visibleAspect(state) {
    if (!state.imageAspect) return undefined;
    const c = cropOf(state);
    return state.imageAspect * (1 - c.l - c.r) / (1 - c.t - c.b);
  }
  // Largest box (percent of the canvas) with the given pixel aspect that fits inside maxW × maxH percent.
  function fitBox(aspect, maxW, maxH) {
    const { width, height } = page.getBoundingClientRect();
    let w = maxW, h = w * width / (aspect * height);
    if (h > maxH) { h = maxH; w = h * aspect * height / width; }
    return { w, h };
  }
  // Stores the file and its natural proportions, with no crop. Resolves once the size is known.
  function setPicture(object, file) {
    const url = URL.createObjectURL(file);
    return new Promise(resolve => {
      const probe = new Image();
      probe.onload = () => {
        const key = `img${++imageCounter}`;
        imageUrls.set(key, url);
        Object.assign(object.state, { imageSrc: key, imageAspect: probe.naturalWidth / probe.naturalHeight, cropBox: null });
        if (!(object.state.imageAspect > 0) || !Number.isFinite(object.state.imageAspect)) object.state.imageAspect = 1;
        resolve(true);
      };
      probe.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
      probe.src = url;
    });
  }
  const imageUrls = new Map();
  let imageCounter = 0;
  // New objects go to the canvas center, a little offset from earlier insertions so they do not stack exactly.
  function insertNew(kind, { edit = false, picture = null, shapeType = null, max = [40, 50] } = {}) {
    if (!insertKinds().includes(kind)) return;
    const s = sample();
    const count = s.objects.length % 6;
    const size = { text: [28, 22], shape: [24, 28], image: [24, 28] }[kind];
    const object = { id: s.nextId++, kind, w: size[0], h: size[1], state: defaults[kind]() };
    object.x = clamp(50 - object.w / 2 + count * 2, 0, 100 - object.w);
    object.y = clamp(42 - object.h / 2 + count * 2, 0, 100 - object.h);
    if (shapeType) {
      object.state.shapeType = shapeType;
      // Shapes that look right only when square get a square box on screen.
      if (EdukorsShapes.square(shapeType)) {
        const { w, h } = fitBox(1, 24, 40);
        Object.assign(object, { w, h });
        object.x = clamp(50 - w / 2 + count * 2, 0, 100 - w);
        object.y = clamp(42 - h / 2 + count * 2, 0, 100 - h);
      }
    }
    if (picture) {
      object.state = picture;
      // The box takes the picture's proportions, within `max` percent of the canvas.
      const { w, h } = fitBox(object.state.imageAspect, max[0], max[1]);
      Object.assign(object, { w, h });
      object.x = clamp(50 - w / 2 + count * 2, 0, 100 - w);
      object.y = clamp(42 - h / 2 + count * 2, 0, 100 - h);
    }
    s.objects.push(object);
    renderPage();
    setSelection([object.id], { edit, point: edit ? 'all' : null });
    commit();
  }

  // Availability: objects → cut, copy, paste (objects were copied), duplicate, delete; selected text → cut, copy,
  // paste (text was copied), delete; undo and redo follow the history; insert follows the app's list.
  function availability() {
    const s = active && sample();
    const textMode = !!s && editing();
    const object = s && selected();
    const field = textMode && object && fieldOf(object);
    const hasText = !!field && insideField(field) && !getSelection().isCollapsed;
    const hasObjects = !!s && !textMode && selectedObjects().length > 0;
    const inserts = insertKinds();
    return {
      undo: !!s?.past.length, redo: !!s?.future.length,
      cut: textMode ? hasText : hasObjects, copy: textMode ? hasText : hasObjects, delete: textMode ? hasText : hasObjects,
      paste: textMode ? clipboard?.type === 'text' : clipboard?.type === 'objects',
      duplicate: hasObjects,
      bringToFront: hasObjects && capability('arrange'), sendToBack: hasObjects && capability('arrange'),
      insertText: inserts.includes('text'), insertShape: inserts.includes('shape'), insertImage: inserts.includes('image')
    };
  }
  function updateEditButtons() {
    if (!active) return;
    const available = availability();
    for (const button of document.querySelectorAll('#edit-actions .tool')) {
      button.removeAttribute('aria-description');
      if (available[button.dataset.command]) button.removeAttribute('aria-disabled'); else button.setAttribute('aria-disabled', 'true');
    }
    for (const button of document.querySelectorAll('#insert-actions .tool')) {
      button.removeAttribute('aria-description');
      // Insert types an app does not offer are left out (they are not a temporary state). The shell starts every
      // Insert button unavailable, so an offered one must also be enabled here.
      button.hidden = !available[button.dataset.command];
      if (available[button.dataset.command]) button.removeAttribute('aria-disabled'); else button.setAttribute('aria-disabled', 'true');
    }
  }
  for (const button of document.querySelectorAll('#edit-actions .tool, #insert-actions .tool')) {
    // Pointer down keeps the focus (and text selection) in the editing field.
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', () => { if (active && availability()[button.dataset.command]) actions[button.dataset.command](); });
  }

  // ---------- Align and distribute (several objects selected) ----------
  function alignObjects(mode) {
    const list = selectedObjects();
    if (list.length < 2 || !capability('arrange')) return;
    const left = Math.min(...list.map(o => o.x)), right = Math.max(...list.map(o => o.x + o.w));
    const top = Math.min(...list.map(o => o.y)), bottom = Math.max(...list.map(o => o.y + o.h));
    for (const o of list) {
      if (mode === 'left') o.x = left;
      if (mode === 'right') o.x = right - o.w;
      if (mode === 'center') o.x = (left + right) / 2 - o.w / 2;
      if (mode === 'top') o.y = top;
      if (mode === 'bottom') o.y = bottom - o.h;
      if (mode === 'middle') o.y = (top + bottom) / 2 - o.h / 2;
      place(o);
    }
    commit();
  }
  // Equal gaps between objects; the outermost two stay where they are. Needs at least three objects.
  function distributeObjects(axis) {
    const list = selectedObjects();
    if (list.length < 3 || !capability('arrange')) return;
    const pos = axis === 'x' ? 'x' : 'y', size = axis === 'x' ? 'w' : 'h';
    const sorted = [...list].sort((a, b) => a[pos] - b[pos]);
    const start = sorted[0][pos], end = Math.max(...sorted.map(o => o[pos] + o[size]));
    const gap = (end - start - sorted.reduce((sum, o) => sum + o[size], 0)) / (sorted.length - 1);
    let cursor = start;
    for (const o of sorted) { o[pos] = cursor; cursor += o[size] + gap; place(o); }
    commit();
  }

  // ---------- Context menu ----------
  const shortcut = (keys, shift = false) => EdukorsPlatform.mac ? `${shift ? '⇧' : ''}⌘${keys}` : `Ctrl+${shift ? 'Shift+' : ''}${keys}`;
  function openMenu(x, y) {
    if (!capability('contextMenu')) return;
    const available = availability();
    const item = (key, keys) => ({ label: message(key), shortcut: keys, disabled: !available[key], action: actions[key] });
    const list = selectedObjects();
    const items = [];
    if (list.length || editing()) {
      items.push(item('cut', shortcut('X')), item('copy', shortcut('C')), item('paste', shortcut('V')));
      if (!editing()) items.push(item('duplicate', shortcut('D')));
      items.push(item('delete', EdukorsPlatform.mac ? '⌫' : 'Del'));
      if (!editing() && capability('arrange')) items.push({ separator: true }, item('bringToFront', shortcut(']', true)), item('sendToBack', shortcut('[', true)));
      if (!editing() && list.length > 1 && capability('arrange')) {
        const many = list.length > 2;
        items.push({ separator: true },
          ...['alignTop', 'alignMiddle', 'alignBottom'].map(key => ({ label: message(key), action: actions[key] })),
          { separator: true },
          ...['alignLeft', 'alignCenter', 'alignRight'].map(key => ({ label: message(key), action: actions[key] })),
          { separator: true },
          { label: message('distributeH'), disabled: !many, action: actions.distributeH },
          { label: message('distributeV'), disabled: !many, action: actions.distributeV });
      }
      const object = selected();
      if (object && !editing() && object.kind !== 'image') items.push({ separator: true }, { label: message('editText'), shortcut: EdukorsPlatform.mac ? '↩' : 'Enter', action: () => select(object.id, { edit: true }) });
    } else {
      // Empty canvas: paste and the app's insert types.
      items.push(item('paste', shortcut('V')));
      const inserts = ['insertText', 'insertShape', 'insertImage'].filter(key => available[key]);
      if (inserts.length) items.push({ separator: true }, ...inserts.map(key => key === 'insertShape' ? { ...item(key), action: () => actions.insertShape({ x, y }) } : item(key)));
    }
    const restoreFocus = editing() ? fieldOf(selected()) : (primary() ? nodeOf(primary()) : page);
    EdukorsContextMenu.open({ x, y, label: message('objectActions'), items, restoreFocus });
  }
  page.addEventListener('contextmenu', event => {
    if (!active || !capability('contextMenu')) return;
    event.preventDefault();
    // Selecting can open the contextual toolbar, which moves the canvas before this event arrives; the element pressed
    // is the one the menu belongs to.
    const target = menuTarget?.isConnected ? menuTarget : event.target;
    menuTarget = null;
    const node = target.closest('.sample-object');
    const object = node && objectById(Number(node.dataset.id));
    const inField = object && editing() && selected() === object && target.closest('.sample-field');
    if (!inField && !isSelected(object)) select(object ? object.id : null, { focus: true });
    openMenu(event.clientX, event.clientY);
  });

  // ---------- Pointer: select, move, resize, rectangle selection, edit ----------
  const additive = event => capability('multiSelect') && (event.shiftKey || EdukorsPlatform.isModifier(event));
  page.addEventListener('pointerdown', event => {
    if (event.button === 2) menuTarget = event.target;
    if (!active || event.button !== 0) return;
    const node = event.target.closest('.sample-object');
    const rect = page.getBoundingClientRect();
    if (!node) {
      // Rectangle selection from an empty area (Shift/Cmd/Ctrl adds to the selection).
      event.preventDefault();
      if (editing()) setSelection(selectedObjects().map(o => o.id), { focus: false, bar: false });
      gesture = { marquee: true, rect, startX: event.clientX, startY: event.clientY, base: additive(event) ? (sample().selection?.ids || []) : [], moved: false };
      page.setPointerCapture(event.pointerId);
      return;
    }
    const object = objectById(Number(node.dataset.id));
    const handle = event.target.closest('.sample-handle')?.dataset.handle;
    const inEditingField = editing() && selected() === object && event.target.closest('.sample-field');
    if (inEditingField && !handle) return; // native caret placement and text selection
    event.preventDefault();
    if (additive(event)) { toggle(object.id); if (!isSelected(object)) return; }
    else if (!isSelected(object) || editing()) select(object.id);
    nodeOf(object)?.focus({ preventScroll: true });
    const group = handle ? [object] : selectedObjects();
    gesture = {
      object, handle, rect, startX: event.clientX, startY: event.clientY, moved: false,
      onText: !!event.target.closest('.sample-field'), link: event.target.closest('.sample-field a'), additive: additive(event),
      origins: group.map(item => ({ item, x: item.x, y: item.y, w: item.w, h: item.h, crop: cropOf(item.state) }))
    };
    page.setPointerCapture(event.pointerId);
  });
  page.addEventListener('pointermove', event => {
    if (!gesture) return;
    const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
    if (!gesture.moved && distance < 3) return;
    const dx = (event.clientX - gesture.startX) / gesture.rect.width * 100;
    const dy = (event.clientY - gesture.startY) / gesture.rect.height * 100;
    if (gesture.marquee) {
      gesture.moved = true;
      const x1 = clamp((gesture.startX - gesture.rect.left) / gesture.rect.width * 100, 0, 100), y1 = clamp((gesture.startY - gesture.rect.top) / gesture.rect.height * 100, 0, 100);
      const x2 = clamp(x1 + dx, 0, 100), y2 = clamp(y1 + dy, 0, 100);
      const box = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
      let marquee = page.querySelector('.sample-marquee');
      if (!marquee) { marquee = document.createElement('div'); marquee.className = 'sample-marquee'; page.append(marquee); }
      Object.assign(marquee.style, { left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` });
      // Objects entirely inside the rectangle are selected (marked live; the toolbar updates on release).
      const inside = sample().objects.filter(o => o.x >= box.x && o.y >= box.y && o.x + o.w <= box.x + box.w && o.y + o.h <= box.y + box.h).map(o => o.id);
      const ids = capability('multiSelect') ? [...gesture.base, ...inside] : inside.slice(-1);
      sample().selection = ids.length ? { ids: [...new Set(ids)], editing: false } : null;
      markSelection();
      return;
    }
    const { handle } = gesture;
    if (handle && capability('resize')) {
      gesture.moved = true;
      const origin = gesture.origins[0], object = origin.item;
      let { x, y, w, h } = origin;
      const picture = object.kind === 'image' && object.state.imageAspect;
      const cropping = picture && object.state.crop;
      if (handle.includes('e')) w = clamp(origin.w + dx, minSize, 100 - origin.x);
      if (handle.includes('s')) h = clamp(origin.h + dy, minSize, 100 - origin.y);
      if (handle.includes('w')) { x = clamp(origin.x + dx, 0, origin.x + origin.w - minSize); w = origin.x + origin.w - x; }
      if (handle.includes('n')) { y = clamp(origin.y + dy, 0, origin.y + origin.h - minSize); h = origin.y + origin.h - y; }
      if (cropping) {
        // Cropping moves the picture's edges: the picture keeps its scale, and the box reveals more or less of it.
        const c = origin.crop, fw = 1 - c.l - c.r, fh = 1 - c.t - c.b, sx = origin.w / fw, sy = origin.h / fh;
        const crop = { ...c };
        if (handle.includes('e')) { w = clamp(w, minSize, sx * (1 - c.l) ); crop.r = 1 - c.l - w / sx; }
        if (handle.includes('w')) { x = clamp(x, origin.x - c.l * sx, origin.x + origin.w - minSize); w = origin.x + origin.w - x; crop.l = c.l + (x - origin.x) / sx; }
        if (handle.includes('s')) { h = clamp(h, minSize, sy * (1 - c.t)); crop.b = 1 - c.t - h / sy; }
        if (handle.includes('n')) { y = clamp(y, origin.y - c.t * sy, origin.y + origin.h - minSize); h = origin.y + origin.h - y; crop.t = c.t + (y - origin.y) / sy; }
        object.state.cropBox = crop;
        paint(object);
      } else if (object.state.keepRatio) {
        // With Keep proportions on, width and height follow each other from the dragged handle. A picture keeps the
        // proportions of the part it shows; anything else keeps the proportions it had when the drag began.
        const ratio = picture ? visibleAspect(object.state) * gesture.rect.height / gesture.rect.width : origin.w / origin.h; // w% ÷ h%
        const horizontal = handle.includes('e') || handle.includes('w'), vertical = handle.includes('n') || handle.includes('s');
        let scale = horizontal && vertical ? Math.max(w / origin.w, h / origin.h) : horizontal ? w / origin.w : h / origin.h;
        // Largest scale that stays inside the canvas, given which edges stay fixed.
        const room = (handle.includes('w') ? origin.x + origin.w : handle.includes('e') ? 100 - origin.x : Math.min(origin.x + origin.w / 2, 100 - origin.x - origin.w / 2) * 2);
        const roomY = (handle.includes('n') ? origin.y + origin.h : handle.includes('s') ? 100 - origin.y : Math.min(origin.y + origin.h / 2, 100 - origin.y - origin.h / 2) * 2);
        scale = Math.min(scale, room / origin.w, roomY / origin.h);
        scale = Math.max(scale, minSize / origin.w, minSize / origin.h);
        w = origin.w * scale; h = w / ratio;
        x = handle.includes('w') ? origin.x + origin.w - w : handle.includes('e') ? origin.x : origin.x + (origin.w - w) / 2;
        y = handle.includes('n') ? origin.y + origin.h - h : handle.includes('s') ? origin.y : origin.y + (origin.h - h) / 2;
      }
      Object.assign(object, { x, y, w, h });
      place(object);
    } else if (!handle && gesture.origins.length === 1 && gesture.origins[0].item.kind === 'image' && gesture.origins[0].item.state.crop && gesture.origins[0].item.state.imageAspect) {
      // In crop mode, dragging moves the picture inside the box: the visible window slides the opposite way.
      gesture.moved = true;
      const origin = gesture.origins[0], c = origin.crop, fw = 1 - c.l - c.r, fh = 1 - c.t - c.b;
      const l = clamp(c.l - dx / (origin.w / fw), 0, 1 - fw), t = clamp(c.t - dy / (origin.h / fh), 0, 1 - fh);
      origin.item.state.cropBox = { l, t, r: 1 - fw - l, b: 1 - fh - t };
      paint(origin.item);
    } else if (!handle && capability('move')) {
      gesture.moved = true;
      // The group moves together and stays inside the canvas.
      const minX = Math.min(...gesture.origins.map(o => o.x)), maxX = Math.max(...gesture.origins.map(o => o.x + o.w));
      const minY = Math.min(...gesture.origins.map(o => o.y)), maxY = Math.max(...gesture.origins.map(o => o.y + o.h));
      const mx = clamp(dx, -minX, 100 - maxX), my = clamp(dy, -minY, 100 - maxY);
      for (const origin of gesture.origins) { origin.item.x = origin.x + mx; origin.item.y = origin.y + my; place(origin.item); nodeOf(origin.item)?.classList.add('is-moving'); }
    }
  });
  page.addEventListener('pointerup', event => {
    if (!gesture) return;
    const current = gesture;
    gesture = null;
    if (current.marquee) {
      page.querySelector('.sample-marquee')?.remove();
      if (!current.moved) { setSelection(current.base, { focus: false }); page.focus({ preventScroll: true }); return; }
      const ids = sample().selection?.ids || [];
      sample().selection = null;
      setSelection(ids, { focus: ids.length > 0 });
      if (!ids.length) page.focus({ preventScroll: true });
      return;
    }
    for (const origin of current.origins) nodeOf(origin.item)?.classList.remove('is-moving');
    if (current.moved) { commit(); return; }
    // A plain click on a link outside text editing opens it.
    if (current.link && !current.additive) { openLink(current.link.getAttribute('href')); return; }
    // A click (no drag, no modifier) inside a group selects just that object; on the sample text it starts editing.
    if (!current.additive && selectedObjects().length > 1) select(current.object.id);
    if (!current.additive && current.onText && current.object.kind === 'text') select(current.object.id, { edit: true, point: { x: event.clientX, y: event.clientY } });
  });
  // While text is being edited, a plain click places the caret, so links open with Cmd/Ctrl+click.
  page.addEventListener('click', event => {
    const link = event.target.closest?.('.sample-field a');
    if (link && editing() && (event.metaKey || event.ctrlKey)) { event.preventDefault(); openLink(link.getAttribute('href')); }
  });
  function openLink(href) {
    if (/^(https?:|mailto:)/i.test(href || '')) window.open(href, '_blank', 'noopener,noreferrer');
  }
  page.addEventListener('pointercancel', () => { gesture = null; page.querySelector('.sample-marquee')?.remove(); });
  page.addEventListener('dblclick', event => {
    // A pressed pointer is captured by the page, so the event target is the page: find the object under the pointer.
    const node = document.elementFromPoint(event.clientX, event.clientY)?.closest('.sample-object');
    const object = node && objectById(Number(node.dataset.id));
    if (object && object.kind !== 'image' && !editing() && !additive(event)) select(object.id, { edit: true, point: { x: event.clientX, y: event.clientY } });
  });
  // Clicking the empty workspace around the page clears the selection.
  document.querySelector('.workspace').addEventListener('pointerdown', event => {
    if (active && !event.composedPath().includes(page)) select(null, { focus: false });
  });
  // Tab focus selects an object (unless it is already part of the selection).
  page.addEventListener('focusin', event => {
    const node = event.target.closest?.('.sample-object');
    if (node && event.target === node && !gesture && !isSelected(objectById(Number(node.dataset.id)))) select(Number(node.dataset.id), { focus: false });
  });

  // ---------- Keyboard ----------
  const isTyping = target => target.closest?.('input, textarea, select');
  document.addEventListener('keydown', event => {
    if (!active || event.defaultPrevented || document.querySelector('dialog[open]') || EdukorsContextMenu.isOpen()) return;
    const mod = EdukorsPlatform.isModifier(event);
    const key = event.key.toLowerCase();
    // Undo / redo everywhere except typed toolbar fields (they keep their native undo).
    if (mod && key === 'z' && !isTyping(event.target)) { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if (!EdukorsPlatform.mac && event.ctrlKey && key === 'y' && !isTyping(event.target)) { event.preventDefault(); redo(); return; }
    const list = selectedObjects();
    if (event.key === 'Escape' && list.length && !isTyping(event.target) && !event.target.closest('.pick-menu')) {
      event.preventDefault();
      if (editing()) select(list[0].id); else { select(null, { focus: false }); page.focus({ preventScroll: true }); }
      return;
    }
    // Select all objects (outside text editing).
    if (mod && key === 'a' && !editing() && !isTyping(event.target) && page.contains(event.target) && capability('multiSelect')) {
      event.preventDefault();
      setSelection(sample().objects.map(o => o.id));
      return;
    }
    if (!list.length || editing() || isTyping(event.target) || !page.contains(event.target)) return;
    const object = selected();
    if ((event.key === 'Enter' || event.key === 'F2') && object && object.kind !== 'image') { event.preventDefault(); select(object.id, { edit: true }); return; }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); actions.delete(); return; }
    if (mod && key === 'd') { event.preventDefault(); actions.duplicate(); return; }
    if (mod && event.shiftKey && event.code === 'BracketRight') { event.preventDefault(); actions.bringToFront(); return; }
    if (mod && event.shiftKey && event.code === 'BracketLeft') { event.preventDefault(); actions.sendToBack(); return; }
    if ((event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) && capability('contextMenu')) {
      event.preventDefault();
      const rect = nodeOf(list[0]).getBoundingClientRect();
      openMenu(rect.left + 12, rect.top + 12);
      return;
    }
    const step = event.shiftKey ? 2 : 0.5;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key] && capability('move')) {
      event.preventDefault();
      const minX = Math.min(...list.map(o => o.x)), maxX = Math.max(...list.map(o => o.x + o.w));
      const minY = Math.min(...list.map(o => o.y)), maxY = Math.max(...list.map(o => o.y + o.h));
      const mx = clamp(moves[event.key][0], -minX, 100 - maxX), my = clamp(moves[event.key][1], -minY, 100 - maxY);
      for (const item of list) { item.x += mx; item.y += my; place(item); }
      scheduleCommit();
    }
  });
  // Clipboard shortcuts for objects (text fields keep the native behavior).
  for (const type of ['copy', 'cut', 'paste']) document.addEventListener(type, event => {
    if (!active || editing() || isTyping(event.target) || !(page.contains(event.target) || event.target === document.body)) return;
    if (type === 'paste' ? clipboard?.type !== 'objects' : !selectedObjects().length) return;
    event.preventDefault();
    actions[type]();
  });

  // ---------- Contextual toolbar ----------
  // Opens or closes the toolbar slot. Its content stays visible while it slides closed. Pick menus may extend below the
  // toolbar only once it has settled open (the slot clips its content while it animates).
  function setSlot(open) {
    clearTimeout(settleTimer);
    slot.inert = !open;
    slot.classList.toggle('is-open', open);
    slot.classList.remove('is-settled');
    if (open) settleTimer = setTimeout(() => slot.classList.add('is-settled'), reducedMotion.matches ? 0 : 220);
  }
  // Groups for the selection: the configured list for one kind; for mixed kinds, the groups every kind shares.
  function groupsFor(kind) {
    const config = EdukorsAppConfig.contextualToolbar || {};
    let groups;
    if (kind === 'mixed') {
      const lists = [...new Set(selectedObjects().map(o => o.kind))].map(k => config[k] || []);
      groups = lists[0].filter(group => lists.every(list => list.includes(group)));
    } else groups = config[kind] || [];
    return groups.filter(group => group !== 'arrange' || capability('arrange'));
  }
  function renderBar() {
    const kind = active && selectionKind();
    const groups = kind ? groupsFor(kind) : [];
    bar.setAttribute('aria-label', message('contextToolbar'));
    toolbar = null;
    if (groups.length) {
      const list = selectedObjects(), lead = list[0];
      if (editing()) readCharacter(lead);
      toolbar = EdukorsFormat.render(bar, {
        groups, state: lead.state, t: message,
        onChange: (property, value) => {
          if (property === 'createQr') { setTimeout(() => createQr(value), 0); return; }
          if (actions[property] && value === undefined) { actions[property](); return; }
          // The lead object's state is already updated; the others in the selection follow.
          for (const object of list) {
            if (object !== lead && property in object.state) object.state[property] = value;
            if (charKeys.has(property) && object.kind !== 'image') applyCharacter(object, property, value);
            paint(object);
          }
          if (!editing() && charKeys.has(property)) nodeOf(lead)?.focus({ preventScroll: true });
          commit();
        }
      });
    }
    setSlot(groups.length > 0);
  }
  // A pending typing group is committed before a toolbar change, so each undo step stays separate.
  bar.addEventListener('pointerdown', () => commit(), true);

  document.addEventListener('edukors:documents-changed', event => {
    if (active) commit();
    active = event.detail.active || null;
    savedRange = null;
    gesture = null;
    renderPage();
    renderBar();
    updateEditButtons();
  });
  // After a save, the current content is the saved content: the tab's dot goes away.
  document.addEventListener('edukors:document-saved', event => {
    const doc = event.detail.doc;
    if (doc === active) commit();
    const s = sampleOf(doc);
    // The saved content is what was written, which may be older than the current content if the person kept editing
    // while the file was being written (the host reports it in `committed`).
    s.baseline = event.detail.committed ?? s.committed;
    const dirty = s.committed !== s.baseline;
    const changed = doc.modified !== dirty;
    doc.modified = dirty;
    if (changed) document.dispatchEvent(new CustomEvent('edukors:document-modified', { detail: { id: doc.id } }));
  });
  document.addEventListener('edukors:preferences-changed', () => { if (!active) return; renderPage(); renderBar(); });
  page.tabIndex = -1;

  // ---------- Changes requested by the AI assistant (demo/assistant.js) ----------
  // The assistant changes a document only through these functions. Each call is validated here and becomes one
  // undo step of that document, which need not be the active one (a request stays bound to its document).
  const plainText = html => { const box = document.createElement('div'); box.innerHTML = html || ''; return box.innerText.trim(); };
  const escapeHtml = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const textHtml = text => escapeHtml(text).replace(/\r?\n/g, '<br>');
  const round = value => Math.round(value * 10) / 10;
  const color = value => (/^#[0-9a-f]{6}$/i.test(value || '') ? value.toLowerCase() : null);
  function describeObject(object) {
    const out = { id: object.id, kind: object.kind, x: round(object.x), y: round(object.y), width: round(object.w), height: round(object.h) };
    if (object.kind === 'text') out.text = object.state.html === null ? label('text') : plainText(object.state.html);
    if (object.kind === 'image') out.picture = object.state.imageSrc ? 'set' : 'placeholder';
    if (object.kind === 'shape') Object.assign(out, { shapeType: object.state.shapeType || 'rect', text: plainText(object.state.html), fill: object.state.fill, lineColor: object.state.lineColor });
    return out;
  }
  function agentChange(doc, mutate) {
    if (doc === active) commit();
    const s = sampleOf(doc);
    const result = mutate(s);
    const now = snapshot(s);
    if (now !== s.committed) {
      s.past.push(s.committed);
      if (s.past.length > 100) s.past.shift();
      s.future = [];
      s.committed = now;
      const dirty = s.committed !== s.baseline;
      if (doc.modified !== dirty) {
        doc.modified = dirty;
        document.dispatchEvent(new CustomEvent('edukors:document-modified', { detail: { id: doc.id } }));
      }
    }
    if (s.selection) {
      s.selection.ids = s.selection.ids.filter(id => s.objects.some(object => object.id === id));
      if (!s.selection.ids.length) s.selection = null;
    }
    if (doc === active) { renderPage(); renderBar(); updateEditButtons(); }
    return result;
  }
  const findIn = (s, id) => {
    const object = s.objects.find(item => item.id === id);
    if (!object) throw new Error(`There is no object with id ${id}.`);
    return object;
  };
  const box = (object, { x, y, width, height }) => {
    if (width !== undefined) object.w = clamp(width, minSize, 100);
    if (height !== undefined) object.h = clamp(height, minSize, 100);
    if (x !== undefined) object.x = x;
    if (y !== undefined) object.y = y;
    object.x = clamp(object.x, 0, 100 - object.w);
    object.y = clamp(object.y, 0, 100 - object.h);
  };

  // ---------- Saving, opening, and exporting (demo/document-file.js, demo/files.js) ----------
  // A file is untrusted input: everything read from it is checked and rebuilt here. Text markup is reduced to the few
  // tags and styles the editor itself produces, so a crafted document cannot run script or load anything.
  const KEEP_TAGS = new Set(['B', 'I', 'U', 'S', 'STRIKE', 'STRONG', 'EM', 'SUB', 'SUP', 'SPAN', 'A', 'BR', 'DIV', 'P', 'FONT', 'UL', 'OL', 'LI']);
  const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'NOSCRIPT', 'TITLE', 'HEAD', 'LINK', 'META', 'FRAME', 'FRAMESET', 'APPLET']);
  const STYLE_PROPS = new Set(['color', 'background-color', 'font-size', 'font-family', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'vertical-align']);
  const isColor = value => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
  const safeStyle = text => text.split(';').map(declaration => {
    const at = declaration.indexOf(':');
    if (at < 0) return '';
    const property = declaration.slice(0, at).trim().toLowerCase(), value = declaration.slice(at + 1).trim();
    // The editor writes font sizes as calc(<n>px * var(--font-scale)) (sizeCss); that exact form is allowed.
    if (property === 'font-size' && /^calc\(\d{1,4}(\.\d{1,20})?px \* var\(--font-scale\)\)$/.test(value)) return `${property}:${value}`;
    const safe = STYLE_PROPS.has(property) && value.length <= 100 && /^[#\w\s.,%()'"+-]+$/.test(value) && !/url|expression|javascript|import|var\(|attr\(/i.test(value);
    return safe ? `${property}:${value}` : '';
  }).filter(Boolean).join(';');
  const safeHref = value => {
    if (!/^\s*(https?:|mailto:)/i.test(value)) return '';
    try { return new URL(value.trim()).href; } catch { return ''; }
  };
  function sanitizeHtml(html) {
    if (typeof html !== 'string' || html.length > 200000) return '';
    const source = new DOMParser().parseFromString(`<body>${html}`, 'text/html').body;    // inert: nothing runs or loads
    const target = document.implementation.createHTMLDocument('');
    const copy = (from, to, depth) => {
      for (const node of from.childNodes) {
        if (node.nodeType === 3) { to.append(target.createTextNode(node.data)); continue; }
        if (node.nodeType !== 1 || DROP_TAGS.has(node.tagName)) continue;
        if (!KEEP_TAGS.has(node.tagName) || depth > 40) { copy(node, to, depth + 1); continue; }
        const element = target.createElement(node.tagName.toLowerCase());
        const style = node.getAttribute('style');
        if (style && safeStyle(style)) element.setAttribute('style', safeStyle(style));
        if (node.tagName === 'A') { const href = safeHref(node.getAttribute('href') || ''); if (href) element.setAttribute('href', href); }
        if (node.tagName === 'FONT') {
          const face = node.getAttribute('face'), color = node.getAttribute('color'), size = node.getAttribute('size');
          if (face && /^[\w \-,'"]{1,80}$/.test(face)) element.setAttribute('face', face);
          if (color && /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20})$/.test(color)) element.setAttribute('color', color);
          if (size && /^[1-7]$/.test(size)) element.setAttribute('size', size);
        }
        copy(node, element, depth + 1);
        to.append(element);
      }
    };
    copy(source, target.body, 0);
    return target.body.innerHTML;
  }

  const ENUMS = {
    align: ['left', 'center', 'right', 'justify'], valign: ['top', 'middle', 'bottom'], list: ['none', 'bulleted', 'numbered'],
    script: ['none', 'sub', 'super'], lineStyle: ['solid', 'dashed', 'dotted']
  };
  const RANGES = { fontSize: [1, 400], lineWidth: [0, 50], opacity: [0, 100], imageOpacity: [0, 100] };
  // The value to keep for one state field of a file, or undefined to keep the default.
  function readField(key, value, kind) {
    if (ENUMS[key]) return ENUMS[key].includes(value) ? value : undefined;
    if (RANGES[key]) return Number.isFinite(value) ? clamp(value, ...RANGES[key]) : undefined;
    if (key === 'color' || key === 'fill' || key === 'lineColor') return isColor(value) ? value.toLowerCase() : undefined;
    if (key === 'fontFamily') return typeof value === 'string' && /^[\w \-,'"]{1,80}$/.test(value) ? value : undefined;
    if (key === 'shapeType') return EdukorsShapes.types.includes(value) ? value : undefined;
    if (key === 'link') return typeof value === 'string' && (value === '' || safeHref(value)) ? (value && safeHref(value)) : undefined;
    if (key === 'html') return value === null ? (kind === 'text' ? null : undefined) : typeof value === 'string' ? sanitizeHtml(value) : undefined;
    return typeof value === 'boolean' ? value : undefined;
  }
  const cropFrom = raw => {
    if (!raw || typeof raw !== 'object') return null;
    const crop = {};
    for (const side of ['l', 't', 'r', 'b']) {
      const value = raw[side] ?? 0;
      if (!Number.isFinite(value) || value < 0 || value > 0.9) return null;
      crop[side] = value;
    }
    return crop.l + crop.r < 0.95 && crop.t + crop.b < 0.95 ? crop : null;
  };
  /**
   * Checks and rebuilds the content read from a file: { nextId, objects }, where pictures are named by relationship id
   * (`imageRel`) and come with `images` (Map rel → Blob). Throws an Error with a message for the person when the file
   * is not a document of this app.
   */
  function parseState(raw, images = new Map()) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.objects)) throw new Error('The document has no objects.');
    if (raw.objects.length > 2000) throw new Error('The document has too many objects.');
    const seen = new Set();
    const objects = raw.objects.map(item => {
      if (!item || typeof item !== 'object' || !['text', 'shape', 'image'].includes(item.kind)) throw new Error('The document has an object this app does not know.');
      if (!Number.isInteger(item.id) || item.id < 1 || seen.has(item.id)) throw new Error('The document has an object with an invalid id.');
      seen.add(item.id);
      const base = defaults[item.kind](), source = item.state && typeof item.state === 'object' ? item.state : {}, state = { ...base };
      for (const key of Object.keys(base)) { const value = readField(key, source[key], item.kind); if (value !== undefined) state[key] = value; }
      if (item.kind === 'image' && typeof source.imageRel === 'string' && images.get(source.imageRel)?.type.startsWith('image/')) {
        Object.assign(state, { imageRel: source.imageRel, imageAspect: Number.isFinite(source.imageAspect) && source.imageAspect >= 0.01 && source.imageAspect <= 100 ? source.imageAspect : 1, cropBox: cropFrom(source.cropBox) });
      }
      state.crop = false;
      const [w, h] = [item.w, item.h].map(value => (Number.isFinite(value) ? clamp(value, minSize, 100) : 20));
      const [x, y] = [item.x, item.y].map(value => (Number.isFinite(value) ? value : 0));
      return { id: item.id, kind: item.kind, x: clamp(x, 0, 100 - w), y: clamp(y, 0, 100 - h), w, h, state };
    });
    return { nextId: Math.max(0, ...objects.map(object => object.id)) + 1, objects };
  }
  // Gives a new document the checked content; its pictures become object URLs, and this is its saved content.
  function adopt(doc, parsed, images = new Map()) {
    const keys = new Map();
    for (const object of parsed.objects) {
      const rel = object.state.imageRel;
      if (rel === undefined) continue;
      delete object.state.imageRel;
      if (!keys.has(rel)) { const key = `img${++imageCounter}`; keys.set(rel, key); imageUrls.set(key, URL.createObjectURL(images.get(rel))); }
      object.state.imageSrc = keys.get(rel);
    }
    doc.sample = { nextId: parsed.nextId, selection: null, past: [], future: [], objects: parsed.objects };
    doc.sample.committed = snapshot(doc.sample);
    doc.sample.baseline = doc.sample.committed;
    doc.modified = false;
  }
  const dataUrl = blob => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
  const SKIP_STYLE = /^(-webkit-|--|transition|animation|scroll-|overscroll|view-|container|block-size|inline-size|min-block|max-block|min-inline|max-inline|margin-(block|inline)|padding-(block|inline)|border-(block|inline|start|end)|inset|offset|contain|content-visibility|interactivity|anchor|position-|text-wrap|field-sizing|app-region|math-|speak|caret|cursor|user-select|pointer-events|will-change|touch-action|resize|outline|appearance)/;
  const escapeAttr = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  globalThis.EdukorsSampleDocument = Object.freeze({
    /** The content of a document to write to a file: { nextId, objects, images: [{ rel, blob }], committed }. Pictures are named by relationship id. */
    exportState: async doc => {
      if (doc === active) commit();
      const s = sampleOf(doc), committed = s.committed, copies = s.objects.map(clone);
      const rels = new Map(), images = [];
      for (const object of copies) {
        const key = object.state.imageSrc;
        delete object.state.imageSrc;
        if (object.kind !== 'image' || !imageUrls.has(key)) continue;
        if (!rels.has(key)) { rels.set(key, `rIdImg${rels.size + 1}`); images.push({ rel: rels.get(key), blob: await (await fetch(imageUrls.get(key))).blob() }); }
        object.state.imageRel = rels.get(key);
      }
      return { nextId: s.nextId, objects: copies, images, committed };
    },
    parseState, adopt, sanitizeHtml,
    /** CSS for a font size inside text html, as the editor writes it (importers use it). */
    fontSizeCss: sizeCss,
    /** Selects every object of the active document (the application menu's Select All outside text). */
    selectAll: () => { if (active && !editing() && capability('multiSelect')) setSelection(sample().objects.map(o => o.id)); },
    /** The active document as one self-contained HTML page (computed styles inline, pictures as data URLs), for export. */
    exportPage: async ({ title = '' } = {}) => {
      if (!active) throw new Error('There is no document to export.');
      commit();
      const rect = page.getBoundingClientRect();
      // Selection marks and handles belong to the interface, not to the content.
      const marked = [...page.querySelectorAll('.is-selected, .is-single, .is-editing, .is-cropping')];
      const classes = marked.map(node => node.className);
      marked.forEach(node => node.classList.remove('is-selected', 'is-single', 'is-editing', 'is-cropping'));
      let body;
      try {
        const copy = page.cloneNode(true), from = page.querySelectorAll('*'), to = copy.querySelectorAll('*');
        from.forEach((node, index) => {
          const computed = getComputedStyle(node), target = to[index];
          for (const { name } of [...target.attributes]) if (/^(class|data-.*|tabindex|role|aria-.*|contenteditable|spellcheck|draggable|title|alt)$/.test(name)) target.removeAttribute(name);
          // Logical, vendor, animation, and variable properties repeat what the physical ones already say.
          target.setAttribute('style', [...computed].filter(property => !SKIP_STYLE.test(property)).map(property => `${property}:${computed.getPropertyValue(property)}`).join(';'));
        });
        copy.querySelectorAll('.sample-handle, .sample-marquee').forEach(node => node.remove());
        for (const image of copy.querySelectorAll('img')) if (image.src.startsWith('blob:')) image.src = await dataUrl(await (await fetch(image.src)).blob());
        body = copy.innerHTML;
      } finally {
        marked.forEach((node, index) => { node.className = classes[index]; });
      }
      const [w, h] = [Math.round(rect.width), Math.round(rect.height)];
      const html = `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>${escapeAttr(title)}</title><style>@page{size:${w}px ${h}px;margin:0}html,body{margin:0;background:#fff}body{width:${w}px;height:${h}px;overflow:hidden}.page{position:relative;width:${w}px;height:${h}px;overflow:hidden;background:#fff}</style></head><body><div class="page">${body}</div></body></html>\n`;
      return { html, width: w, height: h };
    },
    /** The objects of a document, in stacking order (last is on top). Positions and sizes are percent of the page. */
    read: doc => ({ page: 'A canvas; positions and sizes are percentages of the page.', objects: sampleOf(doc).objects.map(describeObject) }),
    insertText: (doc, { text, x = 10, y = 60, width = 40, height = 20 }) => agentChange(doc, s => {
      const object = { id: s.nextId++, kind: 'text', x, y, w: 40, h: 20, state: { ...defaults.text(), fontSize: 36, html: textHtml(text) } };
      box(object, { width, height });
      s.objects.push(object);
      return describeObject(object);
    }),
    insertShape: (doc, { shapeType = 'rect', text = '', x = 35, y = 35, width = 24, height = 28, fill, lineColor }) => agentChange(doc, s => {
      if (!EdukorsShapes.types.includes(shapeType)) throw new Error(`Unknown shape type "${shapeType}". Use one of: ${EdukorsShapes.types.join(', ')}.`);
      const object = { id: s.nextId++, kind: 'shape', x, y, w: 24, h: 28, state: { ...defaults.shape(), shapeType, html: textHtml(text) } };
      if (color(fill)) object.state.fill = color(fill);
      if (color(lineColor)) object.state.lineColor = color(lineColor);
      box(object, { width, height });
      s.objects.push(object);
      return describeObject(object);
    }),
    /** Adds an image (any format the browser plays: PNG, JPEG, GIF, APNG, WebP, SVG). The box fits the picture inside width × height. */
    insertImage: async (doc, { blob, x, y, width = 40, height = 50 }) => {
      const holder = { state: defaults.image() };
      if (!await setPicture(holder, blob)) throw new Error('The browser cannot display this file as an image.');
      return agentChange(doc, s => {
        const { w, h } = fitBox(holder.state.imageAspect, clamp(width, minSize, 100), clamp(height, minSize, 100));
        const count = s.objects.length % 6;
        const object = { id: s.nextId++, kind: 'image', w, h, x: 0, y: 0, state: holder.state };
        box(object, { x: x ?? 50 - w / 2 + count * 2, y: y ?? 42 - h / 2 + count * 2 });
        s.objects.push(object);
        return describeObject(object);
      });
    },
    /** Replaces the picture of an image object; the new one fits inside the old box, keeping its center. */
    replaceImage: async (doc, { id, blob }) => {
      const target = findIn(sampleOf(doc), id);
      if (target.kind !== 'image') throw new Error(`Object ${id} is not an image.`);
      const holder = { state: { ...target.state } };
      if (!await setPicture(holder, blob)) throw new Error('The browser cannot display this file as an image.');
      return agentChange(doc, s => {
        const object = findIn(s, id);
        Object.assign(object.state, { imageSrc: holder.state.imageSrc, imageAspect: holder.state.imageAspect, cropBox: null });
        const { w, h } = fitBox(object.state.imageAspect, object.w, object.h);
        Object.assign(object, { x: object.x + (object.w - w) / 2, y: object.y + (object.h - h) / 2, w, h });
        return describeObject(object);
      });
    },
    setText: (doc, { id, text }) => agentChange(doc, s => {
      const object = findIn(s, id);
      if (object.kind === 'image') throw new Error('Images have no text.');
      object.state.html = textHtml(text);
      return describeObject(object);
    }),
    update: (doc, { id, x, y, width, height, fill, lineColor }) => agentChange(doc, s => {
      const object = findIn(s, id);
      box(object, { x, y, width, height });
      if (object.kind === 'shape' && color(fill)) object.state.fill = color(fill);
      if (object.kind !== 'text' && color(lineColor)) object.state.lineColor = color(lineColor);
      return describeObject(object);
    }),
    remove: (doc, { id }) => agentChange(doc, s => {
      findIn(s, id);
      s.objects = s.objects.filter(object => object.id !== id);
      return { removed: id };
    })
  });
})();
