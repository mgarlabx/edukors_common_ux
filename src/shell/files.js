// Save, Open, Recent, Import, Export, Show in folder, and closing with unsaved changes.
// The screens come from src/files/file-dialogs.js. In the desktop app (EdukorsDesktop.files, provided by the Electron
// preload) the work is real: the app turns its documents into bytes and back through EdukorsAppDocument (its own
// script; see docs/common-shell.md, "App integration"), Export renders the page, and Show in folder opens the system's
// file manager. In a browser the "host" below only simulates the work, in
// memory: no file is written, no folder is opened.
// To see the other states in the simulation, save the document with the name "existing" (Save asks to replace) or
// "error" (Save fails; a document saved as "error" also fails to export, to show that screen).
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

  // ----- Desktop host: real files -----
  const desktopHost = {
    async save(doc, { name, folder, replace }) {
      const base = withoutExtension(name, extension());
      const { bytes, committed } = await app().toBytes(doc, { name: base });
      const result = await desktop.save({ folder, name: base, extension: extension(), bytes, replace });
      if (result.exists) return { exists: true };
      if (result.error) return { error: result.error };
      // Saved in the app's format: from now on it is that file (a document opened from another format leaves it).
      Object.assign(doc, { saved: true, name: base, folder: result.folder, file: result.file, path: result.path, originFormat: null });
      document.dispatchEvent(new CustomEvent('edukors:document-saved', { detail: { doc, committed } }));
      EdukorsAiAssistant.documentSaved(doc);
      EdukorsDocuments.refresh();
      return {};
    },
    async export(doc, { name, folder, format, progress }) {
      progress(10);
      // exportFile({ doc, format, title }) → { html, width, height } or { data }; apps with only a page give exportPage.
      const out = app().exportFile ? await app().exportFile({ doc, format, title: name }) : await app().exportPage({ title: name });
      progress(40);
      const result = await desktop.export({ folder, name, format, html: out.html, data: out.data, width: out.width, height: out.height });
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
    async export(doc, { name, folder, format, progress }) {
      // Exporting again overwrites the previous export of the same document, so it never asks about replacing.
      const ext = `.${format}`, base = withoutExtension(name, ext);
      for (let step = 1; step <= 10; step++) { await wait(90); progress(step * 10); }
      if (base.toLowerCase() === 'error') return { error: t('demoExportError') };
      doc.lastExport = `${folder}/${base}${ext}`;
      return {};
    }
  };

  const host = desktop ? desktopHost : simulatedHost;

  // ----- Commands -----
  // Writes a document opened from another format back into its file, in that format. The first time, the person
  // confirms (or chooses the app's own format instead).
  async function saveOriginal(doc) {
    if (!doc.originConfirmed) {
      const choice = await Dialogs.confirmSaveOriginal({ t, name: doc.file, format: doc.originExt.slice(1).toUpperCase(), extension: extension(), note: doc.originFormat === 'html' ? '' : t('saveOriginalNote') });
      if (choice === 'cancel') return false;
      if (choice === 'app') { Object.assign(doc, { saved: false, file: undefined, path: undefined, originFormat: null }); return save({ doc }); }
      doc.originConfirmed = true;
    }
    try {
      const out = await app().exportFile({ doc, format: doc.originFormat, title: doc.name });
      const result = await desktop.save({ folder: doc.folder, name: doc.file.slice(0, -doc.originExt.length), extension: doc.originExt, bytes: out.data ?? out.html, replace: true });
      if (result.error) throw new Error(result.error);
      document.dispatchEvent(new CustomEvent('edukors:document-saved', { detail: { doc } }));
      EdukorsAiAssistant.documentSaved(doc);
      EdukorsDocuments.refresh();
      Dialogs.toast({ t, message: Dialogs.fill(t('savedToast'), { name: doc.file }) });
      return true;
    } catch (error) {
      Dialogs.toast({ t, message: fileMessage('saveFailed', { name: doc.file, reason: error.message }) });
      return false;
    }
  }

  async function save({ as = false, doc = EdukorsDocuments.active() } = {}) {
    if (!doc) return false;
    if (!as && doc.originFormat && desktop) return saveOriginal(doc);
    // A document that already has a file is saved again without asking anything.
    if (doc.saved && !as) {
      const result = await host.save(doc, { name: doc.name, folder: doc.folder, replace: true });
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
    if (!doc || !doc.saved) return;
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
    const result = await desktop.open({ title: t('openTitle'), filterName: Dialogs.fill(t('openFilter'), { app: appName }), allLabel: t('importAll') });
    if (result.canceled) return;
    if (result.error) { Dialogs.toast({ t, message: fileMessage('openFailed', { name: '', reason: result.error }) }); return; }
    await adoptFile(result.file);
  }

  // A file read by the host becomes a document tab (or activates the tab that already shows it).
  // A file of another format (opened from Open or Recent, when the app lists it in startDesktopApp's openExtensions)
  // becomes a document named after it, in its folder. If the app can write that format back (file.saveOriginal and
  // startDesktopApp's saveExtensions), Save writes into the file itself, after a first confirmation; otherwise the
  // document has no file of its own, and Save asks for a name and saves in the app's format.
  async function adoptFile({ path, name, folder, file: fileName, bytes }) {
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
          ? EdukorsDocuments.add({ saved: true, name, folder, file: fileName, path, origin: path, originFormat: back, originExt: fileName.slice(dot) })
          : EdukorsDocuments.add({ name, folder, origin: path });
        app().adopt(doc, converted);
        EdukorsDocuments.activate(doc.id);
      } catch (error) { Dialogs.toast({ t, message: fileMessage('openFailed', { name: fileName, reason: error.message }) }); }
      return;
    }
    let content;
    try { content = await app().fromBytes(bytes); }
    catch (error) { Dialogs.toast({ t, message: fileMessage('openFailed', { name: fileName, reason: error.message }) }); return; }
    const doc = EdukorsDocuments.add({ saved: true, name, folder, file: fileName, path });
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
    let file;
    if (desktop) {
      const result = await desktop.import({ title: t('importTitle'), allLabel: t('importAll'), formats: formats.map(format => ({ name: t(`import${capitalized(format.id)}`), extensions: format.extensions })) });
      if (result.canceled) return;
      if (result.error) { Dialogs.toast({ t, message: fileMessage('importFailed', { name: '', reason: result.error }) }); return; }
      file = result.file;
    } else {
      file = await pickInBrowser(formats);
      if (!file) return;
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
  // a file that is no longer there is marked, and choosing it removes it from the list. The preview lists what was
  // "saved" while the page is open and can only switch to a document that is still open.
  const shortFolder = folder => homeFolder && (folder === homeFolder || folder.startsWith(`${homeFolder}/`) || folder.startsWith(`${homeFolder}\\`))
    ? `~${folder.slice(homeFolder.length)}` : folder;

  async function openRecent(entry) {
    const open = EdukorsDocuments.list().find(doc => pathOf(doc) === entry.path && doc.saved);
    if (open) { EdukorsDocuments.activate(open.id); return; }
    if (!desktop) { Dialogs.toast({ t, message: Dialogs.fill(t('recentPreview'), { path: entry.path }) }); return; }
    const result = await desktop.openRecent({ path: entry.path });
    if (result.code === 'MISSING') { Dialogs.toast({ t, message: Dialogs.fill(t('recentGone'), { name: entry.file }) }); return; }
    if (result.error) { Dialogs.toast({ t, message: fileMessage('openFailed', { name: entry.file, reason: result.error }) }); return; }
    await adoptFile(result.file);
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
      detail: entry.exists ? shortFolder(entry.folder) : `${t('recentMissing')} · ${shortFolder(entry.folder)}`,
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
    desktop.setDirty(EdukorsDocuments.list().some(doc => doc.modified), { message: t('closeUnsavedMessage'), discard: t('closeWithoutSaving'), cancel: t('cancel') });
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
  }

  // Cmd/Ctrl+S saves; adding Shift asks for a new name and place.
  document.addEventListener('keydown', event => {
    if (!(EdukorsPlatform.mac ? event.metaKey : event.ctrlKey) || event.altKey || event.key.toLowerCase() !== 's') return;
    event.preventDefault();
    if (document.querySelector('dialog[open]') || !EdukorsDocuments.active()) return;
    save({ as: event.shiftKey });
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
