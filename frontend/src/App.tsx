import { Suspense, lazy, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { Layout } from '@/components/Layout/Layout'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'
import { TopicRegistryProvider } from '@/hooks'

const HomePage = lazy(() => import('@/pages/HomePage').then((module) => ({ default: module.HomePage })))
const FavoritesPage = lazy(() =>
  import('@/pages/FavoritesPage').then((module) => ({ default: module.FavoritesPage })),
)
const TopicManagerPage = lazy(() =>
  import('@/pages/TopicManagerPage').then((module) => ({ default: module.TopicManagerPage })),
)
const TopicPage = lazy(() => import('@/pages/TopicPage').then((module) => ({ default: module.TopicPage })))
const ResearchPage = lazy(() =>
  import('@/pages/ResearchPage').then((module) => ({ default: module.ResearchPage })),
)
const PaperPage = lazy(() => import('@/pages/PaperPage').then((module) => ({ default: module.PaperPage })))
const TodayPage = lazy(() => import('@/pages/TodayPage').then((module) => ({ default: module.default })))
const NodeDetailPage = lazy(() => import('@/pages/NodeDetailPage').then((module) => ({ default: module.NodeDetailPage })))

export default function App() {
  return (
    <ErrorBoundary name="AppRoot" quiet>
      <BrowserRouter>
        <TopicRegistryProvider>
          <Layout>
            <Routes>
              <Route path="/" element={withPageFallback(<HomePage />)} />
              <Route path="/today" element={withPageFallback(<TodayPage />)} />
              <Route path="/favorites" element={withPageFallback(<FavoritesPage />)} />
              <Route path="/manage/topics" element={withPageFallback(<TopicManagerPage />)} />
              <Route path="/topic/:topicId" element={withPageFallback(<TopicPage />)} />
              <Route path="/topic/:topicId/research" element={withPageFallback(<ResearchPage />)} />
              <Route path="/paper/:paperId" element={withPageFallback(<PaperPage />)} />
              <Route path="/node/:nodeId" element={withPageFallback(<NodeDetailPage />)} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </TopicRegistryProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

function withPageFallback(page: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{page}</Suspense>
}

function RouteFallback() {
  return (
    <div className="min-h-screen bg-white px-4 py-10 text-sm text-black/56 md:px-6 xl:px-10">
      正在加载页面内容...
    </div>
  )
}
