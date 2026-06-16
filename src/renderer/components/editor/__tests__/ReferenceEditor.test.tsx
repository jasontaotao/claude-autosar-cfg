// @vitest-environment jsdom
//
// ReferenceEditor (Sprint 10 #3) — the dest-merge regression test.
//
// Silent-failure-hunter review finding #1:
//   "ReferenceEditor silently drops dest on user edit"
//   (src/renderer/components/editor/modes/ReferenceEditor.tsx:28-33)
//
// Pre-fix: onChange called updateParam with
//   { type: 'reference', value: e.target.value }
// which dropped the original `dest` field (carries the ECUC
// CONTAINER-VALUE / REFERENCE-DEF / FOREIGN-REFERENCE-DEF attribute
// from the parser). After the first user edit, checkRefDests in
// Sprint 9 #2 could no longer validate the dest-kind rule for any
// reference the user had touched, and round-tripping the saved ARXML
// would lose the DEST attribute.
//
// This file pins:
//   1. typing into the input preserves dest on the next updateParam call
//   2. typing when the value had no dest still does not invent one
//   3. onChange calls updateParam with the same path/paramKey/argument
//      shape every time (the round-trip property)

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ParamValue } from '@core/arxml/types';

import { useArxmlStore } from '../../../store/useArxmlStore';
import { ReferenceEditor } from '../modes/ReferenceEditor';

afterEach(() => {
  vi.restoreAllMocks();
});

const containerPath = '/EAS/EcuC/EcuCGeneral';
const paramKey = 'WdgIfDriverRef';

beforeEach(() => {
  useArxmlStore.getState().clear();
});

describe('ReferenceEditor — dest preservation (Sprint 10 #3 silent-failure fix)', () => {
  it('preserves dest on user edit (the silent-failure regression)', () => {
    const value: ParamValue = {
      type: 'reference',
      value: '/OtherPkg/SomeContainer',
      dest: 'ECUC-CONTAINER-VALUE',
    };
    const updateParam = vi.fn();
    // Replace the store action with a spy so we can assert the exact
    // argument shape (Zustand's setState is hard to assert against).
    useArxmlStore.setState({ updateParam } as unknown as never);

    render(<ReferenceEditor paramKey={paramKey} value={value} containerPath={containerPath} />);
    const input = screen.getByLabelText(`${paramKey} reference path`) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '/OtherPkg/OtherContainer' } });

    expect(updateParam).toHaveBeenCalledTimes(1);
    const [cp, pk, arg] = updateParam.mock.calls[0]!;
    expect(cp).toBe(containerPath);
    expect(pk).toBe(paramKey);
    // dest is preserved (was 'ECUC-CONTAINER-VALUE', still is)
    expect(arg).toEqual({
      type: 'reference',
      value: '/OtherPkg/OtherContainer',
      dest: 'ECUC-CONTAINER-VALUE',
    });
  });

  it('does not invent a dest when the original value had none', () => {
    const value: ParamValue = {
      type: 'reference',
      value: '/OtherPkg/SomeContainer',
      // no dest
    };
    const updateParam = vi.fn();
    useArxmlStore.setState({ updateParam } as unknown as never);

    render(<ReferenceEditor paramKey={paramKey} value={value} containerPath={containerPath} />);
    const input = screen.getByLabelText(`${paramKey} reference path`) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '/OtherPkg/OtherContainer' } });

    expect(updateParam).toHaveBeenCalledTimes(1);
    const arg = updateParam.mock.calls[0]![2];
    // dest stays undefined — we do not synthesize one
    expect(arg).toEqual({
      type: 'reference',
      value: '/OtherPkg/OtherContainer',
    });
    expect('dest' in (arg as object)).toBe(false);
  });

  it('multiple consecutive edits keep dest intact (round-trip property)', () => {
    const value: ParamValue = {
      type: 'reference',
      value: '/A',
      dest: 'ECUC-REFERENCE-DEF',
    };
    const updateParam = vi.fn();
    useArxmlStore.setState({ updateParam } as unknown as never);

    render(<ReferenceEditor paramKey={paramKey} value={value} containerPath={containerPath} />);
    const input = screen.getByLabelText(`${paramKey} reference path`) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '/B' } });
    fireEvent.change(input, { target: { value: '/C' } });
    fireEvent.change(input, { target: { value: '/D' } });

    expect(updateParam).toHaveBeenCalledTimes(3);
    for (const call of updateParam.mock.calls) {
      const arg = call[2] as ParamValue;
      expect(arg.type).toBe('reference');
      if (arg.type === 'reference') {
        expect(arg.dest).toBe('ECUC-REFERENCE-DEF');
      }
    }
  });
});
