# UI v2 P1 偏差裁决文档（2026-08-30 dry-run 实测）

> 本文件是 spec §3.2 偏差裁决产物（P1 dry-run 实测），提交至 spec §10.5 流程。**裁决已完成（2026-08-30 用户整体确认：36 bucket 全部按建议通过、15 新 token 全部通过、plan Deviations 1-5 通过）**，映射已按「机制注记（实施时裁决）」落盘。

- 数据源：`.superpowers/sdd/2026-08-30-p1-visual-foundation/p1-dryrun.txt`（Task 3 Step 1，`node scripts/codemod/hex-to-tokens.mjs` dry-run 实测输出，权威数据源）
- 初始建议列：plan 附录 A（`2026-08-30-p1-visual-foundation.md` 第 0/1/2 节）；频次一律以 dry-run 实测为准，与附录 A 估计的差异在备注列标明
- 裁决方式：逐 bucket 填写行末「用户裁决：**\_\_\_\_**」（可整体按建议通过）；裁决前不得 `--write`

---

## 一、数据快照（dry-run 实测）

总计行（逐字）：

```
[dry-run] 替换 453 / 悬空改写 16 / 删注释 53；未映射偏差 264 种
```

- 「264 种」是逐文件偏差条目合计（同一值跨文件重复计）；全局去重后为 **140 个不同值、合计 518 次出现**（hex 103 种 / rgba·rgb 36 种 / gradient 1 条）。（脚注 2）
- plan 附录 A 预估偏差 ~100 种 distinct 值，实测 140 种——新增 bucket 见 B19–B27、R8、G1。

文件级明细（32 个文件，顺序同 dry-run 输出）：

| 文件                                            |    替换 | 悬空改写 | 删注释 |
| ----------------------------------------------- | ------: | -------: | -----: |
| components/BswmdChip.css                        |      11 |        0 |      0 |
| components/BswmdPickerDialog.css                |      29 |        0 |      5 |
| components/CascadeConfirmDialog.css             |      24 |        0 |      9 |
| components/ConfirmDialog.css                    |      20 |        0 |      7 |
| components/ConfirmDialog2.css                   |       0 |        2 |      0 |
| components/ContextMenu.css                      |       5 |        0 |      5 |
| components/DbcImportWizard/DbcImportWizard.css  |      25 |        0 |      0 |
| components/DbcViewer/DbcViewer.css              |      18 |        0 |      0 |
| components/DiagnosticExtractSuccessDialog.css   |      12 |        0 |      3 |
| components/DiffTable.css                        |       0 |        2 |      0 |
| components/ErrorBanner.css                      |       8 |        0 |      0 |
| components/FileListTab.css                      |      14 |        0 |      0 |
| components/ImportEntry.css                      |       2 |        1 |      0 |
| components/LeftPanel.css                        |      11 |        0 |      0 |
| components/ModuleFromBswmdPicker.css            |      43 |        0 |      5 |
| components/ModuleSelectionPanel.css             |       1 |        2 |      0 |
| components/NewProjectDialog.css                 |      45 |        0 |      6 |
| components/OdxViewer/OdxViewer.css              |      27 |        0 |      4 |
| components/ProjectPanel.css                     |      19 |        0 |      0 |
| components/PromptDialog.css                     |       8 |        0 |      0 |
| components/RemoveModuleConfirmDialog.css        |      25 |        0 |      9 |
| components/ScriptPanel/ScriptPanel.css          |      12 |        0 |      0 |
| components/TemplateCard.css                     |      11 |        0 |      0 |
| components/ValidationPanel.css                  |       7 |        0 |      0 |
| components/ValidationPanel/ValidationPanel.css  |       2 |        1 |      0 |
| components/XlsxBatchWizard/XlsxBatchWizard.css  |      21 |        0 |      0 |
| components/dcmConfig/DcmConfigErrorToast.css    |       0 |        0 |      0 |
| components/dcmConfig/DcmConfigSuccessDialog.css |       0 |        2 |      0 |
| components/editor/modes/BooleanEditor.css       |       6 |        0 |      0 |
| components/editor/modes/EnumEditor.css          |       7 |        0 |      0 |
| keyboard/keyboard.css                           |       0 |        6 |      0 |
| styles.css                                      |      40 |        0 |      0 |
| **合计**                                        | **453** |   **16** | **53** |

