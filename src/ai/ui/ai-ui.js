// Small helpers shared by the AI screens (ai-settings.js, ai-assistant.js): translation lookup, element building,
// and the readable names of providers, account states, and error codes. No HTML strings are built from data.
globalThis.EdukorsAiUi = (() => {
  const messages = () => (EdukorsLanguages[document.documentElement.lang] || EdukorsLanguages.en).messages;
  /** A translated message; {name} placeholders are filled from vars. Missing keys fall back to English. */
  function t(key, vars) {
    let text = messages()[key] ?? EdukorsLanguages.en.messages[key] ?? key;
    if (vars) for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value));
    return text;
  }

  /** h('button', { class, text, onClick, ...attributes }, children) */
  function h(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value; // only for trusted icon SVG from EdukorsIcons
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key === 'value') node.value = value;
      else if (value === true) node.setAttribute(key, '');
      else node.setAttribute(key, String(value));
    }
    for (const child of [].concat(children)) if (child !== null && child !== undefined && child !== false) node.append(child);
    return node;
  }

  const icon = (name, size = 16) => h('span', { class: 'ai-icon', 'aria-hidden': 'true', html: EdukorsIcons.svg(name, size) });

  /** An icon button with the shared tooltip. */
  function iconButton(name, label, onClick, extra = {}) {
    return h('button', { type: 'button', class: 'tool ai-tool', 'aria-label': label, onClick, ...extra }, [
      h('span', { 'aria-hidden': 'true', html: EdukorsIcons.svg(name) }),
      h('span', { class: 'tooltip', 'aria-hidden': 'true', text: label })
    ]);
  }

  const stateKeys = { connected: 'aiStateConnected', disconnected: 'aiStateDisconnected', expired: 'aiStateExpired', unknown: 'aiStateUnknown' };
  const stateLabel = state => t(stateKeys[state] || 'aiStateUnknown');

  // Stable error codes from the runtime (src/ai/runtime/errors.js) in plain language. Raw provider text stays in diagnostics.
  const errorKeys = {
    CLI_MISSING: 'aiErrorCliMissing', CLI_INCOMPATIBLE: 'aiErrorCliIncompatible', CAPABILITY_UNSUPPORTED: 'aiErrorUnsupported',
    ACCOUNT_NOT_FOUND: 'aiErrorAccountNotFound', ACCOUNT_DISCONNECTED: 'aiErrorAccountDisconnected', ACCOUNT_EXPIRED: 'aiErrorAccountDisconnected',
    LOGIN_FAILED: 'aiErrorLoginFailed', SESSION_BUSY: 'aiErrorBusy', PROVIDER_START_FAILED: 'aiErrorProviderStart',
    PROVIDER_CRASHED: 'aiErrorCrashed', RATE_LIMITED: 'aiErrorRateLimited', TIMEOUT: 'aiErrorTimeout', TOOL_DENIED: 'aiErrorToolDenied',
    REGISTRY_LOCKED: 'aiErrorRegistry', REGISTRY_CORRUPT: 'aiErrorRegistry', REGISTRY_TOO_NEW: 'aiErrorRegistryTooNew',
    HOST_UNAVAILABLE: 'aiErrorHost', HOST_LOST: 'aiErrorHostLost'
  };
  const errorText = error => t(errorKeys[error?.code] || 'aiErrorGeneric', { code: error?.code || 'INTERNAL' });

  /** "five_hour" → "5-hour limit"; other window names are shown as the provider gives them. */
  const windowLabel = name => ({ five_hour: t('aiUsageFiveHour'), seven_day: t('aiUsageWeekly') }[name] || name.replaceAll('_', ' '));
  const timeText = iso => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(document.documentElement.lang || 'en', { dateStyle: 'short', timeStyle: 'short' }).format(date);
  };

  return Object.freeze({ t, h, icon, iconButton, stateLabel, errorText, windowLabel, timeText });
})();
