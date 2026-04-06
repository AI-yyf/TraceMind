import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const backendOrigin = 'http://127.0.0.1:3303'

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

test.beforeEach(async ({ request }) => {
  await ensureSystemReady(request)
})

test('global language switch is visible and updates homepage copy', async ({ page }) => {
  await page.goto('/')
  const languageSwitch = page.getByTestId('global-language-switch')
  await expect(languageSwitch).toBeVisible()
  await expect(page.getByText('研究主题', { exact: true })).toBeVisible()

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
  await expect(page.getByText('Research Topics', { exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')

  await page.getByTestId('language-menu-toggle').click()
  await expect(page.getByTestId('language-panel')).toBeVisible()
  await page.getByTestId('language-collapse-button').click()
  await expect(page.getByTestId('language-panel')).toBeHidden()
  await expect(page.getByTestId('language-menu-toggle')).toHaveAttribute('aria-expanded', 'false')

  await page.getByTestId('language-menu-toggle').click()
  await page.getByTestId('language-quick-zh').click()
  await expect(page.getByText('研究主题', { exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh')
})

test('create topic page localizes language cards when the interface language changes', async ({
  page,
}) => {
  await page.goto('/topic/create')
  await expect(page.getByText('构建新主题', { exact: true })).toBeVisible()
  await expect(
    page.getByText('以简体中文为原始输入创建主题，并同步生成完整的 8 语言研究蓝图。', {
      exact: true,
    }),
  ).toBeVisible()

  await page.getByTestId('language-menu-toggle').click()
  await page.getByTestId('language-quick-en').click()

  await expect(page.getByText('Build a New Topic', { exact: true })).toBeVisible()
  await expect(
    page.getByText(
      'Create the topic from Simplified Chinese and generate the full 8-language research blueprint.',
      { exact: true },
    ),
  ).toBeVisible()
  await expect(page.getByText('Preview', { exact: true })).toBeVisible()
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
          excerptTitle: '为什么右侧栏必须保持上下文',
          paragraphs: ['右侧栏需要像工作台，而不是临时聊天抽屉。'],
          savedAt: '2026-04-05T03:00:00.000Z',
          route: '/paper/paper-1',
          sourceLabel: '研究备忘',
          summary: '总结工作台在阅读流中的角色。',
          tags: ['sidebar', 'context'],
        },
      ]),
    )
  })

  await page.goto('/favorites')
  await expect(page.getByTestId('favorites-heading')).toHaveText('研究笔记')
  await expect(page.getByTestId('favorite-note-kind').first()).toHaveText('AI 讲解')

  await page.getByTestId('language-menu-toggle').click()
  await page.getByTestId('language-option-ja').click()

  await expect(page.getByTestId('favorites-heading')).toHaveText('研究ノート')
  await expect(page.getByTestId('favorite-note-kind').first()).toHaveText('AI 解説')
})

