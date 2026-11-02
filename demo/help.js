// Help: a modal sheet with Quick guide, Full guide, and Terms of use tabs and the application version,
// following the Slides editor. The consuming application supplies the Markdown texts (app-config.js).
(() => {
  const trigger = document.querySelector('[data-command="help"]');
  const dialog = document.getElementById('help-dialog');
  const tabList = dialog.querySelector('.help-tabs');
  const body = dialog.querySelector('.help-body');
  const closeButton = document.getElementById('help-close');
  const tabs = ['quickGuide', 'fullGuide', 'termsOfUse'];
  let current = tabs[0];

  trigger.removeAttribute('aria-description');
  trigger.setAttribute('aria-haspopup', 'dialog');
  closeButton.insertAdjacentHTML('afterbegin', EdukorsIcons.svg('graph-Close'));
  document.getElementById('help-version').textContent = `${EdukorsAppConfig.name} · ${EdukorsAppConfig.version}`;

  const language = () => document.documentElement.lang;
  const messages = () => (EdukorsLanguages[language()] || EdukorsLanguages.en).messages;
  const message = key => messages()[key] || EdukorsLanguages.en.messages[key];
  const text = key => {
    const texts = EdukorsAppConfig.help?.[key] || {};
    return texts[language()] || texts.en || '';
  };
  const available = () => tabs.filter(text);

  function renderBody() {
    const content = EdukorsMarkdown.render(text(current));
    content.className = 'help-text';
    body.replaceChildren(content);
    body.setAttribute('aria-labelledby', `help-tab-${current}`);
    body.scrollTop = 0;
  }

  function render() {
    const keys = available();
    trigger.hidden = !keys.length;
    if (!keys.includes(current)) current = keys[0];
    document.getElementById('help-title').textContent = message('help');
    tabList.setAttribute('aria-label', message('help'));
    closeButton.setAttribute('aria-label', message('close'));
    closeButton.querySelector('.tooltip').textContent = message('close');
    for (const tab of tabList.querySelectorAll('[role="tab"]')) tab.remove();
    for (const key of keys) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.id = `help-tab-${key}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', 'help-body');
      tab.setAttribute('aria-selected', String(key === current));
      tab.tabIndex = key === current ? 0 : -1;
      tab.dataset.tab = key;
      tab.textContent = message(key);
      tabList.insertBefore(tab, document.getElementById('help-version'));
    }
    if (keys.length) renderBody();
  }

  function select(key, focus = false) {
    current = key;
    render();
    if (focus) document.getElementById(`help-tab-${key}`).focus();
  }

  tabList.addEventListener('click', event => {
    const tab = event.target.closest('[role="tab"]');
    if (tab) select(tab.dataset.tab);
  });
  // Arrow keys, Home, and End move between tabs (automatic activation).
  tabList.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const keys = available();
    const index = keys.indexOf(current);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + keys.length) % keys.length;
    event.preventDefault();
    select(keys[next], true);
  });

  trigger.addEventListener('click', () => {
    render();
    dialog.showModal();
    document.getElementById(`help-tab-${current}`)?.focus();
  });
  closeButton.addEventListener('click', () => dialog.close());
  document.addEventListener('edukors:preferences-changed', render);
  render();
})();