---

## 二、hex 偏差 bucket（B1–B27；B1–B18 沿用附录 A，B19 起为新增）

「计」= dry-run 实测出现次数（该 bucket 内各值之和，跨文件累计）。

| #         | 偏差值（dry-run 实测 ×频次）                                                                                       |  计 | 备注                                                                                                                                                                                                                                                                                 | 裁决位                                                                                                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------ | --: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1        | #6b7280 ×25（keyboard 12 / ValidationPanel/ 10 / ValidationPanel 3）、#64748b ×11、rgb(100 116 139) ×2、#9ca3af ×1 |  39 | 附录 A 估 14/11/1：#6b7280 实测 +11（keyboard.css 独占 12）；rgb(100 116 139) 为空格语法等价 #64748b，因该值不在 seed TOKEN_MAP 未能自动映射（R7 预期未兑现处）                                                                                                                      | → 建议目标：--text-muted ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                                                                                                |
| B2        | #555 ×8、#666 ×4、#4b5563 ×2、#374151 ×2、#757575 ×1                                                               |  17 | #555 估 5 → 实 8                                                                                                                                                                                                                                                                     | → 建议目标：--text-secondary ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                                                                                            |
| B3        | #111 ×4、#222 ×2、#1f2937 ×2                                                                                       |   8 | 附录 A 预列的 #3c3c3c 未出现                                                                                                                                                                                                                                                         | → 建议目标：--text-primary ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                                                                                              |
| B4        | #e5e7eb ×10、#e4e6eb ×5、#e8ecf1 ×2、#dce0e6 ×2、#eee ×3、#eef1f6 ×1                                               |  23 | 与估基本一致（#eee 估 2 → 实 3）                                                                                                                                                                                                                                                     | → 建议目标：--border-subtle ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                                                                                             |
| B5        | #ccc ×16、#d1d5db ×9、#ddd ×6、#d4d6db ×1                                                                          |  32 | #ccc 估 8 → 实 16、#ddd 估 3 → 实 6                                                                                                                                                                                                                                                  | → 建议目标：--border-strong ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                                                                                             |
| B6        | #fafafa ×4、#f5f7fa ×4、#f9fafb ×3                                                                                 |  11 | #fafafa 估 2 → 实 4                                                                                                                                                                                                                                                                  | → 建议目标：--surface-app ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                                                                                               |
| B7        | #f3f4f6 ×5、#f3f3f3 ×4、#f1f3f5 ×3、#f5f5f5 ×2、#f0f0f0 ×2                                                         |  16 | #f3f3f3 / #f5f5f5 / #f0f0f0 略高于估（4/2/2 vs 2/1/1）                                                                                                                                                                                                                               | → 建议目标：--surface-subtle ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                                                                                            |
| B8        | #2563eb ×15、#4a90e2 ×10、#4f46e5 ×6、#357abd ×4、#1e40af ×2、#82aaff ×1、#1e88e5 ×1                               |  39 | 全面高于估（12/5/3/2/2/1）；#1e88e5（ScriptPanel，Material blue-600）为附录 A 未列的新增值，按同族并入                                                                                                                                                                               | → 建议目标：--brand-500 ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                                                                                                 |
| B9        | #1e3a8a ×12（FileListTab 4 / ProjectPanel 3 / DbcViewer 2 / styles.css 2 / LeftPanel 1）                           |  12 | 与估一致；需上下文拆分（dry-run 无语义标注，裁决后 Task 4 人工 review 落位）                                                                                                                                                                                                         | → 建议目标：文字处 --text-primary；styles.css 深色区底 --chrome-border ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                                                  |
| B10       | #0ea5e9 ×10（均 styles.css）                                                                                       |  10 | 估 5 → 实 10（翻倍）                                                                                                                                                                                                                                                                 | → 建议目标：--accent-cyan ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                                                                                               |
| B11       | #ff5370 ×2、#ff8a80 ×2、#c00 ×2、#ef4444 ×2、#f87171 ×1、#e53935 ×1                                                |  10 | #c00 估 1 → 实 2                                                                                                                                                                                                                                                                     | → 建议目标：--accent-rose ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                                                                                               |
| B12       | #92400e ×5、#8a6d00 ×4、#9a3412 ×1                                                                                 |  10 | #8a6d00 估 2 → 实 4                                                                                                                                                                                                                                                                  | → 建议目标：--accent-amber-strong ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                                                                                       |
| B13       | #ffcb6b ×2、#e0c070 ×2、#f57c00 ×1                                                                                 |   5 | #e0c070 估 1 → 实 2                                                                                                                                                                                                                                                                  | → 建议目标：--accent-amber ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                                                                                              |
| B14       | #43a047 ×2、#16a34a ×1、#15803d ×1、#166534 ×1、#065f46 ×1、#115e59 ×1、#81c784 ×1                                 |   8 | 与估一致                                                                                                                                                                                                                                                                             | → 建议目标：--accent-emerald ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                                                                                            |
| B15       | #585b70 ×20、#74c7ec ×15、#eba0ac ×6、#b4befe ×4、#94e2d5 ×2、#fab387 ×2                                           |  49 | Catppuccin 表外值；六值频次与附录 A 估计完全一致（20/15/6/4/2/2）                                                                                                                                                                                                                    | → 建议目标：#585b70→--border-strong；#74c7ec→--brand-300（选区高亮）；#b4befe→--brand-400；#eba0ac→--accent-rose；#94e2d5→--accent-cyan；#fab387→--accent-amber ；用户裁决：按建议通过（2026-08-30 用户整体确认）         |
| B16       | #1e293b ×19、#2d323b ×13、#3d424b ×5、#30363d ×3、#22262e ×2、#484f58 ×2、#1a1d23 ×1、#262a31 ×1                   |  46 | 估 20/14/5/3/3/2/3/1：#1e293b -1、#2d323b -1、#22262e -1、#1a1d23 -2（另 1 处在 G1 渐变端点内）、#1f232b 未单独出现（仅 G1 端点）；注意 #1e293b 多数出现处为浅色区深字（ProjectPanel/PromptDialog/FileListTab/editor 等），styles.css 6 处才是深色 chrome 底——建议同 B9 做上下文拆分 | → 建议目标：--chrome-bg（#1e293b，浅色区文字用法→--text-primary）/ --chrome-bg-deep（#1a1d23、#22262e、#262a31）/ --chrome-border（#2d323b、#30363d、#3d424b、#484f58） ；用户裁决：按建议通过（2026-08-30 用户整体确认） |
| B17       | #9333ea ×1、#6b21a8 ×1、#f3e8ff ×1、#9d174d ×1、#fdf2f8 ×1（均 ValidationPanel.css 单发）                          |   5 | 与估一致；疑似 Diff/语义高亮专色，映射反而失真                                                                                                                                                                                                                                       | → 建议目标：保留原值 + EXCEPTIONS 豁免 ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                                                                                  |
| B18       | #334155 ×13（styles.css 6 / ErrorBanner 4 / ProjectPanel 2 / LeftPanel 1）                                         |  13 | 与估一致；需上下文拆分                                                                                                                                                                                                                                                               | → 建议目标：浅色区文字 --text-secondary；保暗区 --chrome-border ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                                                         |
| B19（新） | #fef2f2 ×9、#fee2e2 ×5、#fecaca ×1                                                                                 |  15 | §0 已预期（估 6/4/1）：#fef2f2 +3；第 1 节未为此设 bucket，此处补列                                                                                                                                                                                                                  | → 建议目标：#fef2f2→--rose-tint；#fee2e2、#fecaca→--rose-tint-strong ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                                                    |
| B20（新） | #fef3c7 ×5、#fff8e1 ×4、#fff7ed ×2、#ffedd5 ×1                                                                     |  12 | §0 已预期（估 5/2/2/1）：#fff8e1 +2                                                                                                                                                                                                                                                  | → 建议目标：--amber-tint ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                                                                                                |
| B21（新） | #dcfce7 ×1、#a7f3d0 ×1、#ecfdf5 ×1、#f0fdfa ×1                                                                     |   4 | 与 §0 收敛列一致                                                                                                                                                                                                                                                                     | → 建议目标：--emerald-tint ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                                                                                              |
| B22（新） | #dbeafe ×4、#bfdbfe ×1、#eef2ff ×3、#eff6ff ×2                                                                     |  10 | §0 已预期（估 4/1 与 2/1）：#eef2ff +1                                                                                                                                                                                                                                               | → 建议目标：#dbeafe、#bfdbfe→--brand-tint；#eff6ff、#eef2ff→--brand-tint-soft ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                                           |
| B23（新） | #991b1b ×16、#b91c1c ×4、#7f1d1d ×3                                                                                |  23 | §0 已预期（估 12/4/3）：#991b1b +4（DcmConfigErrorToast 6 处为主）                                                                                                                                                                                                                   | → 建议目标：--accent-rose-strong ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                                                                                        |
| B24（新） | #c2410c ×4、#ea580c ×2（均 styles.css）                                                                            |   6 | 附录 A 未预期；tokens.css `--accent-amber-strong` 注释与 spec §3.1 明示「#c2410c/#ea580c 不预先合并」                                                                                                                                                                                | → 建议目标：保留原值 + EXCEPTIONS 豁免 ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                                                                                  |
| B25（新） | #b4b8bf ×5、#8a8f99 ×3、#4d525b ×1、#1e1e1e ×1（均 ScriptPanel.css）                                               |  10 | 附录 A 未预期的 ScriptPanel 保暗区字色/底色散值；39 个现有 token 与 15 个提案 token 均无对应档                                                                                                                                                                                       | → 建议目标：保留原值 + EXCEPTIONS 豁免（如需统一可另行提案 --chrome-text，待定） ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                                        |
| B26（新） | #fca5a5 ×13（DcmConfigErrorToast 6 / styles.css 3 / ErrorBanner 2 / ConfirmDialog2 2）                             |  13 | 附录 A 未预期（Tailwind red-300：tint 面上亮红描边/图标，与 --rose-tint-strong 的近白底不同档）；现有/提案 token 均无对应                                                                                                                                                            | → 建议目标：待定（建议：保留原值 + EXCEPTIONS 豁免，或新增 tint 面红描边档 token） ；用户裁决：保留原值 + EXCEPTIONS 豁免（2026-08-30 用户整体确认；「待定」取保守项，controller 裁定 R5）                                |
| B27（新） | #3730a3 ×1（ValidationPanel.css）                                                                                  |   1 | 附录 A 未预期；indigo-800 单发语义高亮，性质同 B17                                                                                                                                                                                                                                   | → 建议目标：保留原值 + EXCEPTIONS 豁免 ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                                                                                  |

