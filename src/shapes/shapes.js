// Shared shape catalog and shape picker, modeled on the Slides editor (src/shared/manual.ts).
// EdukorsShapes.types: shape ids. EdukorsShapes.paths: SVG paths in a 100×100 box (rect, rounded, and ellipse have none:
// they are drawn with a rounded box). EdukorsShapes.icon(type, size) returns an SVG string for menus.
// EdukorsShapes.pick({ x, y, t, onPick, restoreFocus }) opens a grid of shapes at a point, kept inside the window.
globalThis.EdukorsShapes = (() => {
  const types = ['rect', 'rounded', 'ellipse', 'triangle', 'rightTriangle', 'diamond', 'pentagon', 'hexagon', 'arrow', 'star'];
  const paths = {
    triangle: 'M50 0L100 100H0Z', rightTriangle: 'M0 0L100 100H0Z', diamond: 'M50 0L100 50L50 100L0 50Z',
    pentagon: 'M50 0L100 38L81 100H19L0 38Z', hexagon: 'M25 0H75L100 50L75 100H25L0 50Z', arrow: 'M0 30H62V0L100 50L62 100V70H0Z',
    star: 'M50 0L61.8 35.4H99L68.8 57.3L80.3 92.7L50 70.8L19.7 92.7L31.2 57.3L1 35.4H38.2Z'
  };
  // Shapes that look right only when their box is square; the others keep a wide box.
  const square = type => !/^(rect|rounded|arrow)$/.test(type);

  function icon(type, size = 18) {
    const body = type === 'ellipse' ? '<ellipse cx="50" cy="50" rx="50" ry="50"/>'
      : paths[type] ? `<path d="${paths[type]}"/>`
      : `<rect y="15" width="100" height="70" rx="${type === 'rounded' ? 18 : 0}"/>`;
    return `<svg width="${size}" height="${size}" viewBox="-6 -6 112 112" fill="none" stroke="currentColor" stroke-width="8" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  let current = null;
  function close(restore = true) {
    if (!current) return;
    const { panel, previous, cleanup } = current;
    current = null; cleanup(); panel.remove();
    if (restore && previous?.isConnected) previous.focus({ preventScroll: true });
  }

  function pick({ x, y, t, onPick, restoreFocus }) {
    close(false);
    const panel = document.createElement('div');
    panel.className = 'shape-picker';
    panel.setAttribute('role', 'listbox');
    panel.setAttribute('aria-label', t('shapeType'));
    for (const type of types) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'shape-option';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-label', t(`shape_${type}`));
      button.title = t(`shape_${type}`);
      button.tabIndex = -1;
      button.innerHTML = icon(type, 26);
      button.addEventListener('mousedown', event => event.preventDefault());
      button.addEventListener('click', () => { close(true); onPick(type); });
      panel.append(button);
    }
    document.body.append(panel);
    const { offsetWidth: width, offsetHeight: height } = panel;
    panel.style.left = `${Math.max(4, Math.min(x, innerWidth - width - 4))}px`;
    panel.style.top = `${Math.max(4, Math.min(y, innerHeight - height - 4))}px`;
    const options = () => [...panel.querySelectorAll('.shape-option')];
    const columns = 5;
    panel.addEventListener('keydown', event => {
      const list = options(), index = list.indexOf(document.activeElement);
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
      if (event.key === 'Tab') { event.preventDefault(); close(true); return; }
      const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[event.key];
      if (step || event.key === 'Home' || event.key === 'End') {
        event.preventDefault(); event.stopPropagation();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : Math.max(0, Math.min(list.length - 1, index + step));
        list[next].focus();
      }
    });
    const onPointer = event => { if (!panel.contains(event.target)) close(false); };
    const onAway = () => close(false);
    document.addEventListener('pointerdown', onPointer, true);
    addEventListener('blur', onAway);
    addEventListener('resize', onAway);
    current = {
      panel, previous: restoreFocus || document.activeElement,
      cleanup: () => { document.removeEventListener('pointerdown', onPointer, true); removeEventListener('blur', onAway); removeEventListener('resize', onAway); }
    };
    options()[0].focus({ preventScroll: true });
  }

  return Object.freeze({ types, paths, square, icon, pick, close });
})();
