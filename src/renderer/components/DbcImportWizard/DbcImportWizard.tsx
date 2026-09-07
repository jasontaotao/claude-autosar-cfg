// DbcImportWizard — Task 13（4-step full-import wizard）。
//
// 4-step modal that drives the Task 10/11 full-import IPC pipeline
// (`window.autosarApi.dbcFullImportPreview` / `...Commit`) end-to-end
// via host-provided callbacks（spec §10.2）:
//   1. source-target — pick DBC → discovery preview（省略 targetNode）→
//      target node 下拉只来自 preview.nodes（DBC `BU_` 名称）
//   2. policy        — profileId 展示 + PduId base/step/order + UL 命名；
//                      任何变更重新触发 mapping 预览，seq guard 丢弃过期响应
//   3. preview       — 行按 Com/CanIf/PduR 分组、按路径排序、可展开字段
//                      diff（精确 source badge）、warning 按 code 分组、
//                      stats 展示；decisions 由用户调整
//   4. apply         — commit 成功后显示 applied/kept/deleted 计数
//
// The host owns nothing but the callbacks: `onPreview` / `onCommit` are
// the renderer-side IPC wrappers, `onImported` fires after a successful
// commit（host 负责项目 reload）. Server-side commit is the source of
// truth: the wizard ships ONLY `{module,path,decision}[]` + previewHash,
// never DBM/AST data（test-contract #11）。
//
// Accessibility（与 OdxImportWizard 一致）:
//   - Escape / backdrop / close 按钮在 commit 期间全部禁用
//   - 打开时初始焦点落在 close 按钮

import { useCallback, useEffect, useReducer, useRef } from 'react';

import { AUTOSAR_R22_CAN_PROFILE_ID, DEFAULT_PDU_ID_POLICY } from '@core/dbc/profile.js';
import type { PduIdPolicy, UpperLayerNamingPolicy } from '@core/dbc/profile.js';
import { t, type Locale } from '@shared/i18n/index.js';
import type {
  DbcFullImportCommitRequest,
  DbcFullImportCommitResponse,
  DbcFullImportPreview,
  DbcFullImportPreviewRequest,
  DbcFullImportPreviewResponse,
  DbcImportDecision,
  DbcImportError,
} from '@shared/types/dbc-import';

import './DbcImportWizard.css';
import { ApplyStep } from './steps/ApplyStep';
import { MappingPolicyStep } from './steps/MappingPolicyStep';
import { PreviewDecisionsStep, sortRowsByModulePath } from './steps/PreviewDecisionsStep';
import { SourceTargetStep } from './steps/SourceTargetStep';

export interface DbcImportWizardProps {
  readonly onClose: () => void;
  readonly locale?: Locale;
  /** renderer 持有的未保存文档绝对路径（dirty 判定唯一数据源，§6.2）。 */
  readonly dirtyDocPaths: readonly string[];
  /**
   * 选择 DBC 文件的宿主回调：返回已选文件的绝对路径；用户取消返回 null。
   */
  readonly onPickDbc?: () => Promise<string | null>;
  /** preview IPC wrapper（dbcFullImportPreview）。 */
  readonly onPreview: (
    request: DbcFullImportPreviewRequest,
  ) => Promise<DbcFullImportPreviewResponse>;
  /** commit IPC wrapper（dbcFullImportCommit）。 */
  readonly onCommit: (request: DbcFullImportCommitRequest) => Promise<DbcFullImportCommitResponse>;
  /** commit 成功后触发（host 在此做项目 reload）。 */
  readonly onImported?: () => void;
  /** 内置 profile id；Phase 2 前固定为 AUTOSAR_R22_CAN_PROFILE_ID。 */
  readonly profileId?: string;
}

type DbcWizardStep = 'source-target' | 'policy' | 'preview' | 'apply';
type DbcWizardStatus = 'idle' | 'discovering' | 'previewing' | 'committing' | 'done' | 'error';

interface DbcWizardState {
  readonly step: DbcWizardStep;
  readonly status: DbcWizardStatus;
  readonly dbcPath?: string;
  readonly discovery?: DbcFullImportPreview;
  readonly preview?: DbcFullImportPreview;
  readonly targetNode?: string;
  readonly pduIdPolicy?: Partial<PduIdPolicy>;
  readonly upperLayerNaming?: Partial<UpperLayerNamingPolicy>;
  readonly decisions: ReadonlyMap<string, DbcImportDecision>;
  /** 已派发请求的递增序号：过期响应的 seq < state.seq，直接丢弃。 */
  readonly seq: number;
  readonly error?: DbcImportError;
  readonly commitResult?: { applied: number; kept: number; deleted: number; manifestPath: string };
}

