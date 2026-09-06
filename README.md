# Keil Assistant clangd (Personal)

这是 AKCX2002 基于 Keil Assistant 的**自用修改版本**，增加可选 clangd 后端。
非官方项目，不代表 Arm、Keil、LLVM、Microsoft 或上游作者；不承诺持续维护或商业支持。
扩展标识为 **AKCX2002.keil-assistant-clangd**，不是上游 Marketplace 版本。

## 使用

1. 从本仓库 Releases 下载 VSIX，在 VS Code 中执行“从 VSIX 安装”。
2. 禁用同一窗口中的其他 Keil Assistant 版本：它们共享上游命令和工程视图名称。
3. 安装官方 clangd 扩展（llvm-vs-code-extensions.vscode-clangd），确认 clangd.path 指向可运行的程序。
4. 设置 KeilAssistant.MDK.Uv4Path 为实际 UV4.exe 路径，打开含 .uvproj/.uvprojx 的可信工作区。
5. 执行“Keil clangd: Select Language Service”，选择 clangd。默认仍为 cpptools。
6. 点击状态栏 Keil clangd 查看当前工程、Target、数据库路径和适配提示。

clangd 模式在扩展的工作区存储目录生成 compile_commands.json；打开工程、刷新、切换
Target 或修改工程后自动更新。数据库有变化时刷新官方 clangd 服务。
同一个文件属于多个工程时，活动工程的配置优先。

选择 clangd 会在当前工作区添加 clangd.arguments 的数据库路径，并关闭 Microsoft
C/C++ IntelliSense，避免两套语言服务重复工作。切换回 cpptools/none 或关闭所有 Keil
工程时，恢复仍由本插件管理的设置；用户后来自行改动的配置不会被覆盖。
卸载前请先切换后端以恢复设置。用户的 .clangd、compile_commands.json 保持原样；
已有 .clangd 或用户级 clangd 配置仍可能覆盖生成参数。

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
  不保证兼容。不会通过删除 packed/attribute 语义或伪造内建函数返回值消除错误。
- C51/C251：继续选择 cpptools；clangd 模式不支持这些工程。
- 未覆盖的 CPU/FPU 选项和 MiscControls 会出现在配置提示中，需要核验后用 ExtraArgs
  补充。工具链、Pack 和 RTE 的路径必须与实际安装一致。
- clangd 诊断不是 Keil 构建结果；原有 UV4 构建、下载入口保留。此版本不迁移固件编译器。
- 不支持在同一 VS Code 窗口里同时启用两个 Keil Assistant 扩展，也不替换用户已有
  clangd --compile-commands-dir：检测到冲突会提示处理。

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
产出 keil-assistant-clangd-0.1.0.vsix。测试覆盖编译参数、文件排除、目标合并和上游回归。
真实编译器与编辑器验证范围以对应 Release 说明为准，不将单元测试视为完整固件验收。

参考：[clangd 编译命令](https://clangd.llvm.org/design/compile-commands)、
[系统头文件](https://clangd.llvm.org/guides/system-headers)、
[Arm AC5→AC6 迁移指南](https://www.keil.com/appnotes/files/apnt_298.pdf)。
