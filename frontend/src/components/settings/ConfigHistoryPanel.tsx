import { useEffect, useState } from 'react'
import {
  Clock,
  History,
  Loader2,
  RotateCcw,
  User,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'

import { useI18n } from '@/i18n'
import { apiGet, apiPost } from '@/utils/api'

interface ConfigHistoryEntry {
  version: number
  actor: string | null
  diffSummary: string | null
  timestamp: string
}

interface ConfigHistoryResponse {
  userId: string
  history: ConfigHistoryEntry[]
  total: number
}

interface ConfigHistoryPanelProps {
  currentVersion?: number
  onRollback?: () => void
}

function formatLocalizedTimestamp(isoString: string, language: string = 'zh-CN'): string {
  try {
    const date = new Date(isoString)
    const formatter = new Intl.DateTimeFormat(language, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    return formatter.format(date)
  } catch {
    return isoString
  }
}

function formatDiffSummary(diffSummary: string | null, t: (key: string, fallback?: string) => string): string {
  if (!diffSummary) {
    return t('settings.history.noChanges', '无显著变更')
  }
  return diffSummary
    .replace(/language\.provider:/g, t('settings.diff.languageProvider', '语言槽位.provider:') + ' ')
    .replace(/language\.model:/g, t('settings.diff.languageModel', '语言槽位.model:') + ' ')
    .replace(/multimodal\.provider:/g, t('settings.diff.multimodalProvider', '多模态槽位.provider:') + ' ')
    .replace(/multimodal\.model:/g, t('settings.diff.multimodalModel', '多模态槽位.model:') + ' ')
    .replace(/roles:/g, t('settings.diff.roles', '角色配置:') + ' ')
    .replace(/none/g, t('settings.diff.none', '未配置'))
}

export function ConfigHistoryPanel({ currentVersion, onRollback }: ConfigHistoryPanelProps) {
  const { t, preference } = useI18n()
  const locale = preference.primary
  const [history, setHistory] = useState<ConfigHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rollingBack, setRollingBack] = useState<number | null>(null)
  const [rollbackSuccess, setRollbackSuccess] = useState<number | null>(null)
  const [rollbackError, setRollbackError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const pageSize = 6

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)

    apiGet<ConfigHistoryResponse>('/api/omni/config/history')
      .then((response) => {
        if (!alive) return
        setHistory(response.history)
      })
      .catch((err) => {
        if (!alive) return
        setError(err instanceof Error ? err.message : t('settings.history.loadError', '加载历史版本失败'))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
      }
  }, [t])

  const handleRollback = async (version: number) => {
    setRollingBack(version)
    setRollbackError(null)
    setRollbackSuccess(null)

    try {
      await apiPost<{ rollbackVersion: number }>('/api/omni/config/rollback', { version })
      setRollbackSuccess(version)
      setTimeout(() => setRollbackSuccess(null), 3000)
      onRollback?.()
    } catch (err) {
      setRollbackError(err instanceof Error ? err.message : t('settings.history.rollbackError', '回滚失败'))
    } finally {
      setRollingBack(null)
    }
  }

  const totalPages = Math.ceil(history.length / pageSize)
  const startIndex = page * pageSize
  const endIndex = startIndex + pageSize
  const visibleHistory = history.slice(startIndex, endIndex)
  const latestVersion = history.length > 0 ? history[0].version : undefined

  if (loading) {
    return (
      <div className="rounded-[30px] border border-black/8 bg-white px-5 py-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-black/42" />
          <span className="ml-2 text-[14px] text-black/56">{t('settings.history.loading', '加载历史版本...')}</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-[30px] border border-black/8 bg-white px-5 py-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-[12px] text-red-700">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      </div>
    )
  }

  if (history.length === 0) {
    return (
      <div className="rounded-[30px] border border-black/8 bg-white px-5 py-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-2 text-[14px] text-black/56">
          <History className="h-4 w-4" />
          {t('settings.history.noHistory', '暂无历史版本记录')}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-[30px] border border-black/8 bg-white px-5 py-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-black/34">
            <History className="h-3.5 w-3.5" />
            {t('settings.historyEyebrow', '版本历史')}
          </div>
          <h2 className="mt-2 text-[22px] font-semibold text-black">
            {t('settings.historyTitle', '配置版本历史')}
          </h2>
          <p className="mt-2 text-[13px] leading-7 text-black/58">
            {t('settings.historyBody', '查看所有配置变更历史，支持一键回滚到历史版本。')}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="rounded-[18px] bg-[var(--surface-soft)] px-4 py-3 text-black/68">
            <History className="h-5 w-5" />
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#d1aa5c]/15 px-2.5 py-1 text-[11px] font-medium text-[#8a5a12]">
            {t('settings.history.count', '{count} 条记录').replace('{count}', String(history.length))}
          </div>
        </div>
      </div>

      {rollbackSuccess !== null && (
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-[12px] text-green-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {t('settings.history.rollbackSuccess', '已成功回滚到版本 {version}').replace('{version}', String(rollbackSuccess))}
        </div>
      )}
      {rollbackError && (
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-[12px] text-red-700">
          <AlertCircle className="h-3.5 w-3.5" />
          {rollbackError}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {visibleHistory.map((entry) => {
          const isCurrent = entry.version === currentVersion
          const isLatest = entry.version === latestVersion

          return (
            <div
              key={entry.version}
              className={`rounded-[18px] border px-4 py-3 transition ${
                isCurrent || isLatest
                  ? 'border-[#d1aa5c]/50 bg-[#fff6e6]/50'
                  : 'border-black/8 bg-[var(--surface-soft)]'
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`rounded-[10px] px-2.5 py-1.5 text-[11px] font-semibold ${
                    isCurrent || isLatest
                      ? 'bg-[#d1aa5c] text-white'
                      : 'bg-black/8 text-black/64'
                  }`}>
                    v{entry.version}
                  </div>
                  {(isCurrent || isLatest) && (
                    <div className="inline-flex items-center gap-1 rounded-full bg-[#d1aa5c]/20 px-2 py-0.5 text-[10px] font-medium text-[#8a5a12]">
                      <CheckCircle2 className="h-3 w-3" />
                      {t('settings.history.current', '当前版本')}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4 text-[12px] text-black/48">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{formatLocalizedTimestamp(entry.timestamp, locale)}</span>
                  </div>
                  {entry.actor && (
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" />
                      <span>{entry.actor}</span>
                    </div>
                  )}
                </div>

                {!isLatest && (
                  <button
                    onClick={() => handleRollback(entry.version)}
                    disabled={rollingBack !== null || rollbackSuccess !== null}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] transition ${
                      rollingBack === entry.version
                        ? 'bg-black/8 text-black/48 cursor-wait'
                        : 'bg-black/8 text-black/64 hover:bg-black hover:text-white'
                    } disabled:opacity-50`}
                  >
                    {rollingBack === entry.version ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {t('settings.history.rollingBack', '回滚中...')}
                      </>
                    ) : (
                      <>
                        <RotateCcw className="h-3.5 w-3.5" />
                        {t('settings.history.rollback', '回滚')}
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="mt-2 text-[12px] text-black/58">
                {formatDiffSummary(entry.diffSummary, t)}
              </div>
            </div>
          )
        })}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-[12px] text-black/48">
            {t('settings.history.pageInfo', '第 {page} 页，共 {total} 页')
              .replace('{page}', String(page + 1))
              .replace('{total}', String(totalPages))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="inline-flex items-center gap-1 rounded-full border border-black/8 bg-white px-3 py-1.5 text-[12px] text-black/64 transition hover:border-black/16 hover:text-black disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {t('settings.history.prev', '上一页')}
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="inline-flex items-center gap-1 rounded-full border border-black/8 bg-white px-3 py-1.5 text-[12px] text-black/64 transition hover:border-black/16 hover:text-black disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('settings.history.next', '下一页')}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ConfigHistoryPanel