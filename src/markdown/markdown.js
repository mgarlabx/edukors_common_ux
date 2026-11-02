// Small Markdown subset for help texts, ported from the Slides editor (src/ui/Help.tsx).
// Supports #/##/### headings, paragraphs, - and 1. lists, | tables |, > quotes,
// **bold**, *italic*, `code` and [links](url). Output is built as DOM nodes, never as HTML strings.
// Links open in a new tab; only http, https and mailto destinations become links.
globalThis.EdukorsMarkdown = (() => {
  const inlinePattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\*[^*\s][^*]*\*)/;

  function element(tag, children = []) {
    const node = document.createElement(tag);
    node.append(...children);
    return node;
  }

  function safeUrl(destination) {
    try {
      const url = new URL(destination, document.baseURI);
      return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  }

  function inline(text) {
    return text.split(inlinePattern).filter(Boolean).map(part => {
      if (/^\*\*.+\*\*$/.test(part)) return element('strong', inline(part.slice(2, -2)));
      if (/^`.+`$/.test(part)) return element('code', [part.slice(1, -1)]);
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
      if (link) {
        const href = safeUrl(link[2]);
        if (!href) return element('span', inline(link[1]));
        const anchor = element('a', inline(link[1]));
        anchor.href = href;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        return anchor;
      }
      if (/^\*[^*\s].*\*$/.test(part)) return element('em', [part.slice(1, -1)]);
      return document.createTextNode(part);
    });
  }

  const cells = row => row.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
  const joinLines = text => text.replace(/\n\s*/g, ' ');

  function block(text) {
    const heading = /^(#{1,3}) (.*)$/.exec(text);
    if (heading) return element(`h${heading[1].length}`, inline(heading[2]));
    if (text.startsWith('- ')) {
      return element('ul', text.split(/\n(?=- )/).map(item => element('li', inline(joinLines(item.slice(2))))));
    }
    if (/^\d+\. /.test(text)) {
      return element('ol', text.split(/\n(?=\d+\. )/).map(item => element('li', inline(joinLines(item.replace(/^\d+\. /, ''))))));
    }
    if (text.startsWith('|')) {
      const [head, , ...rows] = text.split('\n');
      return element('table', [
        element('thead', [element('tr', cells(head).map(cell => element('th', inline(cell))))]),
        element('tbody', rows.map(row => element('tr', cells(row).map(cell => element('td', inline(cell))))))
      ]);
    }
    if (text.startsWith('>')) {
      return element('blockquote', text.split(/\n>\s*\n/).map(part => element('p', inline(part.replace(/^>\s?/gm, '').replace(/\n/g, ' ')))));
    }
    return element('p', inline(text.replace(/\n/g, ' ')));
  }

  // A Windows checkout may give the texts CRLF line ends.
  function render(text) {
    const blocks = text.replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/);
    return element('div', blocks.filter(Boolean).map(block));
  }

  return { render };
})();
