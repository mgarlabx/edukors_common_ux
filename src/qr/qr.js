// QR code generator with no dependencies: byte mode, error correction level M, versions 1–20 (up to ~660 bytes).
// Follows ISO/IEC 18004. `EdukorsQr.matrix(text)` returns rows of booleans (true = dark module);
// `EdukorsQr.element(text, { label, margin })` returns an SVG element that scales to its container; `margin` is the white
// border in modules (the standard quiet zone is 4; 1 or 2 still scans on most readers).
(() => {
  const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26];
  const BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16];
  const MAX_VERSION = 20;

  function rawModules(version) {
    let result = (16 * version + 128) * version + 64;
    if (version >= 2) {
      const aligns = Math.floor(version / 7) + 2;
      result -= (25 * aligns - 10) * aligns - 55;
      if (version >= 7) result -= 36;
    }
    return result;
  }
  const dataCodewords = version => Math.floor(rawModules(version) / 8) - ECC_PER_BLOCK[version] * BLOCKS[version];

  // Reed–Solomon over GF(256), polynomial 0x11D.
  function gfMultiply(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
    return z;
  }
  function divisor(degree) {
    const result = new Array(degree).fill(0);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < result.length; j++) {
        result[j] = gfMultiply(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = gfMultiply(root, 2);
    }
    return result;
  }
  function remainder(data, div) {
    const result = new Array(div.length).fill(0);
    for (const b of data) {
      const factor = b ^ result.shift();
      result.push(0);
      div.forEach((coef, i) => { result[i] ^= gfMultiply(coef, factor); });
    }
    return result;
  }

  function encodeBytes(bytes) {
    let version = 1;
    for (; ; version++) {
      if (version > MAX_VERSION) throw new RangeError('Text is too long for the QR code');
      const countBits = version <= 9 ? 8 : 16;
      if (4 + countBits + 8 * bytes.length <= dataCodewords(version) * 8) break;
    }
    const bits = [];
    const put = (value, length) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
    put(0b0100, 4);
    put(bytes.length, version <= 9 ? 8 : 16);
    for (const b of bytes) put(b, 8);
    const capacity = dataCodewords(version) * 8;
    put(0, Math.min(4, capacity - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xEC; bits.length < capacity; pad ^= 0xEC ^ 0x11) put(pad, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    return { version, codewords: interleave(data, version) };
  }

  function interleave(data, version) {
    const blocks = BLOCKS[version], eccLen = ECC_PER_BLOCK[version];
    const raw = Math.floor(rawModules(version) / 8);
    const shortBlocks = blocks - raw % blocks, shortLen = Math.floor(raw / blocks);
    const div = divisor(eccLen);
    const parts = [];
    for (let i = 0, k = 0; i < blocks; i++) {
      const length = shortLen - eccLen + (i < shortBlocks ? 0 : 1);
      const block = data.slice(k, k + length);
      k += length;
      const ecc = remainder(block, div);
      if (i < shortBlocks) block.push(0);
      parts.push(block.concat(ecc));
    }
    const result = [];
    for (let i = 0; i < parts[0].length; i++) {
      parts.forEach((block, j) => { if (i !== shortLen - eccLen || j >= shortBlocks) result.push(block[i]); });
    }
    return result;
  }

  function build(codewords, version) {
    const size = version * 4 + 17;
    const modules = Array.from({ length: size }, () => new Array(size).fill(false));
    const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, dark) => { modules[y][x] = dark; fixed[y][x] = true; };

    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, dist !== 2 && dist !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    if (version > 1) {
      const count = Math.floor(version / 7) + 2;
      const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
      const positions = [6];
      for (let pos = size - 7; positions.length < count; pos -= step) positions.splice(1, 0, pos);
      positions.forEach((cx, i) => positions.forEach((cy, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === count - 1) || (i === count - 1 && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }));
    }
    const formatBits = mask => {
      const data = mask; // error correction level M has format bits 00
      let rem = data;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const bits = ((data << 10) | rem) ^ 0x5412;
      const bit = i => ((bits >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) set(8, i, bit(i));
      set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
      set(8, size - 8, true);
    };
    formatBits(0);
    if (version >= 7) {
      let rem = version;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const bits = (version << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const dark = ((bits >>> i) & 1) !== 0, a = size - 11 + i % 3, b = Math.floor(i / 3);
        set(a, b, dark); set(b, a, dark);
      }
    }

    // Codewords zigzag through the symbol in two-module columns, skipping function modules.
    let index = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
        if (!fixed[y][x] && index < codewords.length * 8) {
          modules[y][x] = ((codewords[index >>> 3] >>> (7 - (index & 7))) & 1) !== 0;
          index++;
        }
      }
    }

    const applyMask = mask => {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const flip = [
          (x + y) % 2 === 0, y % 2 === 0, x % 3 === 0, (x + y) % 3 === 0,
          (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, x * y % 2 + x * y % 3 === 0,
          (x * y % 2 + x * y % 3) % 2 === 0, ((x + y) % 2 + x * y % 3) % 2 === 0
        ][mask];
        if (!fixed[y][x] && flip) modules[y][x] = !modules[y][x];
      }
    };
    const penalty = () => {
      let score = 0, dark = 0;
      const line = get => {
        for (let a = 0; a < size; a++) {
          let run = 1;
          for (let b = 1; b <= size; b++) {
            if (b < size && get(a, b) === get(a, b - 1)) run++;
            else { if (run >= 5) score += 3 + run - 5; run = 1; }
          }
          for (let b = 0; b + 6 < size; b++) {
            if (get(a, b) && !get(a, b + 1) && get(a, b + 2) && get(a, b + 3) && get(a, b + 4) && !get(a, b + 5) && get(a, b + 6)) {
              const before = [1, 2, 3, 4].every(k => b - k < 0 || !get(a, b - k));
              const after = [1, 2, 3, 4].every(k => b + 6 + k >= size || !get(a, b + 6 + k));
              if (before || after) score += 40;
            }
          }
        }
      };
      line((a, b) => modules[a][b]);
      line((a, b) => modules[b][a]);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (modules[y][x]) dark++;
        if (x + 1 < size && y + 1 < size && modules[y][x] === modules[y][x + 1] && modules[y][x] === modules[y + 1][x] && modules[y][x] === modules[y + 1][x + 1]) score += 3;
      }
      const total = size * size;
      return score + (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    };

    let best = 0, bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      applyMask(mask); formatBits(mask);
      const score = penalty();
      if (score < bestScore) { best = mask; bestScore = score; }
      applyMask(mask);
    }
    applyMask(best); formatBits(best);
    return modules;
  }

  function matrix(text) {
    const { version, codewords } = encodeBytes(Array.from(new TextEncoder().encode(String(text))));
    return build(codewords, version);
  }

  // An SVG that fills its container; the 4-module quiet zone and white background keep it scannable on any theme.
  function element(text, { label = '', margin = 4 } = {}) {
    const rows = matrix(text), size = rows.length, total = size + margin * 2;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${total} ${total}`);
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.setAttribute('role', 'img');
    if (label) svg.setAttribute('aria-label', label);
    const background = document.createElementNS(ns, 'rect');
    background.setAttribute('width', total); background.setAttribute('height', total); background.setAttribute('fill', '#fff');
    const path = document.createElementNS(ns, 'path');
    let d = '';
    rows.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x + margin} ${y + margin}h1v1h-1z`; }));
    path.setAttribute('d', d); path.setAttribute('fill', '#000');
    svg.append(background, path);
    return svg;
  }

  // The same code as a standalone SVG document, for use as an image.
  function svgText(text, options) {
    const svg = element(text, options);
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return new XMLSerializer().serializeToString(svg);
  }

  window.EdukorsQr = { matrix, element, svgText };
})();
