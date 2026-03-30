import React, { useState, useEffect } from 'react'
import { Globe, Download, Upload, Plus, Edit2, Trash2, CheckCircle, XCircle, Loader2, FileJson, RefreshCw } from 'lucide-react'

interface LanguageTemplate {
  id: string
  name: string
  description?: string
  language: string
  category: 'topicGeneration' | 'discovery' | 'classification' | 'content' | 'custom'
  system: string
  user: string
  isBuiltIn?: boolean
}

interface Language {
  code: string
  name: string
  nativeName: string
  isDefault?: boolean
}

const categoryLabels = {
  topicGeneration: '主题生成',
  discovery: '论文发现',
  classification: '论文分类',
  content: '内容生成',
  custom: '自定义',
}

export const PromptTemplateManager: React.FC = () => {
  const [languages, setLanguages] = useState<Language[]>([])
  const [templates, setTemplates] = useState<LanguageTemplate[]>([])
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<LanguageTemplate | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  useEffect(() => {
    fetchLanguages()
    fetchTemplates()
  }, [])

  const fetchLanguages = async () => {
    try {
      const res = await fetch('/api/prompt-templates/languages')
      const data = await res.json()
      if (data.success) {
        setLanguages(data.data)
      }
    } catch (e) {
      console.error('Failed to fetch languages:', e)
    }
  }

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedLanguage !== 'all') params.set('language', selectedLanguage)
      if (selectedCategory !== 'all') params.set('category', selectedCategory)

      const res = await fetch(`/api/prompt-templates/templates?${params}`)
      const data = await res.json()
      if (data.success) {
        setTemplates(data.data)
      }
    } catch (e) {
      console.error('Failed to fetch templates:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTemplates()
  }, [selectedLanguage, selectedCategory])

  const handleExport = async () => {
    try {
      const params = new URLSearchParams()
      if (selectedLanguage !== 'all') params.set('language', selectedLanguage)

      const res = await fetch(`/api/prompt-templates/export/${selectedLanguage !== 'all' ? selectedLanguage : ''}`)
      const data = await res.json()

      if (data.success) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `prompt-templates-${selectedLanguage || 'all'}-${Date.now()}.json`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (e) {
      console.error('Export failed:', e)
    }
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImportError(null)

    try {
      const text = await file.text()
      const imported = JSON.parse(text)

      const templatesToImport = Array.isArray(imported) ? imported : imported.data || [imported]

      const res = await fetch('/api/prompt-templates/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates: templatesToImport }),
      })

      const result = await res.json()

      if (result.success) {
        alert(`导入成功！\n导入: ${result.data.imported} 个\n失败: ${result.data.errors} 个`)
        fetchTemplates()
      } else {
        setImportError(result.error || '导入失败')
      }
    } catch (e) {
      setImportError('文件格式错误，请检查 JSON 格式')
    }

    event.target.value = ''
  }

  const handleReset = async (language: string) => {
    if (!confirm(`确定要重置 ${language} 的默认模板吗？`)) return

    try {
      const res = await fetch(`/api/prompt-templates/reset/${language}`, { method: 'POST' })
      const data = await res.json()

      if (data.success) {
        alert(`已重置 ${language} 的默认模板`)
        fetchTemplates()
      }
    } catch (e) {
      console.error('Reset failed:', e)
    }
  }

  const handleDelete = async (template: LanguageTemplate) => {
    if (template.isBuiltIn) {
      alert('无法删除内置模板')
      return
    }

    if (!confirm(`确定要删除模板 "${template.name}" 吗？`)) return

    try {
      const res = await fetch(`/api/prompt-templates/${template.id}`, { method: 'DELETE' })
      const data = await res.json()

      if (data.success) {
        fetchTemplates()
      }
    } catch (e) {
      console.error('Delete failed:', e)
    }
  }

  const filteredTemplates = templates.filter(t => {
    if (selectedCategory !== 'all' && t.category !== selectedCategory) return false
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900">提示词模板管理</h3>
          <p className="text-sm text-gray-500">导入/导出/编辑多语言提示词模板</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            导出
          </button>
          <label className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 cursor-pointer">
            <Upload className="w-4 h-4" />
            导入
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>
        </div>
      </div>

      {importError && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-2">
          <XCircle className="w-5 h-5" />
          {importError}
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">语言</label>
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg"
          >
            <option value="all">全部语言</option>
            {languages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.nativeName} {lang.isDefault ? '(默认)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">类别</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg"
          >
            <option value="all">全部分类</option>
            {Object.entries(categoryLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        {selectedLanguage !== 'all' && (
          <div className="flex items-end">
            <button
              onClick={() => handleReset(selectedLanguage)}
              className="px-4 py-2 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              重置为默认
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className="bg-white rounded-xl border border-gray-200 p-4"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-gray-900">{template.name}</h4>
                    {template.isBuiltIn && (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                        内置
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {languages.find(l => l.code === template.language)?.nativeName || template.language} · {categoryLabels[template.category]}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditingTemplate(template)}
                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  {!template.isBuiltIn && (
                    <button
                      onClick={() => handleDelete(template)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div>
                  <label className="text-gray-500">System Prompt:</label>
                  <p className="text-gray-700 bg-gray-50 rounded p-2 max-h-20 overflow-hidden">
                    {template.system.substring(0, 150)}...
                  </p>
                </div>
                <div>
                  <label className="text-gray-500">User Prompt:</label>
                  <p className="text-gray-700 bg-gray-50 rounded p-2 max-h-20 overflow-hidden">
                    {template.user.substring(0, 150)}...
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {filteredTemplates.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-500">
          <FileJson className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>暂无模板</p>
          <p className="text-sm">导入 JSON 文件或重置为默认模板</p>
        </div>
      )}

      {editingTemplate && (
        <TemplateEditor
          template={editingTemplate}
          onClose={() => setEditingTemplate(null)}
          onSave={() => {
            setEditingTemplate(null)
            fetchTemplates()
          }}
        />
      )}
    </div>
  )
}

interface TemplateEditorProps {
  template: LanguageTemplate
  onClose: () => void
  onSave: () => void
}

const TemplateEditor: React.FC<TemplateEditorProps> = ({ template, onClose, onSave }) => {
  const [form, setForm] = useState<LanguageTemplate>(template)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/prompt-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (res.ok) {
        onSave()
      }
    } catch (e) {
      console.error('Save failed:', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-bold text-gray-900 mb-4">编辑模板</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">模板名称</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
            <input
              type="text"
              value={form.description || ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">System Prompt</label>
            <textarea
              value={form.system}
              onChange={(e) => setForm({ ...form, system: e.target.value })}
              rows={8}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">User Prompt</label>
            <textarea
              value={form.user}
              onChange={(e) => setForm({ ...form, user: e.target.value })}
              rows={8}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg font-mono text-sm"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default PromptTemplateManager
