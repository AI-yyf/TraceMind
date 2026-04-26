import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const backendOrigin = 'http://127.0.0.1:3303'
const canonicalTopicId = 'autonomous-driving'
const canonicalMergeNodeId = 'autonomous-driving:stage-2:1912.12294'
const canonicalStageWindowMonths = 3

type TopicViewModelResponse = {
  data: {
    graph?: {
      nodes: Array<{ nodeId: string }>
    }
    papers: Array<{ paperId: string; route: string }>
  }
}

async function ensureSystemReady(request: APIRequestContext) {
  const response = await request.get(`${backendOrigin}/health`)
  expect(response.ok()).toBeTruthy()
}

async function openWorkbench(page: Page) {
  const shell = page.getByTestId('right-sidebar-shell')
  if (await shell.isVisible().catch(() => false)) {
    return
  }

  const opener = page.getByTestId('topic-workbench-open')
  await expect(opener).toBeVisible()
  await opener.click()
  await expect(shell).toBeVisible()
}

async function openTopicResearchWorkbench(page: Page) {
  await openWorkbench(page)
  await page.getByTestId('sidebar-tab-research').click()
  await expect(page.getByTestId('workbench-research-panel')).toBeVisible()
}

async function fetchTopicViewModel(request: APIRequestContext) {
  const response = await request.get(
    `${backendOrigin}/api/topics/${canonicalTopicId}/view-model?stageMonths=${canonicalStageWindowMonths}`,
  )
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as TopicViewModelResponse
}

test.beforeEach(async ({ request, page }) => {
  await page.setViewportSize({ width: 1180, height: 920 })
  await page.addInitScript(() => {
    const onboardingValue = JSON.stringify({ completed: true, version: 1 })
    window.localStorage.setItem('tracemind-tracker:tracemind:onboarding:completed', onboardingValue)
    window.localStorage.setItem('tracemind:onboarding:completed', onboardingValue)
  })
  await ensureSystemReady(request)
})

test('global language switch is visible and updates homepage copy', async ({ page }) => {
  await page.goto('/')
  const languageSwitch = page.getByTestId('global-language-switch')
  const topicsHeading = page.locator('main h2').first()

  await expect(languageSwitch).toBeVisible()
  await expect(topicsHeading).toBeVisible()
  const initialHeading = (await topicsHeading.textContent())?.trim() ?? ''
  expect(initialHeading).toBeTruthy()

  const box = await languageSwitch.boundingBox()
  const viewport = page.viewportSize()
  expect(box).toBeTruthy()
  expect(viewport).toBeTruthy()

  if (box && viewport) {
    expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(90)
    expect(box.y + box.height).toBeGreaterThan(viewport.height - 120)
  }

  await page.getByTestId('language-menu-toggle').click()
  await expect(page.getByTestId('language-panel')).toBeVisible()
  await expect(page.getByTestId('language-menu-toggle')).toHaveAttribute('aria-expanded', 'true')
  await page.getByTestId('language-quick-en').click()
  await expect(topicsHeading).toHaveText('Research Topics')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')

  await page.getByTestId('language-menu-toggle').click()
  await expect(page.getByTestId('language-panel')).toBeVisible()
  await page.getByTestId('language-collapse-button').click()
  await expect(page.getByTestId('language-panel')).toBeHidden()
  await expect(page.getByTestId('language-menu-toggle')).toHaveAttribute('aria-expanded', 'false')

  await page.getByTestId('language-menu-toggle').click()
  await page.getByTestId('language-quick-zh').click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh')
  await expect(topicsHeading).not.toHaveText('Research Topics')
  expect(((await topicsHeading.textContent())?.trim() ?? '')).not.toBe(initialHeading)
})

test('create topic page localizes language cards when the interface language changes', async ({
  page,
}) => {
  await page.goto('/topic/create')
  await expect(page.getByTestId('create-topic-description')).toBeVisible()
  await expect(page.getByTestId('create-topic-preview-panel')).toBeVisible()

  await page.getByTestId('language-menu-toggle').click()
  await page.getByTestId('language-quick-en').click()

  await expect(page.getByText('Build a New Topic', { exact: true })).toBeVisible()
  await expect(page.getByTestId('create-topic-preview-panel')).toContainText('Preview')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})

