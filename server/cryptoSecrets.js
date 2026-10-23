import crypto from 'crypto';

/**
 * Returns a dedicated 32-byte key for AES-256-GCM encryption of secrets at rest.
 * The key must be provided as 64 hexadecimal characters through TOTP_ENCRYPTION_KEY.
 */
function getEncryptionKey() {
  const envKey = process.env.TOTP_ENCRYPTION_KEY;
  if (!envKey) {
    throw new Error('TOTP_ENCRYPTION_KEY is required to protect administrator TOTP secrets.');
  }

  // Require exactly 32 random bytes in hex. Avoid silently deriving a key from
  // another credential or a built-in default that could be shared across installs.
  if (!/^[a-fA-F0-9]{64}$/.test(envKey)) {
    throw new Error('TOTP_ENCRYPTION_KEY must be a 64-character hexadecimal value.');
  }
  return Buffer.from(envKey, 'hex');
}

/**
 * Encrypts a plaintext secret using AES-256-GCM with a random 96-bit nonce.
 * Output format: enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 *
 * @param {string} plaintext
 * @returns {string|null}
 */
export function encryptSecret(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') return null;
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12); // standard 96-bit nonce for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `enc:v1:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  } catch {
    // Keep key and plaintext details out of logs and client-visible errors.
    throw new Error('Secret encryption failed.');
  }
}

/**
 * Decrypts a secret that was encrypted with encryptSecret.
 * If the value is a legacy unencrypted secret, returns it with isLegacy=true
 * so callers can safely verify and opportunistically migrate the record.
 * Returns null if decryption fails or authentication tag is invalid.
 *
 * @param {string|null|undefined} storedValue
 * @returns {{ secret: string|null, isLegacy: boolean }}
 */
export function decryptSecret(storedValue) {
  if (!storedValue || typeof storedValue !== 'string') return { secret: null, isLegacy: false };

  // If encrypted format
  if (storedValue.startsWith('enc:v1:')) {
    const parts = storedValue.split(':');
    if (parts.length !== 5) return { secret: null, isLegacy: false };
    const iv = Buffer.from(parts[2], 'hex');
    const authTag = Buffer.from(parts[3], 'hex');
    const ciphertext = Buffer.from(parts[4], 'hex');

    try {
      const key = getEncryptionKey();
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return { secret: decrypted.toString('utf8'), isLegacy: false };
    } catch {
      return { secret: null, isLegacy: false };
    }
  }

  // Legacy plaintext secrets can be read only when the migration key is ready,
  // so verification never silently continues while persistence cannot migrate.
  try {
    getEncryptionKey();
    return { secret: storedValue, isLegacy: true };
  } catch {
    return { secret: null, isLegacy: false };
  }
}
