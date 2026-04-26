import crypto from 'node:crypto'

const DEV_MASTER_KEY_SALT = 'tracemind-dev-master-key'
const LEGACY_DEV_MASTER_KEY_SALT = ['arxiv', 'chronicle', 'dev', 'master', 'key'].join('-')

function deriveDevelopmentMasterKey(salt: string) {
  const fallbackSeed = `${salt}:${process.env.DATABASE_URL ?? 'local-dev'}`
  return crypto.createHash('sha256').update(fallbackSeed).digest()
}

function resolveMasterKey(): Buffer {
  const configured = process.env.MASTER_ENCRYPTION_KEY?.trim()
  if (configured) {
    if (!/^[a-fA-F0-9]{64}$/u.test(configured)) {
      throw new Error('MASTER_ENCRYPTION_KEY must be a 64 character hex string.')
    }
    return Buffer.from(configured, 'hex')
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('MASTER_ENCRYPTION_KEY is required in production.')
  }

  return deriveDevelopmentMasterKey(DEV_MASTER_KEY_SALT)
}

function resolveDecryptionMasterKeys(): Buffer[] {
  const configured = process.env.MASTER_ENCRYPTION_KEY?.trim()
  if (configured) return [resolveMasterKey()]

  if (process.env.NODE_ENV === 'production') {
    throw new Error('MASTER_ENCRYPTION_KEY is required in production.')
  }

  return [
    deriveDevelopmentMasterKey(DEV_MASTER_KEY_SALT),
    deriveDevelopmentMasterKey(LEGACY_DEV_MASTER_KEY_SALT),
  ]
}

export interface EncryptedSecretPayload {
  encrypted: string
  iv: string
  tag: string
  preview: string
}

export function maskSecret(value: string): string {
  return getKeyPreview(value)
}

export function getKeyPreview(key: string): string {
  if (!key) return ''
  const previewLength = Math.min(8, key.length)
  return `${key.slice(0, previewLength)}***`
}

export class SecureStorage {
  static encrypt(plainText: string): EncryptedSecretPayload {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-gcm', resolveMasterKey(), iv)

    let encrypted = cipher.update(plainText, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: cipher.getAuthTag().toString('hex'),
      preview: maskSecret(plainText),
    }
  }

  static decrypt(payload: EncryptedSecretPayload): string {
    let lastError: unknown

    for (const masterKey of resolveDecryptionMasterKeys()) {
      try {
        const decipher = crypto.createDecipheriv(
          'aes-256-gcm',
          masterKey,
          Buffer.from(payload.iv, 'hex'),
        )
        decipher.setAuthTag(Buffer.from(payload.tag, 'hex'))

        let decrypted = decipher.update(payload.encrypted, 'hex', 'utf8')
        decrypted += decipher.final('utf8')
        return decrypted
      } catch (error) {
        lastError = error
      }
    }

    throw lastError
  }
}
