/**
 * Passphrase-based encryption for API keys, using the Web Crypto API.
 * Keys are derived with PBKDF2 (SHA-256) and data is sealed with AES-GCM.
 *
 * The encrypted payload is self-describing (salt + iv are stored alongside the
 * ciphertext), so only the passphrase is needed to decrypt.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64ToBuf(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 150000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export interface EncryptedPayload {
  v: 1;
  salt: string;
  iv: string;
  data: string;
}

export async function encryptString(plaintext: string, passphrase: string): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    enc.encode(plaintext)
  );
  return {
    v: 1,
    salt: bufToB64(salt.buffer),
    iv: bufToB64(iv.buffer),
    data: bufToB64(cipher),
  };
}

/**
 * Throws if the passphrase is wrong (AES-GCM auth failure).
 */
export async function decryptString(payload: EncryptedPayload, passphrase: string): Promise<string> {
  const salt = b64ToBuf(payload.salt);
  const iv = b64ToBuf(payload.iv);
  const key = await deriveKey(passphrase, salt);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    b64ToBuf(payload.data) as BufferSource
  );
  return dec.decode(plain);
}
