import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Plus, X, Sparkles } from 'lucide-react'
import { Layout } from '../components/Layout'

interface TopicFormData {
  id: string
  nameZh: string
  nameEn: string
  focusLabel: string
  description: string
  queryTags: string[]
  problemPreference: string[]
}

export function CreateTopicPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState<TopicFormData>({
    id: '',
    nameZh: '',
    nameEn: '',
    focusLabel: '',
    description: '',
    queryTags: [],
    problemPreference: [],
  })
  const [newTag, setNewTag] = useState('')
  const [newProblem, setNewProblem] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // 生成 ID（如果没有填写）
      const topicId = formData.id || formData.nameEn.toLowerCase().replace(/\s+/g, '-')

      // 创建主题配置
      const topicConfig = {
        id: topicId,
        nameZh: formData.nameZh,
        nameEn: formData.nameEn,
        focusLabel: formData.focusLabel,
        description: formData.description,
        queryTags: formData.queryTags,
        problemPreference: formData.problemPreference,
        origin: {
          originPaperId: '',
          originQuestionDefinition: formData.description,
          originWhyThisCounts: '',
        },
        defaults: {
          bootstrapWindowDays: 365,
          maxPaperIntervalDays: 180,
          windowPolicy: 'auto',
        },
      }

      // 发送到后端
      const response = await fetch('/api/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(topicConfig),
      })

      if (response.ok) {
        // 创建成功，跳转到主题列表
        navigate('/topics')
      } else {
        alert('创建主题失败，请重试')
      }
    } catch (error) {
      console.error('Create topic error:', error)
      alert('创建主题失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  const addTag = () => {
    if (newTag.trim() && !formData.queryTags.includes(newTag.trim())) {
      setFormData({ ...formData, queryTags: [...formData.queryTags, newTag.trim()] })
      setNewTag('')
    }
  }

  const removeTag = (tag: string) => {
    setFormData({ ...formData, queryTags: formData.queryTags.filter(t => t !== tag) })
  }

  const addProblem = () => {
    if (newProblem.trim() && !formData.problemPreference.includes(newProblem.trim())) {
      setFormData({ ...formData, problemPreference: [...formData.problemPreference, newProblem.trim()] })
      setNewProblem('')
    }
  }

  const removeProblem = (problem: string) => {
    setFormData({ ...formData, problemPreference: formData.problemPreference.filter(p => p !== problem) })
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              返回
            </button>
            <h1 className="text-3xl font-bold text-gray-900">创建新主题</h1>
            <p className="text-gray-600 mt-2">定义您感兴趣的学术研究领域</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            {/* 主题 ID */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                主题标识（可选）
              </label>
              <input
                type="text"
                value={formData.id}
                onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                placeholder="例如：autonomous-driving"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-sm text-gray-500 mt-1">留空将自动生成</p>
            </div>

            {/* 中文名称 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                中文名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.nameZh}
                onChange={(e) => setFormData({ ...formData, nameZh: e.target.value })}
                placeholder="例如：自动驾驶世界模型"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* 英文名称 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                英文名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.nameEn}
                onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                placeholder="例如：Autonomous Driving World Models"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* 焦点标签 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                焦点标签 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.focusLabel}
                onChange={(e) => setFormData({ ...formData, focusLabel: e.target.value })}
                placeholder="例如：自动驾驶"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-sm text-gray-500 mt-1">简短描述主题的核心关注点</p>
            </div>

            {/* 描述 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                主题描述
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="描述这个主题的研究范围和目标..."
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* 搜索标签 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                搜索标签
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  placeholder="添加搜索关键词"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={addTag}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.queryTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm"
                  >
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <p className="text-sm text-gray-500 mt-1">用于在 arXiv 搜索相关论文</p>
            </div>

            {/* 问题偏好 */}
            <div className="mb-8">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                问题偏好
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newProblem}
                  onChange={(e) => setNewProblem(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addProblem())}
                  placeholder="添加关注的问题"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={addProblem}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.problemPreference.map((problem) => (
                  <span
                    key={problem}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm"
                  >
                    {problem}
                    <button type="button" onClick={() => removeProblem(problem)}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <p className="text-sm text-gray-500 mt-1">您特别关注的具体问题或方向</p>
            </div>

            {/* 提交按钮 */}
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 inline-flex items-center justify-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-5 h-5" />
                {isSubmitting ? '创建中...' : '创建主题'}
              </button>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="px-8 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-all"
              >
                取消
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  )
}
