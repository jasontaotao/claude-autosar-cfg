import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { buildDbm, createDbmDocument } from '../dbmBuilder.js';

const xml =
  'VERSION "1.0"\nNS_ :\nBS_:\nBU_: ECM TCM\nBO_ 512 EngineMsg: 8 ECM\n SG_ Speed : 7|16@1+ (0.1,0) [0|100] "km/h" TCM\n';

describe('createDbmDocument and buildDbm', () => {
  it('projects nodes, messages, signals, and source hash', () => {
    const doc = createDbmDocument('C:/fixtures/demo.dbc', xml);
    expect(doc.sourcePath).toBe('C:/fixtures/demo.dbc');
    expect(doc.sourceHash).toBe(`sha256:${createHash('sha256').update(xml).digest('hex')}`);

    const dbm = buildDbm(doc);
    expect(dbm.meta.protocol).toBe('CAN');
    expect(dbm.nodes.map((node) => node.name)).toEqual(['ECM', 'TCM']);
    expect(dbm.messages[0]).toMatchObject({
      shortName: 'EngineMsg',
      messageId: 512,
      isExtended: false,
      dlc: 8,
      transmitter: 'ECM',
    });
    expect(dbm.signals[0]).toMatchObject({
      shortName: 'Speed',
      messageKey: 'EngineMsg',
      startBit: 7,
      length: 16,
      byteOrder: 'little-endian',
      valueType: 'unsigned',
      receivers: ['TCM'],
    });
  });

  it('groups message and signal attributes and preserves multiplex facts', () => {
    // @dbc-forge/core 的 index 不导出 create* 工厂，这里直接构造 Network 形状对象。
    const signal = {
      name: 'MuxSignal',
      startBit: 0,
      length: 8,
      byteOrder: 'little-endian',
      valueType: 'unsigned',
      factor: 1,
      offset: 0,
      min: 0,
      max: 255,
      unit: '',
      receivers: ['ECM'],
      multiplexed: { kind: 'Muxed', value: 3 },
    } as const;
    const message = {
      id: 0x123,
      name: 'MuxMsg',
      dlc: 8,
      transmitter: 'TCM',
      isExtended: false,
      additionalTransmitters: [],
      signals: [signal],
    } as const;
    const document = {
      sourcePath: 'memory.dbc',
      sourceHash: 'sha256:test',
      network: {
        version: '1.0',
        nodes: [{ name: 'ECM' }],
        messages: [message],
        valueTables: [],
        signalGroups: [],
        attributeDefs: [],
        attributeAssignments: [
          { name: 'GenMsgCycleTime', target: { kind: 'message', messageId: 0x123 }, value: 100 },
          {
            name: 'GenSigInactiveValue',
            target: { kind: 'signal', messageId: 0x123, signalName: 'MuxSignal' },
            value: 255,
          },
        ],
        relationAttributeDefs: [],
        relationAttributeAssignments: [],
        comments: [],
      },
    } as const;

    const dbm = buildDbm(document);
    expect(dbm.messages[0]?.attributes).toEqual({ GenMsgCycleTime: 100 });
    expect(dbm.signals[0]?.attributes).toEqual({ GenSigInactiveValue: 255 });
    expect(dbm.signals[0]?.multiplex).toEqual({
      kind: 'multiplexed',
      switchValue: 3,
    });
  });

  it('legalizes and deduplicates from _2, not _1', () => {
    // 两个同名信号 S 在【同一 message】内 → message-scoped 去重为 S / S_2；
    // 另一 message 中的同名信号 S 不跨 message 去重，保持 key 'S'。
    const doc = createDbmDocument(
      'dup.dbc',
      [
        'VERSION ""',
        'BS_:',
        'BU_: ECM',
        'BO_ 1 Bad_Name: 8 ECM',
        ' SG_ S : 0|8@1+ (1,0) [0|0] "" ECM',
        ' SG_ S : 8|8@1+ (1,0) [0|0] "" ECM',
        'BO_ 2 Bad_Name: 8 ECM',
        ' SG_ S : 0|8@1+ (1,0) [0|0] "" ECM',
      ].join('\n'),
    );
    const dbm = buildDbm(doc);
    expect(dbm.messages.map((message) => message.key)).toEqual(['Bad_Name', 'Bad_Name_2']);
    // 同一 message 内的重复信号名从 _2 起去重。
    expect(
      dbm.signals.filter((signal) => signal.messageKey === 'Bad_Name').map((signal) => signal.key),
    ).toEqual(['S', 'S_2']);
    // 不同 message 中的同名信号不跨 message 去重。
    expect(
      dbm.signals
        .filter((signal) => signal.messageKey === 'Bad_Name_2')
        .map((signal) => signal.key),
    ).toEqual(['S']);
    // 去重 collision 必须产生对应 warning。
    expect(dbm.warnings.map((warning) => warning.code)).toContain('dbc-duplicate-message-name');
    expect(dbm.warnings.map((warning) => warning.code)).toContain('dbc-duplicate-signal-name');
  });

  it('passes through extended CAN ids without flag stripping', () => {
    const doc = createDbmDocument(
      'ext.dbc',
      [
        'VERSION ""',
        'BS_:',
        'BU_: ECM',
        'BO_ 536870911 ExtMsg: 8 ECM',
        ' SG_ S : 0|8@1+ (1,0) [0|0] "" ECM',
      ].join('\n'),
    );
    const dbm = buildDbm(doc);
    // 0x1fffffff 是合法 29-bit ID 上界：无 bit-31 标志，透传，不触发 invalid-can-id。
    expect(dbm.messages[0]).toMatchObject({ messageId: 536870911, isExtended: true });
    expect(dbm.warnings.map((warning) => warning.code)).not.toContain('dbc-invalid-can-id');
  });

  it('strips the Vector bit-31 extended-frame flag from messageId', () => {
    // Vector CANdb++ 导出的 DBC 对扩展帧 BO_ id 写 0x80000000 | id。
    // 0x80000000 | 0x123 = 0x80000123 = 2147483939：应剥离 bit-31，恢复真实 29-bit ID 0x123。
    const doc = createDbmDocument(
      'vector-ext.dbc',
      [
        'VERSION ""',
        'BS_:',
        'BU_: ECM',
        'BO_ 2147483939 ExtMsg: 8 ECM',
        ' SG_ S : 0|8@1+ (1,0) [0|0] "" ECM',
      ].join('\n'),
    );
    const dbm = buildDbm(doc);
    expect(dbm.messages[0]).toMatchObject({ messageId: 0x123, isExtended: true });
    expect(dbm.warnings.map((warning) => warning.code)).not.toContain('dbc-invalid-can-id');
  });

  it('matches message attributes against the raw Vector id after stripping', () => {
    // attributeAssignments 的 target.messageId 用原始 id（带 bit-31），
    // 剥离只作用于 DbmMessage.messageId；attribute 匹配必须仍命中原始 id。
    const rawId = 0x80000123;
    const document = {
      sourcePath: 'memory.dbc',
      sourceHash: 'sha256:test',
      network: {
        version: '1.0',
        nodes: [],
        messages: [
          {
            id: rawId,
            name: 'ExtMsg',
            dlc: 8,
            transmitter: 'ECM',
            isExtended: true,
            additionalTransmitters: [],
            signals: [],
          },
        ],
        valueTables: [],
        signalGroups: [],
        attributeDefs: [],
        attributeAssignments: [
          { name: 'GenMsgCycleTime', target: { kind: 'message', messageId: rawId }, value: 100 },
        ],
        relationAttributeDefs: [],
        relationAttributeAssignments: [],
        comments: [],
      },
    } as const;

    const dbm = buildDbm(document);
    expect(dbm.messages[0]).toMatchObject({ messageId: 0x123, isExtended: true });
    expect(dbm.messages[0]?.attributes).toEqual({ GenMsgCycleTime: 100 });
  });

  it('groups node-level attribute assignments', () => {
    const doc = createDbmDocument(
      'nodes.dbc',
      [
        'VERSION ""',
        'BS_:',
        'BU_: ECM TCM',
        'BA_ "NodeAttr" BU_ ECM 5;',
        'BO_ 1 M: 8 ECM',
        ' SG_ S : 0|8@1+ (1,0) [0|0] "" ECM',
      ].join('\n'),
    );
    const dbm = buildDbm(doc);
    expect(dbm.nodes.find((node) => node.name === 'ECM')?.attributes).toEqual({ NodeAttr: 5 });
    expect(dbm.nodes.find((node) => node.name === 'TCM')?.attributes).toEqual({});
  });

  it('legalizes signal names and emits dbc-short-name-legalized', () => {
    const doc = createDbmDocument(
      'legalize.dbc',
      [
        'VERSION ""',
        'BS_:',
        'BU_: ECM',
        'BO_ 1 M: 8 ECM',
        ' SG_ A-B : 0|8@1+ (1,0) [0|0] "" ECM',
      ].join('\n'),
    );
    const dbm = buildDbm(doc);
    expect(dbm.signals[0]?.key).toBe('A_B');
    expect(dbm.warnings.map((warning) => warning.code)).toContain('dbc-short-name-legalized');
  });

  it('emits dbc-invalid-can-id for out-of-range ids', () => {
    const doc = createDbmDocument(
      'badid.dbc',
      [
        'VERSION ""',
        'BS_:',
        'BU_: ECM',
        // 0x20000000：无 bit-31 标志且超出 29-bit 上界（0x1fffffff）→ 真 invalid。
        'BO_ 536870912 M: 8 ECM',
        ' SG_ S : 0|8@1+ (1,0) [0|0] "" ECM',
      ].join('\n'),
    );
    const dbm = buildDbm(doc);
    expect(dbm.warnings.map((warning) => warning.code)).toContain('dbc-invalid-can-id');
  });

  it('strips the Vector flag then still flags a genuinely out-of-range real id', () => {
    // 0x80000000 | 0x20000000 = 0xA0000000 = 2684354560：剥离 bit-31 后
    // 真实 id 仍是 0x20000000（超 29-bit 上界）→ strip-then-recheck 路径。
    const doc = createDbmDocument(
      'vector-bad-ext.dbc',
      [
        'VERSION ""',
        'BS_:',
        'BU_: ECM',
        'BO_ 2684354560 M: 8 ECM',
        ' SG_ S : 0|8@1+ (1,0) [0|0] "" ECM',
      ].join('\n'),
    );
    const dbm = buildDbm(doc);
    expect(dbm.warnings.map((warning) => warning.code)).toContain('dbc-invalid-can-id');
  });

  it('emits dbc-invalid-dlc for dlc out of range', () => {
    const doc = createDbmDocument(
      'baddlc.dbc',
      [
        'VERSION ""',
        'BS_:',
        'BU_: ECM',
        'BO_ 1 M: 16 ECM',
        ' SG_ S : 0|8@1+ (1,0) [0|0] "" ECM',
      ].join('\n'),
    );
    const dbm = buildDbm(doc);
    expect(dbm.warnings.map((warning) => warning.code)).toContain('dbc-invalid-dlc');
  });

  it('emits dbc-message-missing-transmitter for empty transmitter', () => {
    // parseDbc 的 BO_ 正则要求 transmitter 非空 token，该分支通过手工构造 DbmDocument 覆盖。
    const document = {
      sourcePath: 'memory.dbc',
      sourceHash: 'sha256:test',
      network: {
        version: '1.0',
        nodes: [],
        messages: [
          {
            id: 1,
            name: 'M',
            dlc: 8,
            transmitter: '',
            isExtended: false,
            additionalTransmitters: [],
            signals: [],
          },
        ],
        valueTables: [],
        signalGroups: [],
        attributeDefs: [],
        attributeAssignments: [],
        relationAttributeDefs: [],
        relationAttributeAssignments: [],
        comments: [],
      },
    } as const;
    const dbm = buildDbm(document);
    expect(dbm.warnings.map((warning) => warning.code)).toContain(
      'dbc-message-missing-transmitter',
    );
  });

  it('projects all four multiplex states', () => {
    // @dbc-forge/core 的 index 不导出 create* 工厂，直接构造 Network 形状对象。
    const signalA = {
      name: 'SigPlain',
      startBit: 0,
      length: 8,
      byteOrder: 'little-endian',
      valueType: 'unsigned',
      factor: 1,
      offset: 0,
      min: 0,
      max: 255,
      unit: '',
      receivers: ['ECM'],
      multiplexed: { kind: 'Plain' },
    } as const;
    const signalB = {
      name: 'SigMuxor',
      startBit: 8,
      length: 8,
      byteOrder: 'little-endian',
      valueType: 'unsigned',
      factor: 1,
      offset: 0,
      min: 0,
      max: 255,
      unit: '',
      receivers: ['ECM'],
      multiplexed: { kind: 'Multiplexor' },
    } as const;
    const signalC = {
      name: 'SigMuxed',
      startBit: 16,
      length: 8,
      byteOrder: 'little-endian',
      valueType: 'unsigned',
      factor: 1,
      offset: 0,
      min: 0,
      max: 255,
      unit: '',
      receivers: ['ECM'],
      multiplexed: { kind: 'Muxed', value: 3 },
    } as const;
    const signalD = {
      name: 'SigExtMuxed',
      startBit: 24,
      length: 8,
      byteOrder: 'little-endian',
      valueType: 'unsigned',
      factor: 1,
      offset: 0,
      min: 0,
      max: 255,
      unit: '',
      receivers: ['ECM'],
      multiplexed: { kind: 'ExtendedMuxed', value: 7 },
    } as const;
    const document = {
      sourcePath: 'memory.dbc',
      sourceHash: 'sha256:test',
      network: {
        version: '1.0',
        nodes: [],
        messages: [
          {
            id: 1,
            name: 'MuxMsg',
            dlc: 8,
            transmitter: 'TCM',
            isExtended: false,
            additionalTransmitters: [],
            signals: [signalA, signalB, signalC, signalD],
          },
        ],
        valueTables: [],
        signalGroups: [],
        attributeDefs: [],
        attributeAssignments: [],
        relationAttributeDefs: [],
        relationAttributeAssignments: [],
        comments: [],
      },
    } as const;

    const dbm = buildDbm(document);
    expect(dbm.signals.map((signal) => signal.multiplex)).toEqual([
      { kind: 'plain' },
      { kind: 'multiplexor' },
      { kind: 'multiplexed', switchValue: 3 },
      { kind: 'extended-multiplexed', switchValue: 7 },
    ]);
  });

  it('wraps malformed DBC text as dbc-malformed', () => {
    expect(() => createDbmDocument('bad.dbc', 'this is not a dbc file')).toThrowError(
      /dbc-malformed/,
    );
  });
});
