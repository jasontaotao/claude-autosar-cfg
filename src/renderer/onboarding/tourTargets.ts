// src/renderer/onboarding/tourTargets.ts
// v1.6.0 W — Tour step definitions + target resolver helper.
//
// 设计要点 (locked W spec §2.4 + §4.2):
//   - 5 个 step, 静态数据 (pure data, no runtime side effects)
//   - targetId 对应 DOM `[data-tour-id="..."]` 属性 (selector lookup)
//   - resolveTourTarget 返回 DOMRect 或 null (centered fallback)
//   - 业务注释中文, 技术 API 注释英文

import type { MessageKey } from '@shared/i18n';

export type TourStepPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center';

export interface TourStepDef {
  readonly index: 0 | 1 | 2 | 3 | 4;
  readonly targetId: string;
  readonly titleKey: MessageKey;
  readonly bodyKey: MessageKey;
  readonly placement: TourStepPlacement;
}

/**
 * Static step definitions. The order is canonical (locked per W spec
 * §4.2); inserting/reordering requires updating the right-pane-content
 * contract (see §2.4 Note) and re-running the cross-spec integration
 * tests #4 + #8.
 */
export const TOUR_STEPS: readonly TourStepDef[] = [
  {
    index: 0,
    targetId: 'app-header',
    titleKey: 'onboarding.step1.title',
    bodyKey: 'onboarding.step1.body',
    placement: 'bottom',
  },
  {
    index: 1,
    targetId: 'left-panel',
    titleKey: 'onboarding.step2.title',
    bodyKey: 'onboarding.step2.body',
    placement: 'right',
  },
  {
    index: 2,
    targetId: 'arxml-panel',
    titleKey: 'onboarding.step3.title',
    bodyKey: 'onboarding.step3.body',
    placement: 'left',
  },
  {
    index: 3,
    targetId: 'right-pane-content',
    titleKey: 'onboarding.step4.title',
    bodyKey: 'onboarding.step4.body',
    placement: 'left',
  },
  {
    index: 4,
    targetId: 'app-save',
    titleKey: 'onboarding.step5.title',
    bodyKey: 'onboarding.step5.body',
    placement: 'bottom',
  },
] as const;

/**
 * Resolve the DOMRect of the element carrying the requested
 * `data-tour-id` attribute. Returns null when:
 *   - The selector misses (no element with that attribute)
 *   - The element is hidden (display: none, visibility: hidden,
 *     zero rect in either dimension)
 *
 * The overlay renders a centered bubble when this returns null
 * (see TourOverlay.tsx fallback path).
 */
export function resolveTourTarget(targetId: string): DOMRect | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const el = document.querySelector(`[data-tour-id="${targetId}"]`) as HTMLElement | null;
  if (el === null) {
    return null;
  }
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return null;
  }
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return null;
  }
  return rect;
}