test('homepage search opens grouped backend results', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Control+K')
  await expect(page.getByTestId('global-search')).toBeVisible()

  await page.getByTestId('global-search-input').fill('自动驾驶')
  await expect(page.getByTestId('global-search-group-node')).toBeVisible()
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
  await page.goto('/topic/topic-1')
  await openWorkbench(page)
  await expect(page.getByTestId('topic-workbench')).toBeVisible()

  const composer = page.getByTestId('assistant-composer-input')
  await composer.fill('Keep this draft in the assistant workbench.')
  await page.getByTestId('sidebar-tab-similar').click()
  await expect(page.getByTestId('topic-search-panel')).toBeVisible()
  await page.getByTestId('sidebar-tab-resources').click()
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
  const topicResponse = await request.get(`${backendOrigin}/api/topics/topic-1/view-model`)
  const topicPayload = (await topicResponse.json()) as {
    data: {
      papers: Array<{ paperId: string }>
    }
  }
  const paperId = topicPayload.data.papers[0]?.paperId
  expect(paperId).toBeTruthy()

  const now = new Date().toISOString()
  await page.addInitScript(
    (payload) => {
      window.localStorage.setItem(`topic-chat:${payload.topicId}`, JSON.stringify(payload.store))
    },
    {
      topicId: 'topic-1',
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
                    route: `/paper/${paperId}`,
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

  await page.goto('/topic/topic-1')
  await openWorkbench(page)
  await page.getByTestId('assistant-citation').click()
  await expect(page).toHaveURL(new RegExp(`/paper/${paperId}`))
  await expect(page.getByTestId('paper-reading')).toBeVisible()
})

test('topic similar tab returns topic-scoped results and resources tab is available', async ({
  page,
}) => {
  await page.goto('/topic/topic-1')
  await openWorkbench(page)
  await page.getByTestId('sidebar-tab-similar').click()
  await page.getByTestId('topic-search-input').fill('自动驾驶')
  await expect(page.locator('[data-testid^="topic-search-result-"]').first()).toBeVisible()
  await page.getByTestId('sidebar-tab-resources').click()
  await expect(page.getByTestId('topic-resources-panel')).toBeVisible()
})

test('topic workbench can add node context into the assistant tray', async ({ page }) => {
  await page.goto('/topic/topic-1')
  await openWorkbench(page)
  await page.getByTestId('context-suggestion-node').first().click()
  await expect(page.locator('[data-testid="context-pill-node"]').first()).toBeVisible()
})

test('topic research route opens the topic sidebar research workbench', async ({ page }) => {
  await page.goto('/topic/topic-1/research')
  await expect(page).toHaveURL(/\/topic\/topic-1(?:\?.*)?$/)
  await expect(page.getByTestId('right-sidebar-shell')).toBeVisible()
  await expect(page.getByTestId('topic-research-session-card')).toBeVisible()
  await expect(page.getByTestId('topic-research-intel')).toBeVisible()
  await expect(page.getByTestId('topic-guidance-ledger-card')).toBeVisible()
  await expect(page.getByTestId('topic-research-world-card')).toBeVisible()
  await expect(page.getByTestId('topic-workbench-pulse-card')).toBeVisible()
  await expect(page.getByTestId('assistant-composer-input')).toBeVisible()
})

test('node reading page keeps the same right-side workbench available', async ({
  page,
  request,
}) => {
  const topicResponse = await request.get(`${backendOrigin}/api/topics/topic-1/view-model`)
  const topicPayload = (await topicResponse.json()) as {
    data: {
      graph?: {
        nodes: Array<{ nodeId: string }>
      }
    }
  }
  const nodeId = topicPayload.data.graph?.nodes[0]?.nodeId
  expect(nodeId).toBeTruthy()

  await page.goto(`/node/${nodeId}`)
  await expect(page.getByTestId('node-reading')).toBeVisible()
  await expect(page.getByTestId('node-article-flow')).toBeVisible()
  expect(await page.getByTestId('node-article-flow').locator(':scope > *').count()).toBeGreaterThan(
    2,
  )
  await openWorkbench(page)
  await page.getByTestId('context-suggestion-node').first().click()
  await expect(page.getByTestId('context-pill-node').first()).toBeVisible()
  await expect(page.getByTestId('assistant-composer-input')).toBeVisible()
})

test('paper reading page keeps the same right-side workbench available', async ({
  page,
  request,
}) => {
  const topicResponse = await request.get(`${backendOrigin}/api/topics/topic-1/view-model`)
  const topicPayload = (await topicResponse.json()) as {
    data: {
      papers: Array<{ paperId: string }>
    }
  }
  const paperId = topicPayload.data.papers[0]?.paperId
  expect(paperId).toBeTruthy()

  await page.goto(`/paper/${paperId}`)
  await expect(page.getByTestId('paper-reading')).toBeVisible()
  await expect(page.getByTestId('paper-article-flow')).toBeVisible()
  expect(
    await page.getByTestId('paper-article-flow').locator(':scope > *').count(),
  ).toBeGreaterThan(2)
  await openWorkbench(page)
  await page.getByTestId('context-suggestion-paper').first().click()
  await expect(page.getByTestId('context-pill-paper').first()).toBeVisible()
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
