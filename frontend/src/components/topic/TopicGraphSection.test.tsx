// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  TopicGraphSection,
  type TopicGraphLane,
  type TopicGraphNode,
  type TopicGraphStage,
} from './TopicGraphSection'

describe('TopicGraphSection', () => {
  it('renders same-stage connections and expands the stage band for tall cards', () => {
    const stages: TopicGraphStage[] = [
      {
        stageIndex: 0,
        chronologyLabel: 'Stage 0',
        badgeLabel: 'S0',
        displayTitle: 'Origin stage',
        overview: 'Initial split and merge validation stage.',
        countsLabel: '2 nodes',
      },
    ]

    const lanes: TopicGraphLane[] = [
      {
        id: 'lane-main',
        laneIndex: 0,
        label: 'Mainline',
        legendLabel: 'Mainline Conditional Imitation Learning',
        roleLabel: 'Mainline',
        description: 'Primary route',
        periodLabel: '2026.01',
        color: '#7d1938',
        nodeCount: 1,
        side: 'center',
        isMainline: true,
      },
      {
        id: 'lane-branch',
        laneIndex: 1,
        label: 'Branch',
        legendLabel: 'Branch Learning by Cheating',
        roleLabel: 'Branch',
        description: 'Branch route',
        periodLabel: '2026.01',
        color: '#0f766e',
        nodeCount: 1,
        side: 'right',
        isMainline: false,
      },
    ]

    const nodes: TopicGraphNode[] = [
      {
        nodeId: 'node-root',
        anchorId: 'node:node-root',
        stageIndex: 0,
        laneIndex: 0,
        parentNodeIds: [],
        branchColor: '#7d1938',
        emphasis: 'primary',
        side: 'center',
        isMainline: true,
        title: 'Root node',
        summary: 'Establishes the main research line.',
      },
      {
        nodeId: 'node-branch',
        anchorId: 'node:node-branch',
        stageIndex: 0,
        laneIndex: 1,
        parentNodeIds: ['node-root'],
        branchColor: '#0f766e',
        emphasis: 'branch',
        side: 'right',
        isMainline: false,
        title: 'A very tall branch node that needs more vertical room in the stage band',
        summary:
          'This node intentionally carries a long summary so the graph layout must reserve more space than the old fixed card height allowed.',
        cardHeightEstimate: 264,
      },
    ]

    render(
      <TopicGraphSection
        stages={stages}
        lanes={lanes}
        nodes={nodes}
        activeAnchor={null}
        getStageDomId={(anchorId) => anchorId}
        onFocusStage={vi.fn()}
        renderNode={(node) => <div>{node.title ?? node.nodeId}</div>}
      />,
    )

    const canvas = screen.getByTestId('topic-stage-map-canvas')
    expect(canvas.querySelectorAll('svg path').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByTestId('topic-graph-legend')).toBeInTheDocument()
    expect(screen.getByTestId('topic-graph-legend-0')).toHaveTextContent('Mainline Conditional Imitation Learning')
    expect(screen.getByTestId('topic-graph-legend-1')).toHaveTextContent('Branch Learning by Cheating')
    expect(screen.queryByText('Primary route')).not.toBeInTheDocument()

    const stageBand = screen.getByTestId('topic-stage-band-0')
    expect(Number.parseFloat(stageBand.style.height)).toBeGreaterThanOrEqual(300)
  })

  it('places nodes by backend column before falling back to lane index order', () => {
    const stages: TopicGraphStage[] = [
      {
        stageIndex: 0,
        chronologyLabel: 'Stage 0',
        badgeLabel: 'S0',
        displayTitle: 'Column-led layout',
        overview: 'Nodes should follow backend column placement first.',
      },
    ]

    const lanes: TopicGraphLane[] = [
      {
        id: 'lane-main',
        laneIndex: 0,
        label: 'Mainline',
        legendLabel: 'Mainline Primary Route',
        roleLabel: 'Mainline',
        description: 'Primary route',
        periodLabel: '2026.01',
        color: '#7d1938',
        nodeCount: 1,
        side: 'center',
        isMainline: true,
      },
      {
        id: 'lane-branch',
        laneIndex: 1,
        label: 'Branch',
        legendLabel: 'Branch Secondary Route',
        roleLabel: 'Branch',
        description: 'Branch route',
        periodLabel: '2026.01',
        color: '#0f766e',
        nodeCount: 1,
        side: 'right',
        isMainline: false,
      },
    ]

    const nodes: TopicGraphNode[] = [
      {
        nodeId: 'node-left',
        anchorId: 'node:node-left',
        stageIndex: 0,
        laneIndex: 1,
        column: 1,
        parentNodeIds: [],
        branchColor: '#0f766e',
        emphasis: 'branch',
        side: 'right',
        isMainline: false,
        title: 'Left by column',
      },
      {
        nodeId: 'node-right',
        anchorId: 'node:node-right',
        stageIndex: 0,
        laneIndex: 0,
        column: 2,
        parentNodeIds: [],
        branchColor: '#7d1938',
        emphasis: 'primary',
        side: 'center',
        isMainline: true,
        title: 'Right by column',
      },
    ]

    render(
      <TopicGraphSection
        stages={stages}
        lanes={lanes}
        nodes={nodes}
        activeAnchor={null}
        getStageDomId={(anchorId) => anchorId}
        onFocusStage={vi.fn()}
        renderNode={(node) => <div data-testid={`node-${node.nodeId}`}>{node.title ?? node.nodeId}</div>}
      />,
    )

    const leftNode = screen.getByTestId('node-node-left').parentElement
    const rightNode = screen.getByTestId('node-node-right').parentElement

    expect(leftNode).not.toBeNull()
    expect(rightNode).not.toBeNull()
    expect(Number.parseFloat(leftNode!.style.left)).toBeLessThan(Number.parseFloat(rightNode!.style.left))
  })

  it('renders the mainline chip first even when a branch sits on the left lane', () => {
    const stages: TopicGraphStage[] = [
      {
        stageIndex: 0,
        chronologyLabel: 'Stage 0',
        badgeLabel: 'S0',
        displayTitle: 'Legend order',
        overview: 'Legend should prioritize the mainline before branch chips.',
      },
    ]

    const lanes: TopicGraphLane[] = [
      {
        id: 'lane-branch-left',
        laneIndex: -1,
        label: 'Learning by Cheating',
        legendLabel: 'Branch 01 Learning by Cheating',
        roleLabel: 'Branch 01',
        description: 'Left branch route',
        periodLabel: '2026.01',
        color: '#9d174d',
        nodeCount: 1,
        side: 'left',
        isMainline: false,
      },
      {
        id: 'lane-main',
        laneIndex: 0,
        label: 'Conditional Imitation Learning',
        legendLabel: 'Mainline Conditional Imitation Learning',
        roleLabel: 'Mainline',
        description: 'Primary route',
        periodLabel: '2026.01',
        color: '#7d1938',
        nodeCount: 2,
        side: 'center',
        isMainline: true,
      },
    ]

    const nodes: TopicGraphNode[] = [
      {
        nodeId: 'node-main',
        anchorId: 'node:node-main',
        stageIndex: 0,
        laneIndex: 0,
        parentNodeIds: [],
        branchColor: '#7d1938',
        emphasis: 'primary',
        side: 'center',
        isMainline: true,
        title: 'Mainline node',
      },
      {
        nodeId: 'node-branch',
        anchorId: 'node:node-branch',
        stageIndex: 0,
        laneIndex: -1,
        parentNodeIds: [],
        branchColor: '#9d174d',
        emphasis: 'branch',
        side: 'left',
        isMainline: false,
        title: 'Branch node',
      },
    ]

    render(
      <TopicGraphSection
        stages={stages}
        lanes={lanes}
        nodes={nodes}
        activeAnchor={null}
        getStageDomId={(anchorId) => anchorId}
        onFocusStage={vi.fn()}
        renderNode={(node) => <div>{node.title ?? node.nodeId}</div>}
      />,
    )

    const legendChips = screen.getAllByTestId(/topic-graph-legend-/)
    expect(legendChips[0]).toHaveTextContent('Mainline Conditional Imitation Learning')
    expect(legendChips[1]).toHaveTextContent('Branch 01 Learning by Cheating')
  })
})
