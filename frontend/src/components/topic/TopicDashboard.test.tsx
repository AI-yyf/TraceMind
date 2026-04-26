// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { I18nProvider } from '@/i18n'
import { TopicDashboard } from './TopicDashboard'

describe('TopicDashboard', () => {
  it('renders safely when older dashboard payloads omit new arrays and stats', () => {
    render(
      <I18nProvider>
        <MemoryRouter>
          <TopicDashboard
            dashboard={
              {
                topicId: 'topic-1',
                topicTitle: 'Topic title',
                stats: {
                  totalPapers: 2,
                  totalNodes: 1,
                  totalStages: 1,
                  timeSpanYears: 0,
                  avgPapersPerNode: 2,
                  citationCoverage: 1,
                },
                keyInsights: ['Insight one'],
              } as never
            }
            stageWindowMonths={1}
          />
        </MemoryRouter>
      </I18nProvider>,
    )

    expect(screen.getByText('Topic title')).toBeVisible()
    expect(screen.getByText('Insight one')).toBeVisible()
    expect(screen.getByText(/暂无研究主线数据|No research threads available/u)).toBeVisible()
    expect(
      screen.getByText(
        /All tracked papers in this stage window are already placed into nodes\.|当前时间窗内的追踪论文都已经进入节点。/u,
      ),
    ).toBeVisible()
  })
})
