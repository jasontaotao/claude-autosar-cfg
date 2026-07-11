// src/renderer/components/AppHeader/AppHeaderStatusBadge.tsx
// v1.42.x PATCH T3 — extracted from AppHeader.tsx (lines 813-883,
// ~71 LoC) as the AppHeader sub-component for Visual Concern 3b:
// the status badge cluster (project chip + scripts toggle +
// generate button + locale toggle + version label).
//
// Pure presentational sub-component (per v1.42.1 T0 spec note on
// container/presentational split — matches `ResetOnboardingMenuItem`
// pattern in this subdir). All state ownership stays in AppHeader.tsx
// shell — this sub-component subscribes to `setLocale` from the
// store directly because the Zustand action ref is stable (no
// re-render churn from re-subscribing per render).
//
// Conditional rendering: `{project !== null && <chip />}` stays
// inside the sub-component (matches pre-extraction behavior — the
// chip is mounted only when a project is open).
//
// `setLocale` direct subscription: the locale toggle button reads
// the current `locale` via the `locale` prop (already passed from
// shell) but invokes `setLocale` via direct store subscription
// (Zustand action refs are stable, so this is safe and avoids
// threading setLocale through another prop). Alternative would be
// to pass setLocale as a prop — both work, this version reduces
// prop count by 1.

import { type JSX } from 'react';

import { t, type Locale } from '../../../shared/i18n/index.js';
import { useArxmlStore } from '../../store/useArxmlStore.js';

/** Project metadata for the chip. Matches the pre-extraction
 *  AppHeader shell's destructured `project` + `projectPath` from
 *  useArxmlStore. Kept as `unknown` shape here so this sub-component
 *  doesn't need to import the project types directly — the shell
 *  passes the actual Project instance. */
export type StatusBadgeProject = {
  readonly name: string;
};

export type AppHeaderStatusBadgeProps = {
  /** Current open project (null when no project is open). When
   *  non-null, the chip renders with the project's name + a close
   *  button. When null, the chip is hidden. */
  readonly project: StatusBadgeProject | null;
  /** Source path of the open project (for tooltip on the chip).
   *  null when no project is open. */
  readonly projectPath: string | null;
  /** Close-project handler (wired to the chip's × button). */
  readonly onCloseProjectClick: () => void;
  /** Whether the ScriptPanel is currently open. Controls the
   *  scripts toggle's `is-active` class + `aria-pressed`. */
  readonly scriptPanelOpen: boolean;
  /** Toggle the ScriptPanel open/close. */
  readonly onToggleScriptPanel: () => void;
  /** BSW code generator handler (writes the gen output per
   *  the `.autosarcfg.json` manifest). */
  readonly onGenerate: () => void;
  /** Disabled predicate for the generate button: true when no
   *  project is open (the generator requires a manifest path). */
  readonly canGenerate: boolean;
  /** In-flight gate for the generate button: true while the
   *  `useGenerateCode` hook's state is `running`. */
  readonly generateBusy: boolean;
  /** Current locale for i18n label lookup. */
  readonly locale: Locale;
  /** App version string (already fetched by the parent via the
   *  `getAppVersion` IPC + fallback chain in `AppHeader.tsx`). */
  readonly appVersion: string;
};

export function AppHeaderStatusBadge({
  project,
  projectPath,
  onCloseProjectClick,
  scriptPanelOpen,
  onToggleScriptPanel,
  onGenerate,
  canGenerate,
  generateBusy,
  locale,
  appVersion,
}: AppHeaderStatusBadgeProps): JSX.Element {
  // Subscribe to setLocale via the store directly. Zustand action
  // refs are stable (no re-render churn from re-subscribing), so
  // this is safe and reduces prop count by 1. The current `locale`
  // value still comes via the prop (matches the pre-extraction
  // AppHeader shell pattern of subscribing to locale at the top
  // level).
  const setLocale = useArxmlStore((s) => s.setLocale);

  return (
    <>
      {/* Project chip — shows the current project name + a ×
          close button. Hidden when no project is open. Tooltip
          shows the source path so the user can verify which
          directory the project is loaded from. */}
      {project !== null && (
        <span className="app-project-chip" title={projectPath ?? ''} data-testid="app-project-chip">
          <span className="app-project-chip-label">{t(locale, 'app.project.chipLabel')}</span>
          <span className="app-project-chip-name">{project.name}</span>
          <button
            type="button"
            className="app-project-chip-close"
            aria-label={t(locale, 'app.project.closeAria', { name: project.name })}
            onClick={onCloseProjectClick}
            data-testid="btn-project-close"
          >
            ×
          </button>
        </span>
      )}
      {/* ScriptPanel toggle — open/closes the CodeMirror script
          panel (lazy bundle). aria-pressed reflects state. */}
      <button
        type="button"
        className={`app-btn app-btn-scripts ${scriptPanelOpen ? 'is-active' : ''}`}
        onClick={onToggleScriptPanel}
        aria-pressed={scriptPanelOpen}
        aria-label={t(locale, 'script.panel.toggle')}
        title={t(locale, 'script.panel.toggle')}
        data-testid="btn-scripts-toggle"
      >
        {t(locale, 'script.panel.title')}
      </button>
      {/* v1.21.0 MINOR T1 — BSW code generator GUI entry. Sits
          between the scripts toggle and the locale switch so the
          project-bound actions cluster on the right. Disabled
          when no project is open (the generator requires a
          `.autosarcfg.json` manifest path) or another action is
          in-flight. `generateBusy` is wired from the
          `useGenerateCode` hook's `state === 'running'` flag. */}
      <button
        type="button"
        className={`app-btn app-btn-generate ${generateBusy ? 'is-busy' : ''}`}
        onClick={onGenerate}
        disabled={!canGenerate || generateBusy}
        aria-label={t(locale, 'app.generate.buttonAria')}
        title={
          canGenerate ? t(locale, 'app.generate.button') : t(locale, 'app.generate.needProject')
        }
        data-testid="btn-generate"
      >
        {t(locale, 'app.generate.button')}
      </button>
      {/* Locale toggle button — flips between 'zh-CN' and 'en'.
          Label switches between 'EN' and '中' to preview the
          target locale. Sits at the right edge of the action
          cluster so it's always reachable. */}
      <button
        type="button"
        className="app-btn app-btn-locale"
        onClick={() => setLocale(locale === 'zh-CN' ? 'en' : 'zh-CN')}
        aria-label={t(locale, 'app.locale.toggleAria')}
        data-testid="btn-locale-toggle"
      >
        {locale === 'zh-CN' ? 'EN' : '中'}
      </button>
      {/* App version label (far right). Shows the version from
          the `getAppVersion` IPC (with '?' fallback per the
          v1.12.0 PATCH D3 chain in AppHeader.tsx). The label
          also serves as the tooltip so hovering reveals the same
          value (matches the pre-extraction behavior). */}
      <span className="app-version" title={t(locale, 'app.versionLabel', { version: appVersion })}>
        {t(locale, 'app.versionLabel', { version: appVersion })}
      </span>
    </>
  );
}
