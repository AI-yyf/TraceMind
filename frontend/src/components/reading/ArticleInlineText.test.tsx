// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import {
  parseInlineArticleReferences,
  renderInlineArticleText,
  type ArticleInlineReference,
} from './ArticleInlineText'

describe('ArticleInlineText', () => {
  it('parses inline paper and node references across supported quote styles', () => {
    const tokens = parseInlineArticleReferences(
      'node-1\u300cNode title\u300d builds on paper-1\u300aPaper one\u300b and paper-2"Paper two".',
    )

    expect(tokens).toHaveLength(3)
    expect(tokens[0]).toMatchObject({
      id: 'node-1',
      kind: 'node',
      literalTitle: 'Node title',
    })
    expect(tokens[1]).toMatchObject({
      id: 'paper-1',
      kind: 'paper',
      literalTitle: 'Paper one',
    })
    expect(tokens[2]).toMatchObject({
      id: 'paper-2',
      kind: 'paper',
      literalTitle: 'Paper two',
    })
  })

  it('renders localized inline links without leaking parser glyph noise', () => {
    const references = new Map<string, ArticleInlineReference>([
      [
        'node-1',
        {
          id: 'node-1',
          kind: 'node',
          label: 'Node title',
          route: '/node/node-1',
        },
      ],
      [
        'paper-1',
        {
          id: 'paper-1',
          kind: 'paper',
          label: 'Paper one',
          route: '/node/node-1?anchor=paper:paper-1',
        },
      ],
    ])

    render(
      <MemoryRouter>
        <div>
          {renderInlineArticleText(
            'node-1\u300cNode title\u300d builds on paper-1\u300aPaper one\u300b',
            references,
            1,
          )}
        </div>
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Node title' })).toHaveAttribute(
      'href',
      '/node/node-1?stageMonths=1',
    )
    expect(screen.getByRole('link', { name: '\u300aPaper one\u300b' })).toHaveAttribute(
      'href',
      '/node/node-1?anchor=paper%3Apaper-1&stageMonths=1',
    )
    expect(screen.queryByText('\u6412')).not.toBeInTheDocument()
  })
})
