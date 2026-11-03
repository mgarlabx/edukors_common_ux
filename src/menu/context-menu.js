// Shared context menu (right-click menu) for every app.
// EdukorsContextMenu.open({ x, y, label, items, restoreFocus }) shows a menu at the pointer, kept inside the window.
// items: [{ label, detail, title, shortcut, disabled, action }] or { separator: true }. Unavailable items are shown disabled.
// `detail` is a second, quieter line under the label (for example a folder); `title` is the item's tooltip.
// `className` adds a class to the menu (for a menu with its own width); `onClose` runs when the menu closes.
// Keyboard: arrows, Home, End, Enter or Space to run, Escape to close. A click outside, a scroll, a resize, or the window
// losing focus closes it. Focus returns to `restoreFocus` (or the element focused before) unless an action moved it.
globalThis.EdukorsContextMenu = (() => {
  let current = null;

  function close(restore = true) {
    if (!current) return;
    const { menu, previous, cleanup, onClose } = current;
    current = null;
    cleanup();
    menu.remove();
    onClose?.();
    if (restore && previous?.isConnected) previous.focus({ preventScroll: true });
  }

  function open({ x, y, label, items, restoreFocus, className, onClose }) {
    close(false);
    const menu = document.createElement('div');
    menu.className = `context-menu${className ? ` ${className}` : ''}`;
    menu.setAttribute('role', 'menu');
    if (label) menu.setAttribute('aria-label', label);
    for (const item of items) {
      if (item.separator) {
        const line = document.createElement('div');
        line.className = 'context-menu-separator';
        line.setAttribute('role', 'separator');
        menu.append(line);
        continue;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.tabIndex = -1;
      const text = document.createElement('span');
      if (item.detail) {
        text.className = 'context-menu-text';
        const name = document.createElement('span'), detail = document.createElement('small');
        name.textContent = item.label;
        detail.textContent = item.detail;
        text.append(name, detail);
      } else text.textContent = item.label;
      if (item.title) button.title = item.title;
      button.append(text);
      if (item.shortcut) {
        const keys = document.createElement('kbd');
        keys.textContent = item.shortcut;
        button.append(keys);
      }
      if (item.disabled) button.setAttribute('aria-disabled', 'true');
      // Pointer down does not take the focus, so a text selection survives until the action runs.
      button.addEventListener('mousedown', event => event.preventDefault());
      button.addEventListener('click', () => {
        if (item.disabled) return;
        close(true);
        item.action?.();
      });
      menu.append(button);
    }
    document.body.append(menu);
    const width = menu.offsetWidth, height = menu.offsetHeight;
    menu.style.left = `${Math.max(4, Math.min(x, innerWidth - width - 4))}px`;
    menu.style.top = `${Math.max(4, Math.min(y, innerHeight - height - 4))}px`;

    const entries = () => [...menu.querySelectorAll('[role="menuitem"]')];
    const onKey = event => {
      const list = entries(), index = list.indexOf(document.activeElement);
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
      if (event.key === 'Tab') { event.preventDefault(); close(true); return; }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
        list[next]?.focus();
      }
    };
    const onPointer = event => { if (!menu.contains(event.target)) close(false); };
    const onAway = () => close(false);
    menu.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer, true);
    addEventListener('blur', onAway);
    addEventListener('resize', onAway);
    document.addEventListener('scroll', onAway, true);
    current = {
      menu, previous: restoreFocus || document.activeElement, onClose,
      cleanup: () => {
        document.removeEventListener('pointerdown', onPointer, true);
        removeEventListener('blur', onAway);
        removeEventListener('resize', onAway);
        document.removeEventListener('scroll', onAway, true);
      }
    };
    // The first available item takes the focus so the menu works from the keyboard.
    (entries().find(entry => !entry.hasAttribute('aria-disabled')) || entries()[0])?.focus({ preventScroll: true });
  }

  return Object.freeze({ open, close, isOpen: () => !!current });
})();

// Menus and pickers close on a press outside them, seen by a pointerdown listener on the page. A press inside an
// <iframe> never reaches the page, so an app whose content is an iframe calls EdukorsMenus.pressIn(iframe) when the
// frame reports a press: every open menu, picker, and format-bar list closes as on any click outside it. The event
// carries edukorsRelayed: true, so the app's own pointerdown listeners can tell it from a real press.
globalThis.EdukorsMenus = Object.freeze({
  pressIn(element) {
    if (!element) return;
    const event = new PointerEvent('pointerdown', { bubbles: true, composed: true, button: 0, isPrimary: true });
    Object.defineProperty(event, 'edukorsRelayed', { value: true });
    element.dispatchEvent(event);
  }
});
