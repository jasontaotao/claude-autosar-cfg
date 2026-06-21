// src/renderer/onboarding/TourOverlay.tsx
// v1.6.0 W — 5-step tour overlay component.
//
// 设计要点 (locked W spec §2.2 + §2.4):
//   - 单 step card: target rect + bubble (title + body + prev/next/skip)
//   - 数据-tour-id 找不到时降级为中心化 bubble (centered fallback)
//   - 最后一 step (currentStep === 4) Next 按钮 label = "Finish"
//   - 第一 step (currentStep === 0) Back 按钮 disabled
//   - 当前进度 footer "Step {current} of {total}" 用 i18n key
//   - 不订阅 store, props-only contract 方便测试

import { useEffect, useState } from 'react';

import type { Locale } from '@shared/i18n';
import { t } from '@shared/i18n';

import { TOUR_STEPS, resolveTourTarget, type TourStepDef } from './tourTargets.js';

type Props = {
  readonly currentStep: 0 | 1 | 2 | 3 | 4;
  readonly locale: Locale;
  readonly onAdvance: () => void;
  readonly onBack: () => void;
  readonly onSkip: () => void;
  readonly onFinish: () => void;
};

export function TourOverlay({
  currentStep,
  locale,
  onAdvance,
  onBack,
  onSkip,
  onFinish,
}: Props): JSX.Element {
  const step: TourStepDef = TOUR_STEPS[currentStep]!;
  const [rect, setRect] = useState<DOMRect | null>(() => resolveTourTarget(step.targetId));

  // Re-resolve on window resize so the spotlight tracks layout changes.
  useEffect(() => {
    function handleResize(): void {
      setRect(resolveTourTarget(step.targetId));
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [step.targetId]);

  const isLastStep = currentStep === 4;
  const isFirstStep = currentStep === 0;
  const useCenteredFallback = rect === null;

  function handleNext(): void {
    if (isLastStep) {
      onFinish();
    } else {
      onAdvance();
    }
  }

  return (
    <div data-tour-overlay-step={String(currentStep)} className="tour-overlay">
      {/* Spotlight rect — only rendered when target resolves */}
      {rect !== null ? (
        <div
          data-tour-spotlight
          className="tour-spotlight"
          style={{
            position: 'fixed',
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            pointerEvents: 'none',
            zIndex: 9996,
          }}
        />
      ) : null}

      {/* Bubble — positioned adjacent to spotlight, or centered on fallback */}
      <div
        data-tour-bubble={useCenteredFallback ? 'centered' : 'adjacent'}
        className={`tour-bubble ${useCenteredFallback ? 'tour-bubble-centered' : ''}`}
        style={{
          position: 'fixed',
          ...(useCenteredFallback
            ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
            : { top: rect.bottom + 8, left: rect.left }),
          zIndex: 9997,
        }}
      >
        {useCenteredFallback ? (
          <div data-tour-bubble-centered className="tour-bubble-centered">
            {t(locale, 'tour.coordination.validationPaused.message')}
          </div>
        ) : null}
        <h2 className="tour-bubble-title">{t(locale, step.titleKey)}</h2>
        <p className="tour-bubble-body">{t(locale, step.bodyKey)}</p>
        <footer className="tour-bubble-footer">
          <span className="tour-bubble-progress" data-tour-progress>
            {t(locale, 'onboarding.progress.label', {
              current: String(currentStep + 1),
              total: String(TOUR_STEPS.length),
            })}
          </span>
          <button
            type="button"
            className="tour-bubble-btn"
            data-tour-action="back"
            disabled={isFirstStep}
            onClick={onBack}
          >
            {t(locale, 'onboarding.controls.back')}
          </button>
          <button
            type="button"
            className="tour-bubble-btn"
            data-tour-action="skip"
            onClick={onSkip}
          >
            {t(locale, 'onboarding.controls.skip')}
          </button>
          <button
            type="button"
            className="tour-bubble-btn tour-bubble-btn-primary"
            data-tour-action="next"
            data-tour-action-label={isLastStep ? 'finish' : 'next'}
            onClick={handleNext}
          >
            {t(locale, isLastStep ? 'onboarding.controls.finish' : 'onboarding.controls.next')}
          </button>
        </footer>
      </div>
    </div>
  );
}