type DbcWizardAction =
  | { readonly type: 'DISCOVERY_START' }
  | {
      readonly type: 'DISCOVERY_OK';
      readonly dbcPath: string;
      readonly discovery: DbcFullImportPreview;
    }
  | { readonly type: 'DISCOVERY_FAILED'; readonly error: DbcImportError }
  | { readonly type: 'NODE_SELECTED'; readonly node: string }
  | { readonly type: 'PREVIEW_START' }
  | { readonly type: 'PREVIEW_OK'; readonly preview: DbcFullImportPreview; readonly seq: number }
  | { readonly type: 'PREVIEW_FAILED'; readonly error: DbcImportError; readonly seq: number }
  | {
      readonly type: 'POLICY_CHANGED';
      readonly pduIdPolicy?: Partial<PduIdPolicy>;
      readonly upperLayerNaming?: Partial<UpperLayerNamingPolicy>;
    }
  | { readonly type: 'DECISION_SET'; readonly path: string; readonly decision: DbcImportDecision }
  | { readonly type: 'NEXT' }
  | { readonly type: 'BACK' }
  | { readonly type: 'COMMIT_START' }
  | {
      readonly type: 'COMMIT_OK';
      readonly result: { applied: number; kept: number; deleted: number; manifestPath: string };
    }
  | { readonly type: 'COMMIT_FAILED'; readonly error: DbcImportError }
  | { readonly type: 'DISMISS_ERROR' };

function initialState(): DbcWizardState {
  return {
    step: 'source-target',
    status: 'idle',
    // 预填 profile 默认 PduId 策略：用户不手动填写时输入框显示
    // 0 / 4096 / 1 / document-order，服务端对 undefined override 回落同一默认值。
    pduIdPolicy: DEFAULT_PDU_ID_POLICY,
    decisions: new Map(),
    seq: 0,
  };
}

function previewError(state: DbcWizardState, error: DbcImportError): DbcWizardState {
  return { ...state, status: 'error', error };
}

function wizardReducer(state: DbcWizardState, action: DbcWizardAction): DbcWizardState {
  switch (action.type) {
    case 'DISCOVERY_START':
      return { ...state, status: 'discovering', error: undefined };
    case 'DISCOVERY_OK':
      return {
        ...state,
        status: 'idle',
        dbcPath: action.dbcPath,
        discovery: action.discovery,
        error: undefined,
      };
    case 'DISCOVERY_FAILED':
      return previewError(state, action.error);
    case 'NODE_SELECTED':
      return {
        ...state,
        step: 'policy',
        targetNode: action.node,
        status: 'previewing',
        error: undefined,
      };
    case 'PREVIEW_START':
      return {
        ...state,
        status: 'previewing',
        seq: state.seq + 1,
        error: undefined,
      };
    case 'PREVIEW_OK':
      // seq guard：过期响应（seq < state.seq）直接丢弃，永不覆盖新数据。
      if (action.seq !== state.seq) return state;
      return {
        ...state,
        status: 'idle',
        preview: action.preview,
        // 新预览重新铺默认决策（immutable：新建 Map）
        decisions: new Map(action.preview.rows.map((row) => [row.path, row.defaultDecision])),
        error: undefined,
      };
    case 'PREVIEW_FAILED':
      if (action.seq !== state.seq) return state;
      // 回到 source-target 保留 discovery 结果；仅当无 discovery 时留在原步
      return previewError(
        { ...state, step: state.discovery === undefined ? 'source-target' : state.step },
        action.error,
      );
    case 'POLICY_CHANGED':
      return {
        ...state,
        pduIdPolicy: action.pduIdPolicy,
        upperLayerNaming: action.upperLayerNaming,
      };
    case 'DECISION_SET': {
      // immutable：新建 Map，绝不修改既有 decisions
      const decisions = new Map(state.decisions);
      decisions.set(action.path, action.decision);
      return { ...state, decisions };
    }
    case 'NEXT':
      if (state.step === 'source-target') return { ...state, step: 'policy' };
      if (state.step === 'policy') return { ...state, step: 'preview' };
      return state;
    case 'BACK':
      if (state.step === 'preview') return { ...state, step: 'policy' };
      if (state.step === 'policy') return { ...state, step: 'source-target' };
      return state;
    case 'COMMIT_START':
      return { ...state, status: 'committing', error: undefined };
    case 'COMMIT_OK':
      return {
        ...state,
        status: 'done',
        step: 'apply',
        commitResult: action.result,
        error: undefined,
      };
    case 'COMMIT_FAILED':
      return previewError(state, action.error);
    case 'DISMISS_ERROR':
      return { ...state, status: 'idle', error: undefined };
    default:
      return state;
  }
}

