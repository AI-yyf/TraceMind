import { AlertCircle, BookOpen, Database, Loader2, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { useI18n } from '@/i18n'
import { useSystemInit } from '@/hooks/useSystemInit'

interface SystemInitCheckProps {
  children: React.ReactNode
}

export function SystemInitCheck({ children }: SystemInitCheckProps) {
  const { status, config, error, checkAgain } = useSystemInit()
  const { t } = useI18n()
  const navigate = useNavigate()

  if (status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-amber-600" />
          <p className="mt-4 text-sm text-black/56">{t('common.loading', 'Loading...')}</p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="mt-4 text-lg font-medium text-black">{t('common.error', 'Load failed')}</h2>
          <p className="mt-2 text-sm text-black/56">
            {error?.message || t('init.connectionError', 'Cannot reach the backend service. Please confirm it is running.')}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={checkAgain}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm text-white transition hover:bg-amber-700"
            >
              {t('common.retry', 'Retry')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'uninitialized') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4" data-testid="system-init-check">
        <div className="mx-auto max-w-lg">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
              <Settings className="h-8 w-8 text-amber-600" />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-black">{t('init.title', 'System Setup')}</h2>
            <p className="mt-2 text-sm text-black/56">
              {t('init.description', 'Before first use, connect the backend, configure at least one model, and create a topic.')}
            </p>
          </div>

          <div className="mt-8 space-y-4">
            <div
              className={`flex items-center gap-4 rounded-xl border p-4 ${
                config?.backendHealthy ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
              }`}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  config?.backendHealthy ? 'bg-green-100' : 'bg-red-100'
                }`}
              >
                <Database
                  className={`h-5 w-5 ${
                    config?.backendHealthy ? 'text-green-600' : 'text-red-600'
                  }`}
                />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-black">{t('init.backendTitle', 'Backend Service')}</h3>
                <p className="text-sm text-black/56">
                  {config?.backendHealthy
                    ? t('init.backendReady', 'Connected')
                    : t('init.backendMissing', 'Not connected')}
                </p>
              </div>
              {config?.backendHealthy ? (
                <span className="text-green-600">{t('common.ok', 'OK')}</span>
              ) : null}
            </div>

            <div
              className={`flex items-center gap-4 rounded-xl border p-4 ${
                config?.hasModelConfig
                  ? 'border-green-200 bg-green-50'
                  : 'border-amber-200 bg-amber-50'
              }`}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  config?.hasModelConfig ? 'bg-green-100' : 'bg-amber-100'
                }`}
              >
                <Settings
                  className={`h-5 w-5 ${
                    config?.hasModelConfig ? 'text-green-600' : 'text-amber-600'
                  }`}
                />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-black">{t('init.modelsTitle', 'AI Model Setup')}</h3>
                <p className="text-sm text-black/56">
                  {config?.hasModelConfig
                    ? t('init.modelsReady', 'Configured')
                    : t('init.modelsMissing', 'Configure at least one language or multimodal model before generating research content.')}
                </p>
              </div>
              {!config?.hasModelConfig ? (
                <button
                  type="button"
                  onClick={() => navigate('/settings')}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm text-white transition hover:bg-amber-700"
                >
                  {t('init.goSettings', 'Open settings')}
                </button>
              ) : null}
            </div>

            <div
              className={`flex items-center gap-4 rounded-xl border p-4 ${
                config?.hasTopics ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'
              }`}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  config?.hasTopics ? 'bg-green-100' : 'bg-amber-100'
                }`}
              >
                <BookOpen
                  className={`h-5 w-5 ${config?.hasTopics ? 'text-green-600' : 'text-amber-600'}`}
                />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-black">{t('init.topicsTitle', 'Research Topics')}</h3>
                <p className="text-sm text-black/56">
                  {config?.hasTopics
                    ? t('init.topicsReady', 'Topics available')
                    : t('init.topicsMissing', 'Create at least one topic before opening topic pages, detail pages, and orchestration flows.')}
                </p>
              </div>
              {!config?.hasTopics ? (
                <button
                  type="button"
                  onClick={() => navigate('/?create=1')}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm text-white transition hover:bg-amber-700"
                >
                  {t('init.goCreate', 'Create topic')}
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={checkAgain}
              className="text-sm text-black/46 transition hover:text-black"
            >
              {t('init.recheck', 'Check again')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
