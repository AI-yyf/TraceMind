import React from 'react';
import { motion } from 'framer-motion';

interface TimelineNodeProps {
  date: string;
  isActive?: boolean;
  lineColor?: string;
  index?: number;
}

export const TimelineNode: React.FC<TimelineNodeProps> = ({
  date,
  lineColor = '#DC2626',
  index = 0,
}) => {
  // 解析日期格式：支持 ISO 格式 (2016-04-25T16:03:56Z) 或简单日期 (2016-04-25)
  const formatDate = (dateStr: string) => {
    // 提取日期部分 (YYYY-MM-DD)
    const dateMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (dateMatch) {
      const year = dateMatch[1];
      const month = dateMatch[2];
      const day = dateMatch[3];
      return { year, month, day, full: `${year}.${month}.${day}` };
    }
    // 回退到 Date 对象解析
    const d = new Date(dateStr);
    const year = String(d.getFullYear());
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return { year, month, day, full: `${year}.${month}.${day}` };
  };

  const formatted = formatDate(date);

  return (
    <motion.div
      className="absolute left-0 sm:left-[5px] lg:left-[20px] flex flex-col items-center"
      style={{ top: '50%', transform: 'translateY(-50%)' }}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.1 + 0.3, duration: 0.4 }}
    >
      {/* 日期显示 - 大而醒目，移动端缩小 */}
      <div className="flex flex-col items-end lg:items-center">
        <span
          className="text-[20px] sm:text-[24px] lg:text-[42px] font-bold leading-none tracking-tight"
          style={{ color: lineColor }}
        >
          {formatted.year}
        </span>
        <span
          className="text-[14px] sm:text-[16px] lg:text-[24px] font-semibold mt-1"
          style={{ color: `${lineColor}CC` }}
        >
          {formatted.month}.{formatted.day}
        </span>
      </div>
      
      {/* 节点圆点 - 移动端位置调整 */}
      <motion.div
        className="absolute left-[40px] sm:left-[45px] lg:left-[80px] top-1/2 -translate-y-1/2 w-[12px] h-[12px] sm:w-[14px] sm:h-[14px] lg:w-[20px] lg:h-[20px] rounded-full border-[2px] sm:border-[3px] bg-white"
        style={{ borderColor: lineColor }}
        whileHover={{ scale: 1.3 }}
        transition={{ type: 'spring', stiffness: 400 }}
      />
    </motion.div>
  );
};
