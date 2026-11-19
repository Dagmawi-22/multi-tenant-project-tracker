import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SCHEME = 'scrypt';

export async function hashPassword(plaintext: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(plaintext, salt, KEY_LENGTH);
  return `${SCHEME}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(plaintext: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split('$');

  if (scheme !== SCHEME || !saltHex || !hashHex) {
    return false;
  }

  const expected = Buffer.from(hashHex, 'hex');
  const derived = await scrypt(plaintext, Buffer.from(saltHex, 'hex'), KEY_LENGTH);

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
