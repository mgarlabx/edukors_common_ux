// The demo's document as a file: an Edukors package (docs/document-package.md) with the app name "common" and the
// extension .ecmx. This module only turns a document into bytes and back; the host reads and writes the file.
//
//   common/document.json                         the objects (kind, box, state), main part
//   common/media/image1.png, …                   pictures, each reached by a relationship from the main part
//   common/ai/conversations/<id>.json            the document's AI conversations (src/ai/ui/ai-conversations.js)
//
// Reading is strict and rebuilds everything it keeps (EdukorsSampleDocument.parseState): a file is untrusted input.
globalThis.EdukorsDocumentFile = (() => {
  const APP = 'common';
  const FORMAT = 'edukors.common.document';
  const VERSION = 1;
  const MAIN = `${APP}/document.json`;
  const REL_IMAGE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
  const MAX_PICTURE = 50 * 2 ** 20;
  const EXTENSION = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif', 'image/apng': 'png', 'image/bmp': 'bmp' };

  /** The bytes of a document's file. `name` becomes the document's title. */
  async function toBytes(doc, { name = '' } = {}) {
    const state = await EdukorsSampleDocument.exportState(doc);
    const parts = [], relationships = [];
    for (const [index, { rel, blob }] of state.images.entries()) {
      const type = blob.type || 'application/octet-stream';
      const file = `media/image${index + 1}.${EXTENSION[type] || 'img'}`;
      parts.push({ name: `${APP}/${file}`, contentType: type, content: new Uint8Array(await blob.arrayBuffer()) });
      relationships.push({ id: rel, type: REL_IMAGE, target: file });
    }
    const conversations = EdukorsAiConversations.toPackage(APP, EdukorsAiAssistant.conversationsOf(doc));
    parts.push(...conversations.parts);
    relationships.push(...conversations.relationships);
    const bytes = await EdukorsPackage.write({
      app: { name: APP, version: EdukorsAppConfig.version },
      main: { name: MAIN, contentType: EdukorsPackage.contentType(APP, 'document'), content: { format: FORMAT, version: VERSION, nextId: state.nextId, objects: state.objects }, relationships },
      parts,
      properties: { title: name || undefined }
    });
    return { bytes, committed: state.committed };
  }

  /**
   * Reads and checks a document file: { parsed, images, conversations, title }. Pass `parsed` and `images` to
   * EdukorsSampleDocument.adopt and `conversations` to EdukorsAiAssistant.restoreConversations.
   * Throws an Error whose message says what is wrong with the file.
   */
  async function fromBytes(bytes) {
    let pkg;
    try { pkg = await EdukorsPackage.read(bytes); } catch (error) { throw new Error(error?.message || 'This is not a valid document file.'); }
    if (pkg.app.name && pkg.app.name !== `Edukors ${APP}`) throw new Error('This document belongs to another EDUKORS app.');
    if (pkg.main.name !== MAIN || pkg.main.contentType !== EdukorsPackage.contentType(APP, 'document')) throw new Error('This document belongs to another EDUKORS app.');
    const raw = pkg.json(MAIN);
    if (raw?.format !== FORMAT) throw new Error('This is not a document of this app.');
    if (!Number.isInteger(raw.version) || raw.version > VERSION) throw new Error('This document was made by a newer version of the app.');
    const images = new Map();
    for (const rel of pkg.relationships(MAIN)) {
      if (rel.type !== REL_IMAGE || rel.external) continue;
      const part = pkg.parts.find(item => item.name === rel.target);
      const data = pkg.bytes(rel.target);
      if (data.length <= MAX_PICTURE && part?.contentType.startsWith('image/')) images.set(rel.id, new Blob([data], { type: part.contentType }));
    }
    return { parsed: EdukorsSampleDocument.parseState(raw, images), images, conversations: EdukorsAiConversations.fromPackage(pkg), title: pkg.properties.title || '' };
  }

  return Object.freeze({ APP, MAIN, FORMAT, VERSION, toBytes, fromBytes });
})();

// The demo's side of the shell's file commands (src/shell/files.js, src/shell/desktop-menu.js): how a document becomes
// bytes and back, how other formats are imported (demo/importers.js), how the page is exported, and Select All.
globalThis.EdukorsAppDocument = Object.freeze({
  toBytes: (doc, options) => EdukorsDocumentFile.toBytes(doc, options),
  fromBytes: bytes => EdukorsDocumentFile.fromBytes(bytes),
  adopt(doc, content) {
    EdukorsSampleDocument.adopt(doc, content.parsed, content.images);
    EdukorsAiAssistant.restoreConversations(doc, content.conversations || []);
  },
  exportPage: options => EdukorsSampleDocument.exportPage(options),
  // An importer's result is checked like a file being opened (parseState) before it reaches the page.
  async importFile({ format, name, extension, bytes, t }) {
    const convert = EdukorsImporters[format];
    if (typeof convert !== 'function') throw new Error(t('importUnknown'));
    const raw = await convert({ name, extension, bytes, t });
    return { parsed: EdukorsSampleDocument.parseState(raw, raw.images), images: raw.images };
  },
  selectAll: () => EdukorsSampleDocument.selectAll()
});
