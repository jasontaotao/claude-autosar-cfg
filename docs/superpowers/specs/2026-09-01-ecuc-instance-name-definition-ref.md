# ECUC Instance Name and BSWMD Definition Identity

## Decision

AUTOSAR ECUC value containers have two distinct identities:

- `SHORT-NAME`: instance name. It is user-facing, participates in ECUC paths, and may be renamed when the parent permits a valid identifier.
- `DEFINITION-REF`: BSWMD definition identity. It decides the schema, parameter definitions, references, multiplicity, and code generation type.

A definition named `Foo` may legally have value instances named `Foo`, `Foo_1`, `FrontFoo`, or `RearFoo`, provided each has `DEFINITION-REF` pointing to `Foo`.

## Product rules

1. Default naming may derive from the definition short name and append `_N` for uniqueness.
2. The user may rename ECUC value container instances.
3. Renaming changes only `SHORT-NAME`; it must not change `DEFINITION-REF`.
4. Schema lookup must use `DEFINITION-REF` first when available.
5. Path/short-name lookup remains as a fallback for legacy documents without `DEFINITION-REF`.
6. A renamed instance must update descendant paths, selected path, expanded tree keys, and inbound reference values in the same transaction.
7. Rename validation is separate from schema validation:
   - non-empty
   - valid AUTOSAR-style identifier
   - unique among siblings
   - schema compatibility is unchanged because `DEFINITION-REF` is unchanged
8. BSWMD definition names are not editable through normal ECUC value editing.

## UI rule

Tree and editor surfaces should distinguish:

```text
Instance Name: FrontCellValid
Definition:    JWQ3399AFECellValidSet
```

Rename is an ECUC instance operation, not a BSWMD definition operation.
