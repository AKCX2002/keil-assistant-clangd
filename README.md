# Keil Assistant clangd (Personal)

这是 AKCX2002 基于 Keil Assistant 的**自用修改版本**，增加可选 clangd 后端。
非官方项目，不代表 Arm、Keil、LLVM、Microsoft 或上游作者；不承诺持续维护或商业支持。
扩展标识为 **AKCX2002.keil-assistant-clangd**，不是上游 Marketplace 版本。

**当前版本 0.1.4 仍为预览版：clangd 和 Microsoft C/C++ 都不能替代 ARMCC5 编译验收。**
本次修复针对编辑器解析错误，不修改固件源码、`.uvprojx` 或 UV4 构建/下载命令。
详细见 [本次故障原因与修复总结](docs/AC5_DIAGNOSTICS.md)、[已知缺陷与兼容处理](docs/KNOWN_LIMITATIONS.md)。

## 使用

1. 从本仓库 Releases 下载 VSIX，在 VS Code 中执行“从 VSIX 安装”。
2. 禁用同一窗口中的其他 Keil Assistant 版本：它们共享上游命令和工程视图名称。
3. 安装官方 clangd 扩展（llvm-vs-code-extensions.vscode-clangd），确认 clangd.path 指向可运行的程序。
4. 设置 KeilAssistant.MDK.Uv4Path 为实际 UV4.exe 路径，打开含 .uvproj/.uvprojx 的可信工作区。
5. 执行“Keil clangd: Select Language Service”，选择 clangd。默认仍为 cpptools。
6. 点击状态栏 Keil clangd 查看当前工程、Target、数据库路径和适配提示。

clangd 模式在当前活动 `.uvproj/.uvprojx` 所在目录生成 `compile_commands.json`；打开工程、
刷新、切换 Target 或修改工程后自动更新。数据库有变化时刷新官方 clangd 服务。
同时打开多个工程时，数据库随活动工程目录移动；同一个文件属于多个工程时，活动工程的
配置优先。AC5 适配快照保存在该目录下的 `.keil-assistant-clangd` 子目录。

选择 clangd 会在当前工作区添加 clangd.arguments 的数据库路径，并关闭 Microsoft
C/C++ IntelliSense，避免两套语言服务重复工作。切换回 cpptools/none 或关闭所有 Keil
工程时，恢复仍由本插件管理的设置；用户后来自行改动的配置不会被覆盖。
卸载前请先切换后端以恢复设置。用户的 `.clangd` 保持原样；活动工程目录中的
`compile_commands.json` 由插件生成和更新。已有 `.clangd` 或用户级 clangd 配置仍可能
覆盖生成参数。

设置项：

| 设置 | 用途 |
| --- | --- |
| KeilAssistant.LanguageService | cpptools / clangd / none，工作区范围 |
| KeilAssistant.Clangd.CompilerPath | AC6 编译器驱动路径；空值时从 UV4 路径探测 |
| KeilAssistant.Clangd.SystemIncludes | 补充实际 CMSIS、Pack、RTE、工具链头文件目录 |
| KeilAssistant.Clangd.PackRoot | 可选 Pack 根目录；否则按环境变量及常用安装目录匹配实际 PackID |
| KeilAssistant.Clangd.ExtraArgs | 追加已核验的 Clang 参数，每个数组元素一个参数 |
| KeilAssistant.Clangd.CStandard | 自动解析工程或显式指定 C 标准 |
| KeilAssistant.Clangd.CppStandard | 自动解析工程或显式指定 C++ 标准 |

路径可为绝对路径或相对 .uvprojx 的路径。ExtraArgs 在生成参数之后应用，例如
-mfpu=fpv4-sp-d16、-mfloat-abi=hard；必须对应实际工程，不能照抄不匹配的 CPU 配置。

## 兼容范围

- AC6：生成 Clang 编译参数、CPU、语言标准、宏、include 和逐文件配置。
  从实际 ArmClang 分别查询 C/C++ 的版本和 libc++ 标识宏，保留 clangd 自身的内建语义。
  语言枚举、头文件搜索顺序和 Cortex-M4 FPU 配置已与 uVision 5.43 / AC6 6.24
  生成的 response files 对照；未知语言枚举会要求明确配置，不猜测。
