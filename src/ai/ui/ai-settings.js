// Settings → AI assistant. The same layout in every EDUKORS app (docs/ai.md):
//   Accounts (shared by every EDUKORS app on this computer): add (choose a service, name the account, sign in), status
//   with identity, sign in again, sign out, rename, remove (stating that it affects every app), the app's default
//   account, usage where the service reports it, and installation help when a service's CLI is missing.
//   Advanced (this app only), always in this order: instructions for the agent, MCP servers, skills.
// Everything goes through EdukorsAiHost; without a host, the page explains how to get one.
(() => {
  const { t, h, icon, iconButton, stateLabel, errorText, windowLabel, timeText } = EdukorsAiUi;
  const host = EdukorsAiHost;
  const store = EdukorsAiStore;
  const root = document.getElementById('assistant-panel');
  const dialog = document.getElementById('settings-dialog');

  // Screen state that is not shared with the assistant panel.
  const ui = {
    adding: null,        // { providerId } while the add form is open
    addLabel: '',
    login: null,         // { accountId, url, acceptsCode, cancel, codeError, sent }
    renaming: null,      // accountId
    renameValue: '',
    removing: null,      // accountId waiting for confirmation
    busy: new Set(),     // accountIds with an action running
    errors: {},          // accountId | 'add' → message
    mcpAdding: null,     // { name, url, error } while the add form is open
    skills: null,        // { dir, exists, skills } | { error }
    saveError: null
  };

  const hostNote = h('div', { class: 'ai-host-note', role: 'status' });
  const accountsSection = h('section', { class: 'settings-section ai-section', 'aria-labelledby': 'ai-accounts-title' });
  const advancedSection = h('section', { class: 'settings-section ai-section' });
  root.replaceChildren(hostNote, accountsSection, advancedSection);

  // ---------- Accounts ----------
  const providerName = id => store.provider(id)?.displayName || id;
  const catalogEntry = id => store.state.info?.providers?.find(p => p.id === id);

  function setError(key, error) {
    if (error && error.code !== 'CANCELLED') ui.errors[key] = errorText(error); else delete ui.errors[key];
  }

  async function run(accountId, work) {
    ui.busy.add(accountId);
    setError(accountId, null);
    renderAccounts();
    try { await work(); } catch (error) { setError(accountId, error); }
    ui.busy.delete(accountId);
    renderAccounts();
  }

  function signIn(accountId) {
    if (ui.login) ui.login.cancel();
    const request = host.callCancellable('accounts.connect', { accountId });
    ui.login = { accountId, url: null, acceptsCode: false, cancel: request.cancel, requestId: request.id, codeError: null, sent: false };
    run(accountId, async () => {
      try {
        await request.promise;
      } finally {
        if (ui.login?.requestId === request.id) ui.login = null;
      }
      await store.refreshStatus(accountId);
    });
  }

  host.on('login', message => {
    if (!ui.login || ui.login.requestId !== message.requestId) return;
    Object.assign(ui.login, { url: message.url, acceptsCode: !!message.acceptsCode });
    renderAccounts();
  });

  async function submitCode(input) {
    const code = input.value.trim();
    if (!code || !ui.login) return;
    ui.login.codeError = null;
    try {
      await host.call('accounts.submitCode', { accountId: ui.login.accountId, code });
      ui.login.sent = true;
    } catch (error) {
      ui.login.codeError = errorText(error);
    }
    renderAccounts();
  }

  async function createAccount() {
    const providerId = ui.adding?.providerId;
    if (!providerId) return;
    ui.busy.add('add');
    setError('add', null);
    renderAccounts();
    try {
      const account = await host.call('accounts.create', { providerId, label: ui.addLabel.trim() || providerName(providerId) });
      ui.adding = null;
      ui.addLabel = '';
      await store.loadAccounts();
      if (!store.state.settings?.defaultAccountId) await store.saveSettings({ defaultAccountId: account.id });
      signIn(account.id);
    } catch (error) {
      setError('add', error);
    }
    ui.busy.delete('add');
    renderAccounts();
  }

  function loginView(accountId) {
    const login = ui.login;
    if (!login || login.accountId !== accountId) return null;
    const children = [h('p', { text: t('aiLoginWaiting') })];
    if (login.url) {
      children.push(h('div', { class: 'ai-row' }, [
        h('button', { type: 'button', class: 'small-button', text: t('aiLoginOpen'), onClick: () => window.open(login.url, '_blank', 'noopener,noreferrer') }),
        h('button', { type: 'button', class: 'small-button', text: t('aiCopyAddress'), onClick: event => copy(login.url, event.currentTarget) })
      ]));
    }
    if (login.acceptsCode) {
      const input = h('input', { type: 'text', class: 'ai-input', 'data-key': `code-${accountId}`, autocomplete: 'off', spellcheck: 'false', 'aria-describedby': `ai-code-help-${accountId}`, 'aria-invalid': login.codeError ? 'true' : null });
      children.push(h('form', { class: 'ai-code', onSubmit: event => { event.preventDefault(); submitCode(input); } }, [
        h('label', { text: t('aiLoginCode') }, [input]),
        h('small', { id: `ai-code-help-${accountId}`, class: 'ai-muted', text: t('aiLoginCodeHelp') }),
        login.codeError ? h('p', { class: 'ai-error', role: 'alert', text: login.codeError }) : null,
        login.sent ? h('p', { class: 'ai-muted', text: t('aiLoginCodeSent') }) : null,
        h('div', { class: 'ai-row' }, [h('button', { type: 'submit', class: 'small-button primary', text: t('aiLoginSendCode') })])
      ]));
    }
    children.push(h('div', { class: 'ai-row' }, [h('button', { type: 'button', class: 'small-button', text: t('cancel'), onClick: () => login.cancel() })]));
    return h('div', { class: 'ai-login' }, children);
  }

  // One line per account. The radio on the left chooses the account this app uses (the only place where the
  // assistant's account changes; a new account starts a new conversation). Double-click the name to rename it; the
  // trash icon removes the account after confirmation. Sign in appears while the account is signed out; the sign-in
  // panel, the removal confirmation, and errors open below the line.
  function accountCard(account) {
    const status = store.state.statuses[account.id] || { checking: true };
    const busy = ui.busy.has(account.id);
    const supported = account.supported !== false;
    const state = status.checking ? 'checking' : status.state;
    const active = store.activeAccount()?.id === account.id;
    const radio = h('input', { type: 'radio', name: 'ai-active-account', class: 'ai-radio', 'aria-label': account.label, disabled: !supported || busy, onChange: async () => { await store.saveSettings({ defaultAccountId: account.id }); renderAccounts(); } });
    radio.checked = active;
    let name;
    if (ui.renaming === account.id) {
      name = h('input', { type: 'text', class: 'ai-input ai-rename', value: ui.renameValue, maxlength: 80, 'data-key': `rename-${account.id}`, 'aria-label': t('aiAccountName') });
      const finish = save => {
        if (ui.renaming !== account.id) return;
        const label = name.value.trim();
        ui.renaming = null;
        if (save && label && label !== account.label) run(account.id, async () => { await host.call('accounts.rename', { accountId: account.id, label }); await store.loadAccounts(); });
        else renderAccounts();
      };
      name.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); finish(true); }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false); }
      });
      name.addEventListener('blur', () => finish(true));
    } else {
      name = h('span', { class: 'ai-account-name', title: t('aiRenameHint'), text: account.label, onDblclick: () => { ui.renaming = account.id; ui.renameValue = account.label; renderAccounts(); focusKey(`rename-${account.id}`, true); } });
    }
    const line = h('div', { class: 'ai-account-line' }, [
      radio,
      icon('slides-account', 18),
      name,
      h('small', { class: 'ai-muted ai-account-meta', text: [providerName(account.providerId), status.identity].filter(Boolean).join(' · ') }),
      h('span', { class: 'ai-state', dataset: { state: supported ? state : 'unsupported' }, text: supported ? (state === 'checking' ? t('aiChecking') : stateLabel(state)) : t('aiUnsupported') }),
      supported && state !== 'connected' && state !== 'checking' && ui.login?.accountId !== account.id
        ? h('button', { type: 'button', class: 'small-button primary', text: t('aiSignIn'), disabled: busy, onClick: () => signIn(account.id) })
        : null,
      iconButton('slides-trash', t('aiRemoveNamed', { name: account.label }), () => { ui.removing = account.id; renderAccounts(); focusKey(`remove-${account.id}`); }, { class: 'tool ai-tool', disabled: busy })
    ]);
    const below = [];
    if (ui.removing === account.id) {
      below.push(h('div', { class: 'ai-confirm', role: 'alertdialog', 'aria-label': t('aiRemove') }, [
        h('p', { text: t('aiRemoveConfirm', { name: account.label }) }),
        h('div', { class: 'ai-row' }, [
          h('button', { type: 'button', class: 'small-button danger', 'data-key': `remove-${account.id}`, text: t('aiRemove'), onClick: () => {
            ui.removing = null;
            run(account.id, async () => {
              await host.call('accounts.remove', { accountId: account.id, deleteData: true });
              if (store.state.settings?.defaultAccountId === account.id) await store.saveSettings({ defaultAccountId: null });
              await store.loadAccounts();
            });
          } }),
          h('button', { type: 'button', class: 'small-button', text: t('cancel'), onClick: () => { ui.removing = null; renderAccounts(); } })
        ])
      ]));
    }
    const login = loginView(account.id);
    if (login) below.push(login);
    if (ui.errors[account.id]) below.push(h('p', { class: 'ai-error', role: 'alert', text: ui.errors[account.id] }));
    return h('article', { class: 'ai-account', 'aria-busy': busy ? 'true' : null }, [line, below.length ? h('div', { class: 'ai-account-details' }, below) : null]);
  }

  function setupGuide(provider) {
    const status = provider.detection?.status;
    const entry = catalogEntry(provider.id);
    const children = [h('p', { text: status === 'incompatible' ? t('aiCliIncompatible', { version: provider.detection.version || '?', required: provider.detection.requiredVersion || '?' }) : status === 'error' ? t('aiCliError') : t('aiCliMissing') })];
    if (entry) {
      const platform = store.state.info?.platform;
      children.push(h('p', { class: 'ai-muted', text: t(platform === 'windows' ? 'aiTerminalWindows' : platform === 'mac' ? 'aiTerminalMac' : 'aiTerminalLinux') }));
      children.push(h('div', { class: 'ai-command' }, [
        h('code', { text: entry.command }),
        h('button', { type: 'button', class: 'small-button', text: t('aiCopyCommand'), onClick: event => copy(entry.command, event.currentTarget) })
      ]));
      children.push(h('p', { class: 'ai-muted', text: t('aiInstallThen') }));
    }
    children.push(h('div', { class: 'ai-row' }, [
      entry ? h('button', { type: 'button', class: 'small-button', text: t('aiOfficialGuide'), onClick: () => window.open(entry.url, '_blank', 'noopener,noreferrer') }) : null,
      h('button', { type: 'button', class: 'small-button primary', text: t('aiCheckAgain'), onClick: async event => {
        event.currentTarget.disabled = true;
        await store.loadProviders(true).catch(() => {});
        renderAccounts();
      } })
    ]));
    return h('div', { class: 'ai-setup' }, children);
  }

  function addView() {
    if (!ui.adding) return null;
    const chosen = ui.adding.providerId && store.provider(ui.adding.providerId);
    const providers = store.state.providers;
    const children = [
      h('h4', { text: t('aiAddAccount') }),
      h('div', { class: 'ai-providers', role: 'radiogroup', 'aria-label': t('aiService') }, providers.map((provider, index) => {
        const ready = provider.detection?.status === 'ready';
        const selected = provider.id === ui.adding.providerId;
        return h('button', {
          type: 'button', role: 'radio', class: 'ai-provider', 'aria-checked': String(selected), 'data-key': index === 0 ? 'add-provider' : null,
          onClick: () => { ui.adding.providerId = provider.id; if (!ui.addLabel) ui.addLabel = ''; renderAccounts(); focusKey(ready ? 'add-label' : 'add-provider'); }
        }, [
          h('span', { class: 'ai-provider-name', text: provider.displayName }),
          h('small', { class: 'ai-muted', text: ready ? t('aiCliReady', { version: provider.detection.version || '' }).trim() : provider.detection?.status === 'incompatible' ? t('aiCliNeedsUpdate') : t('aiCliNotFound') })
        ]);
      }))
    ];
    if (chosen && chosen.detection?.status === 'ready') {
      const input = h('input', { type: 'text', class: 'ai-input', 'data-key': 'add-label', value: ui.addLabel, maxlength: 80, placeholder: chosen.displayName, onInput: event => { ui.addLabel = event.target.value; } });
      children.push(h('form', { class: 'ai-add-form', onSubmit: event => { event.preventDefault(); createAccount(); } }, [
        h('label', { text: t('aiAccountName') }, [input]),
        h('small', { class: 'ai-muted', text: t('aiAccountNameHelp') }),
        h('div', { class: 'ai-row' }, [
          h('button', { type: 'submit', class: 'small-button primary', text: t('aiAddAndSignIn'), disabled: ui.busy.has('add') }),
          h('button', { type: 'button', class: 'small-button', text: t('cancel'), onClick: () => { ui.adding = null; renderAccounts(); focusKey('add-open'); } })
        ])
      ]));
    } else {
      if (chosen) children.push(setupGuide(chosen));
      children.push(h('div', { class: 'ai-row' }, [h('button', { type: 'button', class: 'small-button', text: t('cancel'), onClick: () => { ui.adding = null; renderAccounts(); focusKey('add-open'); } })]));
    }
    if (ui.errors.add) children.push(h('p', { class: 'ai-error', role: 'alert', text: ui.errors.add }));
    return h('div', { class: 'ai-add' }, children);
  }

  function renderAccounts() {
    const focus = rememberFocus(accountsSection);
    const { state } = store;
    const canAdd = host.status === 'ready' && state.loaded && !ui.adding;
    const add = iconButton('graph-Plus', t('aiAddAccount'), () => { ui.adding = { providerId: null }; setError('add', null); renderAccounts(); focusKey('add-provider'); }, { class: 'tool ai-tool ai-add-button', 'data-key': 'add-open', disabled: !canAdd });
    const children = [
      h('div', { class: 'ai-field-head ai-section-head' }, [h('h3', { id: 'ai-accounts-title', text: t('accounts') }), add])
    ];
    if (host.status === 'unavailable' || host.status === 'lost') {
      children.push(h('div', { class: 'settings-empty' }, [icon('graph-Ai', 28), h('p', { text: t(host.status === 'lost' ? 'aiHostLost' : 'aiHostMissing') })]));
    } else if (!state.loaded) {
      children.push(state.error ? h('p', { class: 'ai-error', role: 'alert', text: errorText(state.error) }) : h('p', { class: 'ai-muted', text: t('aiChecking') }));
    } else {
      children.push(h('div', { class: 'ai-accounts', role: 'radiogroup', 'aria-label': t('aiDefaultAccount') }, state.accounts.map(accountCard)));
      children.push(addView());
    }
    accountsSection.replaceChildren(...children.filter(Boolean));
    restoreFocus(accountsSection, focus);
  }

  // ---------- Advanced: instructions, MCP servers, skills ----------
  const instructions = h('textarea', { id: 'ai-instructions', class: 'ai-textarea', rows: 5, maxlength: 20000 });
  // MCP servers: one line each (name, address, connection), a + to add one by name and address, a trash icon to remove.
  const mcpList = h('div', { class: 'ai-list', 'aria-live': 'polite' });
  const mcpAddButton = iconButton('graph-Plus', t('aiMcpAdd'), () => { ui.mcpAdding = { name: '', url: '', error: null }; renderMcp(); focusIn(mcpList, 'mcp-name'); }, { class: 'tool ai-tool ai-add-button' });
  const skillsList = h('div', { class: 'ai-skills' });
  const mcpTitle = h('h4', { class: 'ai-label', id: 'ai-mcp-title' });
  // Skills belong to the app (its skills folder), not to a document. A skill is added from a ZIP file.
  const skillFile = h('input', { type: 'file', accept: '.zip,application/zip', hidden: true });
  const skillUpload = iconButton('graph-Plus', t('aiSkillsUpload'), () => skillFile.click(), { class: 'tool ai-tool ai-add-button' });
  const skillsNote = h('p', { class: 'ai-skills-note', role: 'status' });
  skillFile.addEventListener('change', () => { const file = skillFile.files?.[0]; skillFile.value = ''; if (file) installSkill(file); });
  const saveNote = h('p', { class: 'ai-error', role: 'alert', hidden: true });
  const labels = {
    instructions: h('label', { for: 'ai-instructions', class: 'ai-label' }),
    skills: h('h4', { class: 'ai-label', id: 'ai-skills-title' })
  };
  advancedSection.append(
    h('div', { class: 'ai-field' }, [labels.instructions, instructions]),
    h('div', { class: 'ai-field', role: 'group', 'aria-labelledby': 'ai-mcp-title' }, [h('div', { class: 'ai-field-head' }, [mcpTitle, mcpAddButton]), mcpList]),
    h('div', { class: 'ai-field', role: 'group', 'aria-labelledby': 'ai-skills-title' }, [h('div', { class: 'ai-field-head' }, [labels.skills, skillUpload, skillFile]), skillsNote, skillsList]),
    saveNote
  );

  const timers = {};
  function saveLater(field, value, delay = 600) {
    clearTimeout(timers[field]);
    timers[field] = setTimeout(async () => {
      try { await store.saveSettings({ [field]: value }); ui.saveError = null; } catch (error) { ui.saveError = errorText(error); }
      renderAdvancedText();
    }, delay);
  }
  instructions.addEventListener('input', () => saveLater('instructions', instructions.value));
  // ---------- MCP servers ----------
  const SERVER_NAME = /^[A-Za-z0-9_-]{1,64}$/;
  const targetOf = spec => (typeof spec?.url === 'string' ? spec.url : [spec?.command, ...(Array.isArray(spec?.args) ? spec.args : [])].filter(Boolean).join(' '));
  // The example's name and address (from the host's example JSON), shown as placeholders in the add form.
  function exampleServer() {
    try {
      const [name, spec] = Object.entries(JSON.parse(store.state.info?.mcpExample || '{}').mcpServers || {})[0] || [];
      const url = spec?.url || (spec?.args || []).find(arg => /^https?:\/\//.test(arg));
      return name && url ? { name, url } : null;
    } catch { return null; }
  }

  async function addServer() {
    const adding = ui.mcpAdding;
    const name = adding.name.trim(), url = adding.url.trim();
    const { servers } = store.mcpServers();
    adding.error = !SERVER_NAME.test(name) || name === 'edukors' ? t('aiMcpBadName', { server: name })
      : servers.some(s => s.name === name) ? t('aiMcpNameTaken', { server: name })
      : !/^https?:\/\/\S+$/.test(url) ? t('aiMcpNoUrl', { server: name })
      : null;
    if (adding.error) { renderMcp(); return; }
    try {
      // A remote server, reached directly by the engine over HTTP (no other program needed).
      await store.saveMcpServers([...servers, { name, spec: { type: 'http', url } }]);
      ui.mcpAdding = null;
      store.mcpStatus().catch(() => {});
    } catch (error) {
      adding.error = errorText(error);
    }
    renderMcp();
  }

  async function removeServer(name) {
    if (!confirm(t('aiMcpRemoveConfirm', { server: name }))) return;
    try {
      await store.saveMcpServers(store.mcpServers().servers.filter(s => s.name !== name));
      store.mcpStatus().catch(() => {});
    } catch (error) {
      ui.saveError = errorText(error);
    }
    renderMcp();
  }

  function renderMcp() {
    const focus = rememberFocus(mcpList);
    mcpTitle.textContent = t('aiMcp');
    mcpAddButton.setAttribute('aria-label', t('aiMcpAdd'));
    mcpAddButton.querySelector('.tooltip').textContent = t('aiMcpAdd');
    const available = host.status === 'ready' && store.state.loaded;
    mcpAddButton.disabled = !available || !!ui.mcpAdding;
    if (!available) { mcpList.replaceChildren(); return; }
    const { servers, invalid } = store.mcpServers();
    const result = store.mcpResult();
    const rows = servers.map(({ name, spec }) => {
      const status = result?.statuses?.find(s => s.server === name);
      const state = !result ? 'checking' : status?.status === 'connected' ? 'connected' : 'failed';
      const tools = status?.toolNames?.map(tool => tool.name).join(', ');
      return h('div', { class: 'ai-list-row' }, [
        icon('graph-Globe', 18),
        h('span', { class: 'ai-list-name', text: name }),
        h('small', { class: 'ai-muted ai-list-meta', title: tools || '', text: targetOf(spec) }),
        h('span', { class: 'ai-state', dataset: { state: state === 'connected' ? 'connected' : state === 'checking' ? 'checking' : 'expired' }, title: status?.error || '', text: state === 'checking' ? t('aiChecking') : state === 'connected' ? t('aiMcpConnected', { count: status.tools ?? 0 }) : t('aiMcpFailed') }),
        iconButton('slides-trash', t('aiMcpRemove', { server: name }), () => removeServer(name), { class: 'tool ai-tool' })
      ]);
    });
    const children = [];
    // A saved configuration that cannot be read (for example, typed by hand before) can be cleared here.
    if (invalid) children.push(h('div', { class: 'ai-list-row ai-list-message' }, [
      h('span', { class: 'ai-error ai-list-meta', text: t('aiMcpConfigInvalid') }),
      h('button', { type: 'button', class: 'small-button', text: t('aiMcpClear'), onClick: async () => { await store.saveMcpServers([]).catch(() => {}); renderMcp(); } })
    ]));
    if (rows.length) children.push(...rows);
    if (ui.mcpAdding) {
      const adding = ui.mcpAdding;
      const example = exampleServer();
      const nameInput = h('input', { type: 'text', class: 'ai-input', 'data-key': 'mcp-name', value: adding.name, maxlength: 64, spellcheck: 'false', autocomplete: 'off', placeholder: example?.name || '', onInput: event => { adding.name = event.target.value; } });
      const urlInput = h('input', { type: 'url', class: 'ai-input', 'data-key': 'mcp-url', value: adding.url, spellcheck: 'false', autocomplete: 'off', placeholder: example?.url || 'https://', onInput: event => { adding.url = event.target.value; } });
      children.push(h('form', { class: 'ai-add-inline', onSubmit: event => { event.preventDefault(); addServer(); } }, [
        h('label', {}, [h('span', { text: t('aiMcpName') }), nameInput]),
        h('label', {}, [h('span', { text: t('aiMcpUrl') }), urlInput]),
        adding.error ? h('p', { class: 'ai-error', role: 'alert', text: adding.error }) : null,
        h('div', { class: 'ai-row' }, [
          h('button', { type: 'submit', class: 'small-button primary', text: t('aiMcpAddConfirm') }),
          h('button', { type: 'button', class: 'small-button', text: t('cancel'), onClick: () => { ui.mcpAdding = null; renderMcp(); mcpAddButton.focus(); } })
        ])
      ]));
    }
    if (!children.length) children.push(h('p', { class: 'ai-muted ai-list-message', text: t('aiMcpNone') }));
    mcpList.replaceChildren(...children);
    restoreFocus(mcpList, focus);
    if (servers.length && !result) store.mcpStatus().catch(() => {});
  }

  async function loadSkills() {
    try { ui.skills = await host.call('skills.read'); } catch (error) { ui.skills = { error }; }
    renderSkills();
  }

  const skillProblems = { SKILL_ZIP_INVALID: 'aiSkillZipInvalid', SKILL_NO_SKILL_MD: 'aiSkillNoSkillMd', SKILL_BAD_NAME: 'aiSkillBadName' };
  const setSkillsNote = (text, kind) => { ui.skillsNote = text ? { text, kind } : null; renderSkills(); };
  async function installSkill(file, replace = false) {
    if (file.size > 25 << 20) { setSkillsNote(t('aiSkillZipInvalid'), 'error'); return; }
    ui.skillsBusy = true;
    setSkillsNote(t('aiSkillInstalling'), 'info');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const result = await host.call('skills.install', { fileName: file.name, data: btoa(binary), replace });
      if (result?.exists) {
        if (confirm(t('aiSkillReplaceConfirm', { name: result.exists }))) return await installSkill(file, true);
        setSkillsNote('', null);
        return;
      }
      if (result?.error) { setSkillsNote(t(skillProblems[result.error] || 'aiSkillZipInvalid'), 'error'); return; }
      await loadSkills();
      setSkillsNote(t('aiSkillInstalled', { name: result.installed }), 'info');
    } catch (error) {
      setSkillsNote(errorText(error), 'error');
    } finally {
      ui.skillsBusy = false;
      renderSkills();
    }
  }
  async function removeSkill(skill) {
    if (ui.skillsBusy || !confirm(t('aiSkillRemoveConfirm', { name: skill.name }))) return;
    ui.skillsBusy = true;
    try {
      await host.call('skills.remove', { folder: skill.folder });
      setSkillsNote('', null);
      await loadSkills();
    } catch (error) {
      setSkillsNote(errorText(error), 'error');
    } finally {
      ui.skillsBusy = false;
      renderSkills();
    }
  }

  function renderSkills() {
    const available = host.status === 'ready';
    skillUpload.setAttribute('aria-label', t('aiSkillsUpload'));
    skillUpload.querySelector('.tooltip').textContent = t('aiSkillsUpload');
    // One change to the skills at a time: adding and deleting wait for each other.
    skillUpload.disabled = !available || !!ui.skillsBusy;
    skillsNote.textContent = ui.skillsNote?.text || '';
    skillsNote.dataset.kind = ui.skillsNote?.kind || '';
    skillsNote.hidden = !ui.skillsNote;
    const data = ui.skills;
    if (!data) { skillsList.replaceChildren(); return; }
    if (data.error) { skillsList.replaceChildren(h('p', { class: 'ai-error', text: errorText(data.error) })); return; }
    // The same list as accounts and MCP servers: icon, name, description, trash icon.
    skillsList.replaceChildren(h('div', { class: 'ai-list' }, data.skills.length
      ? data.skills.map(skill => h('div', { class: 'ai-list-row' }, [
        icon('graph-Bolt', 18),
        h('span', { class: 'ai-list-name', text: skill.name }),
        h('small', { class: 'ai-muted ai-list-meta', title: skill.description || '', text: skill.description || '' }),
        iconButton('slides-trash', t('aiSkillRemove', { name: skill.name }), () => removeSkill(skill), { class: 'tool ai-tool', disabled: !!ui.skillsBusy })
      ]))
      : [h('p', { class: 'ai-muted ai-list-message', text: t('aiSkillsNone') })]));
  }

  function renderAdvancedText() {
    labels.instructions.textContent = t('aiInstructions');
    labels.skills.textContent = t('aiSkills');
    instructions.placeholder = t('aiInstructionsPlaceholder');
    const available = host.status === 'ready' && store.state.loaded;
    instructions.disabled = !available;
    saveNote.hidden = !ui.saveError;
    saveNote.textContent = ui.saveError || '';
    renderMcp();
    renderSkills();
  }

  // Fills the fields from the saved settings, unless the person is typing in them.
  function fillFields() {
    const settings = store.state.settings;
    if (!settings) return;
    if (document.activeElement !== instructions) instructions.value = settings.instructions || '';
  }

  // ---------- Host note, focus, copy ----------
  function renderHostNote() {
    const info = store.state.info;
    const text = host.status === 'ready' && info && !info.sharedRegistry ? t('aiDevRegistry') : '';
    hostNote.textContent = text;
    hostNote.hidden = !text;
  }

  function rememberFocus(container) {
    const active = document.activeElement;
    if (!active || !container.contains(active)) return null;
    return { key: active.dataset?.key, start: active.selectionStart, end: active.selectionEnd };
  }
  function restoreFocus(container, focus) {
    if (!focus?.key) return;
    const node = container.querySelector(`[data-key="${CSS.escape(focus.key)}"]`);
    if (!node) return;
    node.focus({ preventScroll: true });
    if (typeof focus.start === 'number' && 'setSelectionRange' in node) try { node.setSelectionRange(focus.start, focus.end); } catch {}
  }
  const focusIn = (container, key) => requestAnimationFrame(() => container.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus());
  const focusKey = (key, select = false) => requestAnimationFrame(() => {
    const node = accountsSection.querySelector(`[data-key="${CSS.escape(key)}"]`);
    node?.focus();
    if (select) node?.select?.();
  });

  async function copy(text, button) {
    try {
      await navigator.clipboard.writeText(text);
      const previous = button.textContent;
      button.textContent = t('aiCopied');
      setTimeout(() => { if (button.isConnected) button.textContent = previous; }, 1500);
    } catch {}
  }

  function renderAll() {
    renderHostNote();
    renderAccounts();
    fillFields();
    renderAdvancedText();
  }

  // Opening Settings reloads everything: another EDUKORS app may have changed the shared accounts meanwhile.
  async function reload() {
    if (host.status === 'unavailable' || host.status === 'lost') { renderAll(); return; }
    await store.load();
    loadSkills();
  }
  new MutationObserver(() => { if (dialog.open) reload(); }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  // Settings opened from the assistant panel: go straight to the AI page.
  document.addEventListener('edukors:open-settings', event => {
    if (!dialog.open) dialog.showModal();
    if (event.detail?.section) document.querySelector(`[data-section="${event.detail.section}"]`)?.click();
  });
  store.subscribe(() => { renderHostNote(); renderAccounts(); fillFields(); renderAdvancedText(); });
  host.on('status', renderAll);
  document.addEventListener('edukors:preferences-changed', renderAll);
  renderAll();
})();
