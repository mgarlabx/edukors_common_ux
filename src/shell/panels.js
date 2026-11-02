// Right-aligned panel toggles: the sidebar (application content) and the AI assistant.
// They are available only while a document is open, and both start closed. The sidebar opens on the left of the
// workspace and the assistant on the right; both can be open at once.
// The assistant's content (conversation, composer, account and model) belongs to src/ai/ui/ai-assistant.js.
(() => {
  const panels = {
    sidebar: document.getElementById('sidebar-panel'),
    assistant: document.getElementById('assistant-panel-side')
  };
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
    document.getElementById('sidebar-title').textContent = message('sidebar');
    document.getElementById('sidebar-placeholder').textContent = message('sidebarPlaceholder');
    document.getElementById('assistant-panel-label').textContent = message('assistant');
    for (const button of document.querySelectorAll('[data-close-panel]')) {
      button.setAttribute('aria-label', message('close'));
      button.querySelector('.tooltip').textContent = message('close');
    }
  }

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
