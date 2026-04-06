import type {
  ModelConfigResponse,
  ResearchRoleId,
  UserModelConfig,
} from '@/types/alpha'

type SlotForm = {
  provider: string
  model: string
  baseUrl: string
  apiKey: string
  providerOptions: Record<string, string>
  thinking: 'on' | 'off' | 'auto'
  citations: 'native' | 'backend'
  parser: 'native' | 'backend'
  temperature: string
  maxTokens: string
}

type CatalogProvider = ModelConfigResponse['catalog'][number]
type CatalogField = NonNullable<CatalogProvider['configFields']>[number]
type RoleFormMode = 'default' | 'custom'
type RoleFormState = {
  mode: RoleFormMode
  form: SlotForm
}
type RoleFormMap = Partial<Record<ResearchRoleId, RoleFormState>>

function parseProviderOptionValue(field: CatalogField, raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return undefined

  if (field.type === 'number') {
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  if (field.type === 'boolean') {
    return trimmed === 'true'
  }

  if (field.type === 'json') {
    try {
      return JSON.parse(trimmed) as Record<string, unknown>
    } catch {
      return undefined
    }
  }

  return trimmed
}

function buildSlotOptions(form: SlotForm) {
  return {
    thinking: form.thinking,
    citations: form.citations,
    parser: form.parser,
    temperature: form.temperature ? Number(form.temperature) : undefined,
    maxTokens: form.maxTokens ? Number(form.maxTokens) : undefined,
  }
}

function buildProviderOptionsPayload(
  provider: CatalogProvider | undefined,
  form: SlotForm,
) {
  if (!provider?.configFields?.length) return undefined

  const entries = provider.configFields
    .map((field) => [field.key, parseProviderOptionValue(field, form.providerOptions[field.key] ?? '')] as const)
    .filter(([, value]) => value !== undefined)

  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function getProviderById(
  catalog: ModelConfigResponse['catalog'] | null | undefined,
  providerId: string,
) {
  return catalog?.find((entry) => entry.provider === providerId)
}

function buildRoleConfigPayload(
  form: SlotForm,
  provider: CatalogProvider | undefined,
) {
  if (!form.provider || !form.model) return null

  return {
    provider: form.provider as never,
    model: form.model,
    baseUrl: form.baseUrl || undefined,
    apiKey: form.apiKey || undefined,
    providerOptions: buildProviderOptionsPayload(provider, form),
    options: buildSlotOptions(form),
  }
}

export function buildRolePayload(
  roleForms: RoleFormMap,
  catalog: ModelConfigResponse['catalog'],
  previousRoles?: NonNullable<ModelConfigResponse['config']['roles']>,
): UserModelConfig['roles'] {
  const entries: Array<[ResearchRoleId, NonNullable<UserModelConfig['roles']>[ResearchRoleId]]> = []
  const roleIds = [...new Set<ResearchRoleId>([
    ...(Object.keys(previousRoles ?? {}) as ResearchRoleId[]),
    ...(Object.keys(roleForms) as ResearchRoleId[]),
  ])]

  for (const roleId of roleIds) {
    const state = roleForms[roleId]
    const hadCustomConfig = Boolean(previousRoles?.[roleId])

    if (!state || state.mode !== 'custom') {
      if (hadCustomConfig) {
        entries.push([roleId, null])
      }
      continue
    }

    const provider = getProviderById(catalog, state.form.provider)
    const payload = buildRoleConfigPayload(state.form, provider)
    if (payload) {
      entries.push([roleId, payload])
    }
  }

  return Object.fromEntries(entries) as UserModelConfig['roles']
}
