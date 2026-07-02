// Logo — AppHeader + 其他位置使用的品牌标记。
//
// 内联 SVG 渲染（不通过 `import url`），原因：
//   - 颜色/无障碍属性需要可控（currentColor 透传 + aria-hidden）
//   - 零构建配置依赖（无需 Vite SVG plugin）
//   - 测试可在 jsdom 里直接断言 DOM 结构
//
// 数据源 `src/renderer/assets/autosarcfg-logo.svg` 是给 `scripts/gen-icons.mjs`
// 用的 PNG/ICO 派生源，跟本组件的内容应保持同步。

export interface LogoProps {
  /** 渲染像素尺寸（width + height）。默认 32。 */
  readonly size?: number;
  /** 自定义类名（外层 `<span>`）。 */
  readonly className?: string;
}

export function Logo({ size = 32, className }: LogoProps): JSX.Element {
  const hostClass = className ?? 'app-logo';
  return (
    <span className={hostClass} data-testid="app-logo" aria-hidden="true">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 64 64"
        width={size}
        height={size}
        focusable="false"
      >
        <rect x="0" y="0" width="64" height="64" rx="12" ry="12" fill="#89b4fa" />
        <text
          x="32"
          y="32"
          fill="#ffffff"
          fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          fontSize="32"
          fontWeight="700"
          textAnchor="middle"
          dominantBaseline="central"
        >
          AC
        </text>
      </svg>
    </span>
  );
}
