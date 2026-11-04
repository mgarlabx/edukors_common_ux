// Save, Open, Recent, Import, Export, Show in folder, and closing with unsaved changes.
// The screens come from src/files/file-dialogs.js. In the desktop app (EdukorsDesktop.files, provided by the Electron
// preload) the work is real: the app turns its documents into bytes and back through EdukorsAppDocument (its own
// script; see docs/common-shell.md, "App integration"), Export renders the page, and Show in folder opens the system's
// file manager. In a browser the "host" below only simulates the work, in
// memory: no file is written, no folder is opened.
// To see the other states in the simulation, save the document with the name "existing" (Save asks to replace) or
// "error" (Save fails; a document saved as "error" also fails to export, to show that screen).
// EdukorsLoading.begin(name) shows an animated "Opening …" indicator and returns the function that ends it. Several may
// run at once; the indicator stays while any is active and names the latest. It appears only after a short moment, so
// a small file opens without a flash. Apps call it for their own long loads (for example a conversion of their own).
globalThis.EdukorsLoading = (() => {
  const active = [];
  let node = null, timer = null;
  const label = () => {
    const messages = (EdukorsLanguages[document.documentElement.lang] || EdukorsLanguages.en).messages;
    const t = key => messages[key] || EdukorsLanguages.en.messages[key];
    const name = active.at(-1)?.name;
    return name ? t('openingFile').replace('{name}', name) : t('opening');
  };
  function render() {
    if (!active.length) { clearTimeout(timer); timer = null; if (node) node.hidden = true; return; }
    if (!node) {
      node = document.createElement('div');
      node.className = 'loading-indicator';
      node.setAttribute('role', 'status');
      node.hidden = true;
      node.innerHTML = '<span class="loading-spinner" aria-hidden="true"></span><span class="loading-text"></span>';
      document.body.append(node);
    }
    node.querySelector('.loading-text').textContent = label();
    if (node.hidden && !timer) timer = setTimeout(() => { timer = null; if (active.length) node.hidden = false; }, 150);
  }
  function begin(name) {
    const entry = { name: typeof name === 'string' ? name : '' };
    active.push(entry);
    render();
    let ended = false;
    return () => { if (ended) return; ended = true; active.splice(active.indexOf(entry), 1); render(); };
  }
  document.addEventListener('edukors:preferences-changed', () => { if (node && active.length) node.querySelector('.loading-text').textContent = label(); });
  return Object.freeze({ begin, isActive: () => active.length > 0 });
})();

