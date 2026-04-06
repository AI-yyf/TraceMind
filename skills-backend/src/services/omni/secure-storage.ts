import crypto from 'node:crypto'

const DEV_MASTER_KEY_SALT = 'arxiv-chronicle-dev-master-key'

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

  const fallbackSeed = `${DEV_MASTER_KEY_SALT}:${process.env.DATABASE_URL ?? 'local-dev'}`
  return crypto.createHash('sha256').update(fallbackSeed).digest()
}

export interface EncryptedSecretPayload {
  encrypted: string
  iv: string
  tag: string
  preview: string
}

export function maskSecret(value: string): string {
  if (!value) return ''
  if (value.length <= 8) return `${value.slice(0, 2)}****`
  return `${value.slice(0, 4)}****${value.slice(-4)}`
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
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      resolveMasterKey(),
      Buffer.from(payload.iv, 'hex'),
    )
    decipher.setAuthTag(Buffer.from(payload.tag, 'hex'))

    let decrypted = decipher.update(payload.encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  }
}
