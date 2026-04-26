# FRONTEND - 前端工作台

## OVERVIEW

React + Vite + TypeScript + Tailwind CSS + MUI 的研究工作台前端

## WHERE TO LOOK

| 任务 | 位置 | 备注 |
|------|------|------|
| 路由配置 | `src/App.tsx` | React Router，所有页面路由 |
| 页面组件 | `src/pages/` | 17个页面文件 |
| 共享组件 | `src/components/` | node/topic/reading/visualization等 |
| 状态管理 | `src/hooks/` + `src/contexts/` | Zustand + React Context |
| 国际化 | `src/i18n/` | 8语言 + 25翻译模块 |
| API调用 | `src/utils/api.ts` | axios封装，统一代理到3303 |

## CONVENTIONS

- **A4布局**: 内容页 `max-width: min(210mm, 100%)`
- **i18n**: 使用 `useI18n().t(key)` 获取翻译，`useBilingualText()` 双语显示
- **样式**: Tailwind CSS 优先，MUI 组件补充
- **数据获取**: React Query (v3) + 自定义 hooks

## ANTI-PATTERNS

- **硬编码文案**: 所有文案必须通过 i18n 系统
- **直接API调用**: 必须通过 `src/utils/api.ts` 封装
- **忽略A4宽度约束**: 内容页必须遵守 210mm 最大宽度
