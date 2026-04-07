/**
 * CitationGraph - 引用关系图可视化组件
 *
 * 功能：
 * 1. 力导向图展示论文引用关系
 * 2. 支持缩放、拖拽、点击交互
 * 3. 高亮显示选中论文的引用网络
 * 4. 显示引用统计和关键路径
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ZoomIn, ZoomOut, Maximize, Network, BookOpen, ArrowRight } from 'lucide-react';
import type { TrackerPaper } from '../../types/tracker';

// ============ 类型定义 ============

export interface CitationNode {
  id: string;
  paper: TrackerPaper;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  mass: number;
  fixed?: boolean;
  highlighted?: boolean;
  level: number; // 距离中心节点的层级
}

export interface CitationEdge {
  source: string;
  target: string;
  type: 'cites' | 'cited-by' | 'related';
  strength: number;
}

export interface CitationGraphData {
  nodes: CitationNode[];
  edges: CitationEdge[];
  centerNodeId: string;
}

interface CitationGraphProps {
  data: CitationGraphData;
  width?: number;
  height?: number;
  onNodeClick?: (paperId: string) => void;
  className?: string;
}

// ============ 配置 ============

const CONFIG = {
  nodeRadius: {
    min: 8,
    max: 24,
    default: 12,
  },
  forces: {
    repulsion: 800,
    spring: 0.05,
    springLength: 120,
    center: 0.02,
    damping: 0.9,
  },
  zoom: {
    min: 0.3,
    max: 3,
    step: 0.2,
  },
  colors: {
    center: '#DC2626',
    cites: '#2563EB',      // 引用别人（蓝色）
    citedBy: '#059669',    // 被引用（绿色）
    related: '#7C3AED',    // 相关（紫色）
    highlight: '#F59E0B',  // 高亮（橙色）
    edge: '#CBD5E1',
    edgeHighlight: '#94A3B8',
  },
};

// ============ 主组件 ============

export const CitationGraph: React.FC<CitationGraphProps> = ({
  data,
  width = 800,
  height = 600,
  onNodeClick,
  className = '',
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 状态
  const [nodes, setNodes] = useState<CitationNode[]>([]);
  const [edges] = useState<CitationEdge[]>(data.edges);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(data.centerNodeId);
  const [isDragging, setIsDragging] = useState(false);
  const [dragNode, setDragNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [animationRunning, setAnimationRunning] = useState(true);

  // 初始化节点位置
  useEffect(() => {
    const initializedNodes = data.nodes.map((node, index) => {
      const angle = (index / data.nodes.length) * 2 * Math.PI;
      const distance = node.level * 100 + 50;

      return {
        ...node,
        x: width / 2 + Math.cos(angle) * distance,
        y: height / 2 + Math.sin(angle) * distance,
        vx: 0,
        vy: 0,
        radius: calculateNodeRadius(node.paper),
        mass: calculateNodeMass(node.paper),
      };
    });

    setNodes(initializedNodes);
  }, [data.nodes, width, height]);

  // 力导向模拟
  useEffect(() => {
    if (!animationRunning) return;

    let animationId: number;

    const simulate = () => {
      setNodes(prevNodes => {
        const newNodes = [...prevNodes];

        // 应用力
        applyForces(newNodes, edges, width, height);

        // 更新位置
        for (const node of newNodes) {
          if (node.fixed) continue;

          node.vx *= CONFIG.forces.damping;
          node.vy *= CONFIG.forces.damping;

          node.x += node.vx;
          node.y += node.vy;

          // 边界限制
          node.x = Math.max(node.radius, Math.min(width - node.radius, node.x));
          node.y = Math.max(node.radius, Math.min(height - node.radius, node.y));
        }

        return newNodes;
      });

      animationId = requestAnimationFrame(simulate);
    };

    animationId = requestAnimationFrame(simulate);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [animationRunning, edges, width, height]);

  // 计算节点半径（基于引用数）
  const calculateNodeRadius = (paper: TrackerPaper): number => {
    const citations = paper.citationCount || 0;
    const normalized = Math.min(citations / 100, 1);
    return CONFIG.nodeRadius.min + normalized * (CONFIG.nodeRadius.max - CONFIG.nodeRadius.min);
  };

  // 计算节点质量
  const calculateNodeMass = (paper: TrackerPaper): number => {
    return 1 + (paper.citationCount || 0) / 50;
  };

  // 应用力
  const applyForces = (
    nodes: CitationNode[],
    edges: CitationEdge[],
    width: number,
    height: number
  ) => {
    // 1. 斥力（节点之间）
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const nodeA = nodes[i];
        const nodeB = nodes[j];

        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;

        const force = CONFIG.forces.repulsion / (distance * distance);
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;

        nodeA.vx -= fx / nodeA.mass;
        nodeA.vy -= fy / nodeA.mass;
        nodeB.vx += fx / nodeB.mass;
        nodeB.vy += fy / nodeB.mass;
      }
    }

    // 2. 弹簧力（边）
    for (const edge of edges) {
      const source = nodes.find(n => n.id === edge.source);
      const target = nodes.find(n => n.id === edge.target);

      if (!source || !target) continue;

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;

      const displacement = distance - CONFIG.forces.springLength;
      const force = CONFIG.forces.spring * displacement * edge.strength;

      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;

      source.vx += fx / source.mass;
      source.vy += fy / source.mass;
      target.vx -= fx / target.mass;
      target.vy -= fy / target.mass;
    }

    // 3. 中心引力
    const centerX = width / 2;
    const centerY = height / 2;

    for (const node of nodes) {
      const dx = centerX - node.x;
      const dy = centerY - node.y;

      node.vx += dx * CONFIG.forces.center;
      node.vy += dy * CONFIG.forces.center;
    }
  };

  // 处理节点点击
  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    onNodeClick?.(nodeId);
  }, [onNodeClick]);

  // 处理缩放
  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + CONFIG.zoom.step, CONFIG.zoom.max));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - CONFIG.zoom.step, CONFIG.zoom.min));
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // 处理拖拽
  const handleMouseDown = (_e: React.MouseEvent, nodeId?: string) => {
    if (nodeId) {
      setDragNode(nodeId);
      setNodes(prev =>
        prev.map(n => n.id === nodeId ? { ...n, fixed: true } : n)
      );
    } else {
      setIsDragging(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragNode) {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = (e.clientX - rect.left - pan.x) / zoom;
      const y = (e.clientY - rect.top - pan.y) / zoom;

      setNodes(prev =>
        prev.map(n => n.id === dragNode ? { ...n, x, y, vx: 0, vy: 0 } : n)
      );
    } else if (isDragging) {
      setPan(prev => ({
        x: prev.x + e.movementX,
        y: prev.y + e.movementY,
      }));
    }
  };

  const handleMouseUp = () => {
    if (dragNode) {
      setNodes(prev =>
        prev.map(n => n.id === dragNode ? { ...n, fixed: false } : n)
      );
      setDragNode(null);
    }
    setIsDragging(false);
  };

  // 获取节点颜色
  const getNodeColor = (node: CitationNode): string => {
    if (node.id === selectedNodeId) return CONFIG.colors.center;
    if (node.id === hoveredNode) return CONFIG.colors.highlight;

    // 根据与选中节点的关系着色
    if (selectedNodeId) {
      const edge = edges.find(
        e =>
          (e.source === selectedNodeId && e.target === node.id) ||
          (e.target === selectedNodeId && e.source === node.id)
      );

      if (edge) {
        if (edge.type === 'cites') return CONFIG.colors.cites;
        if (edge.type === 'cited-by') return CONFIG.colors.citedBy;
        return CONFIG.colors.related;
      }
    }

    return '#94A3B8';
  };

  // 获取边的样式
  const getEdgeStyle = (edge: CitationEdge) => {
    const isConnected =
      selectedNodeId &&
      (edge.source === selectedNodeId || edge.target === selectedNodeId);

    return {
      stroke: isConnected ? CONFIG.colors.edgeHighlight : CONFIG.colors.edge,
      strokeWidth: isConnected ? 2 : 1,
      opacity: selectedNodeId && !isConnected ? 0.2 : 1,
    };
  };

  // 统计信息
  const stats = useMemo(() => {
    const centerNode = nodes.find(n => n.id === data.centerNodeId);
    const citingCount = edges.filter(e => e.target === data.centerNodeId).length;
    const citedCount = edges.filter(e => e.source === data.centerNodeId).length;

    return {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      centerCitations: centerNode?.paper.citationCount || 0,
      citingCount,
      citedCount,
    };
  }, [nodes, edges, data.centerNodeId]);

  return (
    <div
      ref={containerRef}
      className={`relative bg-neutral-50 rounded-xl overflow-hidden ${className}`}
      style={{ width, height }}
    >
      {/* 工具栏 */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-2 flex flex-col gap-1">
          <button
            onClick={handleZoomIn}
            className="p-2 hover:bg-neutral-100 rounded transition-colors"
            title="放大"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2 hover:bg-neutral-100 rounded transition-colors"
            title="缩小"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleReset}
            className="p-2 hover:bg-neutral-100 rounded transition-colors"
            title="重置"
          >
            <Maximize className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-2">
          <button
            onClick={() => setAnimationRunning(!animationRunning)}
            className={`p-2 rounded transition-colors ${
              animationRunning ? 'bg-green-100 text-green-700' : 'hover:bg-neutral-100'
            }`}
            title={animationRunning ? '暂停动画' : '开始动画'}
          >
            <Network className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-2">
          <button
            onClick={() => setShowLabels(!showLabels)}
            className={`p-2 rounded transition-colors ${
              showLabels ? 'bg-blue-100 text-blue-700' : 'hover:bg-neutral-100'
            }`}
            title={showLabels ? '隐藏标签' : '显示标签'}
          >
            <BookOpen className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 统计面板 */}
      <div className="absolute top-4 right-4 z-10 bg-white rounded-lg shadow-sm border border-neutral-200 p-4">
        <h4 className="text-sm font-medium text-neutral-900 mb-3">引用统计</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-neutral-500">论文总数</span>
            <span className="font-medium">{stats.totalNodes}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-neutral-500">引用关系</span>
            <span className="font-medium">{stats.totalEdges}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-neutral-500">被引用数</span>
            <span className="font-medium text-green-600">{stats.centerCitations}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-neutral-500">引用其他</span>
            <span className="font-medium text-blue-600">{stats.citingCount}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-neutral-500">被其他引用</span>
            <span className="font-medium text-green-600">{stats.citedCount}</span>
          </div>
        </div>
      </div>

      {/* 图例 */}
      <div className="absolute bottom-4 left-4 z-10 bg-white rounded-lg shadow-sm border border-neutral-200 p-3">
        <h4 className="text-xs font-medium text-neutral-500 mb-2">图例</h4>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: CONFIG.colors.center }}
            />
            <span>当前论文</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: CONFIG.colors.cites }}
            />
            <span>引用其他</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: CONFIG.colors.citedBy }}
            />
            <span>被引用</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: CONFIG.colors.related }}
            />
            <span>相关论文</span>
          </div>
        </div>
      </div>

      {/* SVG 画布 */}
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="cursor-grab active:cursor-grabbing"
        onMouseDown={(e) => handleMouseDown(e)}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* 边 */}
          {edges.map((edge, index) => {
            const source = nodes.find(n => n.id === edge.source);
            const target = nodes.find(n => n.id === edge.target);

            if (!source || !target) return null;

            const style = getEdgeStyle(edge);

            return (
              <g key={`${edge.source}-${edge.target}-${index}`}>
                <line
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={style.stroke}
                  strokeWidth={style.strokeWidth}
                  opacity={style.opacity}
                />
                {/* 箭头 */}
                {edge.type !== 'related' && (
                  <ArrowMarker
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    color={style.stroke}
                    opacity={style.opacity}
                  />
                )}
              </g>
            );
          })}

          {/* 节点 */}
          {nodes.map(node => (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              className="cursor-pointer"
              onMouseDown={(e) => {
                e.stopPropagation();
                handleMouseDown(e, node.id);
              }}
              onClick={(e) => {
                e.stopPropagation();
                handleNodeClick(node.id);
              }}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
            >
              {/* 节点圆形 */}
              <circle
                r={node.radius}
                fill={getNodeColor(node)}
                stroke="white"
                strokeWidth={node.id === selectedNodeId ? 3 : 2}
                opacity={selectedNodeId && node.id !== selectedNodeId && !edges.some(
                  e =>
                    (e.source === selectedNodeId && e.target === node.id) ||
                    (e.target === selectedNodeId && e.source === node.id)
                ) ? 0.3 : 1}
              />

              {/* 引用数标记 */}
              {(node.paper.citationCount || 0) > 10 && (
                <text
                  y={-node.radius - 5}
                  textAnchor="middle"
                  className="text-[10px] fill-neutral-500"
                >
                  {node.paper.citationCount}
                </text>
              )}

              {/* 标签 */}
              {showLabels && (
                <text
                  y={node.radius + 14}
                  textAnchor="middle"
                  className="text-xs fill-neutral-700"
                  style={{
                    fontWeight: node.id === selectedNodeId ? 600 : 400,
                    opacity: selectedNodeId && node.id !== selectedNodeId ? 0.5 : 1,
                  }}
                >
                  {(node.paper.titleZh || node.paper.title).slice(0, 15)}
                  {(node.paper.titleZh || node.paper.title).length > 15 ? '...' : ''}
                </text>
              )}
            </g>
          ))}
        </g>
      </svg>

      {/* 选中论文详情 */}
      <AnimatePresence>
        {selectedNodeId && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute bottom-4 right-4 z-10 w-72 bg-white rounded-lg shadow-lg border border-neutral-200 p-4"
          >
            {(() => {
              const node = nodes.find(n => n.id === selectedNodeId);
              if (!node) return null;

              return (
                <>
                  <h4 className="font-medium text-neutral-900 mb-2 line-clamp-2">
                    {node.paper.titleZh || node.paper.title}
                  </h4>
                  <p className="text-sm text-neutral-500 mb-3">
                    {node.paper.authors.slice(0, 3).join(', ')}
                    {node.paper.authors.length > 3 && ' et al.'}
                  </p>
                  <div className="flex items-center gap-4 text-sm mb-3">
                    <span className="text-green-600">
                      被引: {node.paper.citationCount || 0}
                    </span>
                    <span className="text-neutral-400">
                      {node.paper.published.slice(0, 4)}
                    </span>
                  </div>
                  <button
                    onClick={() => onNodeClick?.(node.id)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-lg text-sm hover:bg-neutral-800 transition-colors"
                  >
                    查看详情
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/**
 * 箭头标记
 */
interface ArrowMarkerProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  opacity: number;
}

const ArrowMarker: React.FC<ArrowMarkerProps> = ({
  x1,
  y1,
  x2,
  y2,
  color,
  opacity,
}) => {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const arrowLength = 10;
  const arrowAngle = Math.PI / 6;

  // 计算箭头位置（在目标节点边缘）
  const targetX = x2 - Math.cos(angle) * 15;
  const targetY = y2 - Math.sin(angle) * 15;

  const x3 = targetX - arrowLength * Math.cos(angle - arrowAngle);
  const y3 = targetY - arrowLength * Math.sin(angle - arrowAngle);
  const x4 = targetX - arrowLength * Math.cos(angle + arrowAngle);
  const y4 = targetY - arrowLength * Math.sin(angle + arrowAngle);

  return (
    <polygon
      points={`${targetX},${targetY} ${x3},${y3} ${x4},${y4}`}
      fill={color}
      opacity={opacity}
    />
  );
};

export default CitationGraph;
