# Changelog

## 0.1.3 (preview)

- Keep AC5 `__packed` declarations parseable when an open editor buffer overrides the
  packed VFS snapshot. Saved-file snapshots still carry the supported packed layout;
  the open-buffer fallback is explicitly editor-only and does not claim layout fidelity.

## 0.1.2 (preview)

- Include the AC5 editor adaptation introduced in the local 0.1.1 preview; firmware
  sources, Keil project files and UV4 build/download commands remain unchanged.
- Match Clang's project/system/quoted include precedence when finding packed headers,
  and resolve UTF-8 include filenames while retaining the original snapshot bytes.
- Limit packed rewriting to record definitions; preserve qualifiers on existing types,
  raw strings and continued comments.
- Restrict TypeScript inputs and Mocha discovery to this extension, preventing reference
  repositories under artifacts from entering builds and tests; exclude stale reference output from VSIX.
- Document the original failures, upstream implementation limits, verification evidence,
  unresolved defects and the semantic costs of compatibility workarounds.

## 0.1.1 (local preview, no GitHub release)

- Fix AC5 clangd parsing of CMSIS, ACLE intrinsics and Arm standard-library declarations.
- Adapt saved packed record declarations through extension-owned VFS snapshots,
  preserving layout and source offsets without changing firmware or Keil commands.
- Refresh snapshots on C/H file changes and report editor-buffer compatibility limits.

## 0.1.0

- Personal-use, unofficial fork with a separate extension identifier.
- Optional clangd compilation database backend with active Target updates,
  deterministic shared-source ownership and configuration diagnostics.
- Workspace-only language-service selection and reversible owned settings.
- AC6 configuration and bounded AC5 adaptation; actual Keil compilation remains
  authoritative. Legacy AC5 assembly is not advertised as fully supported.
- Upstream MIT notice and adapted keil2clangd Apache-2.0 terms retained.