/** §12 error closed set → 本地化 label key。 */
function errorKey(kind: DbcImportError['kind']): Parameters<typeof t>[1] {
  return `dbc.import.error.${kind}` as Parameters<typeof t>[1];
}

function errorMessage(locale: Locale, error: DbcImportError): string {
  const label = t(locale, errorKey(error.kind));
  const detail = error.message.length > 0 ? `: ${error.message}` : '';
  if (error.kind !== 'write-failed') return `${label}${detail}`;
  const rollback = error.rolledBack
    ? t(locale, 'dbc.import.error.write-failed.rolledBack')
    : t(locale, 'dbc.import.error.write-failed.partial');
  return `${label}${detail}${rollback}`;
}

function isBusy(status: DbcWizardStatus): boolean {
  return status === 'committing';
}

export function DbcImportWizard({
  onClose,
  locale = 'zh-CN',
  dirtyDocPaths,
  onPickDbc,
  onPreview,
  onCommit,
  onImported,
  profileId = AUTOSAR_R22_CAN_PROFILE_ID,
}: DbcImportWizardProps): JSX.Element {
  const [state, dispatch] = useReducer(wizardReducer, undefined, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const busy = isBusy(state.status);

  // Escape-to-close：committing 期间禁止关闭（spec §10.2.4）。
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || busy) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', handler);
    return (): void => window.removeEventListener('keydown', handler);
  }, [busy, onClose]);

  // 初始焦点落在 close 按钮（键盘用户可直接 Space/Enter）。
  useEffect(() => {
    const id = requestAnimationFrame(() => closeButtonRef.current?.focus());
    return (): void => cancelAnimationFrame(id);
  }, []);

  const runMappingPreview = useCallback(
    async (
      targetNode: string,
      pduIdPolicy?: Partial<PduIdPolicy>,
      upperLayerNaming?: Partial<UpperLayerNamingPolicy>,
    ): Promise<void> => {
      const prev = stateRef.current;
      // PREVIEW_START 使 reducer 自增 seq；这里预计算同值（handler 串行，
      // 不会有两个并发 START 读取同一个旧值）。
      const seq = prev.seq + 1;
      dispatch({ type: 'PREVIEW_START' });
      try {
        const response = await onPreview({
          dbcPath: prev.dbcPath ?? '',
          targetNode,
          dirtyDocPaths,
          profileId,
          ...(pduIdPolicy !== undefined ? { pduIdPolicy } : {}),
          ...(upperLayerNaming !== undefined ? { upperLayerNaming } : {}),
        });
        if (!response.ok) {
          dispatch({ type: 'PREVIEW_FAILED', error: response.error, seq });
          return;
        }
        dispatch({ type: 'PREVIEW_OK', preview: response.value, seq });
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        dispatch({
          type: 'PREVIEW_FAILED',
          error: { kind: 'read-failed', message },
          seq,
        });
      }
    },
    [dirtyDocPaths, onPreview, profileId],
  );

  const pickDbc = useCallback(async (): Promise<void> => {
    if (onPickDbc === undefined || busy) return;
    dispatch({ type: 'DISCOVERY_START' });
    try {
      const path = await onPickDbc();
      if (path === null) {
        dispatch({ type: 'DISCOVERY_FAILED', error: { kind: 'read-failed', message: 'canceled' } });
        dispatch({ type: 'DISMISS_ERROR' });
        return;
      }
      const response = await onPreview({
        dbcPath: path,
        dirtyDocPaths,
        profileId,
      });
      if (!response.ok) {
        dispatch({ type: 'DISCOVERY_FAILED', error: response.error });
        return;
      }
      dispatch({ type: 'DISCOVERY_OK', dbcPath: path, discovery: response.value });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      dispatch({
        type: 'DISCOVERY_FAILED',
        error: { kind: 'read-failed', message },
      });
    }
  }, [busy, dirtyDocPaths, onPickDbc, onPreview, profileId]);

  const handleNodeChange = useCallback(
    (node: string): void => {
      if (node.length === 0) return;
      dispatch({ type: 'NODE_SELECTED', node });
      void runMappingPreview(node, stateRef.current.pduIdPolicy, stateRef.current.upperLayerNaming);
    },
    [runMappingPreview],
  );

  const handlePolicyChange = useCallback(
    (
      pduIdPolicy?: Partial<PduIdPolicy>,
      upperLayerNaming?: Partial<UpperLayerNamingPolicy>,
    ): void => {
      const prev = stateRef.current;
      // 合并 partial：immutable。未提供的 partial 保留既有 state 槽位
      // （而非清空）——否则编辑一组策略会把另一组的用户输入静默抹掉
      // （commit 回落默认值 / UL 复选框自行取消勾选）。
      const mergedPdu =
        pduIdPolicy !== undefined ? { ...prev.pduIdPolicy, ...pduIdPolicy } : prev.pduIdPolicy;
      const mergedUl =
        upperLayerNaming !== undefined
          ? { ...prev.upperLayerNaming, ...upperLayerNaming }
          : prev.upperLayerNaming;
      dispatch({
        type: 'POLICY_CHANGED',
        pduIdPolicy: mergedPdu,
        upperLayerNaming: mergedUl,
      });
      if (prev.targetNode !== undefined) {
        void runMappingPreview(prev.targetNode, mergedPdu, mergedUl);
      }
    },
    [runMappingPreview],
  );

  const commit = useCallback(async (): Promise<void> => {
    const prev = stateRef.current;
    const preview = prev.preview;
    const dbcPath = prev.dbcPath;
    const targetNode = prev.targetNode;
    if (preview === undefined || dbcPath === undefined || targetNode === undefined || busy) return;
    dispatch({ type: 'COMMIT_START' });
    try {
      const response = await onCommit({
        dbcPath,
        targetNode,
        dirtyDocPaths,
        profileId,
        // exactOptionalPropertyTypes：undefined 不写属性，改用条件展开
        ...(prev.pduIdPolicy !== undefined ? { pduIdPolicy: prev.pduIdPolicy } : {}),
        ...(prev.upperLayerNaming !== undefined ? { upperLayerNaming: prev.upperLayerNaming } : {}),
        previewHash: preview.previewHash,
        // 只传 {module,path,decision}——服务端重跑 preview 并比对 hash（§10.1）。
        // 顺序与 UI 分组排序一致：以 (module, path) 排序后再携带决策。
        decisions: sortRowsByModulePath(preview.rows).map((row) => ({
          module: row.module,
          path: row.path,
          decision: prev.decisions.get(row.path) ?? row.defaultDecision,
        })),
      });
      if (!response.ok) {
        dispatch({ type: 'COMMIT_FAILED', error: response.error });
        return;
      }
      dispatch({ type: 'COMMIT_OK', result: response.value });
      onImported?.();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      dispatch({ type: 'COMMIT_FAILED', error: { kind: 'read-failed', message } });
    }
  }, [busy, dirtyDocPaths, onCommit, onImported, profileId]);

  // decision 更新走独立 dispatch（保持 reducer 纯粹，不携带 policy 变更）
  const setDecision = useCallback((path: string, decision: DbcImportDecision): void => {
    dispatch({ type: 'DECISION_SET', path, decision });
  }, []);

  return (
    <div
      className="dbc-wizard-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dbc-wizard-title"
      data-testid="dbc-wizard-backdrop"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="dbc-wizard-modal"
        onClick={(e): void => {
          e.stopPropagation();
        }}
      >
        <header className="dbc-wizard-header">
          <h2 id="dbc-wizard-title" className="dbc-wizard-title" data-testid="dbc-wizard-title">
            {t(locale, 'dbc.import.wizard.title')}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="dbc-wizard-close"
            onClick={onClose}
            disabled={busy}
            aria-label={t(locale, 'dbc.import.close')}
            data-testid="dbc-wizard-close"
          >
            ×
          </button>
        </header>

        {state.error !== undefined && (
          <div className="dbc-wizard-error" role="alert" data-testid="dbc-wizard-error">
            {errorMessage(locale, state.error)}
          </div>
        )}

        {state.step === 'source-target' && (
          <SourceTargetStep
            locale={locale}
            dbcPath={state.dbcPath}
            discovery={state.discovery}
            targetNode={state.targetNode}
            busy={state.status === 'discovering'}
            onPick={() => void pickDbc()}
            onNodeChange={handleNodeChange}
          />
        )}

        {state.step === 'policy' && (
          <MappingPolicyStep
            locale={locale}
            profileId={profileId}
            pduIdPolicy={state.pduIdPolicy}
            upperLayerNaming={state.upperLayerNaming}
            reparsing={state.status === 'previewing'}
            onPolicyChange={handlePolicyChange}
            onNext={(): void => dispatch({ type: 'NEXT' })}
          />
        )}

        {state.step === 'preview' && state.preview !== undefined && (
          <PreviewDecisionsStep
            locale={locale}
            preview={state.preview}
            decisions={state.decisions}
            committing={busy}
            onDecisionChange={setDecision}
            onCommit={() => void commit()}
            onBack={(): void => dispatch({ type: 'BACK' })}
          />
        )}

        {state.step === 'apply' && state.commitResult !== undefined && (
          <ApplyStep
            locale={locale}
            applied={state.commitResult.applied}
            kept={state.commitResult.kept}
            deleted={state.commitResult.deleted}
            manifestPath={state.commitResult.manifestPath}
            onFinish={onClose}
          />
        )}
      </div>
    </div>
  );
}
