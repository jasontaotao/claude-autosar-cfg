// Logo 组件测试 — 验证默认/自定义 props、SVG 结构、无障碍属性。
//
// 用 RTL + Vitest，跟项目其他组件测试一致（jsdom 环境）。

// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Logo } from '../Logo';

describe('Logo', () => {
  it('renders a host span with data-testid="app-logo" and aria-hidden="true"', () => {
    render(<Logo />);
    const host = screen.getByTestId('app-logo');
    expect(host).toBeInTheDocument();
    expect(host.tagName.toLowerCase()).toBe('span');
    expect(host.getAttribute('aria-hidden')).toBe('true');
  });

  it('defaults size to 32 (svg width/height both 32)', () => {
    render(<Logo />);
    const svg = screen.getByTestId('app-logo').querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('width')).toBe('32');
    expect(svg?.getAttribute('height')).toBe('32');
  });

  it('respects custom size prop', () => {
    render(<Logo size={20} />);
    const svg = screen.getByTestId('app-logo').querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('20');
    expect(svg?.getAttribute('height')).toBe('20');
  });

  it('uses default class "app-logo" when no className prop is provided', () => {
    render(<Logo />);
    const host = screen.getByTestId('app-logo');
    expect(host.className).toBe('app-logo');
  });

  it('overrides host class when className prop is supplied', () => {
    render(<Logo className="custom-logo-class" />);
    const host = screen.getByTestId('app-logo');
    expect(host.className).toBe('custom-logo-class');
  });

  it('renders the Catppuccin Mocha Blue background rect (#89b4fa)', () => {
    render(<Logo />);
    const rect = screen.getByTestId('app-logo').querySelector('rect');
    expect(rect).not.toBeNull();
    expect(rect?.getAttribute('fill')).toBe('#89b4fa');
    expect(rect?.getAttribute('rx')).toBe('12');
  });

  it('renders the white "AC" text', () => {
    render(<Logo />);
    const text = screen.getByTestId('app-logo').querySelector('text');
    expect(text).not.toBeNull();
    expect(text?.textContent).toBe('AC');
    expect(text?.getAttribute('fill')).toBe('#ffffff');
    expect(text?.getAttribute('text-anchor')).toBe('middle');
  });
});
