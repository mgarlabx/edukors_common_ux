// Tests for the document package layer. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import '../src/package/package.js';

const P = globalThis.EdukorsPackage;
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5]);
const sample = (extra = {}) => ({
  app: { name: 'common', version: 'v.26.11.01' },
  main: { name: 'common/document.json', contentType: P.contentType('common', 'document'), content: { objects: [{ id: 1, text: 'Olá, 世界' }] }, relationships: [{ id: 'rId1', type: 'https://edukors.org/package/relationships/image', target: 'media/image1.png' }] },
  parts: [{ name: 'common/media/image1.png', contentType: 'image/png', content: png }],
  properties: { title: 'Untitled & <co>', creator: 'Ana', language: 'pt-BR', created: '2026-11-01T10:00:00Z', modified: '2026-11-01T11:30:00Z' },
  ...extra
});
const rejects = (promise, code) => assert.rejects(promise, error => error instanceof P.PackageError && (!code || error.code === code), `expected PackageError ${code || ''}`);

test('round trip keeps content, properties, relationships, and bytes', async () => {
  const bytes = await P.write(sample());
  const doc = await P.read(bytes);
  assert.equal(doc.main.name, 'common/document.json');
  assert.equal(doc.main.contentType, 'application/vnd.edukors.common.document+json');
  assert.deepEqual(doc.json('common/document.json'), { objects: [{ id: 1, text: 'Olá, 世界' }] });
  assert.deepEqual(doc.bytes('common/media/image1.png'), png);
  assert.equal(doc.properties.title, 'Untitled & <co>');
  assert.equal(doc.properties.language, 'pt-BR');
  assert.equal(doc.properties.modified, '2026-11-01T11:30:00Z');
  assert.deepEqual(doc.app, { name: 'Edukors common', version: 'v.26.11.01' });
  assert.deepEqual(doc.relationships('common/document.json'), [{ id: 'rId1', type: 'https://edukors.org/package/relationships/image', target: 'common/media/image1.png', external: false }]);
  assert.deepEqual(doc.orphans, []);
});

test('content types: a Default per extension, an Override only where needed', async () => {
  const doc = await P.read(await P.write(sample()));
  const types = Object.fromEntries(doc.parts.map(p => [p.name, p.contentType]));
  assert.equal(types['common/media/image1.png'], 'image/png');
  assert.equal(types['docProps/core.xml'], P.TYPE.core);
  assert.equal(types['_rels/.rels'], P.TYPE.rels);
  const xml = new TextDecoder().decode(doc.bytes('_rels/.rels'));
  assert.match(xml, /relationships\/main/);
});

test('unreachable parts are reported as orphans', async () => {
  const bytes = await P.write(sample({ parts: [{ name: 'common/media/image1.png', contentType: 'image/png', content: png }, { name: 'common/old.json', contentType: 'application/json', content: {} }] }));
  assert.deepEqual((await P.read(bytes)).orphans, ['common/old.json']);
});

test('interoperates with standard ZIP tools', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'edukors-pkg-'));
  const file = join(dir, 'test.ecmx');
  writeFileSync(file, await P.write(sample()));
  const script = `import zipfile,sys\nz=zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nnames=z.namelist()\nassert names[0]=='[Content_Types].xml', names\nprint(','.join(names))`;
  const out = execFileSync('python3', ['-c', script, file]).toString().trim();
  assert.match(out, /^\[Content_Types\]\.xml,_rels\/\.rels,docProps\/core\.xml/);
});

test('reads a package made by another tool (Python zipfile, folder entries, deflate)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'edukors-pkg-'));
  const file = join(dir, 'other.zip');
  const script = `import zipfile,sys
z=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED)
z.writestr('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="json" ContentType="application/json"/></Types>')
z.writestr('_rels/', '')
z.writestr('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="a" Type="https://edukors.org/package/relationships/main" Target="/main.json"/></Relationships>')
z.writestr('main.json','{"ok":true}'*500)
z.close()`;
  execFileSync('python3', ['-c', script, file]);
  const { readFileSync } = await import('node:fs');
  const doc = await P.read(new Uint8Array(readFileSync(file)));
  assert.equal(doc.main.name, 'main.json');
  assert.equal(doc.text('main.json').length, 11 * 500);
});

