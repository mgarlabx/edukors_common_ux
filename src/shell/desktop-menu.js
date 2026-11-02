// The desktop app's menu (desktop/main.mjs builds it on macOS only; Windows and Linux have no menu bar).
// The page gives the menu its labels in the interface language and runs its commands with the same code as the toolbar.
// Edit commands go to a text field when one has the focus (its native undo, delete, select all) and to the document
// otherwise. Close Tab closes the active document, or the window when none is open; Windows and Linux get Ctrl+W here.
// In a browser this file does nothing.
(() => {
  const menu = globalThis.EdukorsDesktop?.menu;
  if (!menu) return;
  const t = key => (EdukorsLanguages[document.documentElement.lang] || EdukorsLanguages.en).messages[key] || EdukorsLanguages.en.messages[key];
  const button = key => document.querySelector(`[data-command="${key}"]`);
  const usable = node => node && !node.hidden && node.getAttribute('aria-disabled') !== 'true';

  function sendLabels() {
    menu.setLabels({
      name: EdukorsAppConfig.name, version: EdukorsAppConfig.version,
      about: t('menuAbout'), settings: `${t('settings')}…`, services: t('menuServices'), hide: t('menuHide'),
      hideOthers: t('menuHideOthers'), showAll: t('menuShowAll'), quit: t('menuQuit'),
      edit: t('edit'), undo: t('undo'), redo: t('redo'), cut: t('cut'), copy: t('copy'), paste: t('paste'), delete: t('delete'),
      selectAll: t('menuSelectAll'), window: t('menuWindow'), minimize: t('menuMinimize'), zoom: t('menuZoom'),
      closeTab: t('menuCloseTab'), front: t('menuFront')
    });
  }

  // A text field or text being edited keeps its native behavior.
  const typing = () => {
    const node = document.activeElement;
    return !!node && (node.matches('input, textarea, select') || node.isContentEditable);
  };

  function closeTab() {
    // An open dialog or menu is closed with Escape or its own buttons; Close Tab does not act behind it.
    if (document.querySelector('dialog[open]') || EdukorsContextMenu.isOpen()) return;
    const active = EdukorsDocuments.active();
    if (active) EdukorsDocuments.close(active.id); else window.close();
  }

  const commands = {
    settings: () => { if (!document.querySelector('dialog[open]')) button('settings').click(); },
    closeTab,
    undo: () => typing() && !document.activeElement.isContentEditable ? document.execCommand('undo') : usable(button('undo')) && button('undo').click(),
    redo: () => typing() && !document.activeElement.isContentEditable ? document.execCommand('redo') : usable(button('redo')) && button('redo').click(),
    delete: () => typing() ? document.execCommand('delete') : usable(button('delete')) && button('delete').click(),
    selectAll: () => typing() ? document.execCommand('selectAll') : globalThis.EdukorsAppDocument?.selectAll?.()
  };
  menu.onCommand(name => commands[name]?.());

  // Windows and Linux have no menu, so Ctrl+W is handled here (Ctrl+Shift+W is left alone).
  if (!EdukorsPlatform.mac) document.addEventListener('keydown', event => {
    if (!event.ctrlKey || event.shiftKey || event.altKey || event.metaKey || event.key.toLowerCase() !== 'w') return;
    event.preventDefault();
    closeTab();
  });

  sendLabels();
  document.addEventListener('edukors:preferences-changed', sendLabels);
})();
