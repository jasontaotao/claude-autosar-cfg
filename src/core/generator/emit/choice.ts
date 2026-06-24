// core/generator/emit/choice.ts
//
// Approach A: emit `<choiceName>`-driven C preprocessor branches
// (`#ifdef MACRO / #else / #endif` or `#ifndef MACRO / #endif` when
// no `elseBranch` is provided). Used by EcuC generator for EcucPartitionChoice.

export interface ChoiceBranchInput {
  readonly macroName: string;
  readonly ifBranch: string;
  readonly elseBranch: string | null;
}

export function emitChoiceBranch(input: ChoiceBranchInput): string {
  if (input.elseBranch === null) {
    return `#ifndef ${input.macroName}\n${input.ifBranch}\n#endif`;
  }
  return [`#ifdef ${input.macroName}`, input.ifBranch, '#else', input.elseBranch, '#endif'].join(
    '\n',
  );
}
