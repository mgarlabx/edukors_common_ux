// The one entry point of the shared shell. An app's page loads its configuration and then this script:
//
//   <script src="app-config.js"></script>                                       EdukorsAppConfig (name, version, help, file, …)
//   <script src="node_modules/edukors-common-ux/src/shell/boot.js"
//           data-app="document.js assistant.js"></script>                       the app's own scripts, in order
//
// It adds the shell's stylesheet and markup (title bar, toolbar, tabs, panels, status bar, Settings, Help), then loads
// Common's scripts, the app's scripts, and the shell scripts that need the app (menu, terms), all in this order. So
// when Common gains or reorders a file, no app has to change. Paths are resolved from this script's own address.
// The app's scripts must define EdukorsAppDocument (see docs/common-shell.md, "App integration") to save and open.
(() => {
  const self = document.currentScript;
  const src = new URL('..', self.src);            // …/src/
  const shell = new URL('.', self.src);           // …/src/shell/
  const config = globalThis.EdukorsAppConfig || {};
  const esc = text => String(text ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const logo = new URL('assets/edukors-logo.svg', shell).href;
  // The workspace shows the app's name under the logo, without "Edukors" (Common, Text Editor, …).
  const mark = config.watermark || String(config.name || '').replace(/^Edukors\s+/i, '');

  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = new URL('shell.css', shell).href;
  document.head.append(style);
  if (!document.querySelector('link[rel="icon"]')) document.head.insertAdjacentHTML('beforeend', '<link rel="icon" href="data:,">');

  document.body.insertAdjacentHTML('afterbegin', `
  <div class="app-shell">
    <header class="titlebar">
      <div class="window-controls" aria-hidden="true"><i></i><i></i><i></i></div>
      <h1>${esc(config.name)}</h1>
    </header>
    <nav class="toolbar" aria-label="Application actions">
      <a class="brand-link" href="https://edukors.org" target="_blank" rel="noopener noreferrer" aria-label="Edukors.org — opens in a new tab">
        <img class="toolbar-logo" src="${logo}" alt="Edukors.org">
        <span class="tooltip" aria-hidden="true">Edukors.org</span>
      </a>
      <div class="toolbar-group" id="file-actions"></div>
      <span class="separator document-action" aria-hidden="true" hidden></span>
      <div class="toolbar-group document-action" id="edit-actions" role="group" aria-label="Edit" hidden></div>
      <span class="separator document-action" aria-hidden="true" hidden></span>
      <div class="toolbar-group document-action" id="insert-actions" role="group" aria-label="Insert" hidden></div>
      <span class="separator" aria-hidden="true"></span>
      <div class="toolbar-group" id="utility-actions"></div>
      <div class="toolbar-group toolbar-end" id="panel-actions"></div>
    </nav>
    <div class="document-area">
      <div class="document-tabs" id="document-tabs" hidden>
        <nav class="document-tab-list" id="document-tab-list" aria-label="Open documents"></nav>
        <button class="tool" id="document-new-tab" type="button" aria-label="New document"><span class="tooltip" aria-hidden="true">New document</span></button>
      </div>
      <div class="context-slot" id="context-slot" inert><div class="context-clip"><section class="context-toolbar" id="context-toolbar" aria-label="Contextual toolbar"></section></div></div>
      <div class="document-body">
      <aside class="side-panel side-panel-left" id="sidebar-panel" aria-labelledby="sidebar-title" inert>
        <div class="panel-inner">
        <header class="panel-header"><h2 id="sidebar-title">Sidebar</h2><button class="tool panel-close" type="button" data-close-panel="sidebar" aria-label="Close"><span class="tooltip" aria-hidden="true">Close</span></button></header>
        <p class="panel-placeholder" id="sidebar-placeholder">Sidebar. The application supplies its content here.</p>
        </div>
      </aside>
      <main class="workspace" aria-label="No documents open">
        <div class="watermark" aria-hidden="true">
          <img src="${logo}" alt="">
          <p>${esc(mark)}</p>
        </div>
        <div class="document-placeholder" id="document-placeholder" hidden></div>
      </main>
      <aside class="side-panel assistant-panel" id="assistant-panel-side" aria-labelledby="assistant-panel-title" inert>
        <div class="panel-inner">
        <header class="panel-header"><h2 id="assistant-panel-title"><span id="assistant-panel-icon" aria-hidden="true"></span><span id="assistant-panel-label">AI assistant</span></h2><button class="tool panel-close" type="button" data-close-panel="assistant" aria-label="Close"><span class="tooltip" aria-hidden="true">Close</span></button></header>
        </div>
      </aside>
      </div>
    </div>
    <footer class="statusbar" aria-label="Application status"><span class="document-status" id="document-status" role="status"></span><span class="version">${esc(config.version)}</span></footer>
  </div>
  <dialog class="settings-dialog" id="settings-dialog" aria-labelledby="settings-title">
    <header class="settings-header"><h2 id="settings-title">Settings</h2><button class="tool" id="settings-close" type="button" aria-label="Close"><span class="tooltip" aria-hidden="true">Close</span></button></header>
    <div class="settings-layout">
      <nav class="settings-nav" aria-label="Settings sections">
        <button type="button" class="settings-nav-item" data-section="application" aria-current="page" aria-controls="application-panel"><span id="application-nav-label">Application</span></button>
        <button type="button" class="settings-nav-item" data-section="assistant" aria-controls="assistant-panel"><span id="assistant-nav-label">AI assistant</span></button>
      </nav>
      <div class="settings-body">
      <section id="application-panel" aria-labelledby="application-nav-label">
      <div class="preference"><div class="theme-label"><span id="appearance-label">Appearance</span></div><div class="theme-buttons" role="group" aria-labelledby="appearance-label"><button type="button" data-theme-option="system" aria-pressed="true">System</button><button type="button" data-theme-option="light" aria-pressed="false">Light</button><button type="button" data-theme-option="dark" aria-pressed="false">Dark</button></div></div>
      <div class="preference"><div class="font-size-label"><span id="font-size-label">Font size</span></div><div class="font-size-controls" role="group" aria-labelledby="font-size-label"><button type="button" id="font-decrease" aria-label="Decrease font size" aria-keyshortcuts="Meta+Shift+- Control+Shift+-">−</button><span class="font-percent"><input id="font-size" type="number" min="80" max="200" step="1" value="100" aria-labelledby="font-size-label" inputmode="numeric"><span aria-hidden="true">%</span></span><button type="button" id="font-increase" aria-label="Increase font size" aria-keyshortcuts="Meta+Shift++ Control+Shift++">+</button></div></div>
      <div class="preference"><label for="language"><span id="language-label">Interface language</span></label><select id="language"></select></div>
      <p class="preference-note" id="preference-note" role="status" hidden></p>
      </section>
      <section id="assistant-panel" aria-labelledby="assistant-nav-label" hidden></section>
      </div>
    </div>
  </dialog>
  <dialog class="help-dialog" id="help-dialog" aria-labelledby="help-title">
    <header class="settings-header"><h2 id="help-title">Help</h2><button class="tool" id="help-close" type="button" aria-label="Close"><span class="tooltip" aria-hidden="true">Close</span></button></header>
    <div class="help-tabs" role="tablist" aria-label="Help"><span class="help-version" id="help-version"></span></div>
    <div class="help-body" id="help-body" role="tabpanel" tabindex="0"></div>
  </dialog>`);

  const common = [
    'icons/icons.js', 'i18n/translations.js', 'markdown/markdown.js', 'qr/qr.js', 'shapes/shapes.js', 'format/format-controls.js',
    'menu/context-menu.js', 'files/file-dialogs.js', 'package/package.js',
    'shell/shell.js', 'shell/desktop-window.js', 'shell/settings.js', 'shell/help.js', 'shell/documents.js', 'shell/files.js', 'shell/panels.js',
    'ai/ui/ai-host.js', 'ai/ui/ai-ui.js', 'ai/ui/ai-store.js', 'ai/ui/ai-conversations.js', 'ai/ui/ai-settings.js', 'ai/ui/ai-assistant.js'
  ].map(path => new URL(path, src).href);
  const app = (self.dataset.app || '').split(/\s+/).filter(Boolean).map(path => new URL(path, document.baseURI).href);
  const after = ['shell/desktop-menu.js', 'shell/desktop-app.js'].map(path => new URL(path, src).href);
  // Dynamic scripts with async off run in the order they are added.
  for (const url of [...common, ...app, ...after]) {
    const script = document.createElement('script');
    script.src = url;
    script.async = false;
    document.body.append(script);
  }
})();
