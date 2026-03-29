import { useState, useCallback } from 'react'
import { motion } from 'framer-motion';
import { X, Plus, RotateCcw, ChevronDown, ChevronRight, Save, Info } from 'lucide-react'
import type { TopicId, TopicPreferenceOverrides } from '@/types/tracker'

type TopicPrefEditorProps = {
  topicId: TopicId
  defaults: {
    problemPreference: string[]
    queryTags: string[]
    maxPaperIntervalDays?: number
    nameZh: string
    focusLabel: string
    originQuestionDefinition: string
  }
  overrides: TopicPreferenceOverrides | undefined
  onSave: (topicId: TopicId, preferences: TopicPreferenceOverrides) => void
  onReset: (topicId: TopicId) => void
  onClose: () => void
}

/** 标签输入组件 — 支持添加/删除标签 */
function TagInput({
  value,
  onChange,
  placeholder,
  label,
  helperText,
}: {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder: string
  label: string
  helperText?: string
}) {
  const [input, setInput] = useState('')

  const addTag = useCallback(() => {
    const tag = input.trim()
    if (tag && !value.includes(tag)) {
      onChange([...value, tag])
      setInput('')
    }
  }, [input, value, onChange])

  const removeTag = useCallback(
    (tag: string) => {
      onChange(value.filter((t) => t !== tag))
    },
    [value, onChange]
  )

  return (
    <div>
      <label className="text-[12px] font-semibold text-neutral-600 uppercase tracking-wider mb-2 block">
        {label}
      </label>
      <div className="flex flex-wrap gap-2 mb-3 min-h-[32px]">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 shadow-sm"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="text-neutral-400 hover:text-red-500 transition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTag()
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-red-400 focus:ring-2 focus:ring-red-100 focus:outline-none transition"
        />
        <button
          type="button"
          onClick={addTag}
          className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-4 py-2.5 text-sm text-neutral-600 hover:border-red-300 hover:text-red-600 hover:bg-red-50 transition"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {helperText && (
        <p className="mt-2 text-[12px] text-neutral-400">{helperText}</p>
      )}
    </div>
  )
}