- AC5：提供有限参数和声明适配；旧式内联/嵌入式汇编、部分专有关键字和 pragma
  不保证兼容。不会把空 packed/attribute 宏或伪造的内建函数返回值当作完整语义修复；
  仅在打开缓冲区覆盖 VFS 时使用空 `__packed` fallback，避免声明解析失败，且明确放弃
  该缓冲区内的 packed 布局表达。
  clangd 命令取消 `__CC_ARM`，让 CMSIS 选择现有 GCC/Clang 实现；使用 Clang ACLE
  头文件声明指令内建函数，启用 `__declspec`，并通过 ARM 标准库原有开关排除
  不支持的废弃寄存器返回函数（`__ARM_NO_DEPRECATED_FUNCTIONS=1`）。这些函数的调用仍不支持。
  对可沿字面量 include 找到的 `__packed struct/union`，在扩展存储区生成 VFS 副本，
  调整属性位置并保持紧凑布局、源文件路径及字节偏移；保存 C/H 文件后自动刷新。
  原文件、Keil 工程和构建/下载命令不变。此映射针对已保存的磁盘内容：编辑器打开的
  原始缓冲区优先于 VFS；直接打开含 `__packed` 的文件时使用仅供编辑器解析的空宏，
  声明和补全可用，但该打开缓冲区不表示 packed 布局；宏生成的 include
  和其他 AC5 专有语法不在此适配范围内。配置状态会列出实际映射文件及限制。
- C51/C251：继续选择 cpptools；clangd 模式不支持这些工程。
- 未覆盖的 CPU/FPU 选项和 MiscControls 会出现在配置提示中，需要核验后用 ExtraArgs
  补充。工具链、Pack 和 RTE 的路径必须与实际安装一致。
- clangd 诊断不是 Keil 构建结果；原有 UV4 构建、下载入口保留。此版本不迁移固件编译器。
- 不支持在同一 VS Code 窗口里同时启用两个 Keil Assistant 扩展，也不替换用户已有
  clangd --compile-commands-dir：检测到冲突会提示处理。

## 本次 `AC_SERVER_M` 报错

参考工程直接打开 `USER/ServoProtocol.h` 后，clangd 先在 3 个
`typedef __packed struct` 处报 `unknown type name '__packed'`。这 3 个 typedef 因解析失败
没有建立 `AC_SERVER_S`、`AC_SERVER_M` 和 `AC_SERVER_ERR`，随后 6 个 extern 声明继续报告
未知类型。因此，截图中的 `AC_SERVER_M` 不是源码缺少类型定义，而是打开缓冲区绕过
packed VFS 快照后的二次错误。

0.1.3 在已有 VFS 参数旁增加编辑器专用 `-D__packed=`：

- 保存文件经 VFS 快照读取时，支持范围内的 record 定义仍转换为实际 packed 属性；
- 打开文件由内存缓冲区读取时，空宏只保证 typedef、跳转和补全可用，不表达 packed 布局；
- 固件源码、`.uvprojx`、UV4 构建和下载命令均不修改。

完整复现、证据和验证边界见 [AC5_DIAGNOSTICS.md](docs/AC5_DIAGNOSTICS.md)。

## 目前解决不了的问题与已有缺陷

| 问题 | 状态 | 当前绕过或处理 | 剩余影响 |
| --- | --- | --- | --- |
| ARMCC5 专有汇编、寄存器变量、pragma、调用约定 | 无法原生解决 | 让 CMSIS 采用 GCC/Clang 分支；最终以 UV4/ARMCC5 为准 | 可能误报、漏报或观察到不同条件分支；选择 armcc.exe 也不会更换 clangd 解析器 |
| 打开的 `__packed` 文件 | 有限降级 | 空 `__packed` fallback 保持声明、跳转和补全可用 | 打开缓冲区不表达 packed 布局；布局必须看保存文件的 VFS 快照及 ARMCC5 |
| packed 指针、已有类型限定、宏展开声明 | 未实现 | 仅转换明确的 struct/union 定义 | 复杂形式仍可能诊断，不能声称完整 ABI 等价 |
| 宏 include、include_next、条件依赖和特殊搜索参数 | 未实现完整预处理 | 按 Clang 顺序扫描可解析的字面量 include | 可能漏掉实际依赖；非 UTF-8 的非 ASCII 头文件名也未保证支持 |
| 工作区外或特殊扩展名头文件更新 | 部分覆盖 | 手动执行 `Refresh Keil Project` | 自动监听可能不刷新对应快照 |
| VFS 历史副本 | 未回收 | 内容哈希避免覆盖原文件和半更新 | 长期编辑会增加工作区存储占用 |
| 旧 cpptools 后端 | 保留上游行为 | 空宏、常量占位和 Target 级配置维持可编辑性 | packed、attribute、内建函数及逐文件配置语义可能失真，本次未整改 |
| clangd 重构自测 | 上游工具缺陷/兼容问题未修复 | 保留失败并单独识别源码诊断 | 本机 clangd 23.1.0 在 2 个宏表达式上发生 SwapBinaryOperands 替换重叠，不能称完整检查全通过 |
| 工具链参数与验收覆盖 | 未完成 | 未映射项显式告警，允许用户核验后通过 ExtraArgs 补充 | 编译器版本宏可能缺失；仍有 11 个既有 lint warning，0.1.3 尚未完成重载后的真实 VS Code 交互验收 |

