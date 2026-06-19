// Sprint 14 #1 T10 — shared path utilities used by other sample
// scripts via `ctx._import('./utils/path')`. Pure JS — no TypeScript,
// no Node-only APIs (works under the project's `node:vm` sandbox).
//
// Exposed functions intentionally mirror the shape of the ctx utils
// surface (ctx.utils.path.*) so sample scripts read identically
// regardless of whether they call ctx.utils.path.basename or import
// the shared helper.

export const join = (...segments) => segments.join('/');

export const split = (p) => p.split('/');

export const basename = (p) => {
  const parts = p.split('/');
  return parts[parts.length - 1] ?? p;
};

export const dirname = (p) => {
  const parts = p.split('/');
  parts.pop();
  return parts.join('/');
};