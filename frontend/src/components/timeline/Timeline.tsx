import React from 'react';
import { motion } from 'framer-motion';

interface TimelineProps {
  children: React.ReactNode;
  lineColor?: string;
  className?: string;
}

export const Timeline: React.FC<TimelineProps> = ({
  children,
  lineColor = '#DC2626',
  className = '',
}) => {
  return (
    <div className={`relative ${className}`}>
      {/* 垂直时间线背景 - 移动端更窄 */}
      <div
        className="absolute left-[40px] sm:left-[50px] lg:left-[100px] top-0 bottom-0 w-[2px]"
        style={{ backgroundColor: `${lineColor}20` }}
      />
      
      {/* 动画时间线 */}
      <motion.div
        className="absolute left-[40px] sm:left-[50px] lg:left-[100px] top-0 w-[2px] origin-top"
        style={{ backgroundColor: lineColor }}
        initial={{ height: 0 }}
        animate={{ height: '100%' }}
        transition={{ duration: 1.5, ease: 'easeInOut' }}
      />
      
      {/* 内容区域 */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};
