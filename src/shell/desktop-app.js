// Desktop app only (does nothing in a browser):
// - Terms of use: until the person accepts the current version (EdukorsAppConfig.termsVersion), a modal shows the
//   app's terms (help.termsOfUse) with Decline (quits) and Accept. It has no close button and ignores Escape. Bump
//   termsVersion when the terms change, and everyone is asked again.
// - Updates: when the host finds a newer release (desktop/updates.mjs), a notice offers to open its download page.
(() => {
  const host = globalThis.EdukorsDesktop?.app;
  if (!host) return;
  const t = key => (EdukorsLanguages[document.documentElement.lang] || EdukorsLanguages.en).messages[key] || EdukorsLanguages.en.messages[key];
  const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');

  host.onUpdate(({ version, url }) => {
    EdukorsFileDialogs.toast({ t, message: fill(t('updateAvailable'), { version }), action: { label: t('updateDownload'), onClick: () => window.open(url, '_blank') }, duration: 30000 });
  });

  async function askTerms() {
    const version = EdukorsAppConfig.termsVersion, texts = EdukorsAppConfig.help?.termsOfUse;
    if (!version || !texts) return;
    const terms = await host.terms();
    if (terms.skip || terms.accepted === version) return;
    const lang = document.documentElement.lang;
    const dialog = document.createElement('dialog');
    dialog.className = 'file-dialog wide terms-dialog';
    dialog.setAttribute('aria-labelledby', 'terms-title');
    const header = document.createElement('header');
    header.className = 'settings-header';
    const title = Object.assign(document.createElement('h2'), { id: 'terms-title', textContent: t('termsOfUse') });
    header.append(title);
    const body = document.createElement('div');
    body.className = 'file-body help-body terms-body';
    body.tabIndex = 0;
    body.append(EdukorsMarkdown.render(texts[lang] || texts.en));
    const footer = document.createElement('div');
    footer.className = 'file-footer';
    const decline = Object.assign(document.createElement('button'), { type: 'button', className: 'small-button', textContent: t('termsDecline') });
    const accept = Object.assign(document.createElement('button'), { type: 'button', className: 'small-button primary', textContent: t('termsAccept') });
    footer.append(decline, accept);
    dialog.append(header, body, footer);
    document.body.append(dialog);
    dialog.addEventListener('cancel', event => event.preventDefault());
    decline.addEventListener('click', () => host.quit());
    accept.addEventListener('click', async () => {
      accept.disabled = decline.disabled = true;
      const result = await host.acceptTerms(version);
      if (result?.error) { accept.disabled = decline.disabled = false; return; }
      dialog.close();
      dialog.remove();
    });
    dialog.showModal();
    accept.focus();
  }
  askTerms();
})();
