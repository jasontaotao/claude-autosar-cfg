// i18n — Aggregate Messages interface.
//
// `Messages` is the intersection of 7 cluster interfaces (app / dialog
// / editor / validation / dbc / odx / misc). Each cluster file declares
// its own readonly keys; the locale bundles must satisfy the merged
// shape (the parity test in `__tests__/i18n.test.ts` enforces key-set
// equality between en and zh-CN).

import type { AppMessages } from './app.js';
import type { DbcMessages } from './dbc.js';
import type { DialogMessages } from './dialog.js';
import type { EditorMessages } from './editor.js';
import type { MiscMessages } from './misc.js';
import type { OdxMessages } from './odx.js';
import type { ValidationMessages } from './validation.js';

export interface Messages
  extends
    AppMessages,
    DialogMessages,
    EditorMessages,
    ValidationMessages,
    DbcMessages,
    OdxMessages,
    MiscMessages {}
