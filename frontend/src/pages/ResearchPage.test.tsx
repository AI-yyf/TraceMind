// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ModelConfigResponse } from '@/types/alpha'
import { invalidateModelConfigResponse } from '@/utils/omniRuntimeCache'

vi.mock('@/i18n', async () => {
  const actual = await vi.importActual<typeof import('@/i18n')>('@/i18n')

  return {
    ...actual,
    useI18n: () => ({
      t: (key: string, fallback?: string) => fallback ?? key,
      preference: {
        primary: 'en',
        secondary: 'zh',
        mode: 'monolingual',
      },
    }),
  }
})

import { ResearchPage } from './ResearchPage'

const FULL_CAPABILITY = {
  text: true,
  image: true,
  pdf: true,
  chart: true,
  formula: true,
  citationsNative: false,
  fileParserNative: true,
  toolCalling: true,
  jsonMode: true,
  streaming: true,
} as const

const TOPICS = [
  {
    id: 'agent',
    nameZh: 'Agent Systems',
    nameEn: 'Agent Systems',
  },
  {
    id: 'embodied-vla',
    nameZh: 'Embodied VLA',
    nameEn: 'Embodied VLA',
  },
] as const

const EXISTING_TASK_PROGRESS = {
  taskId: 'task-1',
  topicId: 'agent',
  topicName: 'Agent Systems',
  researchMode: 'duration',
  durationHours: 720,
  currentStage: 1,
  totalStages: 5,
  stageProgress: 40,
  currentStageRuns: 2,
  currentStageTargetRuns: 5,
  stageRunMap: { '1': 2 },
  totalRuns: 2,
  successfulRuns: 2,
  failedRuns: 0,
  lastRunAt: '2026-04-15T00:00:00.000Z',
  lastRunResult: 'success',
  discoveredPapers: 12,
  admittedPapers: 3,
  generatedContents: 1,
  figureCount: 4,
  tableCount: 2,
  formulaCount: 1,
  figureGroupCount: 1,
  startedAt: '2026-04-15T00:00:00.000Z',
  deadlineAt: '2026-05-15T00:00:00.000Z',
  completedAt: null,
  activeSessionId: null,
  completedStageCycles: 0,
  currentStageStalls: 0,
  latestSummary: 'Stable progress',
  status: 'active',
  currentLensIndex: null,
  lensRotationHistory: [],
  lensStallCounts: {},
} as const

const EXISTING_TASK = {
  id: 'task-1',
  name: 'Task 1',
  cronExpression: '0 3 * * *',
  enabled: false,
  topicId: 'agent',
  action: 'discover',
  researchMode: 'duration',
  options: {
    stageDurationDays: 30,
    durationHours: 720,
  },
  progress: EXISTING_TASK_PROGRESS,
} as const

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeModelConfigResponse(): ModelConfigResponse {
  return {
    userId: 'default',
    config: {
      language: {
        provider: 'openai_compatible',
        model: 'Kimi-K2.5',
        baseUrl: 'https://ai.1seey.com/v1',
        apiKeyStatus: 'configured',
        apiKeyPreview: 'sk-***',
      },
      multimodal: {
        provider: 'openai_compatible',
        model: 'Kimi-K2.5',
        baseUrl: 'https://ai.1seey.com/v1',
        apiKeyStatus: 'configured',
        apiKeyPreview: 'sk-***',
      },
    },
    catalog: [
      {
        provider: 'openai_compatible',
        label: 'OpenAI-Compatible',
        baseUrl: 'https://ai.1seey.com/v1',
        adapter: 'openai-compatible',
        providerAuthEnvVars: ['OPENAI_API_KEY'],
        providerAuthChoices: [],
        models: [
          {
            id: 'Kimi-K2.5',
            label: 'Kimi K2.5',
            slot: 'both',
            capabilities: FULL_CAPABILITY,
            recommended: true,
            description: 'Long-context multimodal model.',
          },
        ],
      },
    ],
    presets: [
      {
        id: 'kimi-dual-slot',
        label: 'Kimi dual slot',
        description: 'Kimi on both slots.',
        language: {
          provider: 'openai_compatible',
          model: 'Kimi-K2.5',
        },
        multimodal: {
          provider: 'openai_compatible',
          model: 'Kimi-K2.5',
        },
      },
    ],
  }
}

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ResearchPage />
    </MemoryRouter>,
  )
}

