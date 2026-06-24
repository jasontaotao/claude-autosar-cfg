// core/generator/choices-loader.ts
//
// Reads `src/core/generator/modules/<moduleShortName>/choices.json`.
// For MVP, returns built-in defaults for known modules so tests pass
// without file I/O. v2 can swap to actual fs reads.

const BUILTIN: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  EcuC: {
    EcucPartitionChoice: 'EcuC_USE_OS_PARTITION',
  },
};

export function loadChoiceMacros(
  moduleShortName: string,
): Readonly<Record<string, string>> {
  return BUILTIN[moduleShortName] ?? {};
}
