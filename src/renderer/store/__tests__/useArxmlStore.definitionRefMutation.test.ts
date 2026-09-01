import { beforeEach, describe, expect, it } from 'vitest';

import type { ArxmlContainer, ArxmlDocument, ArxmlModule } from '@core/arxml/types';
import type {
  BswModuleDef,
  BswmdDocument,
  ContainerDef,
  ParamDef,
  ReferenceDef,
} from '@core/project/bswmd.js';

import { useArxmlStore } from '../useArxmlStore';

const DEFINITION_REF = '/EAS/Can/CanConfig/ValidSet';

function child(
  shortName: string,
  path: string,
  subContainers: readonly ContainerDef[] = [],
): ContainerDef {
  return {
    shortName,
    path,
    lowerMultiplicity: 0,
    upperMultiplicity: 'infinite',
    subContainers: [...subContainers],
    parameters: [],
    references: [],
    choices: [],
  };
}

const validSet: ContainerDef = {
  ...child('ValidSet', DEFINITION_REF),
  parameters: [
    {
      shortName: 'TestParam',
      path: `${DEFINITION_REF}/TestParam`,
      kind: 'integer',
      defaultValue: 7,
      minValue: 0,
      maxValue: 100,
      minLength: null,
      maxLength: null,
      enumerationLiterals: [],
    } satisfies ParamDef,
  ],
  references: [
    {
      shortName: 'TestRef',
      path: `${DEFINITION_REF}/TestRef`,
      destKind: 'INTEGER',
      lowerMultiplicity: 0,
      upperMultiplicity: 1,
    } satisfies ReferenceDef,
  ],
  subContainers: [child('ChildSet', `${DEFINITION_REF}/ChildSet`)],
};

const moduleDef: BswModuleDef = {
  shortName: 'Can',
  path: '/EAS/Can',
  dialect: 'ecuc-module-def',
  moduleId: 0,
  containers: [child('CanConfig', '/EAS/Can/CanConfig', [validSet])],
  providedEntries: [],
  lowerMultiplicity: 0,
  upperMultiplicity: 1,
};
const schemas: readonly BswmdDocument[] = [{ version: '4.6', modules: [moduleDef], warnings: [] }];

function makeDoc(): ArxmlDocument {
  const selected: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: 'FrontValidSet',
    definitionRef: DEFINITION_REF,
    params: {},
    children: [],
  };
  const config: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: 'CanConfig',
    params: {},
    children: [selected],
  };
  const module: ArxmlModule = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: 'Can',
    params: {},
    children: [config],
    references: [],
  };
  return {
    path: '/tmp/Can.arxml',
    version: '4.6',
    packages: [{ shortName: 'EAS', path: '/EAS', elements: [module] }],
  };
}

function selectedContainer(): ArxmlContainer {
  const doc = useArxmlStore.getState().doc;
  if (doc === null) throw new Error('doc is null');
  const module = doc.packages[0]!.elements[0]!;
  if (module.kind !== 'module') throw new Error('expected module');
  const config = module.children[0]!;
  if (config.kind !== 'container') throw new Error('expected config');
  const selected = config.children[0]!;
  if (selected.kind !== 'container') throw new Error('expected selected container');
  return selected;
}

beforeEach(() => {
  useArxmlStore.getState().clear();
  useArxmlStore.getState().addDocument(makeDoc(), '/tmp/Can.arxml');
  useArxmlStore.setState({ bswmdSchemas: schemas, bswmdPaths: ['/tmp/Can.bswmd.arxml'] });
});

describe('ECUC mutations use DEFINITION-REF identity', () => {
  it('adds a child to a custom-named container instance', () => {
    useArxmlStore.getState().addContainer('/EAS/Can/CanConfig/FrontValidSet', 'ChildSet');
    expect(useArxmlStore.getState().error).toBeNull();
    expect(selectedContainer().children).toHaveLength(1);
  });

  it('adds a declared parameter to a custom-named container instance', () => {
    useArxmlStore.getState().addParameter('/EAS/Can/CanConfig/FrontValidSet', 'TestParam');
    expect(useArxmlStore.getState().error).toBeNull();
    expect(selectedContainer().params.TestParam).toBeDefined();
  });

  it('adds a declared reference to a custom-named container instance', () => {
    useArxmlStore.getState().addReference('/EAS/Can/CanConfig/FrontValidSet', 'TestRef');
    expect(useArxmlStore.getState().error).toBeNull();
    expect(selectedContainer().params.TestRef).toBeDefined();
  });
});
