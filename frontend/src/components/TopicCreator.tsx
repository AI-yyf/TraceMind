import React, { useState } from 'react'
import { Sparkles, Globe, Loader2, ChevronRight, AlertCircle, Languages } from 'lucide-react'

interface GeneratedTopic {
  nameZh: string
  nameEn: string
  keywords: Array<{ zh: string; en: string }>
  summary: string
  summaryZh?: string
  summaryEn?: string
  recommendedStages: number
  focusLabel?: string
  focusLabelZh?: string
  focusLabelEn?: string
}

interface TopicCreatorProps {
  onTopicCreated?: (topicId: string) => void
}

const languages = [
  { code: 'zh', name: '简体中文', nativeName: '简体中文' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'bilingual', name: '双语模式', nativeName: 'Bilingual' },
]

export const TopicCreator: React.FC<TopicCreatorProps> = ({ onTopicCreated }) => {
  const [description, setDescription] = useState('')
  const [descriptionEn, setDescriptionEn] = useState('')
  const [language, setLanguage] = useState<'zh' | 'en' | 'bilingual'>('bilingual')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<GeneratedTopic | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleGenerate = async () => {
    const desc = language === 'en' ? descriptionEn : description
    if (desc.length < 10) {
      setError('描述至少需要10个字符')
      return
    }

    setLoading(true)
    setError(null)
    setPreview(null)

    try {
      const requestBody: any = {
        description: language === 'en' ? descriptionEn : description,
        language,
        save: false,
      }

      if (language === 'bilingual' && descriptionEn) {
        requestBody.descriptionEn = descriptionEn
      }

      const response = await fetch('/api/topic-gen/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const result = await response.json()

      if (result.success) {
        setPreview(result.data)
      } else {
        setError(result.error || '生成失败')
      }
    } catch (e) {
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!preview) return

    setSaving(true)
    setError(null)

    try {
      const requestBody: any = {
        description: language === 'en' ? descriptionEn : description,
        language,
        save: true,
      }

      if (language === 'bilingual' && descriptionEn) {
        requestBody.descriptionEn = descriptionEn
      }

      const response = await fetch('/api/topic-gen/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const result = await response.json()

      if (result.success) {
        onTopicCreated?.(result.topicId)
        setDescription('')
        setDescriptionEn('')
        setPreview(null)
      } else {
        setError(result.error || '保存失败')
      }
    } catch (e) {
      setError('网络错误，请重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-amber-500" />
          创建新主题
        </h2>
        <p className="text-gray-600 mt-2">
          输入研究方向描述，AI 将自动生成主题名称和关键词
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            研究方向描述（{language === 'en' ? 'English' : '中文'}）
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={language === 'en'
              ? "e.g., I want to research the application of Large Language Models in autonomous driving decision systems, especially end-to-end planning and interpretability..."
              : "例如：我想研究大语言模型在自动驾驶决策系统中的应用，特别是端到端规划和可解释性方面..."}
            className="w-full h-32 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
          />
          <p className="text-sm text-gray-500 mt-1">
            {description.length} / 10 字符（最少）
          </p>
        </div>

        {language === 'bilingual' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <Languages className="w-4 h-4" />
              英文描述（可选）
            </label>
            <textarea
              value={descriptionEn}
              onChange={(e) => setDescriptionEn(e.target.value)}
              placeholder="English description (optional, for more accurate bilingual results)"
              className="w-full h-24 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Globe className="w-4 h-4 inline mr-1" />
            主题语言模式（创建后不可更改）
          </label>
          <div className="flex gap-3">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => setLanguage(lang.code as 'zh' | 'en' | 'bilingual')}
                className={`px-4 py-2 rounded-lg border-2 transition-all ${
                  language === lang.code
                    ? 'border-amber-500 bg-amber-50 text-amber-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="font-medium">{lang.nativeName}</span>
                {lang.code === 'bilingual' && (
                  <span className="block text-xs text-gray-500">中英双语</span>
                )}
              </button>
            ))}
          </div>
          <p className="text-sm text-gray-500 mt-2">
            {language === 'bilingual'
              ? '双语模式将生成中英文主题名和关键词'
              : '选择后所有内容将使用该语言'}
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-lg">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={loading || description.length < 10}
          className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium rounded-xl hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              AI 正在生成主题...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              生成主题预览
            </>
          )}
        </button>

        {preview && (
          <div className="mt-8 p-6 bg-gray-50 rounded-2xl border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4">主题预览</h3>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-500">主题名称（中文）</label>
                  <p className="text-xl font-semibold text-gray-900">{preview.nameZh}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Topic Name（English）</label>
                  <p className="text-xl font-semibold text-gray-900">{preview.nameEn}</p>
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-500">关键词</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {preview.keywords.map((kw, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm"
                    >
                      {kw.zh} / {kw.en}
                    </span>
                  ))}
                </div>
              </div>

              {(preview.summaryZh || preview.summaryEn) && (
                <div className="grid grid-cols-2 gap-4">
                  {preview.summaryZh && (
                    <div>
                      <label className="text-sm text-gray-500">描述（中文）</label>
                      <p className="text-gray-700">{preview.summaryZh}</p>
                    </div>
                  )}
                  {preview.summaryEn && (
                    <div>
                      <label className="text-sm text-gray-500">Description（English）</label>
                      <p className="text-gray-700">{preview.summaryEn}</p>
                    </div>
                  )}
                </div>
              )}

              {!preview.summaryZh && !preview.summaryEn && preview.summary && (
                <div>
                  <label className="text-sm text-gray-500">主题描述</label>
                  <p className="text-gray-700">{preview.summary}</p>
                </div>
              )}

              <div>
                <label className="text-sm text-gray-500">推荐研究阶段数</label>
                <p className="text-gray-900">{preview.recommendedStages} 个阶段</p>
              </div>

              {(preview.focusLabelZh || preview.focusLabelEn) && (
                <div>
                  <label className="text-sm text-gray-500">核心焦点</label>
                  <p className="text-gray-700">
                    {preview.focusLabelZh && <span>{preview.focusLabelZh}</span>}
                    {preview.focusLabelZh && preview.focusLabelEn && <span> | </span>}
                    {preview.focusLabelEn && <span>{preview.focusLabelEn}</span>}
                  </p>
                </div>
              )}

              <div className="pt-4 border-t border-gray-200">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full py-3 px-4 bg-green-600 text-white font-medium rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      保存中...
                    </>
                  ) : (
                    <>
                      保存主题
                      <ChevronRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default TopicCreator
