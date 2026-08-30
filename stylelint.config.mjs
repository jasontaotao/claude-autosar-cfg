/** P1 防回潮门禁（spec §3.5）。tokens.css 是唯一裸色值豁免处（spec §10.3）。 */
export default {
  extends: ['stylelint-config-standard'],
  rules: {
    'at-rule-no-unknown': [true, { ignoreAtRules: ['tailwind', 'apply', 'layer', 'config'] }],
    'color-no-hex': [true, { message: 'P1 §10.3：禁止裸 hex，改用 tokens.css 变量' }],
    'color-named': 'never',
    'declaration-property-value-disallowed-list': {
      '/^(color|background|border|fill|stroke|box-shadow)/': ['/rgba?\\(|hsla?\\(/'],
    },

    // —— standard 预设风格类规则，与色值无关，逐条关闭迁就存量（plan ## Deviations #6）——
    'comment-empty-line-before': null, // 存量注释紧跟规则/块书写，纯空白风格
    'selector-class-pattern': null, // 存量类名 camelCase BEM（如 --odxDcmLinkage），改名波及 TSX
    'no-descending-specificity': null, // 存量 :disabled 位于 :hover 之后的顺序约定，重排有回归风险
    'rule-empty-line-before': null, // 存量规则间空行风格
    'font-family-name-quotes': null, // 存量 "Consolas" 等带引号，纯风格
    'shorthand-property-no-redundant-values': null, // 存量 4 值简写显式书写，纯风格
    'value-keyword-case': null, // 字体名/currentColor 大小写，纯风格
    'declaration-block-no-duplicate-properties': null, // 存量重复 padding 遗留写法（结构类）
    'declaration-property-value-keyword-no-deprecated': null, // 存量 word-break: break-word 遗留写法
    'declaration-block-no-shorthand-property-overrides': null, // 存量 border-left-color 被简写覆盖（结构类）
    'declaration-block-no-redundant-longhand-properties': null, // 存量 overflow/flex-flow longhand 风格
    'selector-not-notation': null, // 存量 :not() 写法风格
    'property-no-deprecated': null, // 存量遗留 clip 属性
    'no-duplicate-selectors': null, // 存量 .tree-add-collection 重复选择器（结构类）
  },
  overrides: [
    {
      files: ['src/renderer/styles/tokens.css'],
      rules: {
        'color-no-hex': null,
        'declaration-property-value-disallowed-list': null,
        // 裸值「记法风格」同属 §10.3 豁免（plan ## Deviations #7）：组件侧裸值已被
        // color-no-hex + disallowed-list 直接禁止，这 4 条记法规则只对豁免文件有
        // 实际约束；tokens.css 值按 mockup 逐字裁决（T3/T4），不改写记法。
        'color-hex-length': null,
        'color-function-notation': null,
        'color-function-alias-notation': null,
        'alpha-value-notation': null,
      },
    },
  ],
};
