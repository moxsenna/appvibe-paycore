/** Minimal MD5 (RFC 1321) for legacy Duitku V2 signatures. */

function md5cycle(x: number[], k: number[]): void {
  let a = x[0] ?? 0;
  let b = x[1] ?? 0;
  let c = x[2] ?? 0;
  let d = x[3] ?? 0;

  const ff = (aa: number, bb: number, cc: number, dd: number, kk: number, s: number, t: number) => {
    const r = (aa + ((bb & cc) | (~bb & dd)) + kk + t) | 0;
    return (((r << s) | (r >>> (32 - s))) + bb) | 0;
  };
  const gg = (aa: number, bb: number, cc: number, dd: number, kk: number, s: number, t: number) => {
    const r = (aa + ((bb & dd) | (cc & ~dd)) + kk + t) | 0;
    return (((r << s) | (r >>> (32 - s))) + bb) | 0;
  };
  const hh = (aa: number, bb: number, cc: number, dd: number, kk: number, s: number, t: number) => {
    const r = (aa + (bb ^ cc ^ dd) + kk + t) | 0;
    return (((r << s) | (r >>> (32 - s))) + bb) | 0;
  };
  const ii = (aa: number, bb: number, cc: number, dd: number, kk: number, s: number, t: number) => {
    const r = (aa + (cc ^ (bb | ~dd)) + kk + t) | 0;
    return (((r << s) | (r >>> (32 - s))) + bb) | 0;
  };

  a = ff(a, b, c, d, k[0] ?? 0, 7, -680876936);
  d = ff(d, a, b, c, k[1] ?? 0, 12, -389564586);
  c = ff(c, d, a, b, k[2] ?? 0, 17, 606105819);
  b = ff(b, c, d, a, k[3] ?? 0, 22, -1044525330);
  a = ff(a, b, c, d, k[4] ?? 0, 7, -176418897);
  d = ff(d, a, b, c, k[5] ?? 0, 12, 1200080426);
  c = ff(c, d, a, b, k[6] ?? 0, 17, -1473231341);
  b = ff(b, c, d, a, k[7] ?? 0, 22, -45705983);
  a = ff(a, b, c, d, k[8] ?? 0, 7, 1770035416);
  d = ff(d, a, b, c, k[9] ?? 0, 12, -1958414417);
  c = ff(c, d, a, b, k[10] ?? 0, 17, -42063);
  b = ff(b, c, d, a, k[11] ?? 0, 22, -1990404162);
  a = ff(a, b, c, d, k[12] ?? 0, 7, 1804603682);
  d = ff(d, a, b, c, k[13] ?? 0, 12, -40341101);
  c = ff(c, d, a, b, k[14] ?? 0, 17, -1502002290);
  b = ff(b, c, d, a, k[15] ?? 0, 22, 1236535329);

  a = gg(a, b, c, d, k[1] ?? 0, 5, -165796510);
  d = gg(d, a, b, c, k[6] ?? 0, 9, -1069501632);
  c = gg(c, d, a, b, k[11] ?? 0, 14, 643717713);
  b = gg(b, c, d, a, k[0] ?? 0, 20, -373897302);
  a = gg(a, b, c, d, k[5] ?? 0, 5, -701558691);
  d = gg(d, a, b, c, k[10] ?? 0, 9, 38016083);
  c = gg(c, d, a, b, k[15] ?? 0, 14, -660478335);
  b = gg(b, c, d, a, k[4] ?? 0, 20, -405537848);
  a = gg(a, b, c, d, k[9] ?? 0, 5, 568446438);
  d = gg(d, a, b, c, k[14] ?? 0, 9, -1019803690);
  c = gg(c, d, a, b, k[3] ?? 0, 14, -187363961);
  b = gg(b, c, d, a, k[8] ?? 0, 20, 1163531501);
  a = gg(a, b, c, d, k[13] ?? 0, 5, -1444681467);
  d = gg(d, a, b, c, k[2] ?? 0, 9, -51403784);
  c = gg(c, d, a, b, k[7] ?? 0, 14, 1735328473);
  b = gg(b, c, d, a, k[12] ?? 0, 20, -1926607734);

  a = hh(a, b, c, d, k[5] ?? 0, 4, -378558);
  d = hh(d, a, b, c, k[8] ?? 0, 11, -2022574463);
  c = hh(c, d, a, b, k[11] ?? 0, 16, 1839030562);
  b = hh(b, c, d, a, k[14] ?? 0, 23, -35309556);
  a = hh(a, b, c, d, k[1] ?? 0, 4, -1530992060);
  d = hh(d, a, b, c, k[4] ?? 0, 11, 1272893353);
  c = hh(c, d, a, b, k[7] ?? 0, 16, -155497632);
  b = hh(b, c, d, a, k[10] ?? 0, 23, -1094730640);
  a = hh(a, b, c, d, k[13] ?? 0, 4, 681279174);
  d = hh(d, a, b, c, k[0] ?? 0, 11, -358537222);
  c = hh(c, d, a, b, k[3] ?? 0, 16, -722521979);
  b = hh(b, c, d, a, k[6] ?? 0, 23, 76029189);
  a = hh(a, b, c, d, k[9] ?? 0, 4, -640364487);
  d = hh(d, a, b, c, k[12] ?? 0, 11, -421815835);
  c = hh(c, d, a, b, k[15] ?? 0, 16, 530742520);
  b = hh(b, c, d, a, k[2] ?? 0, 23, -995338651);

  a = ii(a, b, c, d, k[0] ?? 0, 6, -198630844);
  d = ii(d, a, b, c, k[7] ?? 0, 10, 1126891415);
  c = ii(c, d, a, b, k[14] ?? 0, 15, -1416354905);
  b = ii(b, c, d, a, k[5] ?? 0, 21, -57434055);
  a = ii(a, b, c, d, k[12] ?? 0, 6, 1700485571);
  d = ii(d, a, b, c, k[3] ?? 0, 10, -1894986606);
  c = ii(c, d, a, b, k[10] ?? 0, 15, -1051523);
  b = ii(b, c, d, a, k[1] ?? 0, 21, -2054922799);
  a = ii(a, b, c, d, k[8] ?? 0, 6, 1873313359);
  d = ii(d, a, b, c, k[15] ?? 0, 10, -30611744);
  c = ii(c, d, a, b, k[6] ?? 0, 15, -1560198380);
  b = ii(b, c, d, a, k[13] ?? 0, 21, 1309151649);
  a = ii(a, b, c, d, k[4] ?? 0, 6, -145523070);
  d = ii(d, a, b, c, k[11] ?? 0, 10, -1120210379);
  c = ii(c, d, a, b, k[2] ?? 0, 15, 718787259);
  b = ii(b, c, d, a, k[9] ?? 0, 21, -343485551);

  x[0] = (a + (x[0] ?? 0)) | 0;
  x[1] = (b + (x[1] ?? 0)) | 0;
  x[2] = (c + (x[2] ?? 0)) | 0;
  x[3] = (d + (x[3] ?? 0)) | 0;
}