/** 折叠面板组件 */
function CollapsibleSection({
  title,
  children,
  defaultExpanded = false,
  badge,
}: {
  title: string
  children: React.ReactNode
  defaultExpanded?: boolean
  badge?: React.ReactNode
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  return (
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-neutral-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-neutral-800">{title}</span>
          {badge}
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-neutral-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-neutral-400" />
        )}
      </button>
      {isExpanded && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

export function TopicPrefEditor({
  topicId,
  defaults,
  overrides,
  onSave,
  onReset,
  onClose,
}: TopicPrefEditorProps) {
  // 合并默认值和当前覆盖值作为初始状态
  const [draft, setDraft] = useState<TopicPreferenceOverrides>({
    nameZh: overrides?.nameZh ?? defaults.nameZh,
    focusLabel: overrides?.focusLabel ?? defaults.focusLabel,
    originQuestionDefinition: overrides?.originQuestionDefinition ?? defaults.originQuestionDefinition,
    problemPreference: overrides?.problemPreference ?? defaults.problemPreference,
    queryTags: overrides?.queryTags ?? defaults.queryTags,
    maxPaperIntervalDays: overrides?.maxPaperIntervalDays ?? defaults.maxPaperIntervalDays ?? 61,
  })

  const initialDraft = {
    nameZh: overrides?.nameZh ?? defaults.nameZh,
    focusLabel: overrides?.focusLabel ?? defaults.focusLabel,
    originQuestionDefinition: overrides?.originQuestionDefinition ?? defaults.originQuestionDefinition,
    problemPreference: overrides?.problemPreference ?? defaults.problemPreference,
    queryTags: overrides?.queryTags ?? defaults.queryTags,
    maxPaperIntervalDays: overrides?.maxPaperIntervalDays ?? defaults.maxPaperIntervalDays ?? 61,
  }

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(initialDraft)

  const handleSave = () => {
    // 只保存与默认值不同的字段
    const diffOverrides: TopicPreferenceOverrides = {}
    if (draft.nameZh !== defaults.nameZh) diffOverrides.nameZh = draft.nameZh
    if (draft.focusLabel !== defaults.focusLabel) diffOverrides.focusLabel = draft.focusLabel
    if (draft.originQuestionDefinition !== defaults.originQuestionDefinition)
      diffOverrides.originQuestionDefinition = draft.originQuestionDefinition
    if (JSON.stringify(draft.problemPreference) !== JSON.stringify(defaults.problemPreference))
      diffOverrides.problemPreference = draft.problemPreference
    if (JSON.stringify(draft.queryTags) !== JSON.stringify(defaults.queryTags))
      diffOverrides.queryTags = draft.queryTags
    if (draft.maxPaperIntervalDays !== (defaults.maxPaperIntervalDays ?? 61))
      diffOverrides.maxPaperIntervalDays = draft.maxPaperIntervalDays

    onSave(topicId, diffOverrides)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* 面板 */}
      <div className="relative w-full max-w-[640px] max-h-[85vh] overflow-y-auto bg-white rounded-2xl shadow-2xl">
        {/* 顶栏 */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-100 bg-white px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-[12px] font-semibold text-red-600 uppercase tracking-wider">
                主题偏好设置
              </span>
            </div>
            <div className="mt-1 text-lg font-bold text-neutral-900">
              {draft.nameZh}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                type="button"
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition"
              >
                <Save className="h-4 w-4" />
                保存
              </motion.button>
            )}
            <button
              type="button"
              onClick={() => {
                onReset(topicId)
                onClose()
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50 transition"
              title="重置为默认值"
            >
              <RotateCcw className="h-4 w-4" />
              重置
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-400 hover:border-neutral-300 hover:text-neutral-600 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 内容 */}
        <div className="px-6 py-5 space-y-4">
          {/* 提示信息 */}
          <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
            <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700 leading-relaxed">
              修改偏好后，内容生成 Skill 在下次运行时会使用新的配置。主题管理仅控制网页展示，不影响 Skill 内部的问题追踪逻辑。
            </p>
          </div>

          {/* 基本信息 */}
          <CollapsibleSection title="基本信息" defaultExpanded={true}>
            <div className="space-y-4">
              <div>
                <label className="text-[12px] font-semibold text-neutral-600 uppercase tracking-wider mb-2 block">
                  主题名称
                </label>
                <input
                  type="text"
                  value={draft.nameZh ?? ''}
                  onChange={(e) => setDraft((prev) => ({ ...prev, nameZh: e.target.value }))}
                  className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-800 focus:border-red-400 focus:ring-2 focus:ring-red-100 focus:outline-none transition"
                />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-neutral-600 uppercase tracking-wider mb-2 block">
                  一句话描述
                </label>
                <input
                  type="text"
                  value={draft.focusLabel ?? ''}
                  onChange={(e) => setDraft((prev) => ({ ...prev, focusLabel: e.target.value }))}
                  className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-800 focus:border-red-400 focus:ring-2 focus:ring-red-100 focus:outline-none transition"
                />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-neutral-600 uppercase tracking-wider mb-2 block">
                  核心问题定义
                </label>
                <textarea
                  value={draft.originQuestionDefinition ?? ''}
                  onChange={(e) => setDraft((prev) => ({ ...prev, originQuestionDefinition: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-800 focus:border-red-400 focus:ring-2 focus:ring-red-100 focus:outline-none transition resize-none"
                />
                <p className="mt-2 text-[12px] text-neutral-400">
                  定义这个主题追踪的核心科学问题，影响 Skill 的论文选择策略。
                </p>
              </div>
            </div>
          </CollapsibleSection>

          {/* 追踪偏好 */}
          <CollapsibleSection 
            title="追踪偏好" 
            defaultExpanded={true}
            badge={
              <span className="text-[10px] px-2 py-0.5 bg-red-100 text-red-600 rounded-full font-medium">
                影响 Skill
              </span>
            }
          >
            <div className="space-y-5">
              <TagInput
                label="问题偏好"
                value={draft.problemPreference ?? []}
                onChange={(tags) => setDraft((prev) => ({ ...prev, problemPreference: tags }))}
                placeholder="输入关注点，如：感知-决策耦合、世界模型..."
                helperText="Skill 在选择论文时会优先匹配这些关注点。使用准确的学术术语。"
              />
              <TagInput
                label="查询标签"
                value={draft.queryTags ?? []}
                onChange={(tags) => setDraft((prev) => ({ ...prev, queryTags: tags }))}
                placeholder="输入英文搜索标签，如：world model、VLA..."
                helperText="ArXiv 搜索时使用的标签。建议使用英文学术术语，多个标签会组合搜索。"
              />
            </div>
          </CollapsibleSection>

          {/* 高级设置 */}
          <CollapsibleSection title="高级设置">
            <div className="space-y-4">
              <div>
                <label className="text-[12px] font-semibold text-neutral-600 uppercase tracking-wider mb-2 block">
                  论文最大时间间隔（天）
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={draft.maxPaperIntervalDays ?? 61}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        maxPaperIntervalDays: Math.max(1, Math.min(365, Number(e.target.value) || 61)),
                      }))
                    }
                    className="w-28 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-800 focus:border-red-400 focus:ring-2 focus:ring-red-100 focus:outline-none transition"
                  />
                  <span className="text-sm text-neutral-500">
                    约 {Math.round((draft.maxPaperIntervalDays ?? 61) / 30)} 个月
                  </span>
                </div>
                <p className="mt-2 text-[12px] text-neutral-400">
                  下一篇论文的发表时间与上一篇的最大间隔天数。超过此间隔会触发问题追踪的重新评估。
                </p>
              </div>
            </div>
          </CollapsibleSection>

          {/* 变更提示 */}
          {hasChanges && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
            >
              <p className="text-sm text-amber-700 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                你有未保存的变更。保存后 Skill 将在下次生成内容时使用新的偏好。
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}

// 需要导入 motion
