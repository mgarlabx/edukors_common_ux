// Right-aligned panel toggles: the sidebar (application content) and the AI assistant.
// They are available only while a document is open, and both start closed. The sidebar opens on the left of the
// workspace and the assistant on the right; both can be open at once. An app without a sidebar (EdukorsAppConfig.sidebar:
// false) has neither the panel nor its toggle. Both can be resized from their inner edge (see "Width" below).
// The assistant's content (conversation, composer, account and model) belongs to src/ai/ui/ai-assistant.js.
(() => {
  const panels = Object.fromEntries(Object.entries({
    sidebar: document.getElementById('sidebar-panel'),
    assistant: document.getElementById('assistant-panel-side')
  }).filter(([, panel]) => panel));
  const open = { sidebar: false, assistant: false };
  let documentOpen = false;

  const messages = () => (EdukorsLanguages[document.documentElement.lang] || EdukorsLanguages.en).messages;
  const message = key => messages()[key] || EdukorsLanguages.en.messages[key];
  const toggle = key => document.querySelector(`[data-command="${key}"]`);

  for (const key of Object.keys(panels)) {
    toggle(key).removeAttribute('aria-description');
    toggle(key).setAttribute('aria-controls', panels[key].id);
  }
  for (const button of document.querySelectorAll('[data-close-panel]')) button.insertAdjacentHTML('afterbegin', EdukorsIcons.svg('graph-Close'));
  document.getElementById('assistant-panel-icon').innerHTML = EdukorsIcons.svg('graph-Ai', 16);

  function render() {
    for (const [key, panel] of Object.entries(panels)) {
      // Panels slide by animating their width; a closed panel is inert, so it takes no focus or clicks.
      const visible = documentOpen && open[key];
      panel.classList.toggle('is-open', visible);
      panel.inert = !visible;
      toggle(key).setAttribute('aria-pressed', String(open[key]));
    }
    if (panels.sidebar) {
      document.getElementById('sidebar-title').textContent = message('sidebar');
      document.getElementById('sidebar-placeholder').textContent = message('sidebarPlaceholder');
    }
    document.getElementById('assistant-panel-label').textContent = message('assistant');
    for (const handle of Object.values(handles)) { handle.setAttribute('aria-label', message('resizePanel')); handle.title = message('resizePanel'); }
    for (const button of document.querySelectorAll('[data-close-panel]')) {
      button.setAttribute('aria-label', message('close'));
      button.querySelector('.tooltip').textContent = message('close');
    }
  }

  // Width: a handle on the panel's inner edge (drag; arrows, Shift for larger steps, Home, End; double click restores
  // the default). The width is the panel's --panel-width, remembered per panel in this app's localStorage; the workspace
  // always keeps MIN_WORKSPACE pixels, and a smaller window gives the room back.
  const LIMITS = { sidebar: [200, 520], assistant: [300, 900] }, MIN_WORKSPACE = 360;
  const storageKey = key => `edukors.common.panel-width.${key}`;
  const stored = key => { try { return Number(localStorage.getItem(storageKey(key))) || 0; } catch { return 0; } };
  const handles = {};
  const contentWidth = panel => panel.querySelector('.panel-inner')?.getBoundingClientRect().width || 0;
  const otherWidth = key => Object.entries(panels).filter(([other, panel]) => other !== key && panel.classList.contains('is-open')).reduce((sum, [, panel]) => sum + panel.getBoundingClientRect().width, 0);
  const clamp = (key, width) => Math.round(Math.max(LIMITS[key][0], Math.min(LIMITS[key][1], innerWidth - otherWidth(key) - MIN_WORKSPACE, width)));
  for (const [key, panel] of Object.entries(panels)) {
    const left = panel.classList.contains('side-panel-left');
    const handle = document.createElement('div');
    Object.assign(handle, { className: `panel-resize ${left ? 'at-right' : 'at-left'}`, tabIndex: 0 });
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-controls', panel.id);
    handle.setAttribute('aria-valuemin', String(LIMITS[key][0]));
    handle.setAttribute('aria-valuemax', String(LIMITS[key][1]));
    panel.append(handle);
    handles[key] = handle;
    let dragging = false;
    // Resizing is immediate: the opening animation is turned off while the width changes.
    const apply = (width, save = true) => {
      panel.classList.add('is-resizing');
      requestAnimationFrame(() => { if (!dragging) panel.classList.remove('is-resizing'); });
      if (width === null) {
        panel.style.removeProperty('--panel-width');
        try { localStorage.removeItem(storageKey(key)); } catch {}
      } else {
        width = clamp(key, width);
        panel.style.setProperty('--panel-width', `${width}px`);
        if (save) try { localStorage.setItem(storageKey(key), String(width)); } catch {}
      }
      handle.setAttribute('aria-valuenow', String(Math.round(contentWidth(panel))));
    };
    if (stored(key)) apply(stored(key), false);
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      const x0 = event.clientX, w0 = contentWidth(panel);
      dragging = true;
      panel.classList.add('is-resizing');
      document.body.classList.add('is-resizing-panel');
      const move = e => apply(w0 + (left ? 1 : -1) * (e.clientX - x0), false);
      const end = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', end);
        handle.removeEventListener('lostpointercapture', end);
        dragging = false;
        document.body.classList.remove('is-resizing-panel');
        apply(contentWidth(panel));
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', end);
      handle.addEventListener('lostpointercapture', end);
    });
    handle.addEventListener('dblclick', () => apply(null));
    handle.addEventListener('keydown', event => {
      const step = event.shiftKey ? 40 : 10, width = contentWidth(panel);
      const grow = left ? 'ArrowRight' : 'ArrowLeft', shrink = left ? 'ArrowLeft' : 'ArrowRight';
      const next = event.key === grow ? width + step : event.key === shrink ? width - step
        : event.key === 'Home' ? LIMITS[key][0] : event.key === 'End' ? LIMITS[key][1] : null;
      if (next === null) return;
      event.preventDefault(); event.stopPropagation();
      apply(next);
    });
  }
  addEventListener('resize', () => {
    for (const [key, panel] of Object.entries(panels)) {
      const width = stored(key);
      if (!width || panel.classList.contains('is-resizing')) continue;
      const fitted = `${clamp(key, width)}px`;
      if (panel.style.getPropertyValue('--panel-width') !== fitted) panel.style.setProperty('--panel-width', fitted);
    }
  });

  for (const key of Object.keys(panels)) toggle(key).addEventListener('click', () => {
    open[key] = !open[key];
    render();
    if (open[key] && key === 'assistant') document.getElementById('assistant-input').focus();
  });
  for (const button of document.querySelectorAll('[data-close-panel]')) button.addEventListener('click', () => {
    const key = button.dataset.closePanel;
    open[key] = false;
    render();
    toggle(key).focus();
  });
  document.addEventListener('edukors:documents-changed', event => {
    documentOpen = event.detail.open;
    render();
  });
  document.addEventListener('edukors:preferences-changed', render);
  render();
})();
