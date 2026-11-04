// The AI assistant panel, laid out as in the Slides editor:
//   header: title, conversation history, new conversation, close;
//   conversation (or the history list);
//   composer: text, then a row with + (add files, a skill, an MCP server, web search on or off) on the left and, on the right, the mode (review before applying /
//   apply), the model with its effort, and Send or Stop;
//   usage: the account's session limit (5-hour window), as a bar with the percentage used.
// One current conversation per open document, plus that document's earlier conversations (kept while the app runs).
// The account is the app's default account; it changes only in Settings, and changing it starts a new conversation
// (the current one goes to the history).
//
// The application configures what the agent may do with EdukorsAiAssistant.configure({ instructions, tools, context,
// documentId }):
//   instructions: the app's own instructions (the user's instructions from Settings follow them);
//   tools: [{ name, description, inputSchema (JSON Schema), label(), changes (default true), run(doc, args) → result }]
//          — the only way the agent changes a document; each app validates and applies through its normal state
//          (one undo step per change). In "review before applying" mode, each tool that changes the document waits
//          for the person's approval;
//   context(doc): the latest document state, sent with every request (unsaved edits included);
//   documentId(doc): a stable id for the conversation's scope.
// Calls to the user's MCP servers always ask first. Stop interrupts; changes already applied stay and can be undone.
globalThis.EdukorsAiAssistant = (() => {
  const { t, h, icon, iconButton, errorText, windowLabel, timeText } = EdukorsAiUi;
  const host = EdukorsAiHost;
  const store = EdukorsAiStore;
  const panel = document.getElementById('assistant-panel-side');
  const inner = panel.querySelector('.panel-inner');
  const header = inner.querySelector('.panel-header');
  const closeButton = header.querySelector('[data-close-panel]');

  let app = { instructions: '', tools: [], context: () => null, documentId: doc => `doc-${doc.id}` };
  // Any kind of file can be attached: the runtime saves it where the agent can open it with its own tools (images
  // and PDFs are read directly by the model).
  const ATTACH_MAX_FILES = 10;
  const ATTACH_MAX_BYTES = 20 * 1024 * 1024;
  let activeDoc = null;
  let showHistory = false;
  let historyQuery = '';
  let lastAccountId;
  const states = new Map();    // documentId → { current: conversation, history: [conversation] }
  const bySession = new Map(); // sessionId → conversation
  const documents = new Map(); // documentId → doc
  let models = { accountId: null, list: [], loading: false, error: false };
  let clock = 0;

  // ---------- Elements ----------
  const historyButton = iconButton('graph-History', t('aiHistory'), () => { if (!activeDoc) return; showHistory = !showHistory; historyQuery = ''; render(); });
  const newButton = iconButton('graph-NewChat', t('aiNewConversation'), () => newConversation());
  header.append(h('div', { class: 'ai-header-actions' }, [historyButton, newButton, closeButton]));
  const thread = h('div', { class: 'ai-thread', role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions text' });
  const historyView = h('section', { class: 'ai-history', hidden: true });
  const input = h('textarea', { id: 'assistant-input', rows: 3 });
  const sendButton = iconButton('graph-Send', t('send'), null, { type: 'submit', id: 'assistant-send', class: 'tool ai-tool ai-send' });
  // Stop and the paperclip have no tooltip (their accessible names stay).
  const plainButton = (name, label, onClick, extra) => { const button = iconButton(name, label, onClick, extra); button.querySelector('.tooltip').remove(); return button; };
  const stopButton = plainButton('graph-Stop', t('aiStop'), () => stop(), { class: 'tool ai-tool ai-send ai-stop', hidden: true });
  // Attachments (text files) and the skill chosen with "/" for the next request, shown as chips above the text.
  const chips = h('div', { class: 'ai-composer-chips' });
  const fileInput = h('input', { type: 'file', multiple: true, hidden: true });
  const addButton = plainButton('graph-Plus', t('aiAddMenu'), () => openAddMenu(), { class: 'tool ai-tool ai-attach', 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
  const composerNote = h('p', { class: 'ai-composer-note', role: 'alert', hidden: true });
  const addMenu = h('div', { class: 'ai-up-menu ai-add-menu', role: 'menu', hidden: true });
  const submenu = h('div', { class: 'ai-up-menu ai-add-submenu', role: 'menu', hidden: true });
  const modeMenu = upwardMenu('mode');
  const modelMenu = upwardMenu('model');
  const composer = h('form', { class: 'assistant-composer ai-composer', id: 'assistant-composer', onSubmit: event => { event.preventDefault(); send(); } }, [
    chips,
    input,
    composerNote,
    h('div', { class: 'ai-composer-bottom' }, [
      h('div', { class: 'ai-composer-left' }, [addButton, fileInput]),
      h('div', { class: 'ai-composer-right' }, [modeMenu.root, modelMenu.root, sendButton, stopButton])
    ])
  ]);
  const usageView = h('div', { class: 'ai-usage-summary' });
  const chatView = h('div', { class: 'ai-chat' }, [thread, composer, addMenu, submenu]);
  for (const node of [...inner.children]) if (node !== header) node.remove();
  inner.append(historyView, chatView, usageView);

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); }
    // Backspace in an empty field removes the chosen skill.
    // Backspace in an empty field removes the last chosen skill or server.
    if (event.key === 'Backspace' && !input.value && current()?.picks.length) { current().picks.pop(); renderChips(); renderControls(); }
  });
  input.addEventListener('input', () => renderControls());
  fileInput.addEventListener('change', () => { const files = [...fileInput.files]; fileInput.value = ''; attachFiles(files); });

  // ---------- Attachments: text files the agent reads with the request ----------
  // Their text goes into the request's context ("attachments"), next to the document, for that request only; the
  // conversation keeps their names. Other formats (PDF, Word, images) need the desktop host to extract text first.
  async function attachFiles(files) {
    const conv = current();
    if (!conv) return;
    const problems = [];
    for (const file of files) {
      if (conv.attachments.length >= ATTACH_MAX_FILES) { problems.push(t('aiAttachTooMany', { count: ATTACH_MAX_FILES })); break; }
      if (file.size > ATTACH_MAX_BYTES) { problems.push(t('aiAttachTooLarge', { name: file.name, size: '20 MB' })); continue; }
      const bytes = await file.arrayBuffer().then(buffer => new Uint8Array(buffer)).catch(() => null);
      if (!bytes) { problems.push(t('aiAttachUnreadable', { name: file.name })); continue; }
      conv.attachments = [...conv.attachments.filter(a => a.name !== file.name), { name: file.name, mimeType: file.type || 'application/octet-stream', bytes }];
    }
    setComposerNote(problems.join(' '));
    renderChips();
    renderControls();
    input.focus();
  }
  function setComposerNote(text) {
    composerNote.textContent = text;
    composerNote.hidden = !text;
  }

  // ---------- The + menu: add files, or choose a skill or an MCP server for the next request ----------
  // + opens a menu above the composer: Add files; Skills ›; MCP servers ›; each submenu lists names only, with the
  // same icons as Settings. The chosen skill or server becomes a chip; the request then starts by naming it. Every
  // call to an MCP server still asks for permission (or not, once always allowed in the conversation).
  // Keyboard: arrows move, → or Enter opens a submenu, ← goes back, Escape closes.
  let skills = [];
  async function loadSkillList() {
    try { skills = (await host.call('skills.read')).skills || []; } catch { skills = []; }
  }
  // inSubmenu: an item of a submenu, which keeps its submenu open when the pointer reaches it.
  const menuButton = (iconName, label, { submenu = false, inSubmenu = false, onChoose, onOpen } = {}) => h('button', {
    type: 'button', role: 'menuitem', class: 'ai-menu-item', tabindex: '-1', ...(submenu ? { 'aria-haspopup': 'menu', 'aria-expanded': 'false' } : {}),
    onClick: event => (submenu ? onOpen(event.currentTarget, true) : onChoose()),
    onPointerenter: event => { event.currentTarget.focus({ preventScroll: true }); if (submenu) onOpen(event.currentTarget, false); else if (!inSubmenu) closeSubmenu(); }
  }, [h('span', { class: 'ai-menu-row' }, [icon(iconName, 16), h('span', { class: 'ai-menu-text', text: label }), submenu ? icon('graph-ChevronRight', 14) : null])]);

  function openAddMenu() {
    if (!addMenu.hidden) { closeAddMenu(); return; }
    loadSkillList().then(() => { if (!addMenu.hidden && submenuOwner?.dataset.kind === 'skills') openSubmenu(submenuOwner, false); });
    const files = menuButton('graph-Paperclip', t('aiAddFiles'), { onChoose: () => { closeAddMenu(false); fileInput.click(); } });
    const skillsItem = menuButton('graph-Bolt', t('aiSkills'), { submenu: true, onOpen: openSubmenu });
    skillsItem.dataset.kind = 'skills';
    const mcpItem = menuButton('graph-Globe', t('aiMcp'), { submenu: true, onOpen: openSubmenu });
    mcpItem.dataset.kind = 'mcp';
    // Web search needs the folder mode (the provider's web tools); where the provider has none, it is not offered.
    const account = store.state.loaded ? store.activeAccount() : null;
    const canSearch = !!(account && store.provider(account.providerId)?.capabilities?.workspace);
    // Web search is a setting of the app (on by default), not a choice per request: off, sessions have no web tools.
    const webOn = canSearch && store.state.settings?.web !== false;
    const web = h('button', { type: 'button', role: 'menuitemcheckbox', class: 'ai-menu-item', tabindex: '-1', 'aria-checked': String(webOn), disabled: !canSearch, title: canSearch ? '' : t('aiWebUnavailable'),
      onPointerenter: event => { event.currentTarget.focus({ preventScroll: true }); closeSubmenu(); },
      onClick: async event => {
        const button = event.currentTarget;
        const next = button.getAttribute('aria-checked') !== 'true';
        button.setAttribute('aria-checked', String(next));
        button.querySelector('.ai-menu-check').hidden = !next;
        await store.saveSettings({ web: next }).catch(() => {});
        // The web tools are fixed when a session opens: open sessions start again (resuming their conversations).
        for (const state of states.values()) if (!state.current.running) closeSession(state.current);
      } }, [h('span', { class: 'ai-menu-row' }, [icon('graph-Search', 16), h('span', { class: 'ai-menu-text', text: t('aiWebSearch') }), h('span', { class: 'ai-menu-check', hidden: !webOn }, [icon('graph-Check', 14)])])]);
    addMenu.replaceChildren(files, h('div', { class: 'ai-menu-separator', role: 'separator' }), skillsItem, mcpItem, h('div', { class: 'ai-menu-separator', role: 'separator' }), web);
    addMenu.setAttribute('aria-label', t('aiAddMenu'));
    const rect = addButton.getBoundingClientRect(), width = Math.min(260, window.innerWidth - 24);
    Object.assign(addMenu.style, { left: `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`, bottom: `${window.innerHeight - rect.top + 6}px`, width: `${width}px` });
    addMenu.hidden = false;
    addButton.setAttribute('aria-expanded', 'true');
    files.focus();
  }
  function closeAddMenu(focus = true) {
    closeSubmenu();
    if (addMenu.hidden) return;
    addMenu.hidden = true;
    addButton.setAttribute('aria-expanded', 'false');
    if (focus) addButton.focus();
  }
  let submenuOwner = null;
  function openSubmenu(owner, focusFirst) {
    if (submenuOwner && submenuOwner !== owner) closeSubmenu();
    submenuOwner = owner;
    owner.setAttribute('aria-expanded', 'true');
    owner.classList.add('is-on');
    const choices = owner.dataset.kind === 'skills'
      ? skills.map(skill => ({ kind: 'skill', name: skill.name, folder: skill.folder }))
      : store.mcpServers().servers.map(server => ({ kind: 'mcp', name: server.name, server: server.name }));
    const iconName = owner.dataset.kind === 'skills' ? 'graph-Bolt' : 'graph-Globe';
    submenu.replaceChildren(...(choices.length
      ? choices.map(choice => menuButton(iconName, choice.name, { inSubmenu: true, onChoose: () => choosePick(choice) }))
      : [h('p', { class: 'ai-menu-pad ai-muted', text: owner.dataset.kind === 'skills' ? t('aiSkillsNone') : t('aiMcpNone') })]));
    submenu.setAttribute('aria-label', owner.textContent);
    // Beside the item: to the right when there is room, otherwise to the left (the panel is at the window's right edge).
    const rect = owner.getBoundingClientRect(), width = Math.min(260, window.innerWidth - 24);
    const left = rect.right + 6 + width <= window.innerWidth - 12 ? rect.right + 6 : Math.max(12, rect.left - 6 - width);
    Object.assign(submenu.style, { left: `${left}px`, top: 'auto', bottom: `${Math.max(12, window.innerHeight - rect.bottom - 6)}px`, width: `${width}px`, maxHeight: `${Math.max(120, rect.bottom - 12)}px` });
    submenu.hidden = false;
    if (focusFirst) submenu.querySelector('[role="menuitem"]')?.focus();
  }
  function closeSubmenu() {
    if (!submenuOwner) return;
    submenuOwner.setAttribute('aria-expanded', 'false');
    submenuOwner.classList.remove('is-on');
    submenuOwner = null;
    submenu.hidden = true;
  }
  function menuKeys(event) {
    const inSub = submenu.contains(event.target);
    const list = [...(inSub ? submenu : addMenu).querySelectorAll('[role^="menuitem"]:not(:disabled)')];
    const at = list.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : (at + (event.key === 'ArrowUp' ? -1 : 1) + list.length) % list.length;
      list[next]?.focus();
      if (!inSub && list[next]?.getAttribute('aria-haspopup') !== 'menu') closeSubmenu();
    } else if (event.key === 'ArrowRight' && !inSub && document.activeElement?.getAttribute('aria-haspopup') === 'menu') {
      event.preventDefault();
      openSubmenu(document.activeElement, true);
    } else if ((event.key === 'ArrowLeft' || event.key === 'Escape') && inSub) {
      event.preventDefault();
      event.stopPropagation();
      const owner = submenuOwner;
      closeSubmenu();
      owner?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeAddMenu();
    } else if (event.key === 'Tab') {
      closeAddMenu(false);
    }
  }
  addMenu.addEventListener('keydown', menuKeys);
  submenu.addEventListener('keydown', menuKeys);
  document.addEventListener('pointerdown', event => { if (!addMenu.hidden && !addMenu.contains(event.target) && !submenu.contains(event.target) && !addButton.contains(event.target)) closeAddMenu(false); });
  window.addEventListener('resize', () => closeAddMenu(false));

  const pickIcon = kind => (kind === 'mcp' ? 'graph-Globe' : 'graph-Bolt');
  function choosePick(choice) {
    const conv = current();
    if (!conv) return;
    // Several skills and servers can be chosen for one request; choosing one again changes nothing.
    if (!conv.picks.some(p => p.kind === choice.kind && p.name === choice.name)) conv.picks.push(choice);
    closeAddMenu(false);
    renderChips();
    renderControls();
    input.focus();
  }

  function renderChips() {
    const conv = current();
    const list = [];
    for (const pick of conv?.picks || []) list.push(h('span', { class: 'ai-input-chip ai-input-chip-skill' }, [
      icon(pickIcon(pick.kind), 13), h('span', { text: pick.name }),
      h('button', { type: 'button', class: 'ai-chip-remove', 'aria-label': t('aiAttachRemove', { name: pick.name }), title: t('aiAttachRemove', { name: pick.name }), html: EdukorsIcons.svg('graph-Close', 12), onClick: () => { conv.picks = conv.picks.filter(p => p !== pick); renderChips(); renderControls(); input.focus(); } })
    ]));
    for (const file of conv?.attachments || []) list.push(h('span', { class: 'ai-input-chip', title: file.name }, [
      icon('graph-Paperclip', 13), h('span', { text: file.name }),
      h('button', { type: 'button', class: 'ai-chip-remove', 'aria-label': t('aiAttachRemove', { name: file.name }), title: t('aiAttachRemove', { name: file.name }), html: EdukorsIcons.svg('graph-Close', 12), onClick: () => { conv.attachments = conv.attachments.filter(a => a !== file); renderChips(); renderControls(); input.focus(); } })
    ]));
    chips.replaceChildren(...list);
    chips.hidden = !list.length;
  }

  // ---------- Upward menus (mode, model and effort), as in the Slides editor ----------
  // A compact chip opens a panel above the composer; Escape, a click outside, or another menu closes it.
  function upwardMenu(kind) {
    const chip = h('button', { type: 'button', class: 'ai-chip-button', 'aria-haspopup': kind === 'mode' ? 'menu' : 'dialog', 'aria-expanded': 'false' });
    const pop = h('div', { class: `ai-up-menu ai-${kind}-pop`, role: kind === 'mode' ? 'menu' : 'dialog', hidden: true });
    const root = h('div', { class: `ai-pop ai-${kind}` }, [chip, pop]);
    const menu = { root, chip, pop, open: false, fill: null };
    const close = (focus = true) => {
      if (!menu.open) return;
      menu.open = false;
      pop.hidden = true;
      chip.setAttribute('aria-expanded', 'false');
      if (focus) chip.focus();
    };
    const show = () => {
      if (chip.disabled) return;
      if (menu.open) { close(); return; }
      document.dispatchEvent(new CustomEvent('edukors:ai-menu-open', { detail: kind }));
      menu.fill?.(close);
      const rect = chip.getBoundingClientRect(), width = Math.min(300, window.innerWidth - 24);
      Object.assign(pop.style, { left: `${Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))}px`, bottom: `${window.innerHeight - rect.top + 6}px`, width: `${width}px`, maxHeight: `${Math.max(0, Math.min(480, rect.top - 12))}px` });
      menu.open = true;
      pop.hidden = false;
      chip.setAttribute('aria-expanded', 'true');
      (pop.querySelector('[role="menuitemradio"][aria-checked="true"]') || pop.querySelector('[role="menuitemradio"]'))?.focus();
    };
    chip.addEventListener('click', show);
    chip.addEventListener('keydown', event => { if (!menu.open && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { event.preventDefault(); show(); } });
    pop.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || event.target.getAttribute('role') !== 'menuitemradio') return;
      const items = [...pop.querySelectorAll('[role="menuitemradio"]')], at = items.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (at + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
      event.preventDefault();
      items[next]?.focus();
    });
    document.addEventListener('pointerdown', event => { if (menu.open && !root.contains(event.target)) close(false); });
    document.addEventListener('edukors:ai-menu-open', event => { if (event.detail !== kind) close(false); });
    window.addEventListener('resize', () => close(false));
    menu.close = close;
    return menu;
  }

  const menuItem = (content, checked, onChoose) => h('button', { type: 'button', role: 'menuitemradio', class: `ai-menu-item${checked ? ' is-on' : ''}`, 'aria-checked': String(checked), onClick: onChoose }, [
    h('span', { class: 'ai-menu-row' }, [...[].concat(content), checked ? icon('graph-Check', 14) : null])
  ]);

  // Mode: review each change before it is applied, or apply changes at once (each one can be undone).
  // Apply uses a play icon: the bolt belongs to skills.
  // Review before applying, apply at once, or plan: read and propose only; nothing changes until the person picks
  // another mode (tools that change the document and actions in the folder are refused meanwhile).
  const modes = { ask: 'graph-Hand', auto: 'slides-play', plan: 'graph-Plan' };
  const currentMode = () => (['auto', 'plan'].includes(store.state.settings?.mode) ? store.state.settings.mode : 'ask');
  const modeKey = (mode, suffix = '') => `aiMode${{ ask: 'Ask', auto: 'Auto', plan: 'Plan' }[mode]}${suffix}`;
  const PLAN_NOTE = 'Plan mode is on: read what you need and reply with a plan, step by step, in the user\'s language. Do not change the document, create or edit files, or run commands; tools that change the document are refused until the user chooses another mode to carry out the plan.';
  modeMenu.fill = close => {
    modeMenu.pop.setAttribute('aria-label', t('aiMode'));
    modeMenu.pop.replaceChildren(...Object.keys(modes).map(mode => menuItem([
      icon(modes[mode], 16),
      h('span', { class: 'ai-menu-text' }, [h('span', { text: t(modeKey(mode)) }), h('small', { class: 'ai-menu-hint', text: t(modeKey(mode, 'Hint')) })])
    ], mode === currentMode(), async () => { close(); await store.saveSettings({ mode }).catch(() => {}); renderControls(); })));
  };

  // Model and effort. Each account keeps its own choice (settings.choices[accountId]), so the model always belongs to
  // the account's service: changing the account (or its service) changes the model shown here. When the saved model is
  // not offered by the service, its default model (or the first one) takes its place.
  const effortName = level => (level ? t(`aiEffort_${level}`) : t('aiEffortDefault'));
  const modelLabel = id => models.list.find(m => m.id === id)?.label || id;
  const modelEfforts = id => models.list.find(m => m.id === id)?.efforts?.filter(Boolean) || [];
  const choiceOf = accountId => store.state.settings?.choices?.[accountId] || {};
  function selection(accountId) {
    if (models.accountId !== accountId || !models.list.length) return null;
    const saved = choiceOf(accountId);
    const model = models.list.some(m => m.id === saved.model) ? saved.model : (models.list.find(m => m.default) || models.list[0]).id;
    return { model, effort: modelEfforts(model).includes(saved.effort) ? saved.effort : '' };
  }
  modelMenu.fill = () => {
    const accountId = store.activeAccount()?.id;
    const chosen = selection(accountId) || { model: '', effort: '' };
    const levels = modelEfforts(chosen.model);
    const children = [h('div', { class: 'ai-menu-label', text: t('aiModel') })];
    if (models.loading) children.push(h('p', { class: 'ai-menu-pad ai-muted', role: 'status', text: t('aiChecking') }));
    if (models.error) children.push(h('div', { class: 'ai-menu-pad', role: 'alert' }, [h('span', { class: 'ai-muted', text: t('aiModelsUnavailable') }), ' ', h('button', { type: 'button', class: 'small-button', text: t('aiUsageRefresh'), onClick: () => { const id = models.accountId; models = { accountId: null, list: [], loading: false, error: false }; loadModels(id); } })]));
    children.push(h('div', { class: 'ai-menu-list', role: 'menu', 'aria-label': t('aiModel') }, models.list.map(m => menuItem([h('span', { class: 'ai-menu-text', text: modelLabel(m.id) })], m.id === chosen.model, () => chooseModel(m.id)))));
    // A model without effort levels (for example, Claude's Haiku 4.5) says so instead of showing the slider.
    if (levels.length) children.push(effortSlider(levels, chosen.effort));
    else if (chosen.model) children.push(h('p', { class: 'ai-menu-pad ai-muted ai-effort-none', text: t('aiEffortNone') }));
    modelMenu.pop.setAttribute('aria-label', t('aiModel'));
    modelMenu.pop.replaceChildren(...children);
  };
  function effortSlider(levels, effort) {
    const stops = ['', ...levels], at = Math.max(0, stops.indexOf(effort)), last = stops.length - 1;
    const value = h('span', { class: 'ai-effort-value', text: effortName(stops[at]) });
    const range = h('input', { type: 'range', class: 'ai-effort-range', min: 0, max: last, step: 1, value: at, 'aria-label': t('aiEffort'), 'aria-valuetext': effortName(stops[at]) });
    const ticks = h('div', { class: 'ai-effort-ticks', 'aria-hidden': 'true' }, stops.map((_, i) => h('span', { class: i <= at ? 'is-on' : '' })));
    const paint = i => {
      range.style.setProperty('--fill', `${last ? (i / last) * 100 : 0}%`);
      value.textContent = effortName(stops[i]);
      range.setAttribute('aria-valuetext', effortName(stops[i]));
      [...ticks.children].forEach((tick, j) => tick.classList.toggle('is-on', j <= i));
    };
    paint(at);
    range.addEventListener('input', () => paint(Number(range.value)));
    range.addEventListener('change', () => chooseEffort(stops[Number(range.value)]));
    return h('section', { class: 'ai-effort' }, [
      h('div', { class: 'ai-effort-head' }, [h('span', { class: 'ai-menu-label', text: t('aiEffort') }), value]),
      range, ticks,
      h('div', { class: 'ai-effort-ends', 'aria-hidden': 'true' }, [h('span', { text: effortName('') }), h('span', { text: effortName(stops[last]) })])
    ]);
  }
  async function chooseModel(id) {
    const accountId = store.activeAccount()?.id;
    if (!accountId) return;
    const saved = choiceOf(accountId);
    await saveChoice(accountId, { model: id, effort: modelEfforts(id).includes(saved.effort) ? saved.effort : '' });
    if (modelMenu.open) modelMenu.fill(); // keeps the menu open, with the new model's efforts
  }
  async function chooseEffort(effort) {
    const accountId = store.activeAccount()?.id;
    const chosen = selection(accountId);
    if (chosen) await saveChoice(accountId, { model: chosen.model, effort });
  }
  async function saveChoice(accountId, choice) {
    const choices = { ...(store.state.settings?.choices || {}), [accountId]: choice };
    await store.saveSettings({ choices }).catch(() => {});
    // An open session takes the new options where the service allows it; otherwise the next session does.
    const conv = current();
    const caps = store.provider(store.activeAccount()?.providerId)?.capabilities;
    if (conv?.sessionId && !conv.running && conv.accountId === accountId) {
      const options = { model: choice.model, ...(choice.effort ? { effort: choice.effort } : {}) };
      if (caps?.liveOptions) host.call('session.updateOptions', { sessionId: conv.sessionId, options }).catch(() => closeSession(conv));
      else closeSession(conv);
    }
    renderControls();
  }

  async function loadModels(accountId) {
    models = { accountId, list: [], loading: true, error: false };
    // Only real models are offered. Claude also reports a "default" entry ("Default (recommended)"), which only means
    // "the account's default"; it is left out, as the account-default choice is not offered.
    try { models = { accountId, list: (await host.call('models.list', { accountId })).filter(m => m.id !== 'default'), loading: false, error: false }; }
    catch { models = { accountId, list: [], loading: false, error: true }; }
    if (modelMenu.open) modelMenu.fill();
    renderControls();
  }

  // ---------- Conversations ----------
  const newId = () => crypto.randomUUID();
  const blank = () => ({ id: newId(), sessionId: null, accountId: null, resumeId: null, items: [], running: null, activity: null, opening: false, started: 0, tokens: { input: 0, output: 0, cached: 0, known: false }, updated: null, attachments: [], picks: [], allowedServers: new Set() });
  function stateOf(doc) {
    const id = app.documentId(doc);
    documents.set(id, doc);
    if (!states.has(id)) states.set(id, { documentId: id, current: blank(), history: [] });
    return states.get(id);
  }
  const current = () => (activeDoc ? stateOf(activeDoc).current : null);
  const stateOfConversation = conv => [...states.values()].find(state => state.current === conv || state.history.includes(conv));
  const conversationTitle = conv => conv.items.find(item => item.kind === 'user')?.text.split('\n')[0].slice(0, 80) || t('aiUntitledConversation');
  const push = (conv, item) => { conv.items.push(item); if (conv === current()) renderThread(); return item; };

  // ---------- Changes to save ----------
  // A document's conversations are part of its file, so changing them is an unsaved change. The signature is what
  // would be saved; it is compared, once per frame, with the one the document had when it was opened or last saved.
  // The result is doc.conversationsModified (EdukorsDocuments.isModified combines it with the app's own doc.modified),
  // announced with edukors:document-modified and edukors:conversations-changed.
  const baselines = new Map(); // documentId → signature when opened or saved
  const signatureOf = state => {
    try { return JSON.stringify(EdukorsAiConversations.toPackage('common', [state.current, ...state.history].map(c => ({ ...c, updated: c.updated || '' }))).parts.map(part => part.content)); }
    catch { return ''; }
  };
  let changeCheck = 0;
  function checkChanges() {
    changeCheck = 0;
    for (const [id, state] of states) {
      const doc = documents.get(id);
      if (!doc) continue;
      if (!baselines.has(id)) baselines.set(id, signatureOf(state));
      const modified = signatureOf(state) !== baselines.get(id);
      if (!!doc.conversationsModified === modified) continue;
      doc.conversationsModified = modified;
      document.dispatchEvent(new CustomEvent('edukors:conversations-changed', { detail: { id: doc.id } }));
      document.dispatchEvent(new CustomEvent('edukors:document-modified', { detail: { id: doc.id } }));
    }
  }
  const touch = () => { if (!changeCheck) changeCheck = requestAnimationFrame(checkChanges); };

  function closeSession(conv) {
    if (!conv.sessionId) return;
    const id = conv.sessionId;
    bySession.delete(id);
    conv.sessionId = null;
    host.call('session.close', { sessionId: id }).catch(() => {});
  }

  // The current conversation goes to the history (when it has a request) and an empty one takes its place.
  function archive(state) {
    const conv = state.current;
    closeSession(conv);
    if (conv.items.some(item => item.kind === 'user')) state.history = [conv, ...state.history.filter(c => c !== conv)].slice(0, 40);
    state.current = blank();
  }

  function newConversation() {
    if (!activeDoc) return;
    const state = stateOf(activeDoc);
    if (state.current.running || !state.current.items.length) return;
    archive(state);
    showHistory = false;
    render();
    input.focus();
  }

  function openConversation(id) {
    const state = stateOf(activeDoc);
    if (state.current.running) return;
    const conv = state.history.find(c => c.id === id);
    if (!conv) return;
    archive(state);
    state.history = state.history.filter(c => c !== conv);
    state.current = conv;
    showHistory = false;
    render();
    thread.scrollTop = thread.scrollHeight;
  }

  function deleteConversation(id) {
    const state = stateOf(activeDoc);
    if (!confirm(t('aiDeleteConversationConfirm'))) return;
    state.history = state.history.filter(c => c.id !== id);
    render();
  }

  async function openSession(conv, account) {
    const info = await host.hostInfo();
    const settings = store.state.settings || {};
    const userInstructions = (settings.instructions || '').trim();
    const common = 'You work in the document\'s folder: you may read, create, and edit files there, run commands, and search the web when the user allows it, but nothing outside that folder. The document itself changes only through the application\'s tools. Files the user attaches are listed after the request with their paths; open them with your file tools. When the user names a skill at the start of a request, read that skill and follow it; when the user names an MCP server, use its tools for the request.';
    const instructions = [app.instructions, common, userInstructions && `Instructions from the user:\n${userInstructions}`].filter(Boolean).join('\n\n');
    let mcpServers;
    if ((settings.mcp || '').trim()) {
      const parsed = await host.call('mcp.parse', { text: settings.mcp });
      if (Object.keys(parsed.servers).length) mcpServers = parsed.servers;
    }
    const options = {};
    if (store.provider(account.providerId)?.capabilities?.models && models.accountId !== account.id) await loadModels(account.id);
    const chosen = selection(account.id);
    if (chosen) { options.model = chosen.model; if (chosen.effort) options.effort = chosen.effort; }
    // A conversation reopened from the history continues where it stopped, on the same account.
    const resumeId = conv.accountId === account.id && conv.resumeId ? conv.resumeId : undefined;
    // The document's folder (or, before it is saved, a private one): files, commands, and the web, confined to it.
    const caps = store.provider(account.providerId)?.capabilities;
    const workspace = caps?.workspace ? await host.call('workspace.prepare', { documentId: stateOfConversation(conv).documentId, ...(app.documentPath?.(documents.get(stateOfConversation(conv).documentId)) ? { documentPath: app.documentPath(documents.get(stateOfConversation(conv).documentId)) } : {}) }) : null;
    conv.workspace = workspace;
    const opened = await host.call('session.open', {
      accountId: account.id,
      documentId: stateOfConversation(conv).documentId,
      instructions,
      tools: app.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      ...(Object.keys(options).length ? { options } : {}),
      ...(resumeId ? { resumeId } : {}),
      ...(mcpServers ? { mcpServers } : {}),
      ...(info.skillsDir ? { skillsDir: info.skillsDir } : {}),
      ...(workspace ? { workspace: { dir: workspace.dir, protect: workspace.protect, web: settings.web !== false, shell: true } } : {})
    });
    conv.sessionId = opened.sessionId;
    conv.resumeId = opened.resumeId || conv.resumeId;
    conv.accountId = account.id;
    bySession.set(opened.sessionId, conv);
  }

  async function send() {
    const conv = current();
    const typed = input.value.trim();
    if (!conv || (!typed && !conv.picks.length) || conv.running || conv.opening) return;
    closeAddMenu(false);
    try {
      await host.ready();
      if (!store.state.loaded) await store.load();
    } catch (error) {
      push(conv, { kind: 'error', text: errorText(error) });
      return;
    }
    const account = store.activeAccount();
    if (!account || store.state.statuses[account.id]?.state !== 'connected') {
      push(conv, { kind: 'needsAccount' });
      return;
    }
    // The chosen skill or MCP tool is named at the start of the request; attachments go into the context of this
    // request only.
    const picks = conv.picks, attachments = conv.attachments;
    const lead = picks.map(pick => (pick.kind === 'mcp' ? `Use the MCP server "${pick.server}" (its tools are named mcp__${pick.server}__<tool>) for this request.`
      : `Use the skill "${pick.name}" for this request.`)).join('\n');
    const text = [currentMode() === 'plan' ? PLAN_NOTE : '', lead, typed].filter(Boolean).join('\n\n');
    input.value = '';
    conv.picks = [];
    conv.attachments = [];
    setComposerNote('');
    renderChips();
    const skillNames = picks.filter(p => p.kind === 'skill').map(p => p.name), serverNames = picks.filter(p => p.kind === 'mcp').map(p => p.name);
    push(conv, { kind: 'user', text: typed, ...(skillNames.length ? { skills: skillNames } : {}), ...(serverNames.length ? { servers: serverNames } : {}),  ...(attachments.length ? { attachments: attachments.map(a => a.name) } : {}) });
    stepTo(conv, conv.sessionId && conv.accountId === account.id ? 'preparing' : 'opening');
    const requestId = newId();
    conv.running = { requestId };
    conv.activity = 'preparing';
    conv.started = Date.now();
    conv.updated = new Date().toISOString();
    startClock();
    render();
    try {
      if (conv.sessionId && conv.accountId !== account.id) closeSession(conv);
      if (!conv.sessionId) {
        conv.opening = true;
        await openSession(conv, account);
        stepTo(conv, 'preparing');
        if (conv === current()) renderThread();
      }
      const context = app.context(documents.get(stateOfConversation(conv).documentId));
      const files = attachments.map(a => ({ name: a.name, mimeType: a.mimeType, data: toBase64(a.bytes) }));
      await host.call('session.send', { sessionId: conv.sessionId, text, requestId, ...(context ? { context: JSON.stringify(context) } : {}), ...(files.length ? { attachments: files } : {}) });
    } catch (error) {
      if (error.code === 'SESSION_CLOSED') { bySession.delete(conv.sessionId); conv.sessionId = null; }
      if (error.code !== 'CANCELLED') push(conv, { kind: 'error', text: errorText(error) });
    } finally {
      conv.opening = false;
      conv.running = null;
      conv.activity = null;
      conv.updated = new Date().toISOString();
      endSteps(conv);
      denyPending(conv);
      render();
      // The service may have new limit figures after a request.
      if (store.provider(account.providerId)?.capabilities?.usage) store.readUsage(account.id).catch(() => {});
    }
  }

  function stop() {
    const conv = current();
    if (!conv?.running || !conv.sessionId) return;
    denyPending(conv);
    host.call('session.interrupt', { sessionId: conv.sessionId }).catch(() => {});
  }

  // A stopped or finished request leaves nothing waiting for an answer.
  function denyPending(conv) {
    for (const item of conv.items) {
      if ((item.kind === 'authorize' || item.kind === 'approve' || item.kind === 'native') && !item.decision) {
        item.decision = 'deny';
        item.resolve(item.kind === 'authorize' ? { allow: false, message: 'The request ended.' } : false);
      }
    }
  }

  function toBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }

  // ---------- Steps: the conversation shows what the agent is doing, so it is never silent for long ----------
  // Each phase becomes a line (spinner and seconds while it runs, then a check and its duration). Text, tools, and
  // cards end the running step. After a few seconds without any event, a "Thinking" step appears.
  const SILENCE_MS = 3000;
  function stepTo(conv, phase) {
    conv.lastEventAt = Date.now();
    const running = conv.items.findLast?.(item => item.kind === 'step' && item.state === 'running');
    if (running?.phase === phase) return;
    endSteps(conv);
    conv.items.push({ kind: 'step', phase, state: 'running', started: Date.now() });
  }
  // A step that ended in under a second leaves no line: only steps that took time stay in the conversation.
  function endSteps(conv) {
    const now = Date.now();
    for (const item of conv.items) if (item.kind === 'step' && item.state === 'running') Object.assign(item, { state: 'done', ended: now });
    conv.items = conv.items.filter(item => item.kind !== 'step' || item.state === 'running' || item.ended - item.started >= 1000);
  }
  const seconds = ms => `${Math.max(0, Math.round(ms / 1000))} s`;

  function startClock() {
    if (clock) return;
    clock = setInterval(() => {
      if (![...states.values()].some(state => state.current.running)) { clearInterval(clock); clock = 0; }
      for (const state of states.values()) {
        const conv = state.current;
        if (!conv.running) continue;
        // Nothing is added while a card waits for the person (approval, permission, or a question).
        const waiting = conv.items.some(item => ((item.kind === 'approve' || item.kind === 'authorize' || item.kind === 'native') && !item.decision) || (item.kind === 'question' && item.answer === null));
        const stepRunning = conv.items.some(item => item.kind === 'step' && item.state === 'running');
        if (!waiting && !stepRunning && Date.now() - (conv.lastEventAt || 0) > SILENCE_MS) { stepTo(conv, 'thinking'); if (conv === current()) renderThread(); }
      }
      // The running step's seconds.
      for (const node of thread.querySelectorAll('.ai-step[data-state="running"] .ai-step-time')) node.textContent = seconds(Date.now() - Number(node.dataset.started));
    }, 1000);
  }

  // ---------- Events from the runtime ----------
  host.on('event', event => {
    const conv = bySession.get(event.sessionId);
    if (!conv) return;
    touch();
    conv.lastEventAt = Date.now();
    switch (event.type) {
      case 'activity': conv.activity = event.phase; if (conv.running) stepTo(conv, event.phase); break;
      case 'textDelta': {
        const last = conv.items[conv.items.length - 1];
        if (last?.kind === 'assistant' && last.requestId === event.requestId) last.text += event.text;
        else { endSteps(conv); conv.items.push({ kind: 'assistant', requestId: event.requestId, text: event.text }); }
        if (conv.activity === 'preparing') conv.activity = 'thinking';
        break;
      }
      case 'toolStarted': endSteps(conv); conv.items.push({ kind: 'tool', callId: event.callId, tool: event.tool, state: 'running' }); break;
      case 'toolCompleted': {
        const item = conv.items.find(i => i.kind === 'tool' && i.callId === event.callId);
        if (item) Object.assign(item, { state: event.ok ? 'ok' : 'failed', errorCode: event.errorCode });
        break;
      }
      case 'question': endSteps(conv); conv.items.push({ kind: 'question', questionId: event.questionId, prompt: event.prompt, options: event.options || [], answer: null, picked: null }); break;
      case 'mcpServerStatus': conv.items.push({ kind: 'mcp', server: event.server, status: event.status, tools: event.tools, error: event.error }); break;
      case 'usageUpdated': {
        const u = event.usage || {};
        if (Number.isFinite(u.inputTokens) || Number.isFinite(u.outputTokens)) {
          conv.tokens.input += u.inputTokens || 0;
          conv.tokens.output += u.outputTokens || 0;
          conv.tokens.cached += u.cachedInputTokens || 0;
          conv.tokens.known = true;
        }
        break;
      }
      case 'turnCompleted': conv.activity = null; endSteps(conv); break;
      case 'cancelled': conv.activity = null; endSteps(conv); conv.items.push({ kind: 'note', text: t('aiStopped') }); break;
      // A failed request resolves session.send with its error and reports it here; it is shown once, from here.
      case 'error': endSteps(conv); conv.items.push({ kind: 'error', text: errorText(event.error) }); break;
      case 'sessionClosed':
        bySession.delete(event.sessionId);
        if (conv.sessionId === event.sessionId) conv.sessionId = null;
        if (event.reason === 'accountRemoved') conv.items.push({ kind: 'note', text: t('aiAccountRemovedNote') });
        break;
      default: return;
    }
    if (conv === current()) render();
  });

  host.handle({
    // The agent asks the application to run one of its tools. In review mode, a change waits for approval.
    tool: async ({ sessionId, documentId, name, args }) => {
      const doc = documents.get(documentId);
      const tool = app.tools.find(item => item.name === name);
      if (!doc || !tool) return { content: `The tool ${name} is not available for this document.`, isError: true };
      const conv = bySession.get(sessionId);
      if (tool.changes !== false && currentMode() === 'plan') return { content: 'Plan mode is on: present the plan; the user chooses another mode to carry it out.', isError: true };
      if (tool.changes !== false && currentMode() === 'ask' && conv) {
        endSteps(conv);
        const approved = await new Promise(resolve => push(conv, { kind: 'approve', tool: name, args, decision: null, resolve }));
        conv.lastEventAt = Date.now();
        if (!approved) return { content: 'The user declined this change. Do not retry it unless the user asks.', isError: true };
      }
      try {
        const result = await tool.run(doc, args ?? {});
        return { content: typeof result === 'string' ? result : JSON.stringify(result ?? { ok: true }) };
      } catch (error) {
        return { content: error?.message || String(error), isError: true };
      }
    },
    // Every call to one of the user's MCP servers waits for the person's decision.
    authorize: ({ sessionId, server, tool, input: args, ...request }) => new Promise(resolve => {
      const conv = bySession.get(sessionId);
      if (!conv) { resolve({ allow: false, message: 'The conversation is closed.' }); return; }
      // Native actions in the folder (creating or editing a file, running a command): asked in review mode only.
      if (request.kind === 'native') {
        if (currentMode() === 'auto') { resolve({ allow: true }); return; }
        if (currentMode() === 'plan') { resolve({ allow: false, message: 'Plan mode is on: nothing is changed or run until the user chooses another mode.' }); return; }
        endSteps(conv);
        push(conv, { kind: 'native', request: { ...request, tool }, decision: null, resolve: allow => resolve(allow ? { allow: true } : { allow: false, message: 'The user declined this action.' }) });
        return;
      }
      // "Always allow" holds for this server until the conversation ends (a new conversation asks again).
      if (conv.allowedServers?.has(server)) { resolve({ allow: true }); return; }
      endSteps(conv);
      push(conv, { kind: 'authorize', server, tool, input: args, decision: null, resolve });
    })
  });

  // ---------- Rendering ----------
  const toolLabel = name => {
    const mcp = /^mcp__(.+?)__(.+)$/.exec(name);
    if (mcp) return t('aiToolMcp', { server: mcp[1], tool: mcp[2] });
    const own = app.tools.find(tool => tool.name === name);
    return own?.label ? own.label() : name;
  };
  const details = (value, summaryKey) => {
    const text = JSON.stringify(value ?? {}, null, 2);
    return text === '{}' ? null : h('details', {}, [h('summary', { text: t(summaryKey) }), h('pre', { text })]);
  };
  const decisionButtons = (item, onDecide, allowKey, doneKey) => (item.decision
    ? h('p', { class: 'ai-muted', text: item.decision === 'allow' ? t(doneKey) : t('aiDenied') })
    : h('div', { class: 'ai-row' }, [
      h('button', { type: 'button', class: 'small-button primary', text: t(allowKey), onClick: () => onDecide(true) }),
      h('button', { type: 'button', class: 'small-button', text: t('aiDeny'), onClick: () => onDecide(false) })
    ]));

  function itemView(item, conv) {
    switch (item.kind) {
      case 'user': return h('div', { class: 'ai-msg ai-msg-user' }, [
        item.skills?.length || item.servers?.length || item.attachments?.length ? h('div', { class: 'ai-msg-chips' }, [
          ...(item.skills || []).map(name => h('span', { class: 'ai-input-chip ai-input-chip-skill' }, [icon('graph-Bolt', 12), h('span', { text: name })])),
          ...(item.servers || []).map(name => h('span', { class: 'ai-input-chip ai-input-chip-skill' }, [icon('graph-Globe', 12), h('span', { text: name })])),
          ...(item.attachments || []).map(name => h('span', { class: 'ai-input-chip' }, [icon('graph-Paperclip', 12), h('span', { text: name })]))
        ]) : null,
        item.text ? h('p', { text: item.text }) : null
      ]);
      case 'assistant': {
        const body = h('div', { class: 'ai-msg ai-msg-assistant' });
        body.append(EdukorsMarkdown.render(item.text));
        return body;
      }
      case 'tool': return h('div', { class: 'ai-chip', dataset: { state: item.state } }, [
        icon(item.state === 'failed' ? 'graph-Error' : item.state === 'ok' ? 'graph-CheckCircle' : 'graph-Bolt', 14),
        h('span', { text: toolLabel(item.tool) }),
        item.state === 'failed' ? h('small', { text: item.errorCode === 'TOOL_DENIED' ? t('aiToolDenied') : t('aiToolFailed') }) : null
      ]);
      case 'mcp': return h('div', { class: 'ai-chip', dataset: { state: item.status === 'connected' ? 'ok' : 'failed' } }, [
        icon(item.status === 'connected' ? 'graph-CheckCircle' : 'graph-Warning', 14),
        h('span', { text: item.status === 'connected' ? t('aiMcpSessionConnected', { server: item.server, count: item.tools ?? 0 }) : t('aiMcpSessionFailed', { server: item.server }) })
      ]);
      case 'question': {
        const answer = value => {
          if (item.answer !== null || !conv.sessionId) return;
          item.answer = value;
          host.call('session.answer', { sessionId: conv.sessionId, questionId: item.questionId, answer: value }).catch(error => push(conv, { kind: 'error', text: errorText(error) }));
          render();
        };
        const free = h('input', { type: 'text', class: 'ai-input', placeholder: t('aiFreeAnswer'), 'aria-label': t('aiFreeAnswer'), value: item.picked || '' });
        return h('div', { class: 'ai-card' }, [h('form', { class: 'ai-question', onSubmit: event => { event.preventDefault(); if (free.value.trim()) answer(free.value.trim()); } }, [
          h('fieldset', { disabled: item.answer !== null }, [
            h('legend', { text: item.prompt }),
            item.options.length ? h('div', { class: 'ai-row' }, item.options.map(option => h('button', { type: 'button', class: 'small-button', 'aria-pressed': String(item.picked === option), text: option, onClick: () => { item.picked = option; render(); } }))) : null,
            free,
            h('div', { class: 'ai-row' }, [h('button', { type: 'submit', class: 'small-button primary', text: t('aiAnswer') })])
          ]),
          item.answer !== null ? h('small', { class: 'ai-muted', text: t('aiAnswered', { answer: item.answer }) }) : null
        ])]);
      }
      case 'approve': return h('div', { class: 'ai-card ai-card-review' }, [
        h('p', { class: 'ai-card-title', text: t('aiApproveTitle') }),
        h('p', { text: toolLabel(item.tool) }),
        details(item.args, 'aiApproveDetails'),
        decisionButtons(item, allow => { if (item.decision) return; item.decision = allow ? 'allow' : 'deny'; item.resolve(allow); render(); }, 'aiApprove', 'aiApproved')
      ]);
      // A native action in the folder, in review mode: what it does, its file or command, Approve or Decline.
      case 'native': {
        const r = item.request;
        const title = r.action === 'command' ? t('aiNativeCommand') : r.action === 'create' ? t('aiNativeCreate') : t('aiNativeEdit');
        const target = r.action === 'command' ? r.command : (r.relativePath || r.path || '') + (r.more ? ` ${t('aiNativeMore', { count: r.more })}` : '');
        return h('div', { class: 'ai-card ai-card-review' }, [
          h('p', { class: 'ai-card-title', text: title }),
          r.description ? h('p', { class: 'ai-muted', text: r.description }) : null,
          target ? h('pre', { class: 'ai-native-target', text: target }) : null,
          decisionButtons(item, allow => { if (item.decision) return; item.decision = allow ? 'allow' : 'deny'; item.resolve(allow); render(); }, 'aiApprove', 'aiApproved')
        ]);
      }
      case 'authorize': {
        const decide = (allow, always = false) => {
          if (item.decision) return;
          item.decision = allow ? (always ? 'always' : 'allow') : 'deny';
          if (always) {
            conv.allowedServers = conv.allowedServers || new Set();
            conv.allowedServers.add(item.server);
            // Other calls to the same server already waiting are allowed too.
            for (const other of conv.items) if (other !== item && other.kind === 'authorize' && !other.decision && other.server === item.server) { other.decision = 'always'; other.resolve({ allow: true }); }
          }
          item.resolve(allow ? { allow: true } : { allow: false, message: 'The user declined.' });
          render();
        };
        return h('div', { class: 'ai-card ai-card-authorize' }, [
          h('p', { class: 'ai-card-title', text: t('aiAuthorizeTitle', { server: item.server, tool: item.tool }) }),
          h('p', { class: 'ai-muted', text: t('aiAuthorizeHelp') }),
          details(item.input, 'aiAuthorizeDetails'),
          item.decision
            ? h('p', { class: 'ai-muted', text: item.decision === 'always' ? t('aiAllowedAlways', { server: item.server }) : item.decision === 'allow' ? t('aiAllowed') : t('aiDenied') })
            : h('div', { class: 'ai-row' }, [
              h('button', { type: 'button', class: 'small-button primary', text: t('aiAllow'), onClick: () => decide(true) }),
              h('button', { type: 'button', class: 'small-button', text: t('aiAllowAlways'), onClick: () => decide(true, true) }),
              h('button', { type: 'button', class: 'small-button', text: t('aiDeny'), onClick: () => decide(false) })
            ])
        ]);
      }
      case 'needsAccount': return h('div', { class: 'ai-card' }, [
        h('p', { text: t('aiNeedsAccount') }),
        h('div', { class: 'ai-row' }, [h('button', { type: 'button', class: 'small-button primary', text: t('aiOpenAiSettings'), onClick: openSettings })])
      ]);
      case 'error': return h('p', { class: 'ai-msg-error', role: 'alert', text: item.text });
      case 'note': return h('p', { class: 'ai-note', text: item.text });
      case 'step': {
        const running = item.state === 'running' && !!conv.running;
        return h('div', { class: 'ai-step', dataset: { state: running ? 'running' : 'done' } }, [
          running ? h('span', { class: 'ai-spinner', 'aria-hidden': 'true' }) : icon('graph-Check', 13),
          h('span', { text: t(running ? (stepKeys[item.phase] || 'aiPhaseThinking') : (stepDoneKeys[item.phase] || 'aiStepDoneThinking')) }),
          h('span', { class: 'ai-step-time', dataset: { started: String(item.started) }, text: seconds((running ? Date.now() : item.ended || Date.now()) - item.started) })
        ]);
      }
      default: return null;
    }
  }
  const openSettings = () => document.dispatchEvent(new CustomEvent('edukors:open-settings', { detail: { section: 'assistant' } }));

  function emptyView() {
    const unavailable = host.status === 'unavailable' || host.status === 'lost';
    const noAccount = !unavailable && store.state.loaded && !store.activeAccount();
    return h('div', { class: 'assistant-empty' }, [
      icon('graph-Ai', 28),
      h('h3', { text: t('assistantEmptyTitle') }),
      h('p', { text: unavailable ? t(host.status === 'lost' ? 'aiHostLost' : 'aiHostMissing') : noAccount ? t('aiNeedsAccount') : t('aiEmptyHint') }),
      noAccount ? h('button', { type: 'button', class: 'small-button primary', text: t('aiOpenAiSettings'), onClick: openSettings }) : null
    ]);
  }

  function renderThread() {
    touch();
    const conv = current();
    const nearBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 40;
    thread.replaceChildren(...(!conv || !conv.items.length ? [emptyView()] : conv.items.map(item => itemView(item, conv)).filter(Boolean)));
    if (nearBottom || conv?.running) thread.scrollTop = thread.scrollHeight;
  }

  // Earlier conversations of this document: search, grouped by day, open, delete.
  const historySearch = h('input', { type: 'search', class: 'ai-input' });
  const historyList = h('div', { class: 'ai-history-list' });
  const historyTitle = h('h3');
  historyView.append(h('div', { class: 'ai-history-head' }, [historyTitle, historySearch]), historyList);
  historySearch.addEventListener('input', () => { historyQuery = historySearch.value; renderHistory(); });
  function renderHistory() {
    historyTitle.textContent = t('aiHistory');
    historySearch.placeholder = t('aiHistorySearch');
    historySearch.setAttribute('aria-label', t('aiHistorySearch'));
    if (historySearch.value !== historyQuery) historySearch.value = historyQuery;
    if (!activeDoc) { historyList.replaceChildren(); return; }
    const state = stateOf(activeDoc);
    const items = state.history.filter(c => conversationTitle(c).toLowerCase().includes(historyQuery.toLowerCase()));
    const today = new Date().toDateString(), yesterday = new Date(Date.now() - 864e5).toDateString();
    const rows = [];
    let group = '';
    for (const conv of items) {
      const date = new Date(conv.updated || Date.now());
      const key = date.toDateString() === today ? 'aiToday' : date.toDateString() === yesterday ? 'aiYesterday' : 'aiEarlier';
      if (key !== group) { rows.push(h('h4', { text: t(key) })); group = key; }
      const account = store.state.accounts.find(a => a.id === conv.accountId);
      rows.push(h('div', { class: 'ai-history-row' }, [
        h('button', { type: 'button', class: 'ai-history-open', onClick: () => openConversation(conv.id) }, [
          h('span', { class: 'ai-history-title', text: conversationTitle(conv) }),
          h('small', { class: 'ai-muted', text: [account?.label, conv.updated ? timeText(conv.updated) : ''].filter(Boolean).join(' · ') })
        ]),
        iconButton('slides-trash', t('aiDeleteConversation'), () => deleteConversation(conv.id))
      ]));
    }
    historyList.replaceChildren(...(rows.length ? rows : [h('p', { class: 'ai-muted ai-history-empty', text: state.history.length ? t('aiHistoryNoMatch') : t('aiHistoryEmpty') })]));
  }

  const stepKeys = { opening: 'aiStepOpening', preparing: 'aiPhasePreparing', thinking: 'aiPhaseThinking', reading: 'aiPhaseReading', researching: 'aiPhaseResearching', applying: 'aiPhaseApplying' };
  const stepDoneKeys = { opening: 'aiStepDoneOpening', preparing: 'aiStepDonePreparing', thinking: 'aiStepDoneThinking', reading: 'aiStepDoneReading', researching: 'aiStepDoneResearching', applying: 'aiStepDoneApplying' };


  // The account's session limit (the 5-hour window), as the service reports it: one bar with the percentage used and,
  // beside it, the time the window resets (only the time if today, the date and time otherwise; the full date and the
  // word "resets" in the tooltip).
  // When the service has no such window, its most used window is shown instead; with no window at all, nothing is shown.
  function renderUsage() {
    const account = store.state.loaded ? store.activeAccount() : null;
    const windows = (account && store.state.usage[account.id]?.windows || []).filter(w => Number.isFinite(w.used));
    const shown = windows.find(w => w.name === 'five_hour') || windows.reduce((a, b) => (!a || b.used > a.used ? b : a), null);
    usageView.hidden = !shown || !activeDoc;
    if (usageView.hidden) return;
    const percent = Math.round(Math.min(1, Math.max(0, shown.used)) * 100);
    const label = windowLabel(shown.name);
    usageView.title = shown.resetsAt ? t('aiUsageResets', { time: timeText(shown.resetsAt) }) : '';
    usageView.replaceChildren(
      h('span', { class: 'ai-usage-label', text: label }),
      h('meter', { min: 0, max: 100, value: percent, low: 70, high: 90, optimum: 0, 'aria-label': label, 'aria-valuetext': `${percent}%` }),
      h('span', { class: 'ai-usage-value', text: `${percent}%` }),
      ...(shown.resetsAt && resetText(shown.resetsAt) ? [h('span', { class: 'ai-usage-reset', text: `· ${resetText(shown.resetsAt)}` })] : [])
    );
  }
  function resetText(iso) {
    const date = new Date(iso), now = new Date();
    if (Number.isNaN(date.getTime())) return '';
    const lang = document.documentElement.lang || 'en';
    const today = date.toDateString() === now.toDateString();
    const time = new Intl.DateTimeFormat(lang, today ? { timeStyle: 'short' } : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
    return time;
  }

  function renderControls() {
    const conv = current();
    const available = host.status !== 'unavailable' && host.status !== 'lost';
    const running = !!conv?.running;
    const account = store.state.loaded ? store.activeAccount() : null;
    input.disabled = !available;
    sendButton.hidden = running;
    stopButton.hidden = !running;
    sendButton.setAttribute('aria-disabled', String(!(available && (!!input.value.trim() || !!conv?.picks.length) && !running)));
    addButton.disabled = !available || !conv;
    input.placeholder = t('aiAskPlaceholder');
    input.setAttribute('aria-label', t('aiAskPlaceholder'));
    for (const [button, key] of [[sendButton, 'send'], [stopButton, 'aiStop'], [addButton, 'aiAddMenu'], [newButton, 'aiNewConversation'], [historyButton, 'aiHistory']]) {
      button.setAttribute('aria-label', t(key));
      const tooltip = button.querySelector('.tooltip');
      if (tooltip) tooltip.textContent = t(key);
    }
    newButton.setAttribute('aria-disabled', String(!conv || !conv.items.length || running));
    historyButton.setAttribute('aria-pressed', String(showHistory));
    historyButton.setAttribute('aria-disabled', String(!activeDoc));

    // Mode chip.
    const mode = currentMode();
    modeMenu.chip.disabled = !available || running;
    modeMenu.chip.setAttribute('aria-label', `${t('aiMode')}: ${t(modeKey(mode))}`);
    modeMenu.chip.title = t(modeKey(mode, 'Hint'));
    modeMenu.chip.replaceChildren(icon(modes[mode], 14), h('span', { text: t(modeKey(mode, 'Short')) }), icon('graph-ChevronDown', 12));

    // Model chip: shown when the account's service lists its models.
    const caps = account && store.provider(account.providerId)?.capabilities;
    if (account && caps?.models && models.accountId !== account.id && !models.loading) loadModels(account.id);
    const chosen = account && caps?.models ? selection(account.id) : null;
    modelMenu.root.hidden = !chosen;
    if (chosen) {
      modelMenu.chip.disabled = running;
      modelMenu.chip.setAttribute('aria-label', `${t('aiModel')}: ${modelLabel(chosen.model)}`);
      modelMenu.chip.replaceChildren(h('span', { class: 'ai-chip-text' }, [modelLabel(chosen.model), chosen.effort ? h('span', { class: 'ai-chip-sub', text: ` · ${effortName(chosen.effort)}` }) : null]), icon('graph-ChevronDown', 12));
    }
    if (running) { modeMenu.close(false); modelMenu.close(false); }
    renderUsage();
  }

  function render() {
    touch();
    historyView.hidden = !showHistory;
    chatView.hidden = showHistory;
    if (showHistory) renderHistory(); else renderThread();
    renderChips();
    renderControls();
  }

  // ---------- Wiring ----------
  document.addEventListener('edukors:documents-changed', event => {
    activeDoc = event.detail.active || null;
    // Conversations of closed documents end with them.
    const open = new Set(EdukorsDocuments.list().map(doc => app.documentId(doc)));
    for (const [id, state] of states) {
      if (open.has(id)) continue;
      const conv = state.current;
      if (conv.running && conv.sessionId) host.call('session.interrupt', { sessionId: conv.sessionId }).catch(() => {});
      denyPending(conv);
      closeSession(conv);
      states.delete(id);
      documents.delete(id);
      baselines.delete(id);
    }
    if (!activeDoc) showHistory = false;
    render();
  });
  // When the panel opens, the shared accounts are read again (another app may have changed them).
  new MutationObserver(() => {
    if (!panel.classList.contains('is-open') || host.status !== 'ready') return;
    store.load().then(() => {
      const account = store.activeAccount();
      if (account && store.provider(account.providerId)?.capabilities?.usage) store.readUsage(account.id).catch(() => {});
    });
  }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  // The account changes only in Settings. A new account starts a new conversation; the current one goes to the history.
  store.subscribe(() => {
    const account = store.state.loaded ? store.activeAccount() : null;
    const id = account?.id ?? null;
    if (store.state.loaded && lastAccountId !== undefined && id !== lastAccountId) {
      for (const state of states.values()) if (!state.current.running && state.current.items.length) archive(state);
      models = { accountId: null, list: [], loading: false, error: false };
      render();
    }
    if (store.state.loaded) lastAccountId = id;
    renderControls();
  });
  host.on('status', () => { if (host.status === 'ready') store.load(); render(); });
  document.addEventListener('edukors:preferences-changed', render);
  render();

  return Object.freeze({
    configure(options) { app = { ...app, ...options }; render(); },
    /**
     * The document's conversations, to save in its package (see ai-conversations.js): the current one first, then
     * the history. The host calls this when it saves the document.
     */
    conversationsOf(doc) {
      const state = stateOf(doc);
      return [state.current, ...state.history];
    },
    /**
     * The document now has a file: idle conversations close their sessions, so the next request opens in the file's
     * folder (documentPath). A conversation that is running keeps its session until it ends.
     */
    documentSaved(doc) {
      const state = stateOf(doc);
      for (const conv of [state.current, ...state.history]) if (!conv.running) closeSession(conv);
    },
    /**
     * What would be saved now, to pass to markSaved once the file is written (conversations may change meanwhile).
     */
    signature(doc) { return signatureOf(stateOf(doc)); },
    /** The document's conversations as written (signature taken before writing, or now): no longer a change to save. */
    markSaved(doc, signature) {
      const state = stateOf(doc);
      baselines.set(app.documentId(doc), signature ?? signatureOf(state));
      checkChanges();
    },
    /** Conversations read from the document's package when it opens: they become its history. */
    restoreConversations(doc, list) {
      const state = stateOf(doc);
      const known = new Set([state.current.id, ...state.history.map(c => c.id)]);
      const restored = (list || []).filter(c => c && !known.has(c.id)).map(c => ({ ...blank(), ...c, tokens: { ...blank().tokens, ...c.tokens } }));
      state.history = [...state.history, ...restored].sort((a, b) => String(b.updated).localeCompare(String(a.updated))).slice(0, 40);
      // What the file had is not a change; a recovered draft's conversations are part of the recovered changes.
      baselines.set(app.documentId(doc), signatureOf(state));
      if (doc === activeDoc) render();
    }
  });
})();