test('part names: portable and safe', () => {
  for (const good of ['slides/slides/slide1.json', 'a/b.c/d', 'media/imagem 1.png', 'docs/é.json']) assert.equal(P.partNameProblem(good), '', good);
  for (const bad of ['', '/abs', 'a//b', 'a/../b', './a', 'a/./b', 'a\\b', 'trailing/', 'bad:name', 'q?.json', 'a/CON', 'a/nul.txt', 'dot./x', 'sp /x', 'a/%2Fb', 'x'.repeat(241), 'ctl\u0001']) assert.notEqual(P.partNameProblem(bad), '', JSON.stringify(bad));
});

test('writing rejects bad input', async () => {
  await rejects(P.write(sample({ main: { ...sample().main, name: '../x.json' } })), 'part-name');
  await rejects(P.write(sample({ parts: [{ name: 'Common/Media/IMAGE1.png', contentType: 'image/png', content: png }, { name: 'common/media/image1.png', contentType: 'image/png', content: png }] })), 'part-name');
  await rejects(P.write(sample({ parts: [{ name: 'docProps/core.xml', contentType: 'x/y', content: '' }] })), 'part-name');
  await rejects(P.write(sample({ parts: [] })), 'relationship'); // main points to a part that is not there
  await rejects(P.write(sample({ app: { name: 'Bad Name' } })), 'input');
});

test('relationship targets cannot leave the package', () => {
  assert.throws(() => P.resolveTarget('a', '../../x'), error => error.code === 'relationship');
  assert.equal(P.resolveTarget('a/b', '../c.json'), 'a/c.json');
  assert.equal(P.resolveTarget('a/b', '/root.json'), 'root.json');
});

test('reading rejects damaged and hostile packages', async () => {
  const good = await P.write(sample());
  await rejects(P.read(new Uint8Array([1, 2, 3])), 'zip');
  await rejects(P.read(good.subarray(0, good.length - 30)), 'zip');
  const flipped = good.slice(); // a flipped byte inside the first stored/deflated part breaks its checksum or its inflate
  flipped[60] ^= 0xff;
  await assert.rejects(P.read(flipped), error => error instanceof P.PackageError);
  const encrypted = good.slice(); // set the "encrypted" bit in the first central directory header
  const view = new DataView(encrypted.buffer);
  const cd = view.getUint32(encrypted.length - 22 + 16, true);
  view.setUint16(cd + 8, view.getUint16(cd + 8, true) | 1, true);
  await rejects(P.read(encrypted), 'zip');
});

test('limits stop oversized and over-compressed parts', async () => {
  const big = await P.write(sample({ parts: [{ name: 'common/media/image1.png', contentType: 'image/png', content: png }, { name: 'common/zeros.json', contentType: 'application/json', content: new Uint8Array(3_000_000) }] }));
  await rejects(P.read(big, { limits: { maxEntryBytes: 1_000_000 } }), 'limit');
  await rejects(P.read(big, { limits: { maxTotalBytes: 1_000_000 } }), 'limit');
  await rejects(P.read(big, { limits: { maxRatio: 50, ratioFloor: 1000 } }), 'limit');
  await rejects(P.read(big, { limits: { maxEntries: 3 } }), 'limit');
  await rejects(P.read(big), 'limit'); // 3 MB of zeros shrinks about 1000×: the default ratio limit refuses it
  assert.ok((await P.read(big, { limits: { maxRatio: 1e6 } })).parts.length > 3); // and accepts it when the host allows it
});