test('favorites page localizes saved note labels when the interface language changes', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'favorite-excerpts',
      JSON.stringify([
        {
          id: 'favorite-1',
          kind: 'assistant',
          excerptTitle: 'Why the right sidebar must keep context',
          paragraphs: ['The right sidebar should feel like a workbench instead of a temporary chat drawer.'],
          savedAt: '2026-04-05T03:00:00.000Z',
          route: '/node/node-1?anchor=paper%3Apaper-1',
          sourceLabel: 'Research note',
          summary: 'Summarizes the role of the workbench inside the reading flow.',
          tags: ['sidebar', 'context'],
        },
      ]),
    )
  })

  await page.goto('/favorites')
  const heading = page.getByTestId('favorites-heading')
  const noteKind = page.getByTestId('favorite-note-kind').first()
  const initialHeading = (await heading.textContent())?.trim() ?? ''
  const initialKind = (await noteKind.textContent())?.trim() ?? ''

  expect(initialHeading).toBeTruthy()
  expect(initialKind).toBeTruthy()

  await page.getByTestId('language-menu-toggle').click()
  await page.getByTestId('language-option-ja').click()

  await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
  expect(((await heading.textContent())?.trim() ?? '')).not.toBe(initialHeading)
  expect(((await noteKind.textContent())?.trim() ?? '')).not.toBe(initialKind)
})

test('homepage search opens grouped backend results', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Control+K')
  await expect(page.getByTestId('global-search')).toBeVisible()

  await page.getByTestId('global-search-input').fill('Learning by Cheating')
  await expect(page.getByTestId('global-search-group-node')).toBeVisible()
  await expect(page.getByTestId('global-search-result-node').first()).toContainText(
    'Learning by Cheating',
  )
  await page.getByTestId('global-search-result-node').first().click()
  await expect(page).toHaveURL(/\/node\//)
})

test('homepage search shows the compact empty state when regression noise is filtered', async ({
  page,
}) => {
  await page.goto('/')
  await page.keyboard.press('Control+K')
  await page.getByTestId('global-search-input').fill('transformer')

  await expect(page.getByTestId('global-search-result-topic')).toHaveCount(0)
})

test('topic workbench keeps draft across tab switches and restores chat after reload', async ({
  page,
}) => {
  await page.goto(`/topic/${canonicalTopicId}?stageMonths=${canonicalStageWindowMonths}`)
  await openWorkbench(page)
  await expect(page.getByTestId('topic-workbench')).toBeVisible()

  const composer = page.getByTestId('assistant-composer-input')
  await composer.fill('Keep this draft in the assistant workbench.')
  await page.getByTestId('sidebar-tab-research').click()
  await expect(page.getByTestId('workbench-research-view-search')).toBeVisible()
  await page.getByTestId('workbench-research-view-search').click()
  await expect(page.getByTestId('topic-search-panel')).toBeVisible()
  await page.getByTestId('workbench-research-view-resources').click()
  await expect(page.getByTestId('topic-resources-panel')).toBeVisible()
  await page.getByTestId('sidebar-tab-assistant').click()
  await expect(composer).toHaveValue('Keep this draft in the assistant workbench.')

  await page.getByTestId('assistant-send-button').click()
  await expect(page.getByTestId('conversation-thread')).toContainText(
    'Keep this draft in the assistant workbench.',
  )
  await page.reload()
  await expect(page.getByTestId('conversation-thread')).toContainText(
    'Keep this draft in the assistant workbench.',
  )
})

test('seeded citation chip jumps to the cited paper anchor', async ({ page, request }) => {
  const topicPayload = await fetchTopicViewModel(request)
  const paper = topicPayload.data.papers[0]
  const paperId = paper?.paperId
  expect(paperId).toBeTruthy()
  expect(paper?.route).toBeTruthy()

  const now = new Date().toISOString()
  await page.addInitScript(
    (payload) => {
      window.localStorage.setItem(`topic-chat:${payload.topicId}`, JSON.stringify(payload.store))
    },
    {
      topicId: canonicalTopicId,
      paperId,
      store: {
        currentThreadId: 'thread-seeded',
        threads: [
          {
            id: 'thread-seeded',
            title: 'Seeded Citation',
            createdAt: now,
            updatedAt: now,
            messages: [
              {
                id: 'assistant-seeded',
                role: 'assistant',
                content: 'Open the linked citation to verify anchor navigation.',
                citations: [
                  {
                    anchorId: `paper:${paperId}`,
                    type: 'paper',
                    route:
                      paper?.route ??
                      `/topic/${canonicalTopicId}?stageMonths=${canonicalStageWindowMonths}&anchor=paper%3A${paperId}`,
                    label: 'Seeded citation',
                    quote: 'Seeded for regression coverage.',
                  },
                ],
                createdAt: now,
              },
            ],
          },
        ],
      },
    },
  )

  await page.goto(`/topic/${canonicalTopicId}?stageMonths=${canonicalStageWindowMonths}`)
  await openWorkbench(page)
  await page.getByTestId('assistant-citation').click()
  await expect(page).toHaveURL(new RegExp(`/node/.+anchor=paper%3A${paperId}`))
  await expect(page.getByTestId('node-reading')).toBeVisible()
})