(() => {
  const Dialogs = EdukorsFileDialogs;
  const config = () => EdukorsAppConfig.file || {};
  // The app's document: { toBytes, fromBytes, adopt, exportPage?, importFile?, selectAll? }. Read when used, because
  // the app's scripts load after this one.
  const app = () => globalThis.EdukorsAppDocument;
  const messages = () => (EdukorsLanguages[document.documentElement.lang] || EdukorsLanguages.en).messages;
  const t = key => messages()[key] || EdukorsLanguages.en.messages[key];
  const extension = () => config().extension || '.ecmx';
  const formats = () => (config().exportFormats || ['pdf', 'png', 'html']).map(id => ({
    id, label: t(`export${id[0].toUpperCase()}${id.slice(1)}`), description: t(`export${id[0].toUpperCase()}${id.slice(1)}Desc`), extension: `.${id}`
  }));
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const withoutExtension = (name, ext) => name.toLowerCase().endsWith(ext.toLowerCase()) ? name.slice(0, -ext.length) : name;
  const pathOf = doc => doc.path || `${doc.folder}/${doc.file}`;

  const desktop = globalThis.EdukorsDesktop?.files;
  let defaultFolder = null;      // the system's documents folder, from the desktop host
  let homeFolder = null;         // shown as ~ in Recent
  const fileMessage = (key, values) => Dialogs.fill(t(key), values);
  // The desktop host says when a chosen file starts being read; the operation that asked ends the indicator.
  let hostLoading = null;
  const endLoading = () => { hostLoading?.(); hostLoading = null; };

  // ----- Desktop host: real files -----
  const desktopHost = {
    // check: saving over the document's own file asks the host to compare the file's fingerprint first ({ conflict }).
    async save(doc, { name, folder, replace, check = false }) {
      const base = withoutExtension(name, extension());
      EdukorsDocuments.setSaving(doc, true);
      try {
        // The conversations as written: changes made while the file is written stay unsaved.
        const signature = EdukorsAiAssistant.signature(doc);
        const { bytes, committed } = await app().toBytes(doc, { name: base });
        const own = check && doc.saved && doc.fingerprint && doc.name === base && doc.folder === folder;
        const result = await desktop.save({ folder, name: base, extension: extension(), bytes, replace, expected: own ? doc.fingerprint : undefined });
        if (result.conflict) return { conflict: result.conflict };
        if (result.exists) return { exists: true };
        if (result.error) return { error: result.error };
        // Saved in the app's format: from now on it is that file (a document opened from another format leaves it).
        Object.assign(doc, { saved: true, name: base, folder: result.folder, file: result.file, path: result.path, originFormat: null, fingerprint: result.fingerprint, recovered: false });
        EdukorsAiAssistant.markSaved(doc, signature);
        document.dispatchEvent(new CustomEvent('edukors:document-saved', { detail: { doc, committed } }));
        EdukorsAiAssistant.documentSaved(doc);
        EdukorsDocuments.refresh();
        return {};
      } finally { EdukorsDocuments.setSaving(doc, false); }
    },
    async export(doc, { name, folder, format, replace, progress }) {
      progress(10);
      // exportFile({ doc, format, title }) → { html, width, height } or { data }; apps with only a page give exportPage.
      const out = app().exportFile ? await app().exportFile({ doc, format, title: name }) : await app().exportPage({ title: name });
      progress(40);
      const result = await desktop.export({ folder, name, format, replace: replace === true, html: out.html, data: out.data, width: out.width, height: out.height });
      if (result.exists) return { exists: true };
      if (result.error) return { error: result.error };
      progress(100);
      doc.lastExport = result.path;
      return {};
    }
  };

  // ----- Simulated host -----
  let simulatedRecent = [];
  const simulatedHost = {
    async save(doc, { name, folder, replace }) {
      await wait(450);
      const base = withoutExtension(name, extension());
      if (base.toLowerCase() === 'existing' && !replace && doc.file !== `${base}${extension()}`) return { exists: true };
      if (base.toLowerCase() === 'error') return { error: t('demoSaveError') };
      Object.assign(doc, { saved: true, name: base, folder, file: `${base}${extension()}` });
      // The preview's Recent remembers what was "saved" while the page is open.
      simulatedRecent = [{ path: pathOf(doc), name: base, folder, file: doc.file, exists: true }, ...simulatedRecent.filter(entry => entry.path !== pathOf(doc))].slice(0, 10);
      document.dispatchEvent(new CustomEvent('edukors:document-saved', { detail: { doc } }));
      EdukorsDocuments.refresh();
      return {};
    },
    async export(doc, { name, folder, format, replace, progress }) {
      // An existing file is replaced only after the screen asked. The preview has no files: a document saved as
      // `existing` shows the question.
      const ext = `.${format}`, base = withoutExtension(name, ext);
      if (base.toLowerCase() === 'existing' && !replace) { await wait(200); return { exists: true }; }
      for (let step = 1; step <= 10; step++) { await wait(90); progress(step * 10); }
      if (base.toLowerCase() === 'error') return { error: t('demoExportError') };
      doc.lastExport = `${folder}/${base}${ext}`;
      return {};
    }
  };

  const host = desktop ? desktopHost : simulatedHost;

  // ----- Commands -----
  const askConflict = (doc, kind) => Dialogs.confirm({
    t, title: Dialogs.fill(t('conflictTitle'), { name: doc.file || EdukorsDocuments.nameOf(doc) }),
    message: t(kind === 'missing' ? 'conflictMissing' : 'conflictChanged'), primary: t('replaceFile')
  });
  // A document that has no file yet is saved (the Save screen asks where); true once it has a file.
  const saveFirst = async doc => doc.saved || await save({ doc });
  // Writes a document opened from another format back into its file, in that format. The first time, the person
  // confirms (or chooses the app's own format instead).
  async function saveOriginal(doc) {
    if (!doc.originConfirmed) {
      const choice = await Dialogs.confirmSaveOriginal({ t, name: doc.file, format: doc.originExt.slice(1).toUpperCase(), extension: extension(), note: doc.originFormat === 'html' ? '' : t('saveOriginalNote') });
      if (choice === 'cancel') return false;
      if (choice === 'app') { Object.assign(doc, { saved: false, file: undefined, path: undefined, originFormat: null }); return save({ doc }); }
      doc.originConfirmed = true;
    }
    EdukorsDocuments.setSaving(doc, true);
    try {
      const signature = EdukorsAiAssistant.signature(doc);
      const out = await app().exportFile({ doc, format: doc.originFormat, title: doc.name });
      const request = { folder: doc.folder, name: doc.file.slice(0, -doc.originExt.length), extension: doc.originExt, bytes: out.data ?? out.html, replace: true };
      let result = await desktop.save({ ...request, expected: doc.fingerprint });
      if (result.conflict) {
        if (!(await askConflict(doc, result.conflict))) { Dialogs.toast({ t, message: t('saveCancelled') }); return false; }
        result = await desktop.save(request);
      }
      if (result.error) throw new Error(result.error);
      Object.assign(doc, { fingerprint: result.fingerprint, recovered: false });
      EdukorsAiAssistant.markSaved(doc, signature);
      document.dispatchEvent(new CustomEvent('edukors:document-saved', { detail: { doc } }));
      EdukorsAiAssistant.documentSaved(doc);
      EdukorsDocuments.refresh();
      Dialogs.toast({ t, message: Dialogs.fill(t('savedToast'), { name: doc.file }) });
      return true;
    } catch (error) {
      Dialogs.toast({ t, message: fileMessage('saveFailed', { name: doc.file, reason: error.message }) });
      return false;
    } finally { EdukorsDocuments.setSaving(doc, false); }
  }

  async function save({ as = false, doc = EdukorsDocuments.active() } = {}) {
    if (!doc) return false;
    if (!as && doc.originFormat && desktop) return saveOriginal(doc);
    // A document that already has a file is saved again without asking anything.
    if (doc.saved && !as) {
      let result = await host.save(doc, { name: doc.name, folder: doc.folder, replace: true, check: true });
      // The file changed on disk (another app, a sync) or is gone since it was opened or saved here: the person decides.
      if (result.conflict) {
        if (!(await askConflict(doc, result.conflict))) { Dialogs.toast({ t, message: t('saveCancelled') }); return false; }
        result = await host.save(doc, { name: doc.name, folder: doc.folder, replace: true });
      }
      if (result.error) { Dialogs.toast({ t, message: fileMessage('saveFailed', { name: doc.file, reason: result.error }) }); return false; }
      Dialogs.toast({ t, message: Dialogs.fill(t('savedToast'), { name: doc.file }) });
      return true;
    }
    const result = await Dialogs.save({
      // A new document starts in the last folder used (the desktop host remembers it across sessions).
      t, title: as ? t('saveAsTitle') : t('saveTitle'), name: doc.name || EdukorsDocuments.nameOf(doc),
      folder: doc.folder || (desktop ? (await desktop.info()).documents : defaultFolder) || t('defaultFolder'), extension: extension(),
      chooseFolder: desktop && (async current => (await desktop.chooseFolder({ defaultPath: current, title: t('chooseFolderTitle') })).folder),
      commit: values => host.save(doc, values)
    });
    if (!result) return false;
    Dialogs.toast({ t, message: Dialogs.fill(t('savedToast'), { name: doc.file }), action: { label: t('reveal'), onClick: () => reveal(doc) } });
    return true;
  }

  async function exportDocument() {
    const doc = EdukorsDocuments.active();
    // A document without a file is saved first: the export goes next to it, with its name.
    if (!doc || !(await saveFirst(doc))) return;
    // HTML is always the first option; the name and the folder are those of the saved file.
    const result = await Dialogs.exportAs({ t, name: doc.name, folder: doc.folder, formats: formats(), commit: values => host.export(doc, values) });
    if (!result) return;
    const file = `${result.name}.${result.format}`;
    Dialogs.toast({ t, message: Dialogs.fill(t('exportedToast'), { name: file }), action: { label: t('reveal'), onClick: () => reveal(doc, `${result.folder}/${file}`) } });
  }

  // The browser cannot open a file manager, so the preview only says what would happen.
  async function reveal(doc = EdukorsDocuments.active(), path) {
    if (!doc?.saved) return;
    if (desktop) {
      const result = await desktop.reveal({ path: path || doc.lastExport || pathOf(doc) });
      if (result.error) Dialogs.toast({ t, message: fileMessage('revealFailed', { reason: result.error }) });
      return;
    }
    Dialogs.toast({ t, message: Dialogs.fill(t('revealPreview'), { path: path || doc.lastExport || pathOf(doc) }) });
  }

  // ----- Open (desktop only) -----
  async function openFile() {
    if (document.querySelector('dialog[open]')) return;
    // The filter names the app without "Edukors" (Text Editor documents, Common documents).
    const appName = String(EdukorsAppConfig.name || '').replace(/^Edukors\s+/i, '');
    try {
      const result = await desktop.open({ title: t('openTitle'), filterName: Dialogs.fill(t('openFilter'), { app: appName }), allLabel: t('importAll') });
      if (result.canceled) return;
      if (result.error) { Dialogs.toast({ t, message: fileMessage('openFailed', { name: '', reason: result.error }) }); return; }
      await adoptFile(result.file);
    } finally { endLoading(); }
  }

  // A file read by the host becomes a document tab (or activates the tab that already shows it).
  // A file of another format (opened from Open or Recent, when the app lists it in startDesktopApp's openExtensions)
  // becomes a document named after it, in its folder. If the app can write that format back (file.saveOriginal and
  // startDesktopApp's saveExtensions), Save writes into the file itself, after a first confirmation; otherwise the
  // document has no file of its own, and Save asks for a name and saves in the app's format.
  async function adoptFile({ path, name, folder, file: fileName, bytes, fingerprint }) {
    const open = EdukorsDocuments.list().find(doc => doc.path === path || doc.origin === path);
    if (open) { EdukorsDocuments.activate(open.id); return; }
    const dot = fileName.lastIndexOf('.'), ext = dot > 0 ? fileName.slice(dot).toLowerCase() : '';
    if (ext !== extension().toLowerCase()) {
      const format = importFormats().find(item => item.extensions.includes(ext));
      try {
        if (!format || typeof app().importFile !== 'function') throw new Error(t('importUnknown'));
        const converted = await app().importFile({ format: format.id, name, extension: ext, bytes, t });
        // A format the app can write back (EdukorsAppConfig.file.saveOriginal: import format → export format) is saved
        // into this file; otherwise Save asks where to save it in the app's format.
        const back = config().saveOriginal?.[format.id];
        const doc = back
          ? EdukorsDocuments.add({ saved: true, name, folder, file: fileName, path, origin: path, originFormat: back, originExt: fileName.slice(dot), fingerprint })
          : EdukorsDocuments.add({ name, folder, origin: path });
        app().adopt(doc, converted);
        EdukorsDocuments.activate(doc.id);
      } catch (error) { Dialogs.toast({ t, message: fileMessage('openFailed', { name: fileName, reason: error.message }) }); }
      return;
    }
    let content;
    try { content = await app().fromBytes(bytes); }
    catch (error) { Dialogs.toast({ t, message: fileMessage('openFailed', { name: fileName, reason: error.message }) }); return; }
    const doc = EdukorsDocuments.add({ saved: true, name, folder, file: fileName, path, fingerprint });
    app().adopt(doc, content);
    EdukorsDocuments.activate(doc.id);
  }

  // ----- Import -----
  // Another format becomes a new, unsaved document named after the file. The formats come from
  // EdukorsAppConfig.file.importFormats and the conversion from the app (EdukorsAppDocument.importFile), which must
  // check the result as strictly as a file being opened. The desktop host shows the system's dialog and reads the file;
  // in a browser a file input does the same, so Import works in the preview too.
  const capitalized = id => `${id[0].toUpperCase()}${id.slice(1)}`;
  const importFormats = () => config().importFormats || [];

  function pickInBrowser(formats) {
    return new Promise(resolve => {
      const input = Object.assign(document.createElement('input'), { type: 'file', accept: formats.flatMap(format => format.extensions).join(',') });
      input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) { resolve(null); return; }
        const dot = file.name.lastIndexOf('.');
        resolve({ name: dot > 0 ? file.name.slice(0, dot) : file.name, file: file.name, extension: dot > 0 ? file.name.slice(dot).toLowerCase() : '', bytes: new Uint8Array(await file.arrayBuffer()) });
      });
      input.addEventListener('cancel', () => resolve(null));
      input.click();
    });
  }

  async function importFile() {
    if (document.querySelector('dialog[open]')) return;
    const formats = importFormats();
    if (!formats.length) return;
    try { await importChosen(formats); } finally { endLoading(); }
  }

  async function importChosen(formats) {
    let file;
    if (desktop) {
      const result = await desktop.import({ title: t('importTitle'), allLabel: t('importAll'), formats: formats.map(format => ({ name: t(`import${capitalized(format.id)}`), extensions: format.extensions })) });
      if (result.canceled) return;
      if (result.error) { Dialogs.toast({ t, message: fileMessage('importFailed', { name: '', reason: result.error }) }); return; }
      file = result.file;
    } else {
      file = await pickInBrowser(formats);
      if (!file) return;
      hostLoading = EdukorsLoading.begin(file.file);
    }
    const format = formats.find(item => item.extensions.includes(file.extension));
    try {
      if (!format) throw new Error(t('importUnknown'));
      const content = await app().importFile({ format: format.id, name: file.name, extension: file.extension, bytes: file.bytes, t });
      const doc = EdukorsDocuments.add({ name: file.name });
      app().adopt(doc, content);
      EdukorsDocuments.activate(doc.id);
    } catch (error) {
      Dialogs.toast({ t, message: fileMessage('importFailed', { name: file.file, reason: error.message }) });
    }
  }

  // ----- Recent -----
  // A menu under the toolbar button: the documents saved or opened most recently, newest first, with their folders.
  // The desktop host keeps the list (it adds a file only after a real save or open, and opens only paths it holds);
  // a file that is no longer there is dropped from the list without being shown (if it disappears while the menu is
  // open, choosing it removes it and says so). The preview lists what was
  // "saved" while the page is open and can only switch to a document that is still open.
  const shortFolder = folder => homeFolder && (folder === homeFolder || folder.startsWith(`${homeFolder}/`) || folder.startsWith(`${homeFolder}\\`))
    ? `~${folder.slice(homeFolder.length)}` : folder;

  async function openRecent(entry) {
    const open = EdukorsDocuments.list().find(doc => pathOf(doc) === entry.path && doc.saved);
    if (open) { EdukorsDocuments.activate(open.id); return; }
    if (!desktop) { Dialogs.toast({ t, message: Dialogs.fill(t('recentPreview'), { path: entry.path }) }); return; }
    try {
      const result = await desktop.openRecent({ path: entry.path });
      if (result.code === 'MISSING') { Dialogs.toast({ t, message: Dialogs.fill(t('recentGone'), { name: entry.file }) }); return; }
      if (result.error) { Dialogs.toast({ t, message: fileMessage('openFailed', { name: entry.file, reason: result.error }) }); return; }
      await adoptFile(result.file);
    } finally { endLoading(); }
  }

  async function showRecent() {
    if (document.querySelector('dialog[open]')) return;
    const trigger = button('recent');
    let list = simulatedRecent;
    if (desktop) {
      const result = await desktop.recent();
      if (result.error) { Dialogs.toast({ t, message: Dialogs.fill(t('recentFailed'), { reason: result.error }) }); return; }
      list = result.recent;
    }
    // Files of other formats show their extension (lesson.docx), so they are not confused with the app's documents.
    const items = list.map(entry => ({
      label: entry.file.toLowerCase().endsWith(extension().toLowerCase()) ? entry.name : entry.file,
      detail: shortFolder(entry.folder),
      title: entry.path,
      action: () => openRecent(entry)
    }));
    if (!items.length) items.push({ label: t('recentEmpty'), disabled: true });
    items.push({ separator: true }, {
      label: t('recentClear'), disabled: !list.length,
      action: async () => { if (desktop) await desktop.forgetRecent(); else simulatedRecent = []; }
    });
    const box = trigger.getBoundingClientRect();
    trigger.setAttribute('aria-expanded', 'true');
    EdukorsContextMenu.open({ x: box.left, y: box.bottom + 4, label: t('recent'), items, restoreFocus: trigger, className: 'recent-menu', onClose: () => trigger.setAttribute('aria-expanded', 'false') });
  }

  // The window asks before closing while any document has unsaved changes.
  function reportUnsaved() {
    desktop.setDirty(EdukorsDocuments.list().some(EdukorsDocuments.isModified), { message: t('closeUnsavedMessage'), discard: t('closeWithoutSaving'), cancel: t('cancel') });
  }

  const button = key => document.querySelector(`[data-command="${key}"]`);
  button('save').addEventListener('click', () => save());
  button('export').addEventListener('click', exportDocument);
  // An app without export formats has no Export button (it stays hidden even with a document open).
  if (!(config().exportFormats ?? ['html']).length) { button('export').classList.remove('document-action'); button('export').hidden = true; }
  button('reveal').addEventListener('click', () => reveal());
  button('import').removeAttribute('aria-description');
  // An app that opens other formats directly may turn Import off (file.importCommand: false) and keep its converters.
  button('import').hidden = !importFormats().length || config().importCommand === false;
  button('import').addEventListener('click', importFile);
  button('recent').removeAttribute('aria-description');
  button('recent').setAttribute('aria-haspopup', 'menu');
  button('recent').setAttribute('aria-expanded', 'false');
  // A second click on the button closes the menu (the menu closes on pointer down, before this click).
  let menuWasOpen = false;
  // Window capture runs before the menu's own document-capture listener closes it.
  addEventListener('pointerdown', event => { if (button('recent').contains(event.target)) menuWasOpen = EdukorsContextMenu.isOpen(); }, true);
  button('recent').addEventListener('click', event => {
    if (menuWasOpen && event.detail) { menuWasOpen = false; return; }
    showRecent();
  });
  if (desktop) {
    button('open').addEventListener('click', openFile);
    for (const type of ['edukors:document-modified', 'edukors:document-saved', 'edukors:documents-changed']) document.addEventListener(type, reportUnsaved);
    desktop.info().then(info => { defaultFolder = info.documents; homeFolder = info.home; });
    // Documents the system opens (double-click, Open With, the app's icon). Only once the page has loaded: the app's
    // scripts, which turn bytes into a document, load after this one.
    desktop.onLoading?.(({ name } = {}) => { endLoading(); hostLoading = EdukorsLoading.begin(name); });
    const listen = () => desktop.onOpened(async result => {
      try {
        if (result.error) Dialogs.toast({ t, message: fileMessage('openFailed', { name: result.name || '', reason: result.error }) });
        else await adoptFile(result.file);
      } finally { endLoading(); }
    });
    if (document.readyState === 'complete') listen(); else addEventListener('load', listen, { once: true });
  }

  // Cmd/Ctrl+S saves; adding Shift asks for a new name and place.
  document.addEventListener('keydown', event => {
    if (!(EdukorsPlatform.mac ? event.metaKey : event.ctrlKey) || event.altKey || event.key.toLowerCase() !== 's') return;
    event.preventDefault();
    if (document.querySelector('dialog[open]') || !EdukorsDocuments.active()) return;
    save({ as: event.shiftKey });
  });

  // ----- Drafts (desktop) -----
  // A document with unsaved changes is kept as a draft in the app's data folder a moment after it changes, so a crash
  // loses little; the next start offers to recover drafts no window owns. Saving or closing a document removes its
  // draft. The bytes come from EdukorsAppDocument.draftBytes(doc) when the app has it (for example to pack them outside
  // the page), else from toBytes(doc, { draft: true }). Apps say that a document changed with edukors:document-changed
  // ({ id }); for apps that do not, documents with unsaved changes are kept again every 30 seconds.
  const drafts = new Map(); // doc id → { key, timer, written, signalled }
  function draftOf(doc) {
    if (!drafts.has(doc.id)) drafts.set(doc.id, { key: `draft-${crypto.randomUUID()}`, timer: 0, written: false, signalled: false });
    return drafts.get(doc.id);
  }
  function forgetDraft(id) {
    const entry = drafts.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    drafts.delete(id);
    if (entry.written) desktop.drafts.remove(entry.key).catch(() => {});
  }
  function keepDraft(doc, delay = 3000) {
    if (!desktop?.drafts || !doc) return;
    if (!EdukorsDocuments.list().includes(doc)) { forgetDraft(doc.id); return; }
    const entry = draftOf(doc);
    clearTimeout(entry.timer);
    if (!EdukorsDocuments.isModified(doc)) {
      if (entry.written) { entry.written = false; desktop.drafts.remove(entry.key).catch(() => {}); }
      return;
    }
    entry.timer = setTimeout(async () => {
      if (!EdukorsDocuments.list().includes(doc) || !EdukorsDocuments.isModified(doc)) return;
      try {
        const bytes = app().draftBytes ? await app().draftBytes(doc) : (await app().toBytes(doc, { name: doc.name || EdukorsDocuments.nameOf(doc), draft: true })).bytes;
        const result = await desktop.drafts.write({ key: entry.key, bytes, name: doc.name || EdukorsDocuments.nameOf(doc), path: doc.path || '' });
        if (!result?.error && drafts.get(doc.id) === entry) entry.written = true;
      } catch { /* a draft is a safety net: the next change tries again */ }
    }, delay);
  }
  const docById = id => EdukorsDocuments.list().find(doc => doc.id === id);
  async function recoverDrafts() {
    const { drafts: found = [] } = await desktop.drafts.list();
    if (!found.length) return;
    const take = await Dialogs.confirm({ t, title: t('recoverTitle'), message: Dialogs.fill(t('recoverBody'), { n: found.length }), primary: t('recover'), cancel: t('discard') });
    for (const item of found) {
      if (take) {
        try {
          const { bytes, error } = await desktop.drafts.read(item.key);
          if (error) throw new Error(error);
          const content = await app().fromBytes(bytes);
          // A recovered document has no file (its original, if any, is untouched) and has unsaved changes.
          const doc = EdukorsDocuments.add({ name: Dialogs.fill(t('recoveredName'), { name: item.name || t('untitled') }), recovered: true });
          app().adopt(doc, content);
          EdukorsDocuments.activate(doc.id);
          keepDraft(doc, 0);
        } catch (error) { Dialogs.toast({ t, message: fileMessage('openFailed', { name: item.name, reason: error.message }) }); }
      }
      await desktop.drafts.remove(item.key).catch(() => {});
    }
  }
  if (desktop?.drafts) {
    document.addEventListener('edukors:document-changed', event => { const doc = docById(event.detail?.id); if (doc) { draftOf(doc).signalled = true; keepDraft(doc); } });
    for (const type of ['edukors:document-modified', 'edukors:conversations-changed']) document.addEventListener(type, event => keepDraft(docById(event.detail?.id)));
    document.addEventListener('edukors:document-saved', event => keepDraft(event.detail?.doc));
    document.addEventListener('edukors:documents-changed', () => {
      const open = new Set(EdukorsDocuments.list().map(doc => doc.id));
      for (const id of [...drafts.keys()]) if (!open.has(id)) forgetDraft(id);
    });
    setInterval(() => { for (const doc of EdukorsDocuments.list()) if (EdukorsDocuments.isModified(doc) && !drafts.get(doc.id)?.signalled) keepDraft(doc, 0); }, 30000);
    // Once the app's scripts have loaded (they turn bytes into documents).
    const recover = () => recoverDrafts().catch(() => {});
    if (document.readyState === 'complete') setTimeout(recover); else addEventListener('load', recover, { once: true });
  }

  // ----- Files to insert (pictures, fonts) -----
  // kinds: ['image'] and/or ['font']. Desktop: the system's dialog, starting in the last folder used for inserting, else
  // the document's folder. Browser: a file input. → [{ name, file, extension, mime, bytes }] (empty when cancelled).
  const MIMES = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf'
  };
  async function pickFiles({ kinds = ['image'], multiple = false, doc = EdukorsDocuments.active() } = {}) {
    const title = t(kinds.length === 1 && kinds[0] === 'image' ? 'pickImagesTitle' : 'pickFilesTitle');
    if (desktop) {
      const result = await desktop.pick({ title, kinds, multiple, folder: doc?.folder });
      if (result.error) { Dialogs.toast({ t, message: fileMessage('pickFailed', { reason: result.error }) }); return []; }
      return result.canceled ? [] : result.files;
    }
    const accept = Object.entries(MIMES).filter(([, mime]) => kinds.some(kind => mime.startsWith(kind === 'image' ? 'image/' : 'font/'))).map(([ext]) => ext);
    return new Promise(resolve => {
      const input = Object.assign(document.createElement('input'), { type: 'file', accept: accept.join(','), multiple });
      input.addEventListener('change', async () => {
        const files = [];
        for (const file of input.files) {
          const dot = file.name.lastIndexOf('.'), ext = dot > 0 ? file.name.slice(dot).toLowerCase() : '';
          if (!accept.includes(ext) || file.size > 50 * 2 ** 20) continue;
          files.push({ name: dot > 0 ? file.name.slice(0, dot) : file.name, file: file.name, extension: ext, mime: MIMES[ext], bytes: new Uint8Array(await file.arrayBuffer()) });
        }
        resolve(files);
      });
      input.addEventListener('cancel', () => resolve([]));
      input.click();
    });
  }

  // For apps: the same commands the toolbar runs.
  globalThis.EdukorsFiles = Object.freeze({
    save: options => save(options),
    saveFirst: (doc = EdukorsDocuments.active()) => (doc ? saveFirst(doc) : Promise.resolve(false)),
    export: () => exportDocument(),
    pickFiles
  });

  // Closing a document that has unsaved changes asks first. Returns true when the document may close.
  EdukorsDocuments.beforeClose = async doc => {
    EdukorsDocuments.activate(doc.id);
    const choice = await Dialogs.confirmClose({ t, name: EdukorsDocuments.nameOf(doc) });
    if (choice === 'cancel') return false;
    if (choice === 'save') return save({ doc });
    return true;
  };
})();