function md5blk(s: string): number[] {
  const md5blks: number[] = [];
  for (let i = 0; i < 64; i += 4) {
    md5blks[i >> 2] =
      s.charCodeAt(i) +
      (s.charCodeAt(i + 1) << 8) +
      (s.charCodeAt(i + 2) << 16) +
      (s.charCodeAt(i + 3) << 24);
  }
  return md5blks;
}

export function md5Hex(input: string): string {
  const n = input.length;
  const state = [1732584193, -271733879, -1732584194, 271733878];
  let i: number;
  for (i = 64; i <= n; i += 64) {
    md5cycle(state, md5blk(input.substring(i - 64, i)));
  }
  const tail = input.substring(i - 64);
  const block = new Array<number>(16).fill(0);
  for (i = 0; i < tail.length; i++) {
    block[i >> 2] = (block[i >> 2] ?? 0) | (tail.charCodeAt(i) << ((i % 4) << 3));
  }
  block[i >> 2] = (block[i >> 2] ?? 0) | (0x80 << ((i % 4) << 3));
  if (i > 55) {
    md5cycle(state, block);
    block.fill(0);
  }
  block[14] = n * 8;
  md5cycle(state, block);

  const hex = (n32: number) => {
    let s = '';
    for (let j = 0; j < 4; j++) {
      s += ((n32 >> (j * 8)) & 0xff).toString(16).padStart(2, '0');
    }
    return s;
  };
  return hex(state[0] ?? 0) + hex(state[1] ?? 0) + hex(state[2] ?? 0) + hex(state[3] ?? 0);
}