test('topic research workbench returns topic-scoped search results and resource evidence', async ({
  page,
}) => {
  await page.goto(`/topic/${canonicalTopicId}?stageMonths=${canonicalStageWindowMonths}`)
  await openTopicResearchWorkbench(page)
  await page.getByTestId('workbench-research-view-search').click()
  await page.getByTestId('topic-search-input').fill('Learning by Cheating')
  await expect(page.locator('[data-testid^="topic-search-result-"]').first()).toBeVisible()
  await page.getByTestId('workbench-research-view-resources').click()
  await expect(page.getByTestId('topic-resources-panel')).toBeVisible()
})

test('topic workbench can add node context into the assistant tray', async ({ page }) => {
  await page.goto(`/topic/${canonicalTopicId}?stageMonths=${canonicalStageWindowMonths}`)
  await openTopicResearchWorkbench(page)
  await page.getByTestId('workbench-research-view-search').click()
  await page.getByTestId('topic-search-input').fill('Learning by Cheating')

  const firstNodeResult = page.getByTestId('topic-search-result-node').first()
  await expect(firstNodeResult).toBeVisible()
  await firstNodeResult.locator(':scope > div > button').click()

  await page.getByTestId('sidebar-tab-assistant').click()
  await expect(page.locator('[data-testid="context-pill-search"]').first()).toBeVisible()
})

test('topic research route opens the topic sidebar research workbench', async ({ page }) => {
  await page.goto(`/topic/${canonicalTopicId}/research`)
  await expect(page).toHaveURL(new RegExp(`/topic/${canonicalTopicId}\\?workbench=research`))
  await expect(page.getByTestId('right-sidebar-shell')).toBeVisible()
  await expect(page.getByTestId('sidebar-tab-research')).toBeVisible()
  await expect(page.getByTestId('workbench-research-panel')).toBeVisible()
  await expect(page.getByTestId('topic-research-session-card')).toBeVisible()
  await expect(page.getByTestId('topic-research-intel')).toBeVisible()
  await expect(page.getByTestId('topic-guidance-ledger-card')).toBeVisible()
  await expect(page.getByTestId('topic-research-world-card')).toBeVisible()
  await expect(page.getByTestId('topic-workbench-pulse-card')).toBeVisible()
  await expect(page.getByTestId('workbench-research-view-search')).toBeVisible()
})

test('node reading page keeps the same right-side workbench available', async ({
  page,
  request,
}) => {
  const topicPayload = await fetchTopicViewModel(request)
  const nodeId = topicPayload.data.graph?.nodes[0]?.nodeId
  expect(nodeId).toBeTruthy()

  await page.goto(`/node/${encodeURIComponent(nodeId!)}?stageMonths=${canonicalStageWindowMonths}`)
  await expect(page.getByTestId('node-reading')).toBeVisible()
  await expect(page.getByTestId('node-article-flow')).toBeVisible()
  expect(await page.getByTestId('node-article-flow').locator(':scope > *').count()).toBeGreaterThan(
    2,
  )
  await openWorkbench(page)
  await expect(page.getByTestId('right-sidebar-shell')).toBeVisible()
  await expect(page.getByTestId('assistant-composer-input')).toBeVisible()
})

test('node reading page switches between article and research views on the same reading surface', async ({
  page,
}) => {
  await page.goto(
    `/node/${encodeURIComponent(canonicalMergeNodeId)}?stageMonths=${canonicalStageWindowMonths}`,
  )

  await expect(page.getByTestId('node-reading')).toBeVisible()
  await expect(page.getByTestId('node-article-flow')).toBeVisible()

  await page.getByTestId('node-main-view-research').click()
  await expect(page).toHaveURL(/view=research/)
  await expect(page.getByTestId('node-research-view')).toBeVisible()
  await expect(page.getByTestId('node-article-flow')).toBeHidden()

  await page.getByTestId('node-main-view-article').click()
  await expect(page).not.toHaveURL(/view=research/)
  await expect(page.getByTestId('node-article-flow')).toBeVisible()
})

test('paper anchors reuse the node reading page and keep the same right-side workbench available', async ({
  page,
  request,
}) => {
  const topicPayload = await fetchTopicViewModel(request)
  const paper = topicPayload.data.papers[0]
  const paperId = paper?.paperId
  expect(paperId).toBeTruthy()
  expect(paper?.route).toBeTruthy()

  await page.goto(
    paper?.route ??
      `/topic/${canonicalTopicId}?stageMonths=${canonicalStageWindowMonths}&anchor=paper%3A${paperId}`,
  )
  await expect(page).toHaveURL(new RegExp(`/node/.+anchor=paper%3A${paperId}`))
  await expect(page.getByTestId('node-reading')).toBeVisible()
  await expect(page.getByTestId('node-article-flow')).toBeVisible()
  expect(await page.getByTestId('node-article-flow').locator(':scope > *').count()).toBeGreaterThan(
    2,
  )
  await openWorkbench(page)
  await expect(page.getByTestId('right-sidebar-shell')).toBeVisible()
  await expect(page.getByTestId('assistant-composer-input')).toBeVisible()
})

