// Visual fixture only. Host command handlers will be added separately.

// Premise: every app runs on macOS, Windows, and Linux. Shortcut labels and modifier keys follow the platform.
globalThis.EdukorsPlatform = (() => {
  const mac = /Mac|iPhone|iPad/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent);
  return Object.freeze({ mac, modifier: mac ? '⌘' : 'Ctrl+', shift: mac ? '⇧' : 'Shift+', isModifier: event => mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey });
})();

function addButton(container, key, label, requiresDocument = false, icon = key) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.command = key;
  button.className = `tool${requiresDocument ? ' document-action' : ''}`;
  button.setAttribute('aria-label', label);
  button.hidden = requiresDocument;
  button.setAttribute('aria-description', 'Visual preview only');
  button.innerHTML = EdukorsIcons.svg(icon);
  const tooltip = document.createElement('span');
  tooltip.className = 'tooltip';
  tooltip.setAttribute('aria-hidden', 'true');
  tooltip.textContent = label;
  button.append(tooltip);
  document.getElementById(container).append(button);
}
for (const [key, label, requiresDocument] of [
  ['new', 'New'], ['open', 'Open'], ['recent', 'Recent'], ['import', 'Import'],
  ['save', 'Save', true], ['export', 'Export', true], ['reveal', 'Show in folder', true]
]) addButton('file-actions', key, label, requiresDocument);
// Edit group (toolbar inventory in docs/common-shell.md): shown with an open document; unavailable commands are disabled, not hidden.
for (const [key, label, icon] of [['undo', 'Undo', 'graph-Undo'], ['redo', 'Redo', 'graph-Redo']]) addButton('edit-actions', key, label, true, icon);
{
  const separator = document.createElement('span');
  separator.className = 'separator document-action';
  separator.setAttribute('aria-hidden', 'true');
  separator.hidden = true;
  document.getElementById('edit-actions').append(separator);
}
for (const [key, label, icon] of [['cut', 'Cut', 'graph-Cut'], ['copy', 'Copy', 'graph-Copy'], ['paste', 'Paste', 'graph-Paste'], ['duplicate', 'Duplicate', 'slides-duplicate'], ['delete', 'Delete', 'graph-Trash']]) addButton('edit-actions', key, label, true, icon);
// Insert group: the app chooses what it offers (text, table, shape, image), with EdukorsAppConfig.insert (any app) or
// EdukorsAppConfig.canvas.insert (a canvas app; text, shape, and image when it names none). No choice means no Insert group.
{
  const offered = EdukorsAppConfig.insert ?? EdukorsAppConfig.canvas?.insert ?? (EdukorsAppConfig.canvas ? ['text', 'shape', 'image'] : []);
  for (const [kind, key, label, icon] of [['text', 'insertText', 'Insert text', 'slides-text'], ['table', 'insertTable', 'Insert table', 'common-table'], ['shape', 'insertShape', 'Insert shape', 'slides-shape'], ['image', 'insertImage', 'Insert image', 'slides-image']]) {
    if (offered.includes(kind)) addButton('insert-actions', key, label, true, icon);
  }
  if (!offered.length) { const group = document.getElementById('insert-actions'); group.previousElementSibling?.remove(); group.remove(); }
}
// Edit and Insert commands start unavailable; the app's document enables what it can do.
for (const button of document.querySelectorAll('#edit-actions .tool, #insert-actions .tool')) button.setAttribute('aria-disabled', 'true');
addButton('utility-actions', 'settings', 'Settings');
addButton('utility-actions', 'help', 'Help');
if (EdukorsAppConfig.sidebar !== false) addButton('panel-actions', 'sidebar', 'Sidebar', true, 'slides-panel');
addButton('panel-actions', 'assistant', 'AI assistant', true, 'graph-Ai');
// The window title and titlebar show only the application name.
document.title = EdukorsAppConfig.name;
document.querySelector('.titlebar h1').textContent = EdukorsAppConfig.name;
document.querySelector('.statusbar .version').textContent = EdukorsAppConfig.version;
