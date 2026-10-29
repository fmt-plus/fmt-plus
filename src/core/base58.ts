// Base58 (the Solana alphabet), zero dependencies.
const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function b58encode(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const d: number[] = [];
  for (let i = zeros; i < bytes.length; i++) {
    let c = bytes[i];
    for (let j = 0; j < d.length; j++) {
      c += d[j] << 8;
      d[j] = c % 58;
      c = (c / 58) | 0;
    }
    while (c) {
      d.push(c % 58);
      c = (c / 58) | 0;
    }
  }
  let s = '1'.repeat(zeros);
  for (let i = d.length - 1; i >= 0; i--) s += A[d[i]];
  return s;
}

export function b58decode(s: string): Uint8Array {
  const bytes: number[] = [];
  for (const ch of s) {
    let carry = A.indexOf(ch);
    if (carry < 0) throw new Error('base58');
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const ch of s) {
    if (ch !== '1') break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

export function isAddress(s: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return false;
  try {
    return b58decode(s).length === 32;
  } catch {
    return false;
  }
}
