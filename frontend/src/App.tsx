import { Suspense, lazy, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { Layout } from '@/components/Layout/Layout'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'
import { TopicRegistryProvider } from '@/hooks'
import { PlaceholderPage } from '@/pages/PlaceholderPage'

const HomePage = lazy(() => import('@/pages/HomePage').then((module) => ({ default: module.HomePage })))
const TopicPage = lazy(() => import('@/pages/TopicPage').then((module) => ({ default: module.TopicPage })))

export default function App() {
  return (
    <ErrorBoundary name="AppRoot" quiet>
      <BrowserRouter>
        <TopicRegistryProvider>
          <Layout>
            <Routes>
              <Route path="/" element={withPageFallback(<HomePage />)} />
              <Route path="/topic/:topicId" element={withPageFallback(<TopicPage />)} />
              <Route
                path="/today"
                element={withPageFallback(
                  <PlaceholderPage
                    title="今日研究"
                    description="这个页面还在迁移到新的 Alpha 数据链路中。当前可用的完整闭环入口是主题页。"
                  />,
                )}
              />
              <Route
                path="/favorites"
                element={withPageFallback(
                  <PlaceholderPage
                    title="收藏"
                    description="收藏页会在后续阶段接入新的后端 ViewModel。当前先以主题页 Alpha 闭环为主。"
                  />,
                )}
              />
              <Route
                path="/manage/topics"
                element={withPageFallback(
                  <PlaceholderPage
                    title="主题管理"
                    description="主题管理页尚在迁移，当前推荐直接进入主题页进行展示与对话体验。"
                  />,
                )}
              />
              <Route
                path="/topic/:topicId/research"
                element={withPageFallback(
                  <PlaceholderPage
                    title="研究编排"
                    description="研究编排已经收敛到后端 Alpha 主链路中，前端工作台会在下一阶段重新接回。"
                  />,
                )}
              />
              <Route
                path="/paper/:paperId"
                element={withPageFallback(
                  <PlaceholderPage
                    title="论文页"
                    description="论文页正在从静态原型迁移到后端证据链。当前请优先通过主题页查看节点、代表论文和引用证据。"
                  />,
                )}
              />
              <Route
                path="/node/:nodeId"
                element={withPageFallback(
                  <PlaceholderPage
                    title="节点页"
                    description="节点详情页正在迁移，主题页已经提供节点锚点跳转和证据展开。"
                  />,
                )}
              />
              <Route
                path="/topic/create"
                element={withPageFallback(
                  <PlaceholderPage
                    title="创建主题"
                    description="创建主题流程还在接入新的后端自动化管线，当前先保留 Alpha 演示路径。"
                  />,
                )}
              />
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
