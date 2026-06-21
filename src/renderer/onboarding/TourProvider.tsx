// src/renderer/onboarding/TourProvider.tsx
// v1.6.0 W — React component host for the tour overlay.
//
// 设计要点 (locked W spec §2.2):
//   - 纯 passthrough provider: 永远渲染 children
//   - 当 tourState.kind === 'running' 时挂载 <TourOverlay />
//   - 其他 4 个 variant (idle/completed/dismissed/suppressed) → 不挂载 overlay
//   - 不读取 store; props-only contract 方便测试
//   - children-first render (overlay 是 sibling, 不是 wrapper)
//   - z-index 9996 (per spec §2.1)

import type { ReactNode } from 'react';

import { TourOverlay } from './TourOverlay.js';
import type { TourState } from './tourState.js';

type Props = {
  /** Tour state from the slice; provider does not subscribe to the store itself. */
  readonly tourState: TourState;
  /** Current locale used for i18n key resolution in the overlay. */
  readonly locale: 'zh-CN' | 'en';
  readonly onAdvance: () => void;
  readonly onBack: () => void;
  readonly onSkip: () => void;
  readonly onFinish: () => void;
  readonly children: ReactNode;
};

/**
 * Portal-free host for the tour overlay. The overlay renders inline
 * inside this provider (NOT via `createPortal` to keep the test
 * contract simple). Apps that need portal'd render should wrap this
 * in their own portal mount.
 */
export function TourProvider({
  tourState,
  locale,
  onAdvance,
  onBack,
  onSkip,
  onFinish,
  children,
}: Props): JSX.Element {
  const isRunning = tourState.kind === 'running';
  return (
    <>
      {children}
      {isRunning ? (
        <div data-tour-overlay data-tour-step={String(tourState.currentStep)}>
          <TourOverlay
            currentStep={tourState.currentStep}
            locale={locale}
            onAdvance={onAdvance}
            onBack={onBack}
            onSkip={onSkip}
            onFinish={onFinish}
          />
        </div>
      ) : null}
    </>
  );
}