function clickTopic(label: string) {
  const button = screen.getByText(label).closest('button')
  expect(button).not.toBeNull()
  fireEvent.click(button as HTMLButtonElement)
}

function installFetchMock() {
  const batchBodies: Array<Record<string, unknown>> = []
  const taskBodies: Array<Record<string, unknown>> = []

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()

    if (url.includes('/api/tasks/topics') && method === 'GET') {
      return jsonResponse({ success: true, data: TOPICS })
    }

    if (url.includes('/api/model-configs') && method === 'GET') {
      return jsonResponse({ success: true, data: makeModelConfigResponse() })
    }

    if (/\/api\/tasks$/u.test(url) && method === 'GET') {
      return jsonResponse({ success: true, data: [EXISTING_TASK] })
    }

    if (/\/api\/topics\/research-session\/batch$/u.test(url) && method === 'POST') {
      batchBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)
      return jsonResponse({ success: true })
    }

    if (/\/api\/tasks$/u.test(url) && method === 'POST') {
      taskBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)
      return jsonResponse({ success: true })
    }

    if (/\/api\/tasks\/.+/u.test(url) && method === 'GET') {
      return jsonResponse({
        success: true,
        data: {
          task: {
            id: 'task-1',
            name: 'Task 1',
            cronExpression: '0 3 * * *',
            enabled: false,
            topicId: 'agent',
            action: 'discover',
            researchMode: 'duration',
            options: {
              stageDurationDays: 30,
              durationHours: 720,
            },
          },
          progress: EXISTING_TASK_PROGRESS,
          history: [],
        },
      })
    }

    return jsonResponse({ success: true, data: {} })
  })

  vi.stubGlobal('fetch', fetchMock)

  return {
    batchBodies,
    taskBodies,
  }
}

describe('ResearchPage', () => {
  afterEach(() => {
    cleanup()
    invalidateModelConfigResponse()
    vi.unstubAllGlobals()
  })

  it('shows the configured Kimi runtime and starts a multi-topic batch session with duration-first payloads', async () => {
    const { batchBodies } = installFetchMock()

    renderPage()

    expect(
      await screen.findByText(
        'Choose one or more topics below to schedule and launch them from the same workbench.',
      ),
    ).toBeInTheDocument()

    expect(screen.getByText('Effective research runtime')).toBeInTheDocument()
    expect(screen.getAllByText('openai_compatible / Kimi-K2.5')).toHaveLength(2)
    expect(screen.getByText('https://ai.1seey.com/v1')).toBeInTheDocument()

    clickTopic('Agent Systems')
    clickTopic('Embodied VLA')

    fireEvent.click(screen.getByRole('button', { name: 'Start Research' }))

    await waitFor(() => {
      expect(batchBodies).toHaveLength(1)
    })

    expect(batchBodies[0]).toEqual({
      topicIds: ['agent', 'embodied-vla'],
      stageDurationDays: 30,
      durationHours: 720,
    })

    expect(await screen.findByText('Started 2 live research lanes.')).toBeInTheDocument()
  })

  it('creates one paused duration task per selected topic when launch is deferred', async () => {
    const { taskBodies } = installFetchMock()

    renderPage()

    await screen.findByText(
      'Choose one or more topics below to schedule and launch them from the same workbench.',
    )

    clickTopic('Agent Systems')

    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button', { name: 'Create Paused Tasks' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Create Paused Tasks' }))

    await waitFor(() => {
      expect(taskBodies).toHaveLength(1)
    })

    expect(taskBodies[0]).toEqual({
      id: 'topic-research:agent',
      name: 'Agent Systems Research Orchestration',
      cronExpression: '0 3 * * *',
      enabled: false,
      topicId: 'agent',
      action: 'discover',
      researchMode: 'duration',
      options: {
        stageDurationDays: 30,
        durationHours: 720,
      },
    })

    expect(await screen.findByText('Created 1 paused research tasks.')).toBeInTheDocument()
  })
})
