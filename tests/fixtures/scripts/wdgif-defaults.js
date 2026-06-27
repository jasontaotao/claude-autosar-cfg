// Sprint 14 #1 T10 — sample transformer script (kind: 'transformer').
//
// Sets every WdgIf channel's `WdgIfMode` parameter to 0 (off-mode
// default). The mutations are accumulated on the WorkingCopy; the
// renderer surfaces a commit/discard dialog so the engineer can
// apply or drop them in one click (spec §7.3).
//
// This fixture exercises:
//   - ctx.project.findContainers({ def: '/...' })
//   - ctx.utils.path.join (via the ctx API, not the imported helper)
//   - ScriptParam.setValue with an integer (triggers the integer
//     type-guard inside the sandbox)
//   - ctx.log.info for the summary line

const items = ctx.project.findContainers({ def: '/WdgIf/WdgIfConfigSet/WdgIfChannel' });
let changed = 0;

for (const c of items) {
  const mode = c.getParam('WdgIfMode');
  if (mode !== null) {
    mode.setValue(0);
    changed += 1;
  }
}

ctx.log.info(
  `已将 ${changed}/${items.length} 个 WdgIf 通道切到 off 模式 (${ctx.utils.path.join('a', 'b')})`,
);
