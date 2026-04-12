export const TOPIC_WORKBENCH_DESKTOP_BREAKPOINT = 1024
export const TOPIC_WORKBENCH_DESKTOP_WIDTH = 392
export const TOPIC_WORKBENCH_DESKTOP_GAP = 24
// On ultra-wide desktops the overlay can stay open by default without stealing
// meaningful space from the primary artifact. Narrower desktop layouts should
// keep the drawer collapsed until the user asks for it.
export const TOPIC_WORKBENCH_AUTO_OPEN_BREAKPOINT = 1720
export const TOPIC_WORKBENCH_DESKTOP_RESERVED_SPACE =
  TOPIC_WORKBENCH_DESKTOP_WIDTH + TOPIC_WORKBENCH_DESKTOP_GAP

export function isTopicWorkbenchDesktopViewport(width: number) {
  return width >= TOPIC_WORKBENCH_DESKTOP_BREAKPOINT
}
