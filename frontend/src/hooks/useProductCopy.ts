import { useEffect, useMemo, useState } from 'react'

import { useI18n } from '@/i18n'
import { pickBestLocalizedValue } from '@/i18n/translations'
import type { ProductCopyRecord, PromptStudioBundle } from '@/types/alpha'
import { apiGet } from '@/utils/api'
import { PROMPT_STUDIO_UPDATED_EVENT } from '@/utils/workbench-events'

let cachedBundle: PromptStudioBundle | null = null
let loadingPromise: Promise<PromptStudioBundle> | null = null

async function loadStudioBundle(): Promise<PromptStudioBundle> {
  if (cachedBundle) return cachedBundle
  if (loadingPromise) return loadingPromise

  loadingPromise = apiGet<PromptStudioBundle>('/api/prompt-templates/studio')
    .then((bundle) => {
      cachedBundle = bundle
      return bundle
    })
    .finally(() => {
      loadingPromise = null
    })

  return loadingPromise
}

export function invalidateProductCopyCache(nextBundle?: PromptStudioBundle | null) {
  cachedBundle = nextBundle ?? null
}

function resolveCopyValue(
  item: ProductCopyRecord | undefined,
  language: keyof ProductCopyRecord['languageContents'],
  fallback = '',
) {
  if (!item) return fallback
  return pickBestLocalizedValue(
    [
      item.languageContents[language],
      item.languageContents.en,
      item.languageContents.zh,
      fallback,
    ],
    fallback,
  )
}

export function useProductCopy() {
  const { preference } = useI18n()
  const [bundle, setBundle] = useState<PromptStudioBundle | null>(cachedBundle)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let alive = true

    if (!bundle) {
      void loadStudioBundle()
        .then((nextBundle) => {
          if (alive) {
            setBundle(nextBundle)
            setError(null)
          }
        })
        .catch((err) => {
          if (alive) setError(err instanceof Error ? err : new Error(String(err)))
        })
    }

    const reload = () => {
      invalidateProductCopyCache()
      void loadStudioBundle()
        .then((nextBundle) => {
          if (alive) {
            setBundle(nextBundle)
            setError(null)
          }
        })
        .catch((err) => {
          if (alive) setError(err instanceof Error ? err : new Error(String(err)))
        })
    }

    window.addEventListener(PROMPT_STUDIO_UPDATED_EVENT, reload)
    return () => {
      alive = false
      window.removeEventListener(PROMPT_STUDIO_UPDATED_EVENT, reload)
    }
  }, [bundle])

  const copyMap = useMemo(
    () => Object.fromEntries((bundle?.productCopies ?? []).map((item) => [item.id, item])),
    [bundle?.productCopies],
  )

  const language = preference.primary

  return {
    language,
    bundle,
    ready: Boolean(bundle),
    error,
    copy: (id: string, fallback = '') => resolveCopyValue(copyMap[id], language, fallback),
  }
}