test('create topic generates preview and lands in the new topic workbench', async ({ page }) => {
  await page.goto('/topic/create')
  await page
    .getByTestId('create-topic-description')
    .fill(
      'Create a regression topic for multimodal transformer retrieval in scientific reading workbenches.',
    )
  await page.getByTestId('create-topic-preview').click()
  await expect(page.getByTestId('create-topic-save')).toBeEnabled()
  await page.getByTestId('create-topic-save').click()
  await expect(page).toHaveURL(/\/topic\/(?!create$).+/)
  await expect(page.getByTestId('topic-stage-map')).toBeVisible()
  await openWorkbench(page)
  await expect(page.getByTestId('topic-workbench')).toBeVisible()
})

test('settings route localizes overview shell when the interface language changes', async ({
  page,
}) => {
  await page.goto('/settings')
  await expect(page.getByTestId('settings-page')).toBeVisible()

  const overviewTitle = page.getByTestId('settings-overview-title')
  const currentFocus = page.getByTestId('settings-current-focus')

  await page.getByTestId('language-menu-toggle').click()
  await page.getByTestId('language-quick-en').click()

  await expect(overviewTitle).toContainText('Settings Overview')
  await expect(currentFocus).toContainText('Current focus')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')

  await page.getByTestId('language-menu-toggle').click()
  await page.getByTestId('language-option-ja').click()

  await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
  await expect(overviewTitle).not.toHaveText('Settings Overview')
  await expect(currentFocus).not.toContainText('Current focus')
})

test('prompt studio route exposes runtime controls and editable prompt templates', async ({
  page,
}) => {
  await page.goto('/prompt-studio?tab=prompts')
  await expect(page.getByTestId('prompt-studio-page')).toBeVisible()
  await expect(page.getByTestId('prompt-language-zh')).toBeVisible()
  await page.getByTestId('prompt-language-en').click()
  await expect(page.getByTestId('prompt-system-topic.hero')).toBeVisible()
  await expect(page.getByTestId('prompt-user-article.node')).toBeVisible()
  await expect(page.getByTestId('prompt-studio-save')).toBeVisible()
})

test('prompt studio shell localizes heading and guide copy when the interface language changes', async ({
  page,
}) => {
  await page.goto('/prompt-studio?tab=models')
  await expect(page.getByTestId('prompt-studio-page')).toBeVisible()

  const title = page.getByTestId('prompt-studio-title')
  const currentConfigLabel = page.getByTestId('prompt-studio-current-config-label')
  const currentConfigTitle = page.getByTestId('prompt-studio-current-config-title')
  const currentConfigBody = page.getByTestId('prompt-studio-current-config-body')

  await page.getByTestId('language-menu-toggle').click()
  await page.getByTestId('language-quick-en').click()

  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(title).toHaveText('Settings & Content Studio')
  await expect(currentConfigLabel).toHaveText('Currently configuring')
  await expect(currentConfigTitle).toHaveText('Models')
  await expect(currentConfigBody).toContainText('default slots and research roles')

  await page.getByTestId('language-menu-toggle').click()
  await page.getByTestId('language-option-ja').click()

  await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
  await expect(title).not.toHaveText('Settings & Content Studio')
  await expect(currentConfigLabel).not.toHaveText('Currently configuring')
  await expect(currentConfigTitle).not.toHaveText('Models')
  await expect(currentConfigBody).not.toContainText('default slots and research roles')
})

test('prompt studio model center exposes research roles and role-aware task routing', async ({
  page,
}) => {
  await page.goto('/prompt-studio?tab=models')
  await expect(page.getByTestId('prompt-studio-page')).toBeVisible()
  await expect(page.getByTestId('prompt-studio-model-quickstart')).toBeVisible()
  await expect(page.getByTestId('prompt-studio-research-roles')).toBeVisible()
  await expect(page.getByTestId('prompt-studio-task-routing')).toBeVisible()

  const nodeWriterCard = page.getByTestId('research-role-card-node_writer')
  await expect(nodeWriterCard).toBeVisible()
  await page.getByTestId('research-role-mode-node_writer').selectOption('custom')
  await expect(page.getByTestId('research-role-custom-node_writer')).toBeVisible()

  const topicSummaryRouting = page.getByTestId('task-routing-select-topic_summary')
  await expect(topicSummaryRouting).toBeVisible()
  await topicSummaryRouting.selectOption('topic_architect')
  await expect(topicSummaryRouting).toHaveValue('topic_architect')
})
