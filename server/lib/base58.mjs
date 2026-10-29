// Base58 (Bitcoin alphabet, as Solana uses it). Zero dependencies.
const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const MAP = new Int16Array(128).fill(-1);
for (let i = 0; i < A.length; i++) MAP[A.charCodeAt(i)] = i;

export function b58encode(bytes) {
  const src = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  let zeros = 0;
  while (zeros < src.length && src[zeros] === 0) zeros++;
  const digits = [];
  for (let i = zeros; i < src.length; i++) {
    let carry = src[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = '1'.repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) out += A[digits[i]];
  return out;
}

/** Decodes base58; throws on a character outside the alphabet. */
export function b58decode(str) {
  const s = String(str);
  const bytes = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    let carry = c < 128 ? MAP[c] : -1;
    if (carry < 0) throw new Error('base58: bad character');
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
  for (let i = 0; i < s.length && s[i] === '1'; i++) bytes.push(0);
  return Uint8Array.from(bytes.reverse());
}

/** A Solana address (or mint/CA): base58 that decodes to exactly 32 bytes and encodes back the same. */
export function isAddress(s) {
  if (typeof s !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return false;
  try {
    const raw = b58decode(s);
    return raw.length === 32 && b58encode(raw) === s;
  } catch {
    return false;
  }
}