---

## 三、rgba / box-shadow / gradient 偏差 bucket（R1–R8、G1）

| #        | 偏差值（dry-run 实测 ×频次）                                                                                                                                                                                                                                                                   |  计 | 备注                                                                                                                                                      | 裁决位                                                                                                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --: | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1       | rgba(0, 0, 0, 0.55) ×8、rgba(0, 0, 0, 0.5) ×8、rgba(0, 0, 0, 0.4) ×7、rgba(0, 0, 0, 0.45) ×3                                                                                                                                                                                                   |  26 | 估 ~22 → 实 26；均为弹窗/浮层遮罩                                                                                                                         | → 建议目标：--overlay-scrim ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                                                 |
| R2       | rgba(0, 0, 0, 0.2) ×3、rgba(0, 0, 0, 0.35) ×2、rgba(0, 0, 0, 0.06) ×1、rgba(0, 0, 0, 0.1) ×1、rgba(0, 0, 0, 0.25) ×1                                                                                                                                                                           |   8 | 估 ~10 → 实 8；弱遮罩/浅投影                                                                                                                              | → 建议目标：--overlay-scrim-soft ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                                            |
| R3       | rgba(137, 180, 250, 0.13) ×2、rgba(137, 180, 250, 0.18) ×2、rgba(59, 130, 246, 0.12) ×1、rgba(59, 130, 246, 0.15) ×1、rgba(137, 180, 250, 0.12) ×1、rgba(137, 180, 250, 0.05) ×1、rgba(59, 130, 246, 0.06) ×1、rgba(59, 130, 246, 0.08) ×1                                                     |  10 | 估 11 → 实 10；rgba(137,180,250,\*) 为反转面 brand alpha（BswmdChip/TemplateCard/NewProjectDialog/OdxViewer）                                             | → 建议目标：rgba(59,130,246,0.12/0.15) 与 rgba(137,180,250,\*)→--brand-alpha；rgba(59,130,246,0.06/0.08)→--brand-alpha-soft ；用户裁决：按建议通过（2026-08-30 用户整体确认） |
| R4       | rgba(255, 255, 255, 0.03) ×2、rgba(255, 255, 255, 0.02) ×1、rgba(255, 255, 255, 0.04) ×1、rgba(255, 255, 255, 0.05) ×1、rgba(255, 255, 255, 0.1) ×1、rgba(255, 255, 255, 0.18) ×1、rgba(255, 255, 255, 0.2) ×1                                                                                 |   8 | 估 6 → 实 8；ScriptPanel 2、styles.css 2、ErrorBanner 4（保暗区发丝线/高光）                                                                              | → 建议目标：--chrome-hairline ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                                               |
| R5       | rgba(185, 28, 28, 0.06) ×3、rgba(252, 165, 165, 0.1) ×2、rgba(14, 165, 233, 0.15) ×2、rgba(249, 226, 175, 0.25) ×1、rgba(249, 226, 175, 0.15) ×1、rgba(245, 158, 11, 0.3) ×1、rgba(245, 158, 11, 0.12) ×1、rgba(243, 139, 168, 0.1) ×1、rgba(244, 67, 54, 0.12) ×1、rgba(67, 160, 71, 0.12) ×1 |  14 | 与估一致（附录 A 列的 10 个值全部出现）                                                                                                                   | → 建议目标：改用对应实 tint 底色（--rose-tint / --amber-tint / --emerald-tint 等；alpha 底→实 tint 属视觉归一） ；用户裁决：按建议通过（2026-08-30 用户整体确认）             |
| R6       | （无独立偏差条目）                                                                                                                                                                                                                                                                             |   0 | codemod 不单独解析 box-shadow，shadow 内 rgba 已计入 R1–R5；特异几何（inset 焦点环等）留 Task 4 人工 review 逐条裁决                                      | → 建议目标：归并 --shadow-sm/md/lg（随 R1–R5 裁决落地） ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                     |
| R7       | rgb(100 116 139) ×2 → 已归入 B1；rgb(59 130 246)/(15 23 42)/(241 245 249)/(248 250 252)/(226 232 240)/(203 213 225) 未出现在偏差表                                                                                                                                                             |   — | 附录 A R7 预期基本兑现：其余空格语法 rgb() 均已自动归一为 hex 并被 seed TOKEN_MAP 替换（计入「替换 453」）；仅 #64748b 不在 seed map 导致 2 处残留（→B1） | → 建议目标：并入 B1（--text-muted） ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                                                                         |
| R8（新） | rgba(15, 23, 42, 0.55) ×4（DbcImportWizard / DbcViewer / ErrorBanner / XlsxBatchWizard）                                                                                                                                                                                                       |   4 | 附录 A 未预期的 slate 基遮罩（R1 只列了黑基 0.4–0.55）                                                                                                    | → 建议目标：--overlay-scrim（slate 基→黑基，视觉归一；如需保真可保留原值 + EXCEPTIONS） ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                     |
| G1（新） | gradient: linear-gradient(180deg, #1f232b 0%, #1a1d23 100%) ×1                                                                                                                                                                                                                                 |   1 | ScriptPanel.css:301（dry-run 输出「首现 L0」为定位 quirk，见脚注 3）；plan Task 3 Step 4 已预告该条                                                       | → 建议目标：GRADIENT_MAP → var(--chrome-bg-deep)（两 stop 同族，整条坍缩为纯色，视觉归一） ；用户裁决：按建议通过（2026-08-30 用户整体确认）                                  |

---

## 四、新 token 提案 — 需与 bucket 裁决一并确认

（plan 附录 A 第 0 节原样转录，15 个，spec §3.1/§9.8 修订提案；「收敛对象」为 plan 时的估计值，实测频次见上表 B19–B23、R1–R5 行。）

| Token                  | 值                      | 收敛对象（实测）                                                       |
| ---------------------- | ----------------------- | ---------------------------------------------------------------------- |
| `--brand-tint`         | `#dbeafe`               | #dbeafe(4) #bfdbfe(1)                                                  |
| `--brand-tint-soft`    | `#eff6ff`               | #eff6ff(1) #eef2ff(2)                                                  |
| `--rose-tint`          | `#fef2f2`               | #fef2f2(6)                                                             |
| `--rose-tint-strong`   | `#fee2e2`               | #fee2e2(4) #fecaca(1)                                                  |
| `--amber-tint`         | `#fef3c7`               | #fef3c7(5) #fff8e1(2) #fff7ed(2) #ffedd5(1)                            |
| `--emerald-tint`       | `#dcfce7`               | #dcfce7(1) #a7f3d0(1) #ecfdf5(1) #f0fdfa(1)                            |
| `--accent-rose-strong` | `#b91c1c`               | #991b1b(12) #b91c1c(4) #7f1d1d(3)                                      |
| `--chrome-bg`          | `#1e293b`               | #1e293b(20)（styles.css 深色 chrome 底）                               |
| `--chrome-bg-deep`     | `#1a1d23`               | #1a1d23(3) #1f232b(1) #22262e(3) #262a31(1)（ScriptPanel 深底/渐变端） |
| `--chrome-border`      | `#334155`               | #334155(13) #2d323b(14) #30363d(3) #3d424b(5) #484f58(2)（保暗区边框） |
| `--overlay-scrim`      | `rgba(0,0,0,0.5)`       | rgba(0,0,0,0.4–0.55)（~22 处弹窗遮罩）                                 |
| `--overlay-scrim-soft` | `rgba(0,0,0,0.2)`       | rgba(0,0,0,0.06–0.35)（~10 处弱遮罩）                                  |
| `--brand-alpha`        | `rgba(59,130,246,0.12)` | rgba(59,130,246,0.06–0.15)(5) + 反转后 rgba(137,180,250,\*)(6)         |
| `--brand-alpha-soft`   | `rgba(59,130,246,0.06)` | rgba(59,130,246,0.06/0.08) 低档                                        |
| `--chrome-hairline`    | `rgba(255,255,255,0.1)` | rgba(255,255,255,0.02–0.2)(6)（保暗区发丝线）                          |

---

## 五、操作说明（用户裁决后流程，对应 plan Task 3 Step 4–5）

1. **用户逐 bucket 填写「用户裁决：**\_\_\_\_**」**（可整体按建议通过）。裁决完成后本文件即生效。
2. **裁决为「映射」的值** → 填入 `scripts/codemod/hex-to-tokens.mjs` 的 `ALPHA_MAP`（rgba 串）与 `GRADIENT_MAP`（整条渐变，如 G1 坍缩为 `var(--chrome-bg-deep)`）；hex→token 的裁决结果随映射表一并落地（seed `TOKEN_MAP` 保持不动，按 codemod 头注约定执行）。
3. **裁决为「保留原值」的值** → 填入 `EXCEPTIONS`，键格式 `src/renderer/<相对路径（正斜杠）>:<展开6位小写hex>`（如 `src/renderer/styles.css:#c2410c`；三/四位短 hex 先展开为 6 位小写，如 `#555` → `#555555`）。
4. **新 token 裁决通过的** → 按第四节提案表追加至 `src/renderer/styles/tokens.css` 对应分组（注释标注「T3 裁决新增」），并按 spec §10.5 修订 spec §3.1（token 表）与 §9.8（mockup 外新增 token 以 §3.1 裁决清单为准）。
5. **以上全部完成后**，才允许运行 `node scripts/codemod/hex-to-tokens.mjs --write`（Task 4），随后进行重灾区（styles.css / ScriptPanel / B15 反转组件）人工语义 review。

---

## 六、机制注记（实施时裁决）

Task 3 Step 4 落盘时的机制性裁决（controller R6–R8，约束性，2026-08-30）：

- **ADJUDICATED_TOKEN_MAP / seed 冻结**：裁决 hex→token 映射（90 键）进入新增 `ADJUDICATED_TOKEN_MAP`；seed `TOKEN_MAP` 冻结 27 键不动（测试冻结断言）。查找链统一为 fileOverrides → adjudicated → seed。
- **FILE_OVERRIDES 承载 B9/B16/B18 上下文拆分**：仅 `src/renderer/styles.css` 命中文件级覆盖（`#1e293b→--chrome-bg`、`#334155→--chrome-border`、`#1e3a8a→--chrome-border`）；其余文件走全局映射（B16 全局 `#1e293b→--text-primary`、B18 全局 `#334155→--text-secondary`、B9 全局 `#1e3a8a→--text-primary`）。
- **scanResidue 例外感知 + 行尾豁免注入**：`--check` 残留扫描按 `relFile:hex` 过滤 EXCEPTIONS 命中项（planned-comment / dangling-var / dark-selector 永不过滤）；`transformCss` 对保留的例外 hex 在行尾（`\r\n`/`\n` 前）注入 `stylelint-disable-line color-no-hex`，dry-run 预览与 `--write` 落盘一致。
- **EXCEPTIONS 键含 `src/renderer/` 前缀**：与 CLI 传入的 relFile（正斜杠）同构，共 16 键（B17 5 / B24 2 / B25 4 / B26 4 / B27 1），全部为 hex 值。
- **悬空 fallback 一致性**：悬空 `var(--color-*, fallback)` 的 fallback 按同一查找链解析，rgba fallback 查 `ALPHA_MAP`（R4/R5 裁决值）；fallback 为裁决例外 hex 时整段原样保留、不记偏差（如 ConfirmDialog2 / DcmConfigErrorToast 的 `var(--color-error-border, #fca5a5)`，悬空 var 本体留 Task 4 人工 review）。

---

## 脚注

1. **双计 quirk**：悬空 `var(--color-*, <fallback>)` 且 fallback 未被映射时，该 fallback 色值会被 codemod 的「悬空 pass」与「hex pass」各计一次（已知 quirk，不做修正），故个别值的出现次数轻微偏高；distinct「种」数不受影响。本表频次一律沿用 dry-run 原值。
2. 「264 种」为逐文件偏差条目合计（同一值跨文件重复计）；全局去重后为 140 个不同值、合计 518 次出现。
3. gradient 条目「首现 L0」为输出定位 quirk（记录值带 `gradient: ` 前缀，原文中不存在该前缀串，`indexOf` 回退为 0）；实际位置为 ScriptPanel.css:301。
