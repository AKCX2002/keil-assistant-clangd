# Third-party notices and project origin

This is an **unofficial personal-use modification** by AKCX2002. It is not an
official Arm, Keil, LLVM, Microsoft or upstream Keil Assistant release. The
upstream authors do not endorse or maintain these modifications. Product names
identify compatible tools and do not imply a trademark license or endorsement.

## Keil Assistant

- Upstream: https://github.com/ruiwarn/keil-assistant
- Baseline: commit `82e1516` (full history retained in this repository).
- Repository license: MIT; the original `LICENSE` is retained unchanged.
- Original notice: Copyright (c) 2020 cl.
- Local changes: separate extension identity, optional clangd backend,
  compilation database management, editor-only AC5 parameter/VFS adaptation,
  tests, build scope fixes and personal-use documentation.
- Original README and changelog files are retained under `docs/upstream/` for provenance;
  their marketplace and maintenance statements describe upstream, not this fork.

## keil2clangd

- Upstream: https://github.com/huiyi-li/keil2clangd
- Reference revision: `5281918`.
- Source: `Keil2Json.py`, especially compiler detection, path conversion and
  compilation database entry generation.
- Adapted file: `src/project/compileCommands.ts` (Python-to-TypeScript adaptation
  with per-file handling, diagnostics and explicit compiler configuration).
- License: Apache License 2.0. The upstream license file is reproduced verbatim
  in `LICENSES/Apache-2.0.txt`, including its existing Docker copyright notice.
  That unusual notice is an upstream attribution detail, not a claim that
  Docker authored or endorses this fork. It has not been silently corrected.
- No separate upstream NOTICE file was present in the checked revision.
- Adapted files carry prominent modification and provenance notices.

## Distribution

Original Keil Assistant code remains under MIT. Code adapted from keil2clangd
retains its Apache-2.0 obligations. New independently authored integration code
is MIT unless its file header states otherwise. The package's
`MIT AND Apache-2.0` expression describes this combined distribution; it does
not offer Apache-derived code under MIT alone.

Distributions must include the applicable licenses and attribution notices.
Compiler binaries, Keil installation headers/Packs, and clangd itself are not
redistributed in this VSIX. Install those tools separately under their own
terms. Runtime dependency license texts remain included when bundled.

## Bundled runtime dependencies

- jsonc-parser: MIT, `LICENSES/jsonc-parser-MIT.txt` (https://github.com/microsoft/node-jsonc-parser).
- xml2js: MIT, `LICENSES/xml2js-MIT.txt` (https://github.com/Leonidas-from-XIV/node-xml2js).
- xmlbuilder: MIT, `LICENSES/xmlbuilder-MIT.txt` (https://github.com/oozcitak/xmlbuilder-js).
- sax: ISC, `LICENSES/sax-license.txt` (https://github.com/isaacs/sax-js).
- Exact dependency versions are recorded in package-lock.json. These components
  keep their own licenses, including the ISC license for sax.
