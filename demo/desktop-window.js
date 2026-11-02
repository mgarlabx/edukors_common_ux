// In the desktop app the page's title bar is the window's title bar (desktop/main.mjs, "Title bar"): the system's
// own bar is hidden, its real buttons sit over this one (macOS: traffic lights on the left; Windows and Linux:
// minimize, maximize, and close on the right), and dragging the bar moves the window. This file leaves room for those
// buttons, hides the decorative ones, and tells the host the bar's height and colors whenever the font size or the
// theme changes. In a browser it does nothing, and the decorative controls stay.
(() => {
  const host = globalThis.EdukorsDesktop?.window;
  if (!host) return;
  const root = document.documentElement, bar = document.querySelector('.titlebar');
  const platform = host.platform === 'darwin' ? 'mac' : host.platform === 'win32' ? 'windows' : 'linux';
  root.classList.add('desktop', `platform-${platform}`);

  const hex = value => {
    const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(value || '');
    if (!match || match[4] === '0') return null;
    return `#${match.slice(1, 4).map(n => Number(n).toString(16).padStart(2, '0')).join('')}`;
  };
  // The bar's own background, or that of the first ancestor that paints one.
  const background = () => {
    for (let node = bar; node; node = node.parentElement) { const color = hex(getComputedStyle(node).backgroundColor); if (color) return color; }
    return hex(getComputedStyle(document.body).backgroundColor) || '#ffffff';
  };

  let last = '';
  function report() {
    const next = { height: Math.round(bar.getBoundingClientRect().height), color: background(), symbolColor: hex(getComputedStyle(bar.querySelector('h1')).color) || '#64718e' };
    const key = JSON.stringify(next);
    if (key !== last) { last = key; host.setTitleBar(next); }
  }
  new ResizeObserver(report).observe(bar);
  // Theme and font size live on <html> (data-theme, --font-scale); the system theme can change at any time.
  new MutationObserver(() => requestAnimationFrame(report)).observe(root, { attributes: true, attributeFilter: ['data-theme', 'style', 'lang'] });
  host.onState(({ fullScreen }) => root.classList.toggle('is-full-screen', !!fullScreen));
  report();
})();
