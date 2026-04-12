/**
 * Zotero Export Dialog Component
 * Allows users to configure Zotero and export papers to their Zotero library
 */

import React, { useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FolderOpen,
  KeyRound,
  Loader2,
  Upload,
  X,
} from 'lucide-react'

import { useI18n } from '@/i18n'
import { apiGet, apiPost } from '@/utils/api'
import { cn } from '@/utils/cn'

// ============================================================================
// Types
// ============================================================================

interface ZoteroConfigResponse {
  configured: boolean
  config: {
    userId: string | null
    username: string | null
    enabled: boolean
    hasApiKey: boolean
  } | null
}

interface ZoteroTestResponse {
  success: boolean
  username?: string
  error?: string
}

interface ZoteroExportResponse {
  success: boolean
  exportedCount: number
  errors: string[]
  collectionKey?: string
}

interface ZoteroCollection {
  key: string
  name: string
  parent: string | null
}

interface ZoteroCollectionsResponse {
  success: boolean
  collections: ZoteroCollection[]
}

interface ExportStatusResponse {
  exported: boolean
  collectionKey: string | null
  exportedAt: string | null
  topicName: string | null
}

// ============================================================================
// Component
// ============================================================================

interface ZoteroExportDialogProps {
  isOpen: boolean
  onClose: () => void
  topicId?: string
  nodeId?: string
  paperIds?: string[]
  topicName?: string
}

