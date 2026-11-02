// What the AI assistant may do in this demo: read the sample document and change it through
// EdukorsSampleDocument (demo/sample-document.js), each change one undo step. A real app supplies its own tools,
// instructions, and context in the same shape (see src/ai/ui/ai-assistant.js).
(() => {
  const { t } = EdukorsAiUi;
  const doc = EdukorsSampleDocument;
  const number = { type: 'number', minimum: 0, maximum: 100 };
  const position = {
    x: { ...number, description: 'Left edge, percent of the page width.' },
    y: { ...number, description: 'Top edge, percent of the page height.' },
    width: { ...number, description: 'Percent of the page width.' },
    height: { ...number, description: 'Percent of the page height.' }
  };
  const color = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$', description: 'A color as #RRGGBB.' };
  const id = { type: 'integer', description: 'The object id from read_document.' };

  // Arguments come from the model: check them here, before the document sees them.
  function check(args, schema) {
    for (const key of schema.required || []) if (args[key] === undefined) throw new Error(`Missing "${key}".`);
    for (const [key, value] of Object.entries(args)) {
      const rule = schema.properties[key];
      if (!rule) throw new Error(`Unknown argument "${key}".`);
      if (rule.type === 'string' && typeof value !== 'string') throw new Error(`"${key}" must be text.`);
      if ((rule.type === 'number' || rule.type === 'integer') && !Number.isFinite(value)) throw new Error(`"${key}" must be a number.`);
      if (rule.type === 'integer' && !Number.isInteger(value)) throw new Error(`"${key}" must be a whole number.`);
      if (rule.pattern && !new RegExp(rule.pattern).test(value)) throw new Error(`"${key}" has an invalid format.`);
      if (rule.enum && !rule.enum.includes(value)) throw new Error(`"${key}" must be one of: ${rule.enum.join(', ')}.`);
      if (typeof rule.maxLength === 'number' && value.length > rule.maxLength) throw new Error(`"${key}" is too long.`);
    }
    return args;
  }
  const tool = (name, labelKey, description, properties, required, run) => {
    const inputSchema = { type: 'object', properties, required, additionalProperties: false };
    return { name, description, inputSchema, label: () => t(labelKey), run: (d, args) => run(d, check(args, inputSchema)) };
  };
  const text = { type: 'string', maxLength: 5000 };
  const documentId = d => `common-demo-${d.id}`;

  // An image comes from one of three sources. Files are read by the host (the document's folder or an attachment,
  // or the web); markup the agent writes (SVG) needs no file. Animated GIF, WebP, APNG, and SVG play as images.
  const source = {
    path: { type: 'string', maxLength: 1000, description: 'A file in the document\'s folder, or an attached file.' },
    url: { type: 'string', maxLength: 2000, description: 'An http or https address of an image.' },
    svg: { type: 'string', maxLength: 200000, description: 'SVG markup (a full <svg> element) to use as the image; it may animate.' }
  };
  async function blobFrom(d, args) {
    const given = ['path', 'url', 'svg'].filter(key => args[key] !== undefined);
    if (given.length !== 1) throw new Error('Give exactly one of "path", "url", or "svg".');
    if (args.svg !== undefined) {
      if (!/<svg[\s>]/i.test(args.svg)) throw new Error('"svg" must contain an <svg> element.');
      return new Blob([args.svg.includes('xmlns') ? args.svg : args.svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"')], { type: 'image/svg+xml' });
    }
    const file = args.path !== undefined
      ? await EdukorsAiHost.call('workspace.readFile', { documentId: documentId(d), path: args.path })
      : await EdukorsAiHost.call('workspace.fetchUrl', { url: args.url });
    const bytes = Uint8Array.from(atob(file.data), c => c.charCodeAt(0));
    const type = file.mimeType?.startsWith('image/') ? file.mimeType : /\.svg$/i.test(file.name) ? 'image/svg+xml' : file.mimeType;
    return new Blob([bytes], { type });
  }

  EdukorsAiAssistant.configure({
    instructions: [
      'You help the user with the document open in Edukors Common, a demo of the shared EDUKORS interface.',
      'The document is a page with objects: text boxes, shapes, and images (animated GIF, WebP, and SVG play as images). Positions and sizes are percentages of the page.',
      'Use read_document to see the objects; change the document only with the tools, and only what the user asked.',
      'To add pictures, use insert_image or replace_image with a file in your folder (path), a web address (url), or SVG markup you write (svg). You may create files in your folder first, for example by running a script, and insert them by path.',
      'Each change appears on screen at once and can be undone by the user. Answer briefly, in the language the user writes in.'
    ].join(' '),
    documentId,
    documentPath: d => (d.saved && d.path ? d.path : undefined),
    context: d => doc.read(d),
    tools: [
      tool('read_document', 'aiToolRead', 'Reads the objects of the document, with ids, kinds, text, positions, and sizes.', {}, [], d => doc.read(d)),
      tool('insert_text', 'aiToolInsertText', 'Adds a text box.', { text, ...position }, ['text'], (d, a) => doc.insertText(d, a)),
      tool('insert_shape', 'aiToolInsertShape', 'Adds a shape, optionally with text inside.',
        { shapeType: { type: 'string', enum: EdukorsShapes.types }, text, fill: color, lineColor: color, ...position }, ['shapeType'], (d, a) => doc.insertShape(d, a)),
      tool('insert_image', 'aiToolInsertImage', 'Adds an image or animation (PNG, JPEG, GIF, WebP, SVG). Give one source: path, url, or svg. The box fits the picture inside width × height.',
        { ...source, ...position }, [], async (d, a) => { const { path, url, svg, ...rest } = a; return doc.insertImage(d, { ...rest, blob: await blobFrom(d, { path, url, svg }) }); }),
      tool('replace_image', 'aiToolReplaceImage', 'Replaces the picture of an image object. Give one source: path, url, or svg.',
        { id, ...source }, ['id'], async (d, a) => { const { id: target, ...from } = a; return doc.replaceImage(d, { id: target, blob: await blobFrom(d, from) }); }),
      tool('set_text', 'aiToolSetText', 'Replaces the text of a text box or shape.', { id, text }, ['id', 'text'], (d, a) => doc.setText(d, a)),
      tool('update_object', 'aiToolUpdate', 'Moves or resizes an object, or changes a shape\'s fill or line color.', { id, ...position, fill: color, lineColor: color }, ['id'], (d, a) => doc.update(d, a)),
      tool('delete_object', 'aiToolDelete', 'Deletes an object.', { id }, ['id'], (d, a) => doc.remove(d, a))
    ]
  });
})();
