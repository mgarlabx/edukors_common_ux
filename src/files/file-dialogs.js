// Shared screens for Save, Export, closing a document with unsaved changes, and the notices that follow.
// The screens only collect choices and show progress and errors; the host does the real work (files, folders, export)
// through the `commit` function each call receives. Nothing here touches the file system.
//
//   EdukorsFileDialogs.save({ t, title, name, folder, extension, commit })       → { name, folder } | null
//   EdukorsFileDialogs.exportAs({ t, name, folder, formats, format, commit })    → { name, folder, format } | null
//                         (no name or folder fields: the export goes next to the original file, with the same name)
//   EdukorsFileDialogs.confirmClose({ t, name })                                  → 'save' | 'discard' | 'cancel'
//   EdukorsFileDialogs.toast({ t, message, action: { label, onClick } })
//
// `t(key)` returns interface text; `{name}`, `{ext}`, and `{path}` in a text are filled in here.
// `commit({ name, folder, format, replace, progress })` returns a promise of:
//   {}                   done
//   { exists: true }     a file with that name is already in the folder: the screen asks whether to replace it
//   { error: 'text' }    failed: the screen stays open and shows the text
// `formats`: [{ id, label, description, extension }]. `progress(0..100)` fills the progress bar while exporting.
// Choosing a folder belongs to the host: pass `chooseFolder: async () => 'path'` to enable the Choose button.
globalThis.EdukorsFileDialogs = (() => {
  const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
  let counter = 0;

  // Returns the key of the message that explains why the name cannot be a file name, or '' when it can.
  function fileNameProblem(name) {
    if (!name) return 'fileNameEmpty';
    if (name.length > 120) return 'fileNameLong';
    if (/[\u0000-\u001f\u007f\\/:*?"<>|]/.test(name) || /[. ]$/.test(name)) return 'fileNameInvalid';
    if (RESERVED.test(name)) return 'fileNameReserved';
    return '';
  }
  const fill = (text, values) => text.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'text') node.textContent = value;
      else if (key === 'class') node.className = value;
      else node.setAttribute(key, value === true ? '' : value);
    }
    node.append(...children);
    return node;
  }

  // The dialog frame: title, close button, body, footer. Resolves through `finish`.
  function frame({ t, title, wide = false }) {
    const id = `file-dialog-${++counter}`;
    const close = el('button', { type: 'button', class: 'tool', 'aria-label': t('close') }, [el('span', { class: 'tooltip', 'aria-hidden': 'true', text: t('close') })]);
    close.insertAdjacentHTML('afterbegin', EdukorsIcons.svg('graph-Close'));
    const body = el('div', { class: 'file-body' });
    const footer = el('div', { class: 'file-footer' });
    const dialog = el('dialog', { class: `file-dialog${wide ? ' wide' : ''}`, 'aria-labelledby': `${id}-title` }, [
      el('header', { class: 'settings-header' }, [el('h2', { id: `${id}-title`, text: title }), close]), body, footer
    ]);
    document.body.append(dialog);
    return { dialog, body, footer, close };
  }

  function present(dialog, onDismiss) {
    const previous = document.activeElement;
    let done = false;
    const finish = value => { if (done) return; done = true; dialog.close(); dialog.remove(); if (previous?.isConnected) previous.focus({ preventScroll: true }); onDismiss(value); };
    dialog.addEventListener('close', () => finish(undefined));
    dialog.showModal();
    return finish;
  }

  const button = (text, className = '') => el('button', { type: 'button', class: `small-button ${className}`.trim(), text });

  // Save and Export share one form: name + extension, folder, and (for Export) a list of formats.
  function form({ t, title, name, folder, extension, formats, format, primary, busyLabel, hint, chooseFolder, fixedLocation = false, commit }) {
    return new Promise(resolve => {
      const { dialog, body, footer, close } = frame({ t, title });
      let selected = formats ? (formats.find(item => item.id === format) || formats[0]) : null;
      const extensionText = () => (selected ? selected.extension : extension);

      const nameId = `file-name-${counter}`, folderId = `file-folder-${counter}`;
      const nameInput = el('input', { type: 'text', id: nameId, value: name, autocomplete: 'off', spellcheck: 'false', 'aria-describedby': `${nameId}-message` });
      const extensionChip = el('span', { class: 'file-extension', 'aria-hidden': 'true', text: extensionText() });
      const folderInput = el('input', { type: 'text', id: folderId, value: folder, readonly: true });
      const choose = button(t('chooseFolder'));
      if (chooseFolder) choose.addEventListener('click', async () => { const next = await chooseFolder(folderInput.value); if (next) folderInput.value = next; });
      else { choose.setAttribute('aria-disabled', 'true'); choose.title = t('chooseFolderTip'); choose.addEventListener('click', event => event.preventDefault()); }
      const message = el('p', { class: 'file-message', id: `${nameId}-message`, role: 'alert' });
      const progress = el('progress', { class: 'file-progress', max: 100, value: 0, 'aria-label': busyLabel, hidden: true });

      if (formats) {
        const group = el('fieldset', { class: 'file-formats' }, [el('legend', { text: t('exportFormat') })]);
        for (const item of formats) {
          const radio = el('input', { type: 'radio', name: `format-${counter}`, value: item.id, checked: item === selected });
          radio.addEventListener('change', () => { selected = item; extensionChip.textContent = item.extension; });
          group.append(el('label', { class: 'file-format' }, [radio, el('span', {}, [el('strong', { text: item.label }), el('small', { text: item.description })]), el('span', { class: 'file-extension', 'aria-hidden': 'true', text: item.extension })]));
        }
        body.append(group);
      }
      // With a fixed location (Export) the name and the folder are not asked: the file keeps the document's name, with the
      // format's extension, and goes next to the original. The inputs stay in memory only to carry those values.
      body.append(
        ...(fixedLocation ? [] : [
          el('div', { class: 'file-field' }, [el('label', { for: nameId, text: t('fileName') }), el('div', { class: 'file-name-row' }, [nameInput, extensionChip])]),
          el('div', { class: 'file-field' }, [el('label', { for: folderId, text: t('fileFolder') }), el('div', { class: 'file-name-row' }, [folderInput, choose])])
        ]),
        ...(hint ? [el('p', { class: 'file-hint', text: fill(hint, { ext: extensionText() }) })] : []),
        message, progress
      );

      const cancel = button(t('cancel')), go = button(primary, 'primary');
      const back = button(t('chooseAnotherName')), replace = button(t('replaceFile'), 'primary');
      back.hidden = replace.hidden = true;
      footer.append(cancel, back, go, replace);

      let busy = false, finish;
      const setBusy = value => {
        busy = value;
        for (const control of [cancel, go, back, replace, close, nameInput, ...body.querySelectorAll('input[type=radio]')]) control.disabled = value;
        progress.hidden = !(value && formats);
        go.textContent = value ? busyLabel : primary;
      };
      const showMessage = (text, kind = 'error') => { message.textContent = text; message.dataset.kind = kind; };
      const currentName = () => nameInput.value.trim();

      async function run(replacing = false) {
        const problem = fixedLocation ? '' : fileNameProblem(currentName());
        if (problem) { showMessage(t(problem)); nameInput.setAttribute('aria-invalid', 'true'); nameInput.focus(); return; }
        nameInput.removeAttribute('aria-invalid');
        showMessage('');
        setBusy(true);
        let result;
        try { result = await commit({ name: currentName(), folder: folderInput.value, format: selected?.id, replace: replacing, progress: value => { progress.value = value; } }); }
        catch (error) { result = { error: error.message || t(formats ? 'exportFailed' : 'saveFailed') }; }
        setBusy(false);
        if (result?.exists) {
          showMessage(fill(t('fileExists'), { name: currentName() + extensionText() }), 'warning');
          go.hidden = true; back.hidden = replace.hidden = false;
          replace.focus();
        } else if (result?.error) {
          showMessage(`${t(formats ? 'exportFailed' : 'saveFailed')} ${result.error}`);
          go.focus();
        } else finish({ name: currentName(), folder: folderInput.value, format: selected?.id });
      }
      go.addEventListener('click', () => run(false));
      replace.addEventListener('click', () => run(true));
      back.addEventListener('click', () => { showMessage(''); go.hidden = false; back.hidden = replace.hidden = true; nameInput.focus(); nameInput.select(); });
      nameInput.addEventListener('input', () => { if (message.textContent) { showMessage(''); nameInput.removeAttribute('aria-invalid'); if (!go.hidden) return; go.hidden = false; back.hidden = replace.hidden = true; } });
      body.addEventListener('keydown', event => { if (event.key === 'Enter' && event.target.tagName === 'INPUT' && (event.target.type === 'text' || event.target.type === 'radio')) { event.preventDefault(); if (!busy) (go.hidden ? run(true) : run(false)); } });
      cancel.addEventListener('click', () => finish(null));
      close.addEventListener('click', () => finish(null));
      // Escape does not cancel while the host is working.
      dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
      finish = present(dialog, value => resolve(value ?? null));
      if (fixedLocation) body.querySelector('input[type=radio]:checked')?.focus(); else { nameInput.focus(); nameInput.select(); }
    });
  }

  const save = ({ t, title, name, folder, extension, chooseFolder, commit }) =>
    form({ t, title: title || t('saveTitle'), name, folder, extension, primary: t('save'), busyLabel: t('saving'), hint: t('saveFormatHint'), chooseFolder, commit });

  // The name and the folder are not asked: an export is saved next to the original file, with the same name and the
  // format's extension.
  const exportAs = ({ t, name, folder, formats, format, commit }) =>
    form({ t, title: t('exportTitle'), name, folder, formats, format, primary: t('export'), busyLabel: t('exporting'), fixedLocation: true, commit });

  // "Save changes to …?" when a document with unsaved changes is about to close.
  function confirmClose({ t, name }) {
    return new Promise(resolve => {
      const { dialog, body, footer, close } = frame({ t, title: fill(t('closeUnsavedTitle'), { name }) });
      body.append(el('p', { class: 'file-hint', text: t('closeUnsavedBody') }));
      const discard = button(t('dontSave')), cancel = button(t('cancel')), go = button(t('save'), 'primary');
      footer.classList.add('spread');
      footer.append(discard, el('span', { class: 'file-footer-end' }, [cancel, go]));
      const finish = present(dialog, value => resolve(value ?? 'cancel'));
      discard.addEventListener('click', () => finish('discard'));
      cancel.addEventListener('click', () => finish('cancel'));
      close.addEventListener('click', () => finish('cancel'));
      go.addEventListener('click', () => finish('save'));
      go.focus();
    });
  }

  // A short notice at the bottom of the window, announced to screen readers, with an optional action.
  function toast({ t, message, action, duration = 6000 }) {
    let region = document.getElementById('toast-region');
    if (!region) { region = el('div', { id: 'toast-region', class: 'toast-region', role: 'status', 'aria-live': 'polite' }); document.body.append(region); }
    const node = el('div', { class: 'toast' }, [el('span', { text: message })]);
    const remove = () => node.remove();
    if (action) { const act = button(action.label); act.addEventListener('click', () => { remove(); action.onClick(); }); node.append(act); }
    const dismiss = el('button', { type: 'button', class: 'tool', 'aria-label': t('close') }, [el('span', { class: 'tooltip', 'aria-hidden': 'true', text: t('close') })]);
    dismiss.insertAdjacentHTML('afterbegin', EdukorsIcons.svg('graph-Close'));
    dismiss.addEventListener('click', remove);
    node.append(dismiss);
    region.replaceChildren(node); // a new notice replaces the previous one
    const timer = setTimeout(remove, duration);
    node.addEventListener('pointerenter', () => clearTimeout(timer));
    return remove;
  }

  return Object.freeze({ save, exportAs, confirmClose, toast, fileNameProblem, fill });
})();