export const ZoteroExportDialog: React.FC<ZoteroExportDialogProps> = ({
  isOpen,
  onClose,
  topicId,
  nodeId,
  paperIds,
  topicName,
}) => {
  const { t } = useI18n()

  // Configuration state
  const [userId, setUserId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [isConfigured, setIsConfigured] = useState(false)
  const [savedUsername, setSavedUsername] = useState<string | null>(null)

  // UI state
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<ZoteroTestResponse | null>(null)
  const [exportResult, setExportResult] = useState<ZoteroExportResponse | null>(null)
  const [collections, setCollections] = useState<ZoteroCollection[]>([])
  const [selectedCollectionKey, setSelectedCollectionKey] = useState<string>('')
  const [customCollectionName, setCustomCollectionName] = useState('')
  const [exportStatus, setExportStatus] = useState<ExportStatusResponse | null>(null)

  // Mode: 'config' | 'export'
  const [mode, setMode] = useState<'config' | 'export'>('config')

  // Load existing configuration on open
  useEffect(() => {
    if (!isOpen) return

    async function loadConfig() {
      setLoading(true)
      setError(null)
      try {
        const config = await apiGet<ZoteroConfigResponse>('/api/zotero/config')
        if (config.configured && config.config) {
          setIsConfigured(true)
          setSavedUsername(config.config.username)
          setUserId(config.config.userId || '')
          setMode('export')
        } else {
          setIsConfigured(false)
          setMode('config')
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load configuration')
      } finally {
        setLoading(false)
      }
    }

    loadConfig()
  }, [isOpen])

  // Load export status if topicId provided
  useEffect(() => {
    if (!isOpen || !topicId || !isConfigured) return

    async function loadExportStatus() {
      try {
        const status = await apiGet<ExportStatusResponse>(`/api/zotero/export/status/${topicId}`)
        setExportStatus(status)
      } catch {
        // Ignore - may not have been exported yet
      }
    }

    loadExportStatus()
  }, [isOpen, topicId, isConfigured])

  // Load collections when switching to export mode
  useEffect(() => {
    if (!isOpen || mode !== 'export' || !isConfigured) return

    async function loadCollections() {
      try {
        const result = await apiGet<ZoteroCollectionsResponse>('/api/zotero/collections')
        setCollections(result.collections || [])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load collections')
      }
    }

    loadCollections()
  }, [isOpen, mode, isConfigured])

  // Reset state on close
  useEffect(() => {
    if (!isOpen) {
      setUserId('')
      setApiKey('')
      setError(null)
      setSuccess(null)
      setTestResult(null)
      setExportResult(null)
      setCollections([])
      setSelectedCollectionKey('')
      setCustomCollectionName('')
    }
  }, [isOpen])

  if (!isOpen) return null

  // Test connection
  async function handleTest() {
    if (!userId || !apiKey) {
      setError(t('zotero.errors.required', 'User ID and API Key are required'))
      return
    }

    setTesting(true)
    setError(null)
    setTestResult(null)

    try {
      const result = await apiPost<ZoteroTestResponse, { userId: string; apiKey: string }>(
        '/api/zotero/test',
        { userId, apiKey }
      )
      setTestResult(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection test failed')
    } finally {
      setTesting(false)
    }
  }

  // Save configuration
  async function handleSaveConfig() {
    if (!userId || !apiKey) {
      setError(t('zotero.errors.required', 'User ID and API Key are required'))
      return
    }

    setLoading(true)
    setError(null)

    try {
      await apiPost<{ success: boolean }, { userId: string; apiKey: string; username?: string }>(
        '/api/zotero/config',
        { userId, apiKey }
      )
      setSuccess(t('zotero.success.saved', 'Configuration saved successfully'))
      setIsConfigured(true)
      setMode('export')

      // Reload config to get username
      const config = await apiGet<ZoteroConfigResponse>('/api/zotero/config')
      if (config.config?.username) {
        setSavedUsername(config.config.username)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save configuration')
    } finally {
      setLoading(false)
    }
  }

  // Export papers
  async function handleExport() {
    setExporting(true)
    setError(null)
    setExportResult(null)

    const collectionName = customCollectionName || topicName || undefined

    try {
      let endpoint: string
      let payload: Record<string, unknown>

      if (topicId) {
        endpoint = `/api/zotero/export/topic/${topicId}`
        payload = {
          collectionName,
          collectionKey: selectedCollectionKey || undefined,
        }
      } else if (nodeId) {
        endpoint = `/api/zotero/export/node/${nodeId}`
        payload = {
          collectionName,
          collectionKey: selectedCollectionKey || undefined,
        }
      } else if (paperIds && paperIds.length > 0) {
        endpoint = '/api/zotero/export/papers'
        payload = {
          paperIds,
          collectionName,
          collectionKey: selectedCollectionKey || undefined,
        }
      } else {
        setError(t('zotero.errors.noTarget', 'No papers to export'))
        setExporting(false)
        return
      }

      const result = await apiPost<ZoteroExportResponse, Record<string, unknown>>(
        endpoint,
        payload
      )
      setExportResult(result)

      if (result.success) {
        setSuccess(
          t('zotero.success.exported', `Exported ${result.exportedCount} papers to Zotero`)
        )
      } else if (result.errors.length > 0) {
        setError(result.errors[0])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  // Delete configuration
  async function handleDeleteConfig() {
    setLoading(true)
    try {
      await fetch('/api/zotero/config', { method: 'DELETE' })
      setIsConfigured(false)
      setSavedUsername(null)
      setUserId('')
      setApiKey('')
      setMode('config')
      setSuccess(t('zotero.success.deleted', 'Configuration removed'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove configuration')
    } finally {
      setLoading(false)
    }
  }

  // Get help link
  const zoteroHelpLink = 'https://www.zotero.org/support/dev/web_api/v3/basics'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        className={cn(
          'w-[480px] max-h-[80vh] overflow-y-auto rounded-[18px] bg-white',
          'shadow-[0_8px_30px_rgba(15,23,42,0.12)] border border-black/8'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[10px] bg-[#f59e0b]/10 flex items-center justify-center">
              <Upload className="w-5 h-5 text-[#f59e0b]" />
            </div>
            <h2 className="text-[16px] font-semibold text-black">
              {t('zotero.title', 'Export to Zotero')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-black/5 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-black/50" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-black/30" />
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 rounded-[12px] bg-red-50 border border-red-100 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-[13px] text-red-700">{error}</p>
            </div>
          )}

          {/* Success message */}
          {success && (
            <div className="mb-4 p-3 rounded-[12px] bg-green-50 border border-green-100 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
              <p className="text-[13px] text-green-700">{success}</p>
            </div>
          )}

          {/* Configuration Mode */}
          {!loading && mode === 'config' && (
            <div className="space-y-4">
              <p className="text-[13px] text-black/60">
                {t(
                  'zotero.config.description',
                  'Connect your Zotero library to export papers. You need your User ID and API Key from Zotero.'
                )}
              </p>

              <a
                href={zoteroHelpLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] text-[#3b82f6] hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {t('zotero.config.help', 'How to get API credentials')}
              </a>

              <div className="space-y-3">
                <div>
                  <label className="block text-[12px] font-medium text-black/70 mb-1.5">
                    {t('zotero.config.userId', 'User ID')}
                  </label>
                  <input
                    type="text"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder={t('zotero.config.userIdPlaceholder', 'e.g., 123456')}
                    className={cn(
                      'w-full px-3 py-2.5 rounded-[10px] border border-black/10',
                      'text-[14px] text-black placeholder:text-black/30',
                      'focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]/20'
                    )}
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-black/70 mb-1.5">
                    {t('zotero.config.apiKey', 'API Key')}
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={t('zotero.config.apiKeyPlaceholder', 'Your Zotero API key')}
                    className={cn(
                      'w-full px-3 py-2.5 rounded-[10px] border border-black/10',
                      'text-[14px] text-black placeholder:text-black/30',
                      'focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]/20'
                    )}
                  />
                </div>
              </div>

              {/* Test result */}
              {testResult && (
                <div
                  className={cn(
                    'p-3 rounded-[12px] flex items-start gap-3',
                    testResult.success ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'
                  )}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  )}
                  <div className="text-[13px]">
                    {testResult.success
                      ? t('zotero.test.success', `Connected to Zotero${testResult.username ? ` (${testResult.username})` : ''}`)
                      : testResult.error}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleTest}
                  disabled={testing || !userId || !apiKey}
                  className={cn(
                    'px-4 py-2.5 rounded-[10px] text-[13px] font-medium',
                    'border border-black/10 bg-white text-black/70',
                    'hover:bg-black/5 disabled:opacity-50 disabled:cursor-not-allowed',
                    'flex items-center gap-2'
                  )}
                >
                  {testing && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t('zotero.actions.test', 'Test Connection')}
                </button>

                <button
                  onClick={handleSaveConfig}
                  disabled={loading || !userId || !apiKey}
                  className={cn(
                    'px-4 py-2.5 rounded-[10px] text-[13px] font-medium',
                    'bg-[#3b82f6] text-white hover:bg-[#3b82f6]/90',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'flex items-center gap-2'
                  )}
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <KeyRound className="w-4 h-4" />
                  {t('zotero.actions.save', 'Save Configuration')}
                </button>
              </div>
            </div>
          )}

          {/* Export Mode */}
          {!loading && mode === 'export' && isConfigured && (
            <div className="space-y-4">
              {/* Connected status */}
              <div className="p-3 rounded-[12px] bg-[#f59e0b]/5 border border-[#f59e0b]/20 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#f59e0b]" />
                <div className="text-[13px] text-black/70">
                  {t(
                    'zotero.export.connected',
                    `Connected to Zotero${savedUsername ? ` (${savedUsername})` : ''}`
                  )}
                </div>
                <button
                  onClick={() => setMode('config')}
                  className="ml-auto text-[12px] text-[#3b82f6] hover:underline"
                >
                  {t('zotero.export.editConfig', 'Edit')}
                </button>
              </div>

              {/* Previous export status */}
              {exportStatus?.exported && (
                <div className="p-3 rounded-[12px] bg-black/3 flex items-center gap-3">
                  <FolderOpen className="w-5 h-5 text-black/40" />
                  <div className="text-[12px] text-black/50">
                    {t(
                      'zotero.export.previousExport',
                      `Previously exported at ${exportStatus.exportedAt ? new Date(exportStatus.exportedAt).toLocaleDateString() : 'unknown'}`
                    )}
                  </div>
                </div>
              )}

              {/* Export options */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[12px] font-medium text-black/70 mb-1.5">
                    {t('zotero.export.collection', 'Collection')}
                  </label>
                  <select
                    value={selectedCollectionKey}
                    onChange={(e) => setSelectedCollectionKey(e.target.value)}
                    className={cn(
                      'w-full px-3 py-2.5 rounded-[10px] border border-black/10',
                      'text-[14px] text-black',
                      'focus:outline-none focus:border-[#3b82f6]'
                    )}
                  >
                    <option value="">
                      {t('zotero.export.newCollection', 'Create new collection')}
                    </option>
                    {collections.map((col) => (
                      <option key={col.key} value={col.key}>
                        {col.name}
                      </option>
                    ))}
                  </select>
                </div>

                {!selectedCollectionKey && (
                  <div>
                    <label className="block text-[12px] font-medium text-black/70 mb-1.5">
                      {t('zotero.export.collectionName', 'Collection Name')}
                    </label>
                    <input
                      type="text"
                      value={customCollectionName}
                      onChange={(e) => setCustomCollectionName(e.target.value)}
                      placeholder={topicName || t('zotero.export.collectionNamePlaceholder', 'My Research')}
                      className={cn(
                        'w-full px-3 py-2.5 rounded-[10px] border border-black/10',
                        'text-[14px] text-black placeholder:text-black/30',
                        'focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]/20'
                      )}
                    />
                  </div>
                )}
              </div>

              {/* Export result */}
              {exportResult && (
                <div
                  className={cn(
                    'p-3 rounded-[12px] flex items-start gap-3',
                    exportResult.success ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'
                  )}
                >
                  {exportResult.success ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  )}
                  <div className="text-[13px]">
                    {exportResult.success
                      ? t('zotero.export.result', `Exported ${exportResult.exportedCount} papers successfully`)
                      : exportResult.errors[0] || 'Export failed'}
                  </div>
                </div>
              )}

              {/* Export actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className={cn(
                    'flex-1 px-4 py-2.5 rounded-[10px] text-[13px] font-medium',
                    'bg-[#f59e0b] text-white hover:bg-[#f59e0b]/90',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'flex items-center justify-center gap-2'
                  )}
                >
                  {exporting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Upload className="w-4 h-4" />
                  {t('zotero.actions.export', 'Export to Zotero')}
                </button>

                <button
                  onClick={handleDeleteConfig}
                  className={cn(
                    'px-4 py-2.5 rounded-[10px] text-[13px] font-medium',
                    'border border-black/10 bg-white text-black/50',
                    'hover:bg-black/5 hover:text-black/70'
                  )}
                >
                  {t('zotero.actions.disconnect', 'Disconnect')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ZoteroExportDialog