import assert from 'node:assert'
import { describe, it, beforeEach, afterEach } from 'node:test'
import crypto from 'node:crypto'
import { SecureStorage, maskSecret, getKeyPreview, type EncryptedSecretPayload } from '../services/omni/secure-storage'

describe('SecureStorage', () => {
  const originalEnv = process.env.NODE_ENV
  const originalMasterKey = process.env.MASTER_ENCRYPTION_KEY

  beforeEach(() => {
    process.env.NODE_ENV = 'test'
    delete process.env.MASTER_ENCRYPTION_KEY
  })

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
    if (originalMasterKey) {
      process.env.MASTER_ENCRYPTION_KEY = originalMasterKey
    } else {
      delete process.env.MASTER_ENCRYPTION_KEY
    }
  })

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt a string correctly', () => {
      const plainText = 'sk-test-api-key-1234567890'
      const encrypted = SecureStorage.encrypt(plainText)
      const decrypted = SecureStorage.decrypt(encrypted)

      assert.strictEqual(decrypted, plainText)
    })

    it('should produce different IV for each encryption', () => {
      const plainText = 'test-secret-value'
      const encrypted1 = SecureStorage.encrypt(plainText)
      const encrypted2 = SecureStorage.encrypt(plainText)

      assert.notStrictEqual(encrypted1.iv, encrypted2.iv)
      assert.notStrictEqual(encrypted1.encrypted, encrypted2.encrypted)
    })

    it('should include auth tag for integrity verification', () => {
      const plainText = 'my-api-key'
      const encrypted = SecureStorage.encrypt(plainText)

      assert.ok(encrypted.tag)
      assert.strictEqual(encrypted.tag.length, 32) // 16 bytes = 32 hex chars
    })

    it('should include preview of original value', () => {
      const plainText = 'sk-abcdefghijklmnopqrstuvwxyz'
      const encrypted = SecureStorage.encrypt(plainText)

      assert.ok(encrypted.preview)
      assert.ok(encrypted.preview.startsWith(plainText.slice(0, 8)))
    })

    it('should throw on decryption with corrupted auth tag', () => {
      const plainText = 'secret-value'
      const encrypted = SecureStorage.encrypt(plainText)

      const corrupted: EncryptedSecretPayload = {
        ...encrypted,
        tag: crypto.randomBytes(16).toString('hex'),
      }

      assert.throws(() => SecureStorage.decrypt(corrupted))
    })

    it('should throw on decryption with corrupted encrypted data', () => {
      const plainText = 'secret-value'
      const encrypted = SecureStorage.encrypt(plainText)

      const corrupted: EncryptedSecretPayload = {
        ...encrypted,
        encrypted: crypto.randomBytes(32).toString('hex'),
      }

      assert.throws(() => SecureStorage.decrypt(corrupted))
    })

    it('should handle empty string', () => {
      const plainText = ''
      const encrypted = SecureStorage.encrypt(plainText)
      const decrypted = SecureStorage.decrypt(encrypted)

      assert.strictEqual(decrypted, plainText)
      assert.strictEqual(encrypted.preview, '')
    })

    it('should handle long API keys', () => {
      const plainText = 'sk-proj-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'
      const encrypted = SecureStorage.encrypt(plainText)
      const decrypted = SecureStorage.decrypt(encrypted)

      assert.strictEqual(decrypted, plainText)
    })

    it('should handle unicode characters', () => {
      const plainText = 'api-key-with-unicode-中文字符-日本語'
      const encrypted = SecureStorage.encrypt(plainText)
      const decrypted = SecureStorage.decrypt(encrypted)

      assert.strictEqual(decrypted, plainText)
    })
  })

  describe('maskSecret', () => {
    it('should return empty string for empty input', () => {
      assert.strictEqual(maskSecret(''), '')
    })

    it('should mask short strings (<=8 chars) with partial + ***', () => {
      assert.strictEqual(maskSecret('abc'), 'abc***')
      assert.strictEqual(maskSecret('abcd'), 'abcd***')
      assert.strictEqual(maskSecret('abcdefgh'), 'abcdefgh***')
    })

    it('should show first 8 chars + *** for longer strings', () => {
      assert.strictEqual(maskSecret('abcdefghi'), 'abcdefgh***')
      assert.strictEqual(maskSecret('sk-test-api-key-12345'), 'sk-test-***')
    })
  })

  describe('getKeyPreview', () => {
    it('should return empty string for empty input', () => {
      assert.strictEqual(getKeyPreview(''), '')
    })

    it('should show all chars + *** for keys shorter than 8', () => {
      assert.strictEqual(getKeyPreview('abc'), 'abc***')
      assert.strictEqual(getKeyPreview('sk-123'), 'sk-123***')
    })

    it('should show first 8 chars + *** for keys >= 8 chars', () => {
      assert.strictEqual(getKeyPreview('sk-proj-abc123XYZ'), 'sk-proj-***')
      assert.strictEqual(getKeyPreview('abcdefgh12345678'), 'abcdefgh***')
    })
  })

  describe('MASTER_ENCRYPTION_KEY validation', () => {
    it('should accept valid 64-character hex key', () => {
      const validKey = crypto.randomBytes(32).toString('hex')
      process.env.MASTER_ENCRYPTION_KEY = validKey

      const plainText = 'test-value'
      const encrypted = SecureStorage.encrypt(plainText)
      const decrypted = SecureStorage.decrypt(encrypted)

      assert.strictEqual(decrypted, plainText)
    })

    it('should reject invalid key format', () => {
      process.env.MASTER_ENCRYPTION_KEY = 'invalid-key-not-hex'

      assert.throws(() => SecureStorage.encrypt('test'), /MASTER_ENCRYPTION_KEY must be a 64 character hex string/)
    })

    it('should reject key with wrong length', () => {
      process.env.MASTER_ENCRYPTION_KEY = 'abc123' // Too short

      assert.throws(() => SecureStorage.encrypt('test'), /MASTER_ENCRYPTION_KEY must be a 64 character hex string/)
    })
  })

  describe('encryption algorithm verification', () => {
    it('should use AES-256-GCM (verify IV length)', () => {
      const encrypted = SecureStorage.encrypt('test')
      // AES-GCM uses 12-16 byte IV, we use 16 bytes = 32 hex chars
      assert.strictEqual(encrypted.iv.length, 32)
    })

    it('should produce deterministic decryption with same key', () => {
      // Set a fixed master key for deterministic testing
      process.env.MASTER_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex')

      const plainText = 'consistent-value'
      const encrypted = SecureStorage.encrypt(plainText)
      const decrypted1 = SecureStorage.decrypt(encrypted)
      const decrypted2 = SecureStorage.decrypt(encrypted)

      assert.strictEqual(decrypted1, decrypted2)
      assert.strictEqual(decrypted1, plainText)
    })
  })

  describe('EncryptedSecretPayload structure', () => {
    it('should contain all required fields', () => {
      const encrypted = SecureStorage.encrypt('test-key')

      assert.ok(encrypted.encrypted)
      assert.ok(encrypted.iv)
      assert.ok(encrypted.tag)
      assert.ok(encrypted.preview)

      assert.strictEqual(typeof encrypted.encrypted, 'string')
      assert.strictEqual(typeof encrypted.iv, 'string')
      assert.strictEqual(typeof encrypted.tag, 'string')
      assert.strictEqual(typeof encrypted.preview, 'string')
    })

    it('should be JSON serializable', () => {
      const encrypted = SecureStorage.encrypt('test-key')
      const serialized = JSON.stringify(encrypted)
      const parsed = JSON.parse(serialized) as EncryptedSecretPayload

      assert.strictEqual(parsed.encrypted, encrypted.encrypted)
      assert.strictEqual(parsed.iv, encrypted.iv)
      assert.strictEqual(parsed.tag, encrypted.tag)
      assert.strictEqual(parsed.preview, encrypted.preview)

      // Should still be decryptable after serialization round-trip
      const decrypted = SecureStorage.decrypt(parsed)
      assert.strictEqual(decrypted, 'test-key')
    })
  })
})