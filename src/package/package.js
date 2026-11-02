// Edukors document package layer (see docs/document-package.md).
// A document is a ZIP organized like DOCX/PPTX (Open Packaging Conventions): an XML skeleton ([Content_Types].xml,
// relationships, docProps) around JSON content parts. This layer handles bytes in and bytes out and never touches the
// file system, so it works the same under Electron, Tauri, or a browser; the host reads and writes the files
// (writing to a temporary file and renaming it over the target is the host's job).
//
//   const bytes = await EdukorsPackage.write({
//     app: { name: 'common', version: 'v.26.11.01' },
//     main: { name: 'common/document.json', contentType: EdukorsPackage.contentType('common', 'document'), content: { objects: [] } },
//     parts: [{ name: 'common/media/image1.png', contentType: 'image/png', content: pngBytes }],
//     properties: { title: 'Untitled', creator: 'Ana', language: 'pt-BR' }     // language belongs to the content
//   });
//   const doc = await EdukorsPackage.read(bytes);   // doc.json(doc.main.name), doc.relationships(...), doc.orphans, ...
//
// Parts reach each other only through relationships (`relationships` on a part: { id?, type, target }), never by raw
// paths. Reading is strict: unsafe or malformed packages throw a PackageError with a `code`.
(() => {
  const NS_PACKAGE_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const NS_TYPES = 'http://schemas.openxmlformats.org/package/2006/content-types';
  const REL = Object.freeze({
    main: 'https://edukors.org/package/relationships/main',
    core: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
    app: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties',
    thumbnail: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail'
  });
  const TYPE = Object.freeze({
    rels: 'application/vnd.openxmlformats-package.relationships+xml',
    core: 'application/vnd.openxmlformats-package.core-properties+xml',
    app: 'application/vnd.openxmlformats-officedocument.extended-properties+xml',
    xml: 'application/xml',
    json: 'application/json'
  });
  const EXTENSIONS = Object.freeze({ graph: '.egrx', slides: '.eslx', text: '.etex', common: '.ecmx' });
  const LIMITS = Object.freeze({ maxEntries: 5000, maxEntryBytes: 512 * 2 ** 20, maxTotalBytes: 2 ** 30, maxRatio: 1000, ratioFloor: 2 ** 20 });
  // Formats that are already compressed are stored; everything else is deflated.
  const STORED = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'woff', 'woff2', 'mp3', 'm4a', 'mp4', 'webm', 'zip']);

  class PackageError extends Error {
    constructor(code, message) { super(message); this.name = 'PackageError'; this.code = code; }
  }
  const fail = (code, message) => { throw new PackageError(code, message); };

  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const lower = text => text.toLowerCase();
  const extensionOf = name => { const base = name.slice(name.lastIndexOf('/') + 1), dot = base.lastIndexOf('.'); return dot >= 0 ? lower(base.slice(dot + 1)) : ''; };

  // ---------- Part names ----------
  // Relative, case-insensitively unique, without "." or ".." segments, and portable across macOS, Windows, and Linux.
  const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
  function partNameProblem(name) {
    if (typeof name !== 'string' || !name) return 'is empty';
    if (name.length > 240) return 'is longer than 240 characters';
    if (name.startsWith('/') || name.endsWith('/')) return 'must not start or end with "/"';
    if (/[\u0000-\u001f\u007f\\<>:"|?*]/.test(name)) return 'contains a character that is not portable';
    if (/%(2f|5c)/i.test(name)) return 'contains an encoded path separator';
    for (const segment of name.split('/')) {
      if (!segment) return 'has an empty segment';
      if (segment === '.' || segment === '..') return 'has a "." or ".." segment';
      if (segment.length > 120) return 'has a segment longer than 120 characters';
      if (/[. ]$/.test(segment)) return 'has a segment ending with a dot or space';
      if (RESERVED.test(segment)) return `uses the reserved name "${segment}"`;
    }
    return '';
  }
  function validatePartName(name) {
    const problem = partNameProblem(name);
    if (problem) fail('part-name', `Invalid part name "${String(name).slice(0, 80)}": it ${problem}.`);
    return name;
  }
  // Resolves a relationship target against the directory of the part it belongs to ('' for the package root).
  function resolveTarget(baseDir, target) {
    if (typeof target !== 'string' || !target) fail('relationship', 'A relationship has no target.');
    const parts = target.startsWith('/') ? [] : baseDir.split('/').filter(Boolean);
    for (const segment of target.replace(/^\//, '').split('/')) {
      if (segment === '..') { if (!parts.length) fail('relationship', `Relationship target "${target}" leaves the package.`); parts.pop(); }
      else if (segment !== '.') parts.push(segment);
    }
    return validatePartName(parts.join('/'));
  }
  const dirOf = name => name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : '';
  const relsNameFor = name => `${dirOf(name) ? `${dirOf(name)}/` : ''}_rels/${name.slice(name.lastIndexOf('/') + 1)}.rels`;

  // ---------- XML (a small, strict subset: no DOCTYPE and no entities, so there is nothing to expand) ----------
  const esc = value => String(value).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const xmlDoc = body => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${body}`;

  function parseXml(text) {
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) fail('xml', 'XML with a DOCTYPE or entity declaration is not accepted.');
    let i = 0;
    const unescape = raw => raw.replace(/&(#x[\da-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (match, ref) => {
      if (ref[0] === '#') { const code = ref[1].toLowerCase() === 'x' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''; }
      return { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[ref.toLowerCase()];
    });
    const root = { name: '#root', localName: '#root', attrs: {}, children: [], text: '' };
    const stack = [root];
    while (i < text.length) {
      const lt = text.indexOf('<', i);
      if (lt < 0) { stack[stack.length - 1].text += unescape(text.slice(i)); break; }
      if (lt > i) stack[stack.length - 1].text += unescape(text.slice(i, lt));
      if (text.startsWith('<!--', lt)) { const end = text.indexOf('-->', lt + 4); if (end < 0) fail('xml', 'Unterminated comment.'); i = end + 3; continue; }
      if (text.startsWith('<![CDATA[', lt)) { const end = text.indexOf(']]>', lt); if (end < 0) fail('xml', 'Unterminated CDATA.'); stack[stack.length - 1].text += text.slice(lt + 9, end); i = end + 3; continue; }
      if (text.startsWith('<?', lt)) { const end = text.indexOf('?>', lt); if (end < 0) fail('xml', 'Unterminated declaration.'); i = end + 2; continue; }
      const end = text.indexOf('>', lt);
      if (end < 0) fail('xml', 'Unterminated tag.');
      const tag = text.slice(lt + 1, end);
      i = end + 1;
      if (tag[0] === '/') {
        const open = stack.pop();
        if (!stack.length || open.name !== tag.slice(1).trim()) fail('xml', 'Mismatched closing tag.');
        continue;
      }
      const selfClosing = tag.endsWith('/');
      const match = /^([^\s/>]+)([\s\S]*?)\/?$/.exec(tag);
      if (!match) fail('xml', 'Malformed tag.');
      const element = { name: match[1], localName: match[1].slice(match[1].indexOf(':') + 1), attrs: {}, children: [], text: '' };
      const attrPattern = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
      let attr, consumed = 0;
      while ((attr = attrPattern.exec(match[2]))) { element.attrs[attr[1]] = unescape(attr[3] ?? attr[4]); consumed += attr[0].length; }
      if (match[2].replace(/\s/g, '').length !== consumed) fail('xml', 'Malformed attributes.');
      stack[stack.length - 1].children.push(element);
      if (!selfClosing) stack.push(element);
    }
    if (stack.length !== 1) fail('xml', 'Unclosed element.');
    if (root.children.length !== 1) fail('xml', 'An XML document needs exactly one root element.');
    return root.children[0];
  }
  const childrenNamed = (node, localName) => node.children.filter(child => child.localName === localName);

  // ---------- CRC32 and deflate ----------
  const CRC_TABLE = (() => { const table = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; } return table; })();
  function crc32(bytes) { let crc = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8); return (crc ^ 0xFFFFFFFF) >>> 0; }

  async function pump(stream, limit) {
    const reader = stream.getReader(), chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) { await reader.cancel(); fail('limit', 'A part is larger than its declared size or the allowed size.'); }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
    return out;
  }
  const through = (bytes, transform, limit) => pump(new Blob([bytes]).stream().pipeThrough(transform), limit);
  const deflate = bytes => through(bytes, new CompressionStream('deflate-raw'), Infinity);
  const inflate = (bytes, limit) => through(bytes, new DecompressionStream('deflate-raw'), limit).catch(error => { throw error instanceof PackageError ? error : new PackageError('zip', 'A compressed part is damaged.'); });

  // ---------- ZIP ----------
  function dosTime(date) {
    const d = new Date(Math.max(date.getTime(), Date.UTC(1980, 0, 1, 0, 0, 0)));
    return { time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1), date: ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate() };
  }

  async function zipWrite(entries, modified) {
    if (entries.length > LIMITS.maxEntries) fail('limit', 'Too many parts.');
    const stamp = dosTime(modified);
    const records = [];
    let offset = 0, total = 0;
    const blocks = [];
    for (const entry of entries) {
      const name = encoder.encode(entry.name), crc = crc32(entry.bytes);
      const stored = STORED.has(extensionOf(entry.name));
      const body = stored ? entry.bytes : await deflate(entry.bytes);
      const useStored = stored || body.length >= entry.bytes.length;
      const data = useStored ? entry.bytes : body, method = useStored ? 0 : 8;
      total += entry.bytes.length;
      if (entry.bytes.length > LIMITS.maxEntryBytes || total > LIMITS.maxTotalBytes) fail('limit', 'The document is too large.');
      const local = new Uint8Array(30 + name.length), view = new DataView(local.buffer);
      view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x0800, true); view.setUint16(8, method, true);
      view.setUint16(10, stamp.time, true); view.setUint16(12, stamp.date, true); view.setUint32(14, crc, true);
      view.setUint32(18, data.length, true); view.setUint32(22, entry.bytes.length, true); view.setUint16(26, name.length, true);
      local.set(name, 30);
      blocks.push(local, data);
      records.push({ name, crc, method, csize: data.length, usize: entry.bytes.length, offset });
      offset += local.length + data.length;
    }
    const centralStart = offset;
    for (const record of records) {
      const central = new Uint8Array(46 + record.name.length), view = new DataView(central.buffer);
      view.setUint32(0, 0x02014b50, true); view.setUint16(4, 20, true); view.setUint16(6, 20, true); view.setUint16(8, 0x0800, true); view.setUint16(10, record.method, true);
      view.setUint16(12, stamp.time, true); view.setUint16(14, stamp.date, true); view.setUint32(16, record.crc, true);
      view.setUint32(20, record.csize, true); view.setUint32(24, record.usize, true); view.setUint16(28, record.name.length, true);
      view.setUint32(42, record.offset, true);
      central.set(record.name, 46);
      blocks.push(central);
      offset += central.length;
    }
    const end = new Uint8Array(22), view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true); view.setUint16(8, records.length, true); view.setUint16(10, records.length, true);
    view.setUint32(12, offset - centralStart, true); view.setUint32(16, centralStart, true);
    blocks.push(end);
    const out = new Uint8Array(offset + 22);
    let at = 0;
    for (const block of blocks) { out.set(block, at); at += block.length; }
    return out;
  }

  // Reads the central directory, then each part, enforcing the limits while inflating (never trusting declared sizes).
  async function zipRead(bytes, limits) {
    if (!(bytes instanceof Uint8Array)) fail('zip', 'The document must be given as bytes.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
      if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { eocd = i; break; }
    }
    if (eocd < 0) fail('zip', 'This is not a ZIP package.');
    const count = view.getUint16(eocd + 10, true), cdSize = view.getUint32(eocd + 12, true), cdOffset = view.getUint32(eocd + 16, true);
    if (view.getUint16(eocd + 4, true) || view.getUint16(eocd + 6, true) || count === 0xFFFF || cdSize === 0xFFFFFFFF || cdOffset === 0xFFFFFFFF) fail('zip', 'Multi-disk and ZIP64 packages are not supported.');
    if (count > limits.maxEntries) fail('limit', 'The package has too many parts.');
    if (cdOffset + cdSize > eocd) fail('zip', 'The central directory is damaged.');
    const entries = [];
    let at = cdOffset;
    for (let n = 0; n < count; n++) {
      if (at + 46 > eocd || view.getUint32(at, true) !== 0x02014b50) fail('zip', 'The central directory is damaged.');
      const flags = view.getUint16(at + 8, true), method = view.getUint16(at + 10, true), crc = view.getUint32(at + 16, true);
      const csize = view.getUint32(at + 20, true), usize = view.getUint32(at + 24, true);
      const nameLength = view.getUint16(at + 28, true), extraLength = view.getUint16(at + 30, true), commentLength = view.getUint16(at + 32, true);
      const offset = view.getUint32(at + 42, true);
      if (at + 46 + nameLength + extraLength + commentLength > eocd) fail('zip', 'The central directory is damaged.');
      let name;
      try { name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength)); } catch { fail('zip', 'A part name is not valid UTF-8.'); }
      at += 46 + nameLength + extraLength + commentLength;
      if (flags & 1) fail('zip', 'Encrypted packages are not supported.');
      if (csize === 0xFFFFFFFF || usize === 0xFFFFFFFF || offset === 0xFFFFFFFF) fail('zip', 'ZIP64 packages are not supported.');
      if (name.endsWith('/')) continue; // folder entry
      if (method !== 0 && method !== 8) fail('zip', 'A part uses an unsupported compression method.');
      entries.push({ name, method, crc, csize, usize, offset });
    }
    let total = 0;
    const out = [];
    for (const entry of entries) {
      total += entry.usize;
      if (entry.usize > limits.maxEntryBytes || total > limits.maxTotalBytes) fail('limit', 'The document is larger than the allowed size.');
      if (entry.usize > limits.ratioFloor && entry.usize / Math.max(1, entry.csize) > limits.maxRatio) fail('limit', 'A part compresses suspiciously well.');
      const o = entry.offset;
      if (o + 30 > cdOffset || view.getUint32(o, true) !== 0x04034b50) fail('zip', 'A part header is damaged.');
      const nameLength = view.getUint16(o + 26, true), extraLength = view.getUint16(o + 28, true), start = o + 30 + nameLength + extraLength;
      if (start + entry.csize > cdOffset) fail('zip', 'A part runs past the end of the package.');
      let localName;
      try { localName = decoder.decode(bytes.subarray(o + 30, o + 30 + nameLength)); } catch { fail('zip', 'A part name is not valid UTF-8.'); }
      if (localName !== entry.name) fail('zip', 'A part header does not match the directory.');
      const raw = bytes.subarray(start, start + entry.csize);
      const data = entry.method === 0 ? raw : await inflate(raw, entry.usize);
      if (data.length !== entry.usize) fail('zip', 'A part is not the size the directory says.');
      if (crc32(data) !== entry.crc) fail('zip', `Part "${entry.name}" is damaged (checksum mismatch).`);
      out.push({ name: entry.name, bytes: data });
    }
    return out;
  }

  // ---------- Building ----------
  const toBytes = content => content instanceof Uint8Array ? content : encoder.encode(typeof content === 'string' ? content : `${JSON.stringify(content)}\n`);
  const w3cdtf = value => new Date(value).toISOString().replace(/\.\d{3}Z$/, 'Z');

  function relationshipsXml(list) {
    const used = new Set(list.map(rel => rel.id).filter(Boolean));
    let n = 0;
    const items = list.map(rel => {
      let id = rel.id;
      if (!id) { do id = `rId${++n}`; while (used.has(id)); used.add(id); }
      return `<Relationship Id="${esc(id)}" Type="${esc(rel.type)}" Target="${esc(rel.target)}"${rel.external ? ' TargetMode="External"' : ''}/>`;
    });
    return xmlDoc(`<Relationships xmlns="${NS_PACKAGE_REL}">${items.join('')}</Relationships>`);
  }

  async function write(doc) {
    const { app, main, parts = [], properties = {}, thumbnail } = doc || {};
    if (!app?.name || !/^[a-z][a-z0-9-]*$/.test(app.name)) fail('input', 'The app name must be lowercase letters, digits, or hyphens.');
    if (!main?.name || !main.contentType) fail('input', 'The main part needs a name and a content type.');
    const modified = properties.modified ? new Date(properties.modified) : new Date();
    const created = properties.created ? new Date(properties.created) : modified;
    const sources = [main, ...parts];
    if (thumbnail) sources.push({ name: 'docProps/thumbnail.png', contentType: 'image/png', content: thumbnail });
    const seen = new Set();
    for (const part of sources) {
      validatePartName(part.name);
      if (!part.contentType) fail('input', `Part "${part.name}" needs a content type.`);
      if (seen.has(lower(part.name))) fail('part-name', `Two parts are named "${part.name}" (names ignore case).`);
      seen.add(lower(part.name));
      if (/^_rels\//i.test(part.name) || /(^|\/)_rels\//i.test(part.name) || /^\[content_types\]/i.test(part.name) || /^docprops\/(core|app)\.xml$/i.test(part.name)) fail('part-name', `"${part.name}" is reserved for the package.`);
    }
    const entries = [];
    const add = (name, content) => entries.push({ name, bytes: toBytes(content) });
    const types = new Map(); // part name → content type, for every part that is not an XML skeleton file
    const rootRels = [{ type: REL.main, target: main.name }, { type: REL.core, target: 'docProps/core.xml' }, { type: REL.app, target: 'docProps/app.xml' }];
    if (thumbnail) rootRels.push({ type: REL.thumbnail, target: 'docProps/thumbnail.png' });
    const coreXml = xmlDoc(`<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${properties.title ? `<dc:title>${esc(properties.title)}</dc:title>` : ''}${properties.creator ? `<dc:creator>${esc(properties.creator)}</dc:creator>` : ''}${properties.language ? `<dc:language>${esc(properties.language)}</dc:language>` : ''}<dcterms:created xsi:type="dcterms:W3CDTF">${w3cdtf(created)}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${w3cdtf(modified)}</dcterms:modified></cp:coreProperties>`);
    const appXml = xmlDoc(`<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Edukors ${esc(app.name)}</Application>${app.version ? `<AppVersion>${esc(app.version)}</AppVersion>` : ''}</Properties>`);

    // Content types: a Default per extension (the most common type for it), an Override for every part that differs.
    const typed = [...sources.map(p => [p.name, p.contentType]), ['docProps/core.xml', TYPE.core], ['docProps/app.xml', TYPE.app]];
    const byExtension = new Map();
    for (const [name, type] of typed) { const ext = extensionOf(name); if (!ext) continue; const counts = byExtension.get(ext) || new Map(); counts.set(type, (counts.get(type) || 0) + 1); byExtension.set(ext, counts); }
    const defaults = new Map([['rels', TYPE.rels], ['xml', TYPE.xml]]);
    for (const [ext, counts] of byExtension) if (!defaults.has(ext)) defaults.set(ext, [...counts].sort((a, b) => b[1] - a[1])[0][0]);
    const overrides = typed.filter(([name, type]) => defaults.get(extensionOf(name)) !== type);
    for (const [name, type] of typed) types.set(name, type);
    const typesXml = xmlDoc(`<Types xmlns="${NS_TYPES}">${[...defaults].map(([ext, type]) => `<Default Extension="${esc(ext)}" ContentType="${esc(type)}"/>`).join('')}${overrides.map(([name, type]) => `<Override PartName="/${esc(name)}" ContentType="${esc(type)}"/>`).join('')}</Types>`);

    add('[Content_Types].xml', typesXml);
    add('_rels/.rels', relationshipsXml(rootRels));
    add('docProps/core.xml', coreXml);
    add('docProps/app.xml', appXml);
    if (thumbnail) add('docProps/thumbnail.png', thumbnail);
    for (const part of [main, ...parts]) {
      add(part.name, part.content ?? '');
      if (part.relationships?.length) {
        const dir = dirOf(part.name);
        for (const rel of part.relationships) if (!rel.external) { const resolved = resolveTarget(dir, rel.target); if (!seen.has(lower(resolved))) fail('relationship', `Part "${part.name}" points to "${rel.target}", which is not in the document.`); }
        add(relsNameFor(part.name), relationshipsXml(part.relationships));
      }
    }
    return zipWrite(entries, modified);
  }

  // ---------- Reading ----------
  async function read(bytes, options = {}) {
    const limits = { ...LIMITS, ...options.limits };
    const raw = await zipRead(bytes, limits);
    const files = new Map();
    for (const { name, bytes: data } of raw) {
      if (name !== '[Content_Types].xml') validatePartName(name);
      const key = lower(name);
      if (files.has(key)) fail('part-name', `Two parts are named "${name}" (names ignore case).`);
      files.set(key, { name, bytes: data });
    }
    const typesFile = files.get('[content_types].xml');
    if (!typesFile) fail('package', 'The package has no [Content_Types].xml.');
    const typesRoot = parseXml(decoder.decode(typesFile.bytes));
    if (typesRoot.localName !== 'Types') fail('package', '[Content_Types].xml is not a content type list.');
    const defaults = new Map(), overrides = new Map();
    for (const node of typesRoot.children) {
      if (node.localName === 'Default' && node.attrs.Extension) defaults.set(lower(node.attrs.Extension), node.attrs.ContentType);
      if (node.localName === 'Override' && node.attrs.PartName) overrides.set(lower(node.attrs.PartName.replace(/^\//, '')), node.attrs.ContentType);
    }
    const typeOf = name => overrides.get(lower(name)) || defaults.get(extensionOf(name));
    const parts = new Map();
    for (const [key, file] of files) {
      if (key === '[content_types].xml') continue;
      const contentType = typeOf(file.name);
      if (!contentType) fail('package', `Part "${file.name}" has no content type.`);
      parts.set(key, { name: file.name, contentType, bytes: file.bytes });
    }

    const relationships = name => {
      const file = name === null ? parts.get('_rels/.rels') : parts.get(lower(relsNameFor(name)));
      if (!file) return [];
      const root = parseXml(decoder.decode(file.bytes));
      if (root.localName !== 'Relationships') fail('relationship', `"${file.name}" is not a relationship list.`);
      const base = name === null ? '' : dirOf(name), ids = new Set();
      return childrenNamed(root, 'Relationship').map(node => {
        const { Id: id, Type: type, Target: target, TargetMode: mode } = node.attrs;
        if (!id || !type || !target) fail('relationship', `A relationship in "${file.name}" is incomplete.`);
        if (ids.has(id)) fail('relationship', `"${file.name}" repeats the relationship id "${id}".`);
        ids.add(id);
        const external = mode === 'External';
        const resolved = external ? target : resolveTarget(base, target);
        if (!external && !parts.has(lower(resolved))) fail('relationship', `A relationship in "${file.name}" points to "${target}", which is missing.`);
        return { id, type, target: resolved, external };
      });
    };

    const rootRels = relationships(null);
    const mainRel = rootRels.find(rel => rel.type === REL.main && !rel.external);
    if (!mainRel) fail('package', 'The package does not say which part is the main one.');
    // Parts that no relationship reaches are not part of the document.
    const reached = new Set([lower('_rels/.rels')]);
    const queue = rootRels.filter(rel => !rel.external).map(rel => rel.target);
    while (queue.length) {
      const name = queue.pop(), key = lower(name);
      if (reached.has(key)) continue;
      reached.add(key);
      reached.add(lower(relsNameFor(name)));
      for (const rel of relationships(parts.get(key).name)) if (!rel.external) queue.push(rel.target);
    }
    const orphans = [...parts.values()].filter(part => !reached.has(lower(part.name))).map(part => part.name);

    const propertiesOf = () => {
      const result = {};
      const core = rootRels.find(rel => rel.type === REL.core && !rel.external);
      if (core) {
        const root = parseXml(decoder.decode(parts.get(lower(core.target)).bytes));
        for (const node of root.children) {
          if (node.localName === 'title') result.title = node.text;
          if (node.localName === 'creator') result.creator = node.text;
          if (node.localName === 'language') result.language = node.text;
          if (node.localName === 'created') result.created = node.text;
          if (node.localName === 'modified') result.modified = node.text;
        }
      }
      return result;
    };
    const appOf = () => {
      const rel = rootRels.find(item => item.type === REL.app && !item.external);
      if (!rel) return {};
      const root = parseXml(decoder.decode(parts.get(lower(rel.target)).bytes));
      return { name: childrenNamed(root, 'Application')[0]?.text, version: childrenNamed(root, 'AppVersion')[0]?.text };
    };
    const get = name => parts.get(lower(name)) || fail('part', `The document has no part "${name}".`);
    const mainPart = get(mainRel.target);
    return {
      main: { name: mainPart.name, contentType: mainPart.contentType },
      properties: propertiesOf(),
      app: appOf(),
      parts: [...parts.values()].map(({ name, contentType }) => ({ name, contentType })),
      orphans,
      relationships: name => relationships(name === undefined || name === null ? null : get(name).name),
      bytes: name => get(name).bytes,
      text: name => { try { return decoder.decode(get(name).bytes); } catch { fail('part', `Part "${name}" is not valid UTF-8 text.`); } },
      json: name => { try { return JSON.parse(decoder.decode(get(name).bytes)); } catch { fail('part', `Part "${name}" is not valid JSON.`); } }
    };
  }

  // A plain ZIP (not a document), read with the same limits and checks: entries as { name, bytes }, folders left out.
  // Used for things people add to an app as ZIP files, such as skills. Names are returned as they are: callers check them.
  async function unzip(bytes, limits = {}) {
    return zipRead(bytes, { ...LIMITS, ...limits });
  }

  globalThis.EdukorsPackage = Object.freeze({
    write, read, unzip, validatePartName, partNameProblem, resolveTarget, PackageError, REL, TYPE, LIMITS, EXTENSIONS,
    contentType: (app, part) => `application/vnd.edukors.${app}.${part}+json`,
    extensionFor: app => EXTENSIONS[app] || `.e${String(app).slice(0, 2)}x`
  });
})();
