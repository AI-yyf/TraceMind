import { Suspense, lazy, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'

import { GlobalLanguageSwitch } from '@/components/GlobalLanguageSwitch'
import { Layout } from '@/components/Layout/Layout'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'
import { SystemInitCheck } from '@/components/SystemInitCheck'
import { ReadingWorkspaceProvider } from '@/contexts/ReadingWorkspaceContext'
import { TopicRegistryProvider } from '@/hooks'
import { I18nProvider, useI18n, BilingualProvider } from '@/i18n'

const HomePage = lazy(() => import('@/pages/HomePage').then((module) => ({ default: module.HomePage })))
const TopicPage = lazy(() => import('@/pages/TopicPage').then((module) => ({ default: module.TopicPage })))
const PaperPage = lazy(() => import('@/pages/PaperPage').then((module) => ({ default: module.PaperPage })))
const NodePage = lazy(() => import('@/pages/NodePage').then((module) => ({ default: module.NodePage })))
const TodayPage = lazy(() => import('@/pages/TodayPage'))
const FavoritesPage = lazy(() => import('@/pages/FavoritesPage').then((module) => ({ default: module.FavoritesPage })))
const TopicManagerPage = lazy(() => import('@/pages/TopicManagerPage').then((module) => ({ default: module.TopicManagerPage })))
const ResearchPage = lazy(() => import('@/pages/ResearchPage').then((module) => ({ default: module.ResearchPage })))
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((module) => ({ default: module.SettingsPage })))
const PromptStudioPage = lazy(() => import('@/pages/PromptStudioPage').then((module) => ({ default: module.PromptStudioPage })))

export default function App() {
  return (
    <ErrorBoundary name="AppRoot" quiet>
      <I18nProvider>
        <BilingualProvider>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <GlobalLanguageSwitch />
            <SystemInitCheck>
              <ReadingWorkspaceProvider>
                <TopicRegistryProvider>
                  <Layout>
                    <Routes>
                    <Route path="/" element={withPageFallback(<HomePage />)} />
                    <Route path="/topic/create" element={<Navigate to="/?create=1" replace />} />
                    <Route path="/topic/:topicId" element={withPageFallback(<TopicPage />)} />
                    <Route path="/topic/:topicId/research" element={<TopicResearchRedirect />} />
                    <Route path="/paper/:paperId" element={withPageFallback(<PaperPage />)} />
                    <Route path="/node/:nodeId" element={withPageFallback(<NodePage />)} />
                    <Route path="/today" element={withPageFallback(<TodayPage />)} />
                    <Route path="/favorites" element={withPageFallback(<FavoritesPage />)} />
                    <Route path="/manage/topics" element={withPageFallback(<TopicManagerPage />)} />
                    <Route path="/research" element={withPageFallback(<ResearchPage />)} />
                    <Route path="/settings" element={withPageFallback(<SettingsPage />)} />
                    <Route path="/prompt-studio" element={withPageFallback(<PromptStudioPage />)} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Layout>
              </TopicRegistryProvider>
            </ReadingWorkspaceProvider>
          </SystemInitCheck>
        </BrowserRouter>
      </BilingualProvider>
    </I18nProvider>
  </ErrorBoundary>
  )
}

function withPageFallback(page: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{page}</Suspense>
}

function RouteFallback() {
  const { t } = useI18n()
  return (
    <div className="min-h-screen bg-transparent px-4 py-10 text-sm text-black/56 md:px-6 xl:px-10">
      {t('common.loading')}
    </div>
  )
}

function TopicResearchRedirect() {
  const { topicId = '' } = useParams<{ topicId: string }>()
  return (
    <Navigate
      to={
        topicId
          ? `/topic/${encodeURIComponent(topicId)}?workbench=assistant&focus=research`
          : '/research'
      }
      replace
    />
  )
}
