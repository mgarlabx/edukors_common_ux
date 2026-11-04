// Shared contextual formatting controls, used by every app's contextual toolbar.
// Groups (ported from the Slides editor's format bar):
//   text:  bold, italic, underline, strikethrough, subscript, superscript, font size (typed or preset, with decrease/increase buttons), font family, text color
//   shape: line width (typed or preset), line style, line color, fill, shadow, opacity
//   align:  left, center, right, justify (one at a time)
//   valign: top, middle, bottom (one at a time)
//   lists:  bulleted, numbered (one at a time, or none)
//   link:   popover with address (http, https, mailto) and a Create QR code button (reported as the `createQr` action with the address); apply and remove
//   image:  replace (an action the app handles), crop toggle, keep proportions, border (line width, style, color), shadow, opacity
//   arrange: bring to front, send to back (actions the app handles)
//   table: a menu of table actions (rows, columns, merge, split, header row, delete), reported as tableAction, and the
//          cells' fill (cellFill); the app may pass its own actions as options.tableActions
//   blockStyle: the paragraph's style (normal, headings 1–3, quote, code; the app may pass its own list as options.blockStyles)
// The library only renders controls and reports changes: onChange(property, value). The app applies them to its content
// and passes the selection's current values back in `state`. Buttons and menus never take the focus on pointer down,
// so a text selection in the editing surface stays selected (as in Slides).
globalThis.EdukorsFormat = (() => {
  const palette = [
    ['#ffffff', 'colorWhite'], ['#000000', 'colorBlack'], ['#808080', 'colorGray'], ['#d9d9d9', 'colorLightGray'], ['#172033', 'colorNavy'],
    ['#ff0000', 'colorRed'], ['#ffa500', 'colorOrange'], ['#ffff00', 'colorYellow'], ['#00b050', 'colorGreen'], ['#0070c0', 'colorBlue'],
    ['#00b0f0', 'colorLightBlue'], ['#7030a0', 'colorPurple'], ['#ff4fa3', 'colorPink'], ['#8b4513', 'colorBrown'], ['#00838f', 'colorTeal']
  ];
  const defaults = {
    fontSizes: [16, 20, 24, 28, 32, 40, 48, 56, 64, 72, 88, 104],
    fontFamilies: ['Arial', 'Georgia', 'Times New Roman', 'Verdana', 'Trebuchet MS', 'Courier New'],
    lineWidths: [0, 1, 2, 4, 8],
    lineStyles: ['solid', 'dashed', 'dotted'],
    // Actions of the table group: the value reported as tableAction and the translation key of its name.
    // null separates groups: rows, columns, deleting rows and columns, merging, the header row, deleting the table.
    tableActions: [['addRowBefore', 'fmtRowAbove'], ['addRowAfter', 'fmtRowBelow'], null, ['addColumnBefore', 'fmtColumnLeft'], ['addColumnAfter', 'fmtColumnRight'], null,
      ['deleteRow', 'fmtDeleteRow'], ['deleteColumn', 'fmtDeleteColumn'], null, ['mergeCells', 'fmtMergeCells'], ['splitCell', 'fmtSplitCell'], null, ['toggleHeaderRow', 'fmtHeaderRow'], null, ['deleteTable', 'fmtDeleteTable']],
    // Paragraph styles for the blockStyle group: the value reported to the app and the translation key of its name.
    blockStyles: [['paragraph', 'fmtStyleNormal'], ['heading1', 'fmtHeading1'], ['heading2', 'fmtHeading2'], ['heading3', 'fmtHeading3'], ['quote', 'fmtQuote'], ['code', 'fmtCodeBlock']],
    // Limits for typed sizes. Typed values are rounded to `step` and clamped; invalid input restores the previous value.
    fontSizeRange: { min: 1, max: 400, step: 1 },
    lineWidthRange: { min: 0, max: 50, step: 0.5 }
  };
  const hexColor = value => {
    const match = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(value.trim());
    if (!match) return '';
    const hex = match[1].length === 3 ? [...match[1]].map(c => c + c).join('') : match[1];
    return `#${hex.toLowerCase()}`;
  };
  const keep = event => event.preventDefault();

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('aria-') || key.startsWith('data-') || key === 'role' || key === 'type') node.setAttribute(key, value);
      else node[key] = value;
    }
    node.append(...children);
    return node;
  }

  function chip(color) {
    const node = el('span', { class: `color-chip${color === 'transparent' ? ' none' : ''}` });
    if (color !== 'transparent') node.style.background = color;
    return node;
  }

  // A small decorative icon placed inside a control; the control's tooltip names it.
  function iconNode(name) {
    const node = el('span', { class: 'control-icon', 'aria-hidden': 'true' });
    node.innerHTML = EdukorsIcons.svg(name, 16);
    return node;
  }

  // Dropdown: a button and a listbox menu. Arrow keys, Home, End move; Enter/Space pick; Escape closes.
  function pick({ id, label, value, options, onPick, wide = false, grid = false, extra, tip = label, icon }) {
    const wrapper = el('div', { class: 'pick' });
    const button = el('button', { type: 'button', class: `pick-button${wide ? ' wide' : ''}`, 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': label, 'data-control': id });
    button.append(el('span', { class: 'pick-value' }, [...(icon ? [iconNode(icon)] : []), value]), el('span', { class: 'pick-chevron', 'aria-hidden': 'true' }));
    button.append(el('span', { class: 'tooltip', 'aria-hidden': 'true', text: tip }));
    if (tip !== label) button.setAttribute('aria-label', tip);
    button.addEventListener('mousedown', keep);
    let menu = null;
    const items = () => [...menu.querySelectorAll('[role="option"]')];
    // Focus returns to the trigger only if it was inside the menu (keyboard use); with the mouse, the focus never left
    // the app's editing surface, so its text selection is kept.
    function close(focus = true) {
      if (!menu) return;
      const hadFocus = wrapper.contains(document.activeElement);
      menu.remove(); menu = null;
      button.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', outside, true);
      if (focus && hadFocus) button.focus();
    }
    function outside(event) { if (!wrapper.contains(event.target)) close(false); }
    function open(fromKeyboard = false) {
      menu = el('div', { class: `pick-menu${grid ? ' grid' : ''}`, role: 'listbox', 'aria-label': label });
      for (const option of options) {
        // { separator: true } draws a line between groups of options.
        if (option.separator) { menu.append(el('div', { class: 'pick-separator', role: 'separator' })); continue; }
        const item = el('button', { type: 'button', role: 'option', 'aria-selected': String(option.selected === true), 'aria-label': option.title || '', title: option.title || '' }, [option.label]);
        if (!option.title) item.removeAttribute('aria-label');
        // `tip`: an instant custom tooltip instead of the native title (used for color names).
        if (option.tip) { item.removeAttribute('title'); item.setAttribute('aria-label', option.tip); item.append(el('span', { class: 'tooltip', 'aria-hidden': 'true', text: option.tip })); }
        if (option.style) Object.assign(item.style, option.style);
        item.addEventListener('mousedown', keep);
        item.addEventListener('click', () => { close(); onPick(option.value); });
        menu.append(item);
      }
      if (extra) menu.append(extra(() => close()));
      wrapper.append(menu);
      button.setAttribute('aria-expanded', 'true');
      document.addEventListener('pointerdown', outside, true);
      if (fromKeyboard) (items().find(item => item.getAttribute('aria-selected') === 'true') || items()[0])?.focus();
    }
    // A click from the keyboard (Enter or Space) has detail 0; it moves the focus into the menu.
    button.addEventListener('click', event => menu ? close() : open(event.detail === 0));
    button.addEventListener('keydown', event => { if (event.key === 'ArrowDown' && !menu) { event.preventDefault(); open(true); } });
    wrapper.addEventListener('keydown', event => {
      if (!menu) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.key === 'Tab') { close(false); return; }
      const list = items(), index = list.indexOf(document.activeElement);
      if (index < 0) return;
      const columns = grid ? 5 : 1;
      const step = { ArrowDown: columns, ArrowUp: -columns, ArrowRight: grid ? 1 : 0, ArrowLeft: grid ? -1 : 0 }[event.key];
      if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); list[event.key === 'Home' ? 0 : list.length - 1].focus(); }
      else if (step) { event.preventDefault(); list[Math.max(0, Math.min(list.length - 1, index + step))].focus(); }
    });
    wrapper.append(button);
    return wrapper;
  }

  // Color dropdown: palette (optionally with "none") and a #RRGGBB code field.
  function colorPick({ id, label, value, onPick, none, t, icon }) {
    const named = [...(none ? [['transparent', none]] : []), ...palette.map(([color, key]) => [color, t(key)])];
    const nameOf = color => color === 'transparent' ? none : (named.find(([c]) => c === color)?.[1] ? `${named.find(([c]) => c === color)[1]} (${color.toUpperCase()})` : color.toUpperCase());
    const options = named.map(([color]) => ({ value: color, label: chip(color), selected: color === value, tip: nameOf(color) }));
    // The trigger's tooltip names the current color, for example "Text color: Red (#FF0000)".
    return pick({
      id, label, value: chip(value), icon, options, onPick, grid: true, tip: `${label}: ${nameOf(value)}`,
      extra: close => {
        const input = el('input', { type: 'text', placeholder: '#RRGGBB', maxLength: 7, spellcheck: false, autocomplete: 'off', 'aria-label': t('fmtHex'), value: value === 'transparent' ? '' : value.toUpperCase() });
        const preview = chip(value);
        const apply = el('button', { type: 'submit', class: 'tool', 'aria-label': t('fmtApplyColor') }, [el('span', { class: 'tooltip', 'aria-hidden': 'true', text: t('fmtApplyColor') })]);
        apply.insertAdjacentHTML('afterbegin', EdukorsIcons.svg('graph-Check'));
        const sync = () => {
          const color = hexColor(input.value);
          input.setAttribute('aria-invalid', String(!!input.value && !color));
          apply.setAttribute('aria-disabled', String(!color));
          preview.className = `color-chip${color ? '' : ' none'}`;
          preview.style.background = color || '';
        };
        input.addEventListener('input', sync);
        const form = el('form', { class: 'pick-hex' }, [preview, input, apply]);
        // Eyedropper: picks a color anywhere on the screen. Chromium (Electron, WebView2) supports it; WebKit does not,
        // so the button is shown only where the EyeDropper API exists. Cancelling with Esc leaves the color unchanged.
        if ('EyeDropper' in globalThis) {
          const dropper = el('button', { type: 'button', class: 'tool', 'aria-label': t('fmtEyedropper'), 'data-control': `${id}-eyedropper` }, [el('span', { class: 'tooltip', 'aria-hidden': 'true', text: t('fmtEyedropper') })]);
          dropper.insertAdjacentHTML('afterbegin', EdukorsIcons.svg('common-eyedropper'));
          dropper.addEventListener('mousedown', keep);
          dropper.addEventListener('click', async () => {
            try {
              const { sRGBHex } = await new EyeDropper().open();
              const color = hexColor(sRGBHex);
              if (color) { close(); onPick(color); }
            } catch { /* cancelled */ }
          });
          form.insertBefore(dropper, preview);
        }
        form.addEventListener('submit', event => { event.preventDefault(); const color = hexColor(input.value); if (color) { close(); onPick(color); } });
        sync();
        return form;
      }
    });
  }

  function toggle({ id, label, text, pressed, onToggle }) {
    const button = el('button', { type: 'button', class: `format-button ${id}`, 'aria-pressed': String(!!pressed), 'aria-label': label, 'data-control': id }, [el('span', { 'aria-hidden': 'true', text }), el('span', { class: 'tooltip', 'aria-hidden': 'true', text: label })]);
    button.addEventListener('mousedown', keep);
    button.addEventListener('click', onToggle);
    return button;
  }

  // Icon toggle: pressed state shown with aria-pressed.
  function iconToggle({ id, label, icon, pressed, onToggle }) {
    const button = el('button', { type: 'button', class: 'format-button icon', 'aria-pressed': String(!!pressed), 'aria-label': label, 'data-control': id }, [el('span', { class: 'tooltip', 'aria-hidden': 'true', text: label })]);
    button.insertAdjacentHTML('afterbegin', EdukorsIcons.svg(icon));
    button.addEventListener('mousedown', keep);
    button.addEventListener('click', onToggle);
    return button;
  }

  // Icon button that asks the app to do something (no state of its own).
  function actionButton({ id, label, icon, onAction }) {
    const button = el('button', { type: 'button', class: 'format-button icon', 'aria-label': label, 'data-control': id }, [el('span', { class: 'tooltip', 'aria-hidden': 'true', text: label })]);
    button.insertAdjacentHTML('afterbegin', EdukorsIcons.svg(icon));
    button.addEventListener('mousedown', keep);
    button.addEventListener('click', onAction);
    return button;
  }

  // Accepts http, https, and mailto; a bare domain such as edukors.org becomes https://edukors.org.
  function safeLink(value) {
    const text = value.trim();
    if (!text) return '';
    const candidate = /^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`;
    try {
      const url = new URL(candidate);
      return ['https:', 'http:', 'mailto:'].includes(url.protocol) && (url.protocol === 'mailto:' || url.hostname.includes('.')) ? url.href : '';
    } catch { return ''; }
  }

  // Link popover: the address field takes the focus (the app must keep its selection while it is open).
  function linkPopover({ state, t, change, action, options = {} }) {
    const wrapper = el('div', { class: 'pick' });
    const button = iconToggle({ id: 'link', label: t('fmtLink'), icon: 'graph-Link', pressed: !!state.link, onToggle: () => panel ? close() : open() });
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    let panel = null;
    function close(focus = true) {
      if (!panel) return;
      panel.remove(); panel = null;
      button.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', outside, true);
      if (focus) button.focus();
    }
    function outside(event) { if (!wrapper.contains(event.target)) close(false); }
    function open() {
      const input = el('input', { type: 'text', inputMode: 'url', spellcheck: false, autocomplete: 'off', value: state.link || '', placeholder: 'https://', 'aria-label': t('fmtLinkUrl'), 'aria-describedby': 'format-link-error' });
      const error = el('p', { class: 'link-error', id: 'format-link-error', role: 'alert' });
      const apply = el('button', { type: 'submit', class: 'small-button primary', text: t('fmtApplyLink') });
      // The QR code is a separate image made from the address. The text and its link stay as they are.
      const qrButton = el('button', { type: 'button', class: 'small-button qr-button', text: t('fmtCreateQr') });
      qrButton.hidden = options.linkQr === false; // apps without pictures (options.linkQr: false) do not offer it
      qrButton.addEventListener('click', () => {
        const url = safeLink(input.value);
        if (!url) { error.textContent = t('fmtInvalidUrl'); input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
        close(false); action('createQr', url);
      });
      const remove = el('button', { type: 'button', class: 'small-button', text: t('fmtRemoveLink') });
      remove.hidden = !state.link;
      remove.addEventListener('click', () => { close(false); change({ link: '' }, null, 'link'); });
      const form = el('form', { class: 'link-form' }, [
        el('label', { text: t('fmtLinkUrl') }, [input]), error,
        qrButton,
        el('div', { class: 'link-actions' }, [remove, apply])
      ]);
      input.addEventListener('input', () => { error.textContent = ''; input.removeAttribute('aria-invalid'); });
      form.addEventListener('submit', event => {
        event.preventDefault();
        const url = safeLink(input.value);
        if (!url) { error.textContent = t('fmtInvalidUrl'); input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
        close(false); change({ link: url }, null, 'link');
      });
      form.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } });
      panel = el('div', { class: 'pick-menu link-panel', role: 'dialog', 'aria-label': t('fmtLink') }, [form]);
      wrapper.append(panel);
      button.setAttribute('aria-expanded', 'true');
      // Near the right edge, the panel slides left so it stays inside the window.
      const over = panel.getBoundingClientRect().right - (innerWidth - 8);
      if (over > 0) panel.style.left = `${-over}px`;
      document.addEventListener('pointerdown', outside, true);
      input.focus();
      input.select();
    }
    wrapper.append(button);
    return wrapper;
  }

  // Value picker: a trigger that opens a small panel with a vertical slider (top = largest) and the value.
  // `onInput` reports while dragging; `onCommit` runs on release or after a key step, and the panel closes.
  // Hovering over the slider previews, in the readout, the value a click there would set (nothing changes yet); a click
  // or drag uses the same position-to-value rule, so the click lands exactly on the previewed number.
  const SLIDER_THUMB = 16; // px: the native range thumb's length along the track (Chromium)
  function sliderPopover({ label, min, max, step = 1, value, unit = '', onInput, onCommit, trigger }) {
    const wrapper = el('div', { class: 'pick' }, [trigger]);
    let panel = null;
    function close(focus = false) {
      if (!panel) return;
      panel.remove(); panel = null;
      trigger.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', outside, true);
      if (focus) trigger.focus();
    }
    function outside(event) { if (!wrapper.contains(event.target)) close(); }
    function open() {
      const shown = number => `${number}${unit}`;
      const decimals = (String(step).split('.')[1] || '').length;
      const readout = el('output', { class: 'slider-value', text: shown(value) });
      // A fixed width, the longest value the slider can show (29.5px, 100%), so the panel never resizes and the slider
      // never shifts under the pointer while the readout changes.
      const longest = String(Math.trunc(Math.max(Math.abs(min), Math.abs(max)))).length + (min < 0 ? 1 : 0) + (decimals ? decimals + 1 : 0) + unit.length;
      readout.style.width = `${longest + 0.5}ch`;
      const input = el('input', { type: 'range', class: 'vertical-range', min, max, step, value, 'aria-label': label, 'aria-orientation': 'vertical' });
      input.addEventListener('input', () => { showCurrent(); input.setAttribute('aria-valuetext', shown(Number(input.value))); onInput?.(Number(input.value)); });
      input.addEventListener('change', () => { const next = Number(input.value); close(); onCommit(next); });
      // Pointer: the slider's own drag is replaced so hover preview, click, and drag share one mapping.
      const valueAt = event => {
        const box = input.getBoundingClientRect();
        const inset = Math.min(SLIDER_THUMB / 2, box.height / 2);
        const ratio = Math.min(1, Math.max(0, (box.bottom - inset - event.clientY) / Math.max(1, box.height - 2 * inset)));
        const stepped = min + Math.round(ratio * (max - min) / step) * step;
        return Number(Math.min(max, Math.max(min, stepped)).toFixed(decimals));
      };
      function showCurrent() { readout.textContent = shown(Number(input.value)); readout.classList.remove('previewing'); }
      function setTo(next) { if (Number(input.value) === next) return; input.value = String(next); input.dispatchEvent(new Event('input', { bubbles: true })); }
      let drag = null; // { pointerId, start } while the button is down
      input.addEventListener('pointermove', event => {
        if (drag) { setTo(valueAt(event)); return; }
        readout.textContent = shown(valueAt(event));
        readout.classList.toggle('previewing', valueAt(event) !== Number(input.value));
      });
      input.addEventListener('pointerleave', () => { if (!drag) showCurrent(); });
      input.addEventListener('mousedown', event => event.preventDefault());
      input.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        input.focus({ preventScroll: true });
        input.setPointerCapture(event.pointerId);
        drag = { pointerId: event.pointerId, start: Number(input.value) };
        setTo(valueAt(event));
        showCurrent();
      });
      const release = event => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        const changed = Number(input.value) !== drag.start;
        drag = null;
        if (changed) input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      input.addEventListener('pointerup', release);
      input.addEventListener('pointercancel', release);
      panel = el('div', { class: 'slider-pop', role: 'dialog', 'aria-label': label }, [readout, input]);
      panel.addEventListener('keydown', event => { if (event.key === 'Escape' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); close(true); } });
      wrapper.append(panel);
      trigger.setAttribute('aria-expanded', 'true');
      // Near the right edge, the panel slides left so it stays inside the window.
      const over = panel.getBoundingClientRect().right - (innerWidth - 8);
      if (over > 0) panel.style.marginLeft = `${-over}px`;
      document.addEventListener('pointerdown', outside, true);
      input.focus({ preventScroll: true });
    }
    trigger.addEventListener('click', () => panel ? close() : open());
    return wrapper;
  }

  // Size combo box: a typed number (Enter or leaving the field applies) plus a menu of preset sizes.
  // Typing needs the focus, so an app must keep its text selection while the field is being edited.
  function sizeCombo({ id, label, value, sizes, unit = '', min = 0, max = 999, step = 1, onCommit, icon }) {
    const input = el('input', { type: 'text', inputMode: 'decimal', autocomplete: 'off', spellcheck: false, class: 'combo-input', value: String(value), 'aria-label': unit ? `${label} (${unit})` : label, 'data-control': id });
    const commit = () => {
      const typed = Number(input.value.replace(',', '.').replace(/px$/i, '').trim());
      if (!input.value.trim() || !Number.isFinite(typed)) { input.value = String(value); return; }
      const next = Math.min(max, Math.max(min, Math.round(typed / step) * step));
      input.value = String(next);
      if (next !== value) onCommit(next);
    };
    input.addEventListener('change', commit);
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); commit(); }
      if (event.key === 'Escape' && input.value !== String(value)) { event.preventDefault(); event.stopPropagation(); input.value = String(value); }
    });
    const trigger = el('button', { type: 'button', class: 'pick-button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-label': label, 'data-control': `${id}-menu` }, [el('span'), el('span', { class: 'pick-chevron', 'aria-hidden': 'true' })]);
    trigger.addEventListener('mousedown', keep);
    const menu = sliderPopover({ label, min, max, step, value, unit, trigger, onInput: next => { input.value = String(next); }, onCommit: next => { if (next !== value) onCommit(next); } });
    menu.classList.add('combo-menu');
    const field = el('span', { class: 'combo-field' }, [...(icon ? [iconNode(icon)] : []), input]);
    if (unit) field.append(el('span', { class: 'combo-unit', 'aria-hidden': 'true', text: unit }));
    return el('div', { class: 'combo' }, [field, menu, el('span', { class: 'tooltip', 'aria-hidden': 'true', text: label })]);
  }

  // Decrease/increase button for a size: moves to the next preset size in its direction; beyond the presets, by one step.
  // Disabled (visible, dimmed, focusable) at the limit.
  function sizeStepButton({ id, label, icon, value, sizes, direction, min, max, step = 1, onCommit }) {
    const sorted = [...sizes].sort((a, b) => a - b);
    const target = direction > 0
      ? (sorted.find(size => size > value) ?? value + step)
      : ([...sorted].reverse().find(size => size < value) ?? value - step);
    const next = Math.min(max, Math.max(min, target));
    const button = actionButton({ id, label, icon, onAction: () => { if (next !== value) onCommit(next); } });
    if (next === value) button.setAttribute('aria-disabled', 'true');
    return button;
  }

  // Opacity slider (0–100% in 5% steps). While dragging, the value is reported live without redrawing (a redraw would
  // end the drag); releasing commits it.
  // Opacity: a droplet button (tooltip "Opacity: 80%") that opens a vertical slider.
  function opacitySlider({ property, state, t, change, live }) {
    const value = Number.isFinite(state[property]) ? state[property] : 100;
    const trigger = el('button', { type: 'button', class: 'format-button icon', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-label': `${t('fmtOpacity')}: ${value}%`, 'data-control': property }, [el('span', { class: 'tooltip', 'aria-hidden': 'true', text: `${t('fmtOpacity')}: ${value}%` })]);
    trigger.insertAdjacentHTML('afterbegin', EdukorsIcons.svg('common-opacity'));
    trigger.addEventListener('mousedown', keep);
    return sliderPopover({ label: t('fmtOpacity'), min: 0, max: 100, step: 5, value, unit: '%', trigger, onInput: next => live(property, next), onCommit: next => change(property, next) });
  }

  function lineSample(style) {
    const svg = `<svg class="line-sample" viewBox="0 0 40 8" width="40" height="8" aria-hidden="true"><line x1="2" y1="4" x2="38" y2="4" stroke="currentColor" stroke-width="2" stroke-linecap="round"${style === 'dashed' ? ' stroke-dasharray="7 4"' : style === 'dotted' ? ' stroke-dasharray="0.1 4.5"' : ''}/></svg>`;
    return document.createRange().createContextualFragment(svg);
  }

  // Border line (width, style, color), shared by shapes and images.
  function lineControls({ state, t, change, options }) {
    return [
      sizeCombo({ id: 'lineWidth', label: t('fmtLineWidth'), icon: 'common-lineWidth', value: state.lineWidth, sizes: options.lineWidths, unit: 'px', ...options.lineWidthRange, onCommit: value => change('lineWidth', value) }),
      pick({ id: 'lineStyle', label: t('fmtLineStyle'), value: lineSample(state.lineStyle), options: options.lineStyles.map(style => ({ value: style, label: lineSample(style), title: t(`fmt${style[0].toUpperCase()}${style.slice(1)}`), selected: style === state.lineStyle })), onPick: value => change('lineStyle', value) }),
      colorPick({ id: 'lineColor', label: t('fmtLineColor'), icon: 'graph-Edit', value: state.lineColor, t, onPick: value => change('lineColor', value) })
    ];
  }

  const groups = {
    // The style of the paragraph at the selection; a mixed selection shows an empty value.
    blockStyle: ({ state, t, change, options }) => {
      const current = options.blockStyles.find(([value]) => value === state.blockStyle);
      return [pick({ id: 'blockStyle', label: t('fmtBlockStyle'), value: current ? t(current[1]) : '', wide: true,
        options: options.blockStyles.map(([value, key]) => ({ value, label: t(key), selected: value === state.blockStyle })), onPick: value => change('blockStyle', value) })];
    },
    table: ({ state, t, change, options }) => [
      pick({ id: 'tableAction', label: t('fmtTable'), icon: 'common-table', value: t('fmtTable'), wide: true,
        options: options.tableActions.map(entry => (entry ? { value: entry[0], label: t(entry[1]), selected: false } : { separator: true })), onPick: value => change('tableAction', value) }),
      colorPick({ id: 'cellFill', label: t('fmtCellFill'), icon: 'common-fill', value: state.cellFill || 'transparent', none: t('fmtNoFill'), t, onPick: value => change('cellFill', value) })
    ],
    text: ({ state, t, change, options }) => [
      ...[['bold', 'fmtBold', 'B'], ['italic', 'fmtItalic', 'I'], ['underline', 'fmtUnderline', 'U'], ['strike', 'fmtStrike', 'S']].map(([key, label, text]) =>
        toggle({ id: key, label: t(label), text, pressed: state[key], onToggle: () => change(key, !state[key]) })),
      // Subscript and superscript exclude each other; pressing the active one returns to normal text.
      ...[['sub', 'fmtSubscript'], ['super', 'fmtSuperscript']].map(([value, label]) => {
        const button = toggle({ id: `script-${value}`, label: t(label), text: 'x', pressed: state.script === value, onToggle: () => change('script', state.script === value ? 'none' : value, `script-${value}`) });
        button.firstChild.append(el(value === 'sub' ? 'sub' : 'sup', { text: '2' }));
        return button;
      }),
      sizeCombo({ id: 'fontSize', label: t('fmtFontSize'), value: state.fontSize, sizes: options.fontSizes, ...options.fontSizeRange, onCommit: value => change('fontSize', value) }),
      el('div', { class: 'step-pair' }, [
        sizeStepButton({ id: 'fontDecrease', label: t('fmtFontDecrease'), icon: 'common-fontDecrease', value: state.fontSize, sizes: options.fontSizes, direction: -1, ...options.fontSizeRange, onCommit: value => change('fontSize', value) }),
        sizeStepButton({ id: 'fontIncrease', label: t('fmtFontIncrease'), icon: 'common-fontIncrease', value: state.fontSize, sizes: options.fontSizes, direction: 1, ...options.fontSizeRange, onCommit: value => change('fontSize', value) })
      ]),
      pick({ id: 'fontFamily', label: t('fmtFontFamily'), value: state.fontFamily, wide: true, options: options.fontFamilies.map(font => ({ value: font, label: font, selected: font === state.fontFamily, style: { fontFamily: font } })), onPick: value => change('fontFamily', value) }),
      colorPick({ id: 'color', label: t('fmtTextColor'), value: state.color, t, onPick: value => change('color', value) })
    ],
    shape: ({ state, t, change, live, options }) => [
      ...lineControls({ state, t, change, options }),
      colorPick({ id: 'fill', label: t('fmtFill'), icon: 'common-fill', value: state.fill, none: t('fmtNoFill'), t, onPick: value => change('fill', value) }),
      iconToggle({ id: 'shadow', label: t('fmtShadow'), icon: 'common-shadow', pressed: state.shadow, onToggle: () => change('shadow', !state.shadow) }),
      iconToggle({ id: 'keepRatio', label: t('fmtKeepRatio'), icon: 'common-keepRatio', pressed: state.keepRatio, onToggle: () => change('keepRatio', !state.keepRatio) }),
      opacitySlider({ property: 'opacity', state, t, change, live })
    ],
    align: ({ state, t, change }) => [['left', 'fmtAlignLeft', 'slides-alignLeft'], ['center', 'fmtAlignCenter', 'slides-alignCenter'], ['right', 'fmtAlignRight', 'slides-alignRight'], ['justify', 'fmtAlignJustify', 'common-alignJustify']]
      .map(([value, label, icon]) => iconToggle({ id: `align-${value}`, label: t(label), icon, pressed: state.align === value, onToggle: () => change('align', value, `align-${value}`) })),
    valign: ({ state, t, change }) => [['top', 'fmtAlignTop', 'common-alignTop'], ['middle', 'fmtAlignMiddle', 'common-alignMiddle'], ['bottom', 'fmtAlignBottom', 'common-alignBottom']]
      .map(([value, label, icon]) => iconToggle({ id: `valign-${value}`, label: t(label), icon, pressed: state.valign === value, onToggle: () => change('valign', value, `valign-${value}`) })),
    lists: ({ state, t, change }) => [['bulleted', 'fmtBulleted', 'graph-List'], ['numbered', 'fmtNumbered', 'graph-ListOrdered']]
      .map(([value, label, icon]) => iconToggle({ id: `list-${value}`, label: t(label), icon, pressed: state.list === value, onToggle: () => change('list', state.list === value ? 'none' : value, `list-${value}`) })),
    link: ({ state, t, change, action, options }) => [linkPopover({ state, t, change, action, options })],
    // Arrange: actions the app performs on the selected object's stacking order.
    arrange: ({ t, action }) => [
      actionButton({ id: 'bringToFront', label: t('bringToFront'), icon: 'common-bringFront', onAction: () => action('bringToFront') }),
      actionButton({ id: 'sendToBack', label: t('sendToBack'), icon: 'common-sendBack', onAction: () => action('sendToBack') })
    ],
    image: ({ state, t, change, action, live, options }) => [
      actionButton({ id: 'replaceImage', label: t('fmtReplaceImage'), icon: 'slides-image', onAction: () => action('replaceImage') }),
      iconToggle({ id: 'crop', label: t('fmtCrop'), icon: 'slides-crop', pressed: state.crop, onToggle: () => change('crop', !state.crop) }),
      iconToggle({ id: 'keepRatio', label: t('fmtKeepRatio'), icon: 'common-keepRatio', pressed: state.keepRatio, onToggle: () => change('keepRatio', !state.keepRatio) }),
      ...lineControls({ state, t, change, options }),
      iconToggle({ id: 'shadow', label: t('fmtShadow'), icon: 'common-shadow', pressed: state.shadow, onToggle: () => change('shadow', !state.shadow) }),
      opacitySlider({ property: 'imageOpacity', state, t, change, live })
    ]
  };
  const groupLabels = { table: 'fmtTable', blockStyle: 'fmtBlockStyle', arrange: 'fmtArrange', text: 'fmtText', shape: 'fmtShape', align: 'fmtAlign', valign: 'fmtVAlign', lists: 'fmtLists', link: 'fmtLink', image: 'fmtImage' };

  // Renders the requested groups into `container`, separated, and keeps focus on the control that changed.
  function render(container, { groups: names, state, t, onChange, options = {} }) {
    const settings = { ...defaults, ...options };
    const draw = focusId => {
      // change(property, value) or change({ property: value, ... }) for several values applied together.
      const change = (property, value, focusControl) => {
        const values = typeof property === 'object' ? property : { [property]: value };
        for (const [key, next] of Object.entries(values)) { state[key] = next; onChange?.(key, next); }
        draw(focusControl || (typeof property === 'string' ? property : undefined));
      };
      const live = (property, value) => { state[property] = value; onChange?.(property, value); };
      const action = (name, value) => onChange?.(name, value);
      const parts = [];
      names.forEach((name, index) => {
        if (index) parts.push(el('span', { class: 'separator', 'aria-hidden': 'true' }));
        parts.push(el('div', { class: 'format-group', 'data-group': name, role: 'group', 'aria-label': t(groupLabels[name]) }, groups[name]({ state, t, change, action, live, options: settings })));
      });
      const hadFocus = container.contains(document.activeElement);
      container.replaceChildren(...parts);
      // Keyboard users keep their place; mouse users keep the focus (and text selection) in the editing surface.
      if (focusId && hadFocus) container.querySelector(`[data-control="${focusId}"]`)?.focus();
    };
    draw();
    return { refresh: () => draw() };
  }

  return Object.freeze({ render, palette, defaults, groupNames: Object.keys(groups) });
})();
