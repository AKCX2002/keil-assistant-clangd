# Keil Assistant clangd (Personal)

Unofficial personal-use modifications by AKCX2002, based on ruiwarn/keil-assistant
(82e1516, MIT) and selected compilation-database logic from huiyi-li/keil2clangd
(5281918, Apache-2.0). Not endorsed by Arm, Keil, LLVM, Microsoft or upstream authors.

**0.1.4 is a preview. Neither clangd nor Microsoft C/C++ provides native ARMCC5
equivalence. Keil build results remain authoritative.** Firmware source/project
files and UV4 build/download commands are unchanged by these editor adaptations.

Install the VSIX from this repository's Releases and the official clangd extension.
Disable other Keil Assistant editions in the same VS Code window. Configure the
actual KeilAssistant.MDK.Uv4Path and a working clangd.path, open a trusted workspace,
then run **Keil clangd: Select Language Service**. The default backend is cpptools.

clangd mode generates `compile_commands.json` beside the active `.uvproj/.uvprojx`,
updates it when projects/targets change, sets workspace clangd arguments and disables C/C++
IntelliSense. Switching away restores settings still owned by this extension.
Switch away before uninstalling. Existing user `.clangd` files are preserved; the
compilation database beside the active project is generated and updated by this
extension. AC5 adaptation snapshots stay in its `.keil-assistant-clangd` subdirectory.
Shared sources use the active project's command. Conflicting compile-commands-dir
settings are reported.

AC6 is the primary target. AC5 support is an approximation: legacy assembly and
proprietary language extensions are not fully supported. C51/C251 need cpptools.
Unmapped flags and missing toolchain paths are reported; use verified ExtraArgs,
SystemIncludes and language-standard overrides where necessary. Keil builds remain
the authority for compiler acceptance; clangd only provides language services.

For AC5 editor parsing, CMSIS uses its existing GCC/Clang branch, Clang ACLE supplies
intrinsics, and the Arm library's deprecated register-return APIs are excluded.
Packed struct/union declarations reached through literal includes are adapted in
extension-storage VFS snapshots, preserving layout, original paths and byte offsets.
Snapshots refresh on saved C/H changes. Open editor buffers override VFS and use an
editor-only empty `__packed` fallback: declarations and completion remain available,
but packed layout is not represented in that draft. Macro-generated includes
and other proprietary syntax are not covered. Firmware files, Keil projects and
build/download commands are unchanged. The configuration status reports these limits.

The reported `AC_SERVER_M` failure was a cascade rather than a missing firmware type.
When `ServoProtocol.h` was open, the clangd draft overrode its transformed VFS snapshot.
Clang then rejected three `typedef __packed struct` declarations, so the three aliases
were never created and six later declarations reported unknown types. Version 0.1.3
adds `-D__packed=` only as an open-draft parsing fallback. Saved-file snapshots still
carry the supported packed attribute; the open draft does not model packed layout.

Known unresolved issues: AC5 assembly, register variables, pragmas and calling conventions;
packed qualifiers on existing types; macro-generated includes/include_next, conditional
dependency discovery and special search options; non-UTF-8 non-ASCII include filenames;
external headers requiring manual refresh; and accumulated historical VFS snapshots.
The inherited cpptools backend still
erases attributes and substitutes some intrinsics with constants, and does not provide
per-file language configuration. It was not remediated in this release.

Undefining __CC_ARM affects every conditional branch using it, not only CMSIS.
Excluding deprecated runtime declarations does not implement their register-return ABI.
Packed VFS rewriting preserves supported record definitions, not all AC5 semantics.
The local clangd 23.1.0 check still fails a refactoring self-test on macro expressions in
two files, despite zero source-error diagnostics across 69 checked translation units.
Eleven existing lint warnings remain. Hardware and exhaustive editor/AC5 compatibility
have not been validated. The 0.1.4 VSIX was installed in the actual `keil` Profile, but
the original window has not yet been reloaded and refreshed, so disappearance of the
reported Problems diagnostics is not recorded as verified.
See the [Chinese limitation register](docs/KNOWN_LIMITATIONS.md)
and [failure analysis](docs/AC5_DIAGNOSTICS.md) for details.

See [README.md](README.md) for settings and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
for complete attribution. The original MIT license and the upstream Apache-2.0
license are included. Keil/Arm/clangd binaries and device Packs are not bundled.

Build with Node.js 22.12+: npm ci, npm test, npm run package.
