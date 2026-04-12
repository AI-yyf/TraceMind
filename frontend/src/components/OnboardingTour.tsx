/**
 * OnboardingTour - 新用户引导流程组件
 * 
 * 功能：
 * - 首次访问时自动显示 3-5 步引导
 * - 高亮关键 UI 元素
 * - 可跳过、可重播
 * - 使用 localStorage 记录完成状态
 */

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { setItem, getItem } from '../utils/storage'

const ONBOARDING_KEY = 'tracemind:onboarding:completed'
const ONBOARDING_VERSION = 1

interface OnboardingStep {
  id: string
  titleKey: string
  descriptionKey: string
  targetSelector?: string
  position: 'center' | 'top' | 'bottom' | 'left' | 'right'
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    titleKey: 'onboarding.welcome.title',
    descriptionKey: 'onboarding.welcome.description',
    position: 'center',
  },
  {
    id: 'create-topic',
    titleKey: 'onboarding.createTopic.title',
    descriptionKey: 'onboarding.createTopic.description',
    targetSelector: '[data-onboarding="create-topic"]',
    position: 'bottom',
  },
  {
    id: 'search',
    titleKey: 'onboarding.search.title',
    descriptionKey: 'onboarding.search.description',
    targetSelector: '[data-onboarding="global-search"]',
    position: 'bottom',
  },
  {
    id: 'settings',
    titleKey: 'onboarding.settings.title',
    descriptionKey: 'onboarding.settings.description',
    targetSelector: '[data-onboarding="settings"]',
    position: 'left',
  },
  {
    id: 'complete',
    titleKey: 'onboarding.complete.title',
    descriptionKey: 'onboarding.complete.description',
    position: 'center',
  },
]

interface OnboardingTourProps {
  forceShow?: boolean
  onComplete?: () => void
  onSkip?: () => void
}

export function OnboardingTour({ forceShow = false, onComplete, onSkip }: OnboardingTourProps) {
  const { t } = useTranslation()
  const [isVisible, setIsVisible] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)

  // 检查是否需要显示 onboarding
  useEffect(() => {
    if (forceShow) {
      setIsVisible(true)
      return
    }

    const cached = getItem<{ completed: boolean; version: number }>(ONBOARDING_KEY)
    if (!cached || cached.version !== ONBOARDING_VERSION || cached.completed !== true) {
      // 延迟显示，等待页面加载完成
      const timer = setTimeout(() => setIsVisible(true), 1000)
      return () => clearTimeout(timer)
    }
  }, [forceShow])

  // 更新目标元素位置
  useEffect(() => {
    if (!isVisible) return

    const step = ONBOARDING_STEPS[currentStepIndex]
    if (!step.targetSelector) {
      setTargetRect(null)
      return
    }

    const updatePosition = () => {
      const target = document.querySelector(step.targetSelector!)
      if (target) {
        setTargetRect(target.getBoundingClientRect())
      }
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    return () => window.removeEventListener('resize', updatePosition)
  }, [isVisible, currentStepIndex])

  const handleComplete = useCallback(() => {
    setIsVisible(false)
    setItem(ONBOARDING_KEY, { completed: true, version: ONBOARDING_VERSION })
    onComplete?.()
  }, [onComplete])

  const handleNext = useCallback(() => {
    if (currentStepIndex < ONBOARDING_STEPS.length - 1) {
      setCurrentStepIndex((prev) => prev + 1)
    } else {
      handleComplete()
    }
  }, [currentStepIndex, handleComplete])

  const handlePrevious = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1)
    }
  }, [currentStepIndex])

  const handleSkip = useCallback(() => {
    setIsVisible(false)
    setItem(ONBOARDING_KEY, { completed: true, version: ONBOARDING_VERSION })
    onSkip?.()
  }, [onSkip])

  if (!isVisible) return null

  const currentStep = ONBOARDING_STEPS[currentStepIndex]
  const isCentered = currentStep.position === 'center'

  // 计算弹窗位置
  const getPopupStyle = (): React.CSSProperties => {
    if (isCentered || !targetRect) {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      }
    }

    const gap = 16
    const popupWidth = 360
    const popupHeight = 200

    let top = 0
    let left = 0

    switch (currentStep.position) {
      case 'bottom':
        top = targetRect.bottom + gap
        left = targetRect.left + targetRect.width / 2 - popupWidth / 2
        break
      case 'top':
        top = targetRect.top - popupHeight - gap
        left = targetRect.left + targetRect.width / 2 - popupWidth / 2
        break
      case 'left':
        top = targetRect.top + targetRect.height / 2 - popupHeight / 2
        left = targetRect.left - popupWidth - gap
        break
      case 'right':
        top = targetRect.top + targetRect.height / 2 - popupHeight / 2
        left = targetRect.right + gap
        break
    }

    // 边界检查
    left = Math.max(16, Math.min(left, window.innerWidth - popupWidth - 16))
    top = Math.max(16, Math.min(top, window.innerHeight - popupHeight - 16))

    return { top, left }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999]"
      >
        {/* 遮罩层 */}
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={handleSkip}
        />

        {/* 高亮目标元素 */}
        {targetRect && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute rounded-lg ring-2 ring-primary-500 ring-offset-2 ring-offset-black/50 pointer-events-none"
            style={{
              top: targetRect.top - 4,
              left: targetRect.left - 4,
              width: targetRect.width + 8,
              height: targetRect.height + 8,
            }}
          />
        )}

        {/* 引导弹窗 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: 'spring', duration: 0.3 }}
          className="absolute w-[360px] bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden"
          style={getPopupStyle()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 进度指示器 */}
          <div className="flex gap-1.5 px-4 pt-4">
            {ONBOARDING_STEPS.map((_, index) => (
              <div
                key={index}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  index <= currentStepIndex
                    ? 'bg-primary-500'
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
            ))}
          </div>

          {/* 内容区 */}
          <div className="p-4 pt-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {t(currentStep.titleKey)}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              {t(currentStep.descriptionKey)}
            </p>
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleSkip}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            >
              {t('onboarding.skip')}
            </button>

            <div className="flex gap-2">
              {currentStepIndex > 0 && (
                <button
                  onClick={handlePrevious}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  {t('onboarding.previous')}
                </button>
              )}
              <button
                onClick={handleNext}
                className="px-4 py-1.5 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors"
              >
                {currentStepIndex === ONBOARDING_STEPS.length - 1
                  ? t('onboarding.finish')
                  : t('onboarding.next')}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default OnboardingTour
