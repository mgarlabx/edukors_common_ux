// Document tabs for the visual prototype. New opens a sample document fixture; nothing is created on disk.
// Opening documents reveals the document-dependent toolbar actions; closing the last one returns to the closed workspace.
// Show in folder needs a file on disk, so it is disabled (not hidden) until the document is saved once; Export saves first.
// Saving is simulated in memory (files.js): nothing is written to disk.
globalThis.EdukorsDocuments = {};
(() => {
  const tabsBar = document.getElementById('document-tabs');
  const tabList = document.getElementById('document-tab-list');
  const newTabButton = document.getElementById('document-new-tab');
  const workspace = document.querySelector('.workspace');
  const watermark = workspace.querySelector('.watermark');
  const placeholder = document.getElementById('document-placeholder');
  const newButton = document.querySelector('[data-command="new"]');
  let documents = [];
  let activeId = null;
  let nextNumber = 1;
  let nextId = 1;

  const messages = () => (EdukorsLanguages[document.documentElement.lang] || EdukorsLanguages.en).messages;
  const message = key => messages()[key] || EdukorsLanguages.en.messages[key];
  // A saved document takes the name of its file; a new one is "Untitled", "Untitled 2", and so on.
  const nameOf = doc => doc.name || (doc.number === 1 ? message('untitled') : `${message('untitled')} ${doc.number}`);
  // Unsaved changes: the app's own (doc.modified), the AI conversations' (doc.conversationsModified, set by the
  // assistant), or a document recovered from a draft that has not been saved since (doc.recovered).
  const isModified = doc => !!doc && !!(doc.modified || doc.conversationsModified || doc.recovered);

  newButton.removeAttribute('aria-description');
  newTabButton.insertAdjacentHTML('afterbegin', EdukorsIcons.svg('graph-Plus'));

  // Status bar: save state of the active document only; its name appears only in the tab.
  function renderStatus() {
    const active = documents.find(doc => doc.id === activeId);
    const status = document.getElementById('document-status');
    status.replaceChildren();
    // Never saved: Unsaved. Saved and unchanged: Saved. Saved and changed since: Unsaved changes.
    const dirty = !!active && (!active.saved || isModified(active));
    status.classList.toggle('is-unsaved', dirty && !active?.saving);
    if (active?.saving) {
      // While the host writes the file (setSaving): a small spinner and "Saving…".
      status.innerHTML = '<span class="loading-spinner status-spinner" aria-hidden="true"></span>';
      status.append(message('saving'));
    } else if (active) {
      status.innerHTML = EdukorsIcons.svg('slides-file');
      status.append(message(!active.saved ? 'unsaved' : isModified(active) ? 'modifiedState' : 'savedState'));
    }
  }

  // Everything the document state changes in the interface, without telling the page to rebuild itself.
  function renderChrome() {
    const open = documents.length > 0;
    tabsBar.hidden = !open;
    watermark.hidden = open;
    placeholder.hidden = !open;
    for (const button of document.querySelectorAll('.document-action')) button.hidden = !open;
    const active = documents.find(doc => doc.id === activeId);
    // Edit commands (availability and actions) are handled by the sample document (sample-document.js).
    document.getElementById('edit-actions').setAttribute('aria-label', message('edit'));
    document.getElementById('insert-actions')?.setAttribute('aria-label', message('insert')); // absent in apps without a canvas
    // Export saves a document that has no file first (files.js); Show in folder needs the file.
    for (const key of ['export', 'reveal']) {
      const button = document.querySelector(`[data-command="${key}"]`);
      const disabled = key === 'reveal' && !!active && !active.saved;
      // aria-disabled keeps the button focusable, so keyboard users can read why it is unavailable.
      if (disabled) button.setAttribute('aria-disabled', 'true'); else button.removeAttribute('aria-disabled');
      const label = disabled ? `${message(key)} (${message('saveFirst')})` : message(key);
      button.setAttribute('aria-label', label);
      button.querySelector('.tooltip').textContent = label;
    }
    tabList.setAttribute('aria-label', message('openDocuments'));
    newTabButton.setAttribute('aria-label', message('newDocument'));
    newTabButton.querySelector('.tooltip').textContent = message('newDocument');
    workspace.setAttribute('aria-label', active ? nameOf(active) : message('empty'));
    renderStatus();

    tabList.replaceChildren(...documents.map(doc => {
      const tab = document.createElement('div');
      tab.className = 'document-tab';
      tab.dataset.id = doc.id;
      tab.classList.toggle('is-modified', isModified(doc));
      const select = document.createElement('button');
      select.type = 'button';
      select.className = 'document-tab-select';
      if (doc.id === activeId) select.setAttribute('aria-current', 'page');
      select.innerHTML = EdukorsIcons.svg('slides-file');
      const label = document.createElement('span');
      label.textContent = nameOf(doc);
      select.title = nameOf(doc);
      if (isModified(doc)) select.setAttribute('aria-label', `${nameOf(doc)}, ${message('modifiedState')}`);
      select.append(label);
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'tool document-tab-close';
      close.setAttribute('aria-label', message('closeDocument').replace('{name}', nameOf(doc)));
      close.innerHTML = EdukorsIcons.svg('graph-Close');
      const tooltip = document.createElement('span');
      tooltip.className = 'tooltip';
      tooltip.setAttribute('aria-hidden', 'true');
      tooltip.textContent = message('close');
      close.append(tooltip);
      tab.append(select, close);
      return tab;
    }));
  }

  function render() {
    renderChrome();
    // The sample page and contextual toolbar (sample-document.js) and the panels (panels.js) follow the active document.
    const active = documents.find(doc => doc.id === activeId);
    document.dispatchEvent(new CustomEvent('edukors:documents-changed', { detail: { open: documents.length > 0, active } }));
  }

  // Typing in a document marks its tab without rebuilding the tab row (the page and toolbar stay as they are).
  document.addEventListener('edukors:document-modified', event => {
    const doc = documents.find(item => item.id === event.detail.id);
    const tab = doc && tabList.querySelector(`[data-id="${doc.id}"]`);
    if (!tab) return;
    tab.classList.toggle('is-modified', isModified(doc));
    renderStatus();
    const select = tab.querySelector('.document-tab-select');
    if (isModified(doc)) select.setAttribute('aria-label', `${nameOf(doc)}, ${message('modifiedState')}`); else select.removeAttribute('aria-label');
  });

  const focusTab = id => tabList.querySelector(`[data-id="${id}"] .document-tab-select`)?.focus();

  function create() {
    const doc = { id: nextId++, number: nextNumber++, saved: false };
    documents.push(doc);
    activeId = doc.id;
    render();
  }

  // A document made by the host (opened from a file): added without being shown; activate it when it is ready.
  function add(props) {
    const doc = { id: nextId++, saved: false, ...props };
    if (!doc.name) doc.number = nextNumber++;
    documents.push(doc);
    return doc;
  }
  function discard(doc) {
    documents = documents.filter(item => item !== doc);
    if (!documents.length) nextNumber = 1;
  }

  function activate(id, focus = false) {
    activeId = id;
    render();
    if (focus) focusTab(id);
  }

  async function close(id) {
    const doc = documents.find(item => item.id === id);
    // The host may ask about unsaved changes first (files.js); it answers false to keep the document open.
    if (isModified(doc) && EdukorsDocuments.beforeClose && !(await EdukorsDocuments.beforeClose(doc))) return;
    const index = documents.findIndex(doc => doc.id === id);
    documents.splice(index, 1);
    if (!documents.length) {
      activeId = null;
      nextNumber = 1;
      render();
      newButton.focus();
      return;
    }
    if (activeId === id) activeId = (documents[index] || documents[index - 1]).id;
    render();
    focusTab(activeId);
  }

  // Disabled actions ignore activation; the capture listener runs before any future command handler.
  document.querySelector('.toolbar').addEventListener('click', event => {
    if (event.target.closest('[aria-disabled="true"]')) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  newButton.addEventListener('click', create);
  newTabButton.addEventListener('click', create);
  tabList.addEventListener('click', event => {
    const tab = event.target.closest('.document-tab');
    if (!tab) return;
    const id = Number(tab.dataset.id);
    if (event.target.closest('.document-tab-close')) close(id); else activate(id, true);
  });
  // Middle click closes a tab, as in browsers and editors.
  tabList.addEventListener('auxclick', event => {
    const tab = event.target.closest('.document-tab');
    if (tab && event.button === 1) { event.preventDefault(); close(Number(tab.dataset.id)); }
  });
  // Left and right arrows, Home, and End move between tabs and select them.
  tabList.addEventListener('keydown', event => {
    if (!event.target.closest('.document-tab-select')) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const index = documents.findIndex(doc => doc.id === activeId);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? documents.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + documents.length) % documents.length;
    event.preventDefault();
    activate(documents[next].id, true);
  });
  document.addEventListener('edukors:preferences-changed', render);
  // For the file commands (files.js): the active document, a light refresh, and the hook run before closing a tab.
  Object.assign(EdukorsDocuments, {
    active: () => documents.find(doc => doc.id === activeId),
    list: () => [...documents],
    activate: id => activate(id),
    add, discard,
    close: id => close(id),
    refresh: renderChrome,
    nameOf, isModified,
    // While the host writes a document (files.js), the status bar says "Saving…".
    setSaving(doc, saving) { doc.saving = !!saving; if (doc.id === activeId) renderStatus(); }
  });
  render();
})();
