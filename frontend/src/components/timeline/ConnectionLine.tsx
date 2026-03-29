import React from 'react';
import { motion } from 'framer-motion';

interface ConnectionLineProps {
  fromIndex: number;
  toIndex: number;
  color?: string;
  isCurved?: boolean;
}

export const ConnectionLine: React.FC<ConnectionLineProps> = ({
  fromIndex,
  toIndex,
  color = '#DC2626',
  isCurved = true,
}) => {
  // 计算曲线路径
  const itemHeight = 200; // 每个项目的估计高度
  const startY = fromIndex * itemHeight + 100;
  const endY = toIndex * itemHeight + 100;
  const controlX = 100; // 控制点水平偏移
  const midY = (startY + endY) / 2;

  const path = isCurved
    ? `M 100 ${startY} Q ${100 + controlX} ${midY} 100 ${endY}`
    : `M 100 ${startY} L 100 ${endY}`;

  return (
    <svg
      className="absolute left-0 top-0 w-full h-full pointer-events-none"
      style={{ zIndex: 5 }}
    >
      <motion.path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeDasharray="5,5"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 0.4 }}
        transition={{ duration: 0.8, delay: 0.5 }}
      />
    </svg>
  );
};