test('a declared size smaller than the real one is caught while inflating', async () => {
  const bytes = await P.write(sample({ parts: [{ name: 'common/media/image1.png', contentType: 'image/png', content: png }, { name: 'common/zeros.json', contentType: 'application/json', content: new Uint8Array(200_000) }] }));
  const forged = bytes.slice();
  const view = new DataView(forged.buffer);
  const cd = view.getUint32(forged.length - 22 + 16, true);
  let at = cd;
  for (let n = 0; n < view.getUint16(forged.length - 22 + 10, true); n++) {
    const nameLength = view.getUint16(at + 28, true);
    const name = new TextDecoder().decode(forged.subarray(at + 46, at + 46 + nameLength));
    if (name === 'common/zeros.json') view.setUint32(at + 24, 1000, true);
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  await rejects(P.read(forged), 'limit');
});

test('XML with a DOCTYPE or entities is refused', async () => {
  // Build a package whose content types file declares an entity.
  const good = await P.write(sample());
  const doc = await P.read(good);
  assert.ok(doc.parts.length);
  const evil = '<?xml version="1.0"?><!DOCTYPE Types [<!ENTITY x "y">]><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>';
  const dir = mkdtempSync(join(tmpdir(), 'edukors-pkg-'));
  const file = join(dir, 'evil.zip');
  execFileSync('python3', ['-c', `import zipfile,sys\nz=zipfile.ZipFile(sys.argv[1],'w')\nz.writestr('[Content_Types].xml',sys.argv[2])\nz.close()`, file, evil]);
  const { readFileSync } = await import('node:fs');
  await rejects(P.read(new Uint8Array(readFileSync(file))), 'xml');
});

test('a package without a main part, or with a missing target, is refused', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'edukors-pkg-'));
  const make = (name, rels) => {
    const file = join(dir, name);
    execFileSync('python3', ['-c', `import zipfile,sys\nz=zipfile.ZipFile(sys.argv[1],'w')\nz.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="r"/><Default Extension="json" ContentType="j"/></Types>')\nz.writestr('_rels/.rels',sys.argv[2])\nz.writestr('a.json','{}')\nz.close()`, file, rels]);
    return import('node:fs').then(fs => new Uint8Array(fs.readFileSync(file)));
  };
  const head = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
  await rejects(P.read(await make('nomain.zip', `${head}</Relationships>`)), 'package');
  await rejects(P.read(await make('missing.zip', `${head}<Relationship Id="a" Type="https://edukors.org/package/relationships/main" Target="gone.json"/></Relationships>`)), 'relationship');
  await rejects(P.read(await make('dup.zip', `${head}<Relationship Id="a" Type="https://edukors.org/package/relationships/main" Target="a.json"/><Relationship Id="a" Type="x" Target="a.json"/></Relationships>`)), 'relationship');
});

test('extensions follow the .e??x rule', () => {
  assert.equal(P.extensionFor('slides'), '.eslx');
  assert.equal(P.extensionFor('graph'), '.egrx');
  assert.equal(P.extensionFor('text'), '.etex');
  assert.equal(P.extensionFor('common'), '.ecmx');
});

test('names with spaces: relationship targets and content-type overrides keep them', async () => {
  const bytes = await P.write({
    app: { name: 'graph', version: 'v.26.11.04' },
    main: { name: 'graph/course.json', contentType: P.contentType('graph', 'course'), content: { a: 1 }, relationships: [{ id: 'rIdMedia1', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', target: 'media/Gato 1.png' }] },
    parts: [{ name: 'graph/media/Gato 1.png', contentType: 'image/png', content: new Uint8Array([1, 2, 3]) }],
    properties: { title: 'A title with spaces' }
  });
  const doc = await P.read(bytes);
  assert.deepEqual([...doc.bytes('graph/media/Gato 1.png')], [1, 2, 3]);
  assert.equal(doc.relationships('graph/course.json')[0].target, 'graph/media/Gato 1.png');
  assert.equal(doc.properties.title, 'A title with spaces');
});

test('attributes: anything but whitespace between them is refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'edukors-attr-'));
  const file = join(dir, 'junk.zip');
  const rels = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship junk Id="rId1" Type="https://edukors.org/package/relationships/main" Target="a.json"/></Relationships>';
  execFileSync('python3', ['-c', `import zipfile,sys\nz=zipfile.ZipFile(sys.argv[1],'w')\nz.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="r"/><Default Extension="json" ContentType="j"/></Types>')\nz.writestr('_rels/.rels',sys.argv[2])\nz.writestr('a.json','{}')\nz.close()`, file, rels]);
  return rejects(P.read(new Uint8Array(readFileSync(file))), 'xml');
});
