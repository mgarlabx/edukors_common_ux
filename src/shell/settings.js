(() => {
  const storageKey = 'edukors.common.preferences';
  // The browser exposes the host's preferred locale; regional variants use the base language.
  const hostLocale = (navigator.language || 'en').toLowerCase().replaceAll('_', '-');
  const hostLanguage = hostLocale.split('-')[0];
  const defaultLanguage = Object.hasOwn(EdukorsLanguages, hostLocale) ? hostLocale
    : Object.hasOwn(EdukorsLanguages, hostLanguage) ? hostLanguage : 'en';
  const defaults = { appearance: 'system', language: defaultLanguage, fontSize: 100 };
  let preferences = { ...defaults };
  try { preferences = { ...defaults, ...JSON.parse(localStorage.getItem(storageKey) || '{}') }; } catch {}
  const allowed = { appearance: ['system', 'light', 'dark'], language: Object.keys(EdukorsLanguages) };
  for (const key of Object.keys(allowed)) if (!allowed[key].includes(preferences[key])) preferences[key] = defaults[key];
  const legacySizes = {small:90, standard:100, large:120};
  preferences.fontSize = legacySizes[preferences.fontSize] || preferences.fontSize;
  if (!Number.isFinite(preferences.fontSize)) preferences.fontSize = 100;
  preferences.fontSize = Math.max(80, Math.min(200, Math.round(preferences.fontSize)));
  const dialog = document.getElementById('settings-dialog');
  const media = matchMedia('(prefers-color-scheme: dark)');
  let storageFailed = false;
  const controls = {language:document.getElementById('language')};
  const languageSelect = controls.language;
  for (const [code, language] of Object.entries(EdukorsLanguages)) {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = language.name;
    languageSelect.append(option);
  }
  function apply() {
    const t = EdukorsLanguages[preferences.language].messages;
    const sections = EdukorsLanguages[preferences.language].messages;
    // The AI assistant page is rendered by src/ai/ui/ai-settings.js.
    for (const [id,key] of Object.entries({'application-nav-label':'application','assistant-nav-label':'assistant'})) document.getElementById(id).textContent = sections[key];
    document.querySelector('.settings-nav').setAttribute('aria-label',t.settings);
    document.documentElement.lang = preferences.language;
    document.documentElement.dataset.theme = preferences.appearance === 'system' ? (media.matches ? 'dark' : 'light') : preferences.appearance;
    document.documentElement.style.setProperty('--font-scale', preferences.fontSize / 100);
    document.getElementById('font-size').value = preferences.fontSize;
    const fontLabels = [t.decreaseFontSize, t.increaseFontSize];
    for(const [index,id] of ['font-decrease','font-increase'].entries()) {
      const button = document.getElementById(id);
      button.setAttribute('aria-label',fontLabels[index]);
      button.title = `${fontLabels[index]} (${EdukorsPlatform.modifier}${EdukorsPlatform.shift}${index ? '+' : '−'})`;
      button.style.visibility = (index ? preferences.fontSize >= 200 : preferences.fontSize <= 80) ? 'hidden' : 'visible';
    }
    for (const [id,key] of Object.entries({'settings-title':'settings','appearance-label':'appearance','language-label':'language','font-size-label':'fontSize'})) document.getElementById(id).textContent = t[key];
    for (const button of document.querySelectorAll('[data-theme-option]')) {
      button.textContent = t[button.dataset.themeOption];
      button.setAttribute('aria-pressed', String(button.dataset.themeOption === preferences.appearance));
    }
    for (const [key,control] of Object.entries(controls)) {
      control.value = preferences[key];
      if(key !== 'language') for(const option of control.options) option.textContent = t[option.value];
    }
    for (const button of document.querySelectorAll('[data-command]')) {
      const label = t[button.dataset.command];
      button.setAttribute('aria-label',label);
      button.querySelector('.tooltip').textContent = label;
    }
    document.getElementById('settings-close').setAttribute('aria-label',t.close);
    document.querySelector('#settings-close .tooltip').textContent = t.close;
    document.querySelector('.workspace').setAttribute('aria-label',t.empty);
    // Saving is silent; only a storage failure is reported.
    const note = document.getElementById('preference-note');
    note.textContent = storageFailed ? t.failed : '';
    note.hidden = !storageFailed;
    document.dispatchEvent(new Event('edukors:preferences-changed'));
  }
  for(const [key,control] of Object.entries(controls)) control.addEventListener('change', () => {
    preferences[key] = control.value;
    try { localStorage.setItem(storageKey,JSON.stringify(preferences)); storageFailed = false; } catch { storageFailed = true; }
    apply();
  });
  for (const button of document.querySelectorAll('[data-theme-option]')) button.addEventListener('click', () => {
    preferences.appearance = button.dataset.themeOption;
    try { localStorage.setItem(storageKey,JSON.stringify(preferences)); storageFailed = false; } catch { storageFailed = true; }
    apply();
  });
  function changeFontSize(delta) {
    preferences.fontSize = Math.max(80, Math.min(200, preferences.fontSize + delta));
    try { localStorage.setItem(storageKey,JSON.stringify(preferences)); storageFailed = false; } catch { storageFailed = true; }
    apply();
  }
  const fontInput = document.getElementById('font-size');
  function commitFontSize() {
    const value = fontInput.valueAsNumber;
    if (!Number.isFinite(value)) { fontInput.value = preferences.fontSize; return; }
    const next = Math.max(80, Math.min(200, Math.round(value)));
    changeFontSize(next - preferences.fontSize);
  }
  fontInput.addEventListener('change', commitFontSize);
  fontInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); commitFontSize(); }
  });
  document.getElementById('font-decrease').addEventListener('click',() => changeFontSize(-10));
  document.getElementById('font-increase').addEventListener('click',() => changeFontSize(10));
  document.addEventListener('keydown',event => {
    if(!EdukorsPlatform.isModifier(event) || !event.shiftKey || event.altKey) return;
    const increase = event.key === '+' || event.code === 'Equal' || event.code === 'NumpadAdd';
    const decrease = event.key === '-' || event.key === '_' || event.code === 'Minus' || event.code === 'NumpadSubtract';
    if(increase || decrease) { event.preventDefault(); changeFontSize(increase ? 10 : -10); }
  });
  const settingsButton = document.querySelector('[data-command="settings"]');
  settingsButton.removeAttribute('aria-description');
  settingsButton.setAttribute('aria-haspopup','dialog');
  settingsButton.addEventListener('click',() => dialog.showModal());
  document.getElementById('settings-close').insertAdjacentHTML('afterbegin',EdukorsIcons.svg('graph-Close'));
  for(const id of ['settings-close']) document.getElementById(id).addEventListener('click',() => dialog.close());
  for (const button of document.querySelectorAll('[data-section]')) {
    button.insertAdjacentHTML('afterbegin', EdukorsIcons.svg(button.dataset.section === 'application' ? 'common-interface' : 'graph-Ai'));
    button.addEventListener('click', () => {
      for (const item of document.querySelectorAll('[data-section]')) {
        const active = item === button;
        if(active) item.setAttribute('aria-current','page'); else item.removeAttribute('aria-current');
        document.getElementById(item.getAttribute('aria-controls')).hidden = !active;
      }
      document.querySelector('.settings-body').scrollTop = 0;
    });
  }
  media.addEventListener('change',apply);
  apply();
})();
