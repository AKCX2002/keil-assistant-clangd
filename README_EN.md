# Keil Assistant clangd (Personal)

Unofficial personal-use modifications by AKCX2002, based on ruiwarn/keil-assistant
(82e1516, MIT) and selected compilation-database logic from huiyi-li/keil2clangd
(5281918, Apache-2.0). Not endorsed by Arm, Keil, LLVM, Microsoft or upstream authors.

Install the VSIX from this repository's Releases and the official clangd extension.
Disable other Keil Assistant editions in the same VS Code window. Configure the
actual KeilAssistant.MDK.Uv4Path and a working clangd.path, open a trusted workspace,
then run **Keil clangd: Select Language Service**. The default backend is cpptools.

clangd mode generates a database in extension workspace storage, updates it when
projects/targets change, sets workspace clangd arguments and disables C/C++
IntelliSense. Switching away restores settings still owned by this extension.
Switch away before uninstalling. Existing user .clangd and compilation databases
are preserved; they may override generated settings. Shared sources use the active
project's command. Conflicting compile-commands-dir settings are reported.

AC6 is the primary target. AC5 support is an approximation: legacy assembly and
proprietary language extensions are not fully supported. C51/C251 need cpptools.
Unmapped flags and missing toolchain paths are reported; use verified ExtraArgs,
SystemIncludes and language-standard overrides where necessary. Keil builds remain
the authority for compiler acceptance; clangd only provides language services.

See [README.md](README.md) for settings and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
for complete attribution. The original MIT license and the upstream Apache-2.0
license are included. Keil/Arm/clangd binaries and device Packs are not bundled.

Build with Node.js 22.12+: npm ci, npm test, npm run package.