## 当前兼容处理，不等于原生修复

| 处理 | 目的 | 必须接受的差异 |
| --- | --- | --- |
| 仅在 clangd 命令中取消 `__CC_ARM` | 使用 CMSIS 的 GCC/Clang 实现 | 所有依赖该宏的代码都可能切换分支，不限于 CMSIS；编辑器不能检查被跳过的 ARMCC5 分支 |
| 引入 Clang ACLE、启用 `__declspec` | 解析内建函数和部分库声明 | 只覆盖 Clang 支持的声明，不能证明 AC5 指令行为、属性和 ABI 完全一致 |
| `__ARM_NO_DEPRECATED_FUNCTIONS=1` | 避开标准库中不支持的废弃寄存器返回声明 | 这些 API 的调用仍不支持；这是使用头文件的条件开关，不是实现了专有返回约定 |
| packed 定义的 VFS 转换与打开缓冲区 fallback | 保存文件保留所支持定义的紧凑布局；打开文件保持声明可解析 | VFS 只改编辑器所读副本；空宏路径不表达布局，也不能覆盖全部 AC5 语法 |
| 旧 cpptools 空宏/常量占位 | 让部分代码可以补全和跳转 | 会丢失 packed、attribute、内建函数等语义；红线少不代表更准确 |

以上处理均不进入 Keil 正式构建。涉及布局、寄存器、汇编和编译器分支时，按原源码和
实际 UV4/ARMCC5 结果判断，不直接根据编辑器的自动修复建议改动固件。

0.1.4 VSIX 已安装到实际 `keil` Profile，但原 VS Code 窗口尚未重载并刷新工程；
因此尚未把截图中的 Problems 面板消失记为通过。定向复现、单元测试、打包和安装
分别有证据，但都不替代这项交互验收。具体结果与最小复验步骤见故障分析文档。

## 来源与许可

| 项目 | 作用 | 许可证 |
| --- | --- | --- |
| [ruiwarn/keil-assistant](https://github.com/ruiwarn/keil-assistant) @ 82e1516 | 主体工程、视图、构建与 cpptools 逻辑 | MIT |
| [huiyi-li/keil2clangd](https://github.com/huiyi-li/keil2clangd) @ 5281918 | 参考和改写编译器识别、路径与编译数据库生成 | Apache-2.0 |

原 MIT LICENSE 保留不变；Apache-2.0 原文及现有署名位于 LICENSES/Apache-2.0.txt。
详细来源、改动范围和再分发要求见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
这不是把所有代码重新许可为 MIT。没有捆绑 Keil、Arm 编译器、设备 Pack 或 clangd 二进制。

## 开发

使用 Node.js 22.12 或更新版本：npm ci → npm test → npm run package。
产出 keil-assistant-clangd-0.1.4.vsix。测试覆盖编译参数、文件排除、目标合并和上游回归。
编译输入限定为 src/lib，测试只收集 dist/src/test；artifacts 下的参考仓库不参与发布构建。
真实编译器与编辑器验证范围以对应 Release 说明为准，不将单元测试视为完整固件验收。

文档入口：[docs](docs/README.md) · [原版实现对照](docs/UPSTREAM_COMPARISON.md)。

参考：[clangd 编译命令](https://clangd.llvm.org/design/compile-commands)、
[系统头文件](https://clangd.llvm.org/guides/system-headers)、
[Arm AC5→AC6 迁移指南](https://www.keil.com/appnotes/files/apnt_298.pdf)。
