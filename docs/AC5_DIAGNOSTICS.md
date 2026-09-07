# ARMCC5 工程的 VS Code 报错分析与 0.1.3 修复总结

记录日期：2026-09-07。对象是本插件生成的 clangd 配置；参考工程为 STM32F407、
UV4/ARMCC5 的 HC300 工程，活动 Target 为 LCD7。未将该工程的源码或编译器改为 Clang。

## 两阶段故障现象

0.1.1/0.1.2 的最初排障从 `USER/Func.c` 开始：clangd 报 included file 中的 `expected identifier`、
`unknown type name '__packed'`，随后出现结构体没有 running、dir、in、out 等成员的错误。
沿头文件追踪后，先发生 CMSIS/AC5 声明解析失败，后续成员报错属于解析恢复后的连锁现象，
不能据此修改固件结构体。

0.1.3 收到的截图是更窄的交互场景：`USER/ServoProtocol.h` 已在编辑器中打开，问题面板
显示 3 个 `__packed` 错误，以及 `AC_SERVER_S`、`AC_SERVER_M`、`AC_SERVER_ERR` 在表声明和
访问器声明处产生的 6 个未知类型错误。插件状态同时确认该头文件已生成 packed VFS 快照。
这两个事实并不矛盾：clangd 的打开文档草稿优先于文件系统和 VFS，因而磁盘快照存在，
但当前头文件仍按编辑器内存中的原始 ARMCC5 文本解析。

### `AC_SERVER_M` 连锁路径

```text
打开 ServoProtocol.h
  -> clangd 使用编辑器草稿，覆盖同路径 VFS 快照
  -> 原始 typedef __packed struct 不能被 Clang 解析（3 处）
  -> AC_SERVER_S / AC_SERVER_M / AC_SERVER_ERR 未建立
  -> 后续 extern 表和访问器声明报告未知类型（6 处）
```

因此，`AC_SERVER_M` 的定义实际存在于头文件第 36～43 行；第 87 行报错不是缺少 include、
声明顺序错误或固件类型被删除。直接补写 typedef、移动固件声明或修改 Keil 宏都会把
编辑器兼容问题错误地转化为固件改动。

| 原因 | 证据与影响 |
| --- | --- |
| clangd 使用 Clang 解析器 | 不执行 ARMCC5 的语法分析；配置 armcc.exe 路径不会切换解析器 |
| 命令中定义 `__CC_ARM` | CMSIS 进入 ARMCC 专用汇编和寄存器变量分支，Clang 无法完整解析 |
| `__packed struct` 的专有限定位置 | Clang 不识别；将 packed 简单变为空宏会丢失布局，放错 attribute 位置也可能被忽略 |
| ARMCC 库的 `__declspec`、废弃寄存器返回声明 | 需要区分可启用的语法与 Clang 无法表示的专有返回约定 |
| AC5 直接使用指令内建函数 | Clang 需要自己的 ACLE 声明，例如 `__nop`，不能伪造为固定返回值 |

## 0.1.3 的定向复现

使用截图对应的真实 `compile_commands.json` 和 `ServoProtocol.h` 进行最小实验：

| 输入路径 | 观察结果 | 结论 |
| --- | --- | --- |
| `ServoProtocol.c` 经现有 VFS 数据库执行 clangd 离线检查 | 退出码 0 | 保存文件的 packed 快照有效；不能覆盖打开文档草稿场景 |
| 移除 VFS 映射，按原始头文件模拟打开缓冲区 | 3 个 `unknown type name '__packed'`，随后 6 个 `AC_SERVER_*` 未知类型 | 复现截图中的完整因果链 |
| 在同一原始头文件命令中增加 `-D__packed=` | 上述 9 个错误全部消失 | 空宏足以恢复声明图，但不证明 packed 布局 |
| 将 packed 属性放在 `typedef` 与 `struct` 之间 | Clang 报属性被忽略，`sizeof` 仍为非紧凑布局 | 不能用看似更接近源码的 attribute 宏冒充布局修复 |
| 将属性放到 VFS 中的 `struct/union` 后 | 紧凑布局断言通过 | 保存文件仍应由 VFS 转换负责布局表达 |

该实验一次只改变 VFS/空宏因素。它把“消除声明连锁错误”和“保留 packed 布局”分成两条
验证路径，避免用红线数量替代语义判断。

## 修改内容及其责任边界

1. `src/project/compileCommands.ts`：在 AC5 的编辑器命令中启用 `-fdeclspec`，预包含
   Clang 的 `arm_acle.h`；在工程宏之后取消 `__CC_ARM`，选择 CMSIS 的 GCC/Clang 实现。
   用 ARM 标准库已有的 `__ARM_NO_DEPRECATED_FUNCTIONS=1` 条件开关排除不支持的废弃声明。
   这些是有限兼容处理，分支和 API 可见性与 ARMCC5 不再完全相同。
2. `src/project/ac5Overlay.ts`：沿支持的字面量 include 搜索，在插件存储区创建 packed
   定义的 VFS 副本。通过移动 struct/union 与内部属性宏的位置，保留原文件路径、行号、
   字节偏移、非 ASCII 注释原始字节及所支持定义的紧凑布局。只转换明确的类型定义，
   不转换已有类型的 packed 指针限定，不改字符串和注释。
3. `src/project/clangdBackend.ts`：仅对 AC5 数据库添加 VFS；监听工作区 C/H 文件变化，
   保存后重新生成，有变化时刷新 clangd。输出实际映射文件和限制。
   打开编辑器缓冲区覆盖 VFS 时，通过仅供编辑器使用的空 `__packed` fallback 保持
   typedef、声明和补全可解析；该打开缓冲区不表示 packed 布局，布局检查仍以保存后的
   VFS 快照和 ARMCC5 构建为准。
4. 发布前修正 VFS 搜索顺序：quoted include 先查当前目录和 `-iquote`，再查 `-I`、
   `-isystem`；angle include 不查 `-iquote`。UTF-8 头文件名可解析，副本不重新编码。
5. `tsconfig.json`、`scripts/run-mocha.js`、`.vscodeignore`：编译只读取 src/lib，
   测试只收集 dist/src/test，打包排除历史参考仓库输出。原因是拉取到 artifacts 下的
   原版 TypeScript 被旧的宽泛编译范围收集，导致运行了不属于本插件的测试。

未修改旧 cpptools 的占位宏适配、固件源码、Keil 工程、UV4 构建和下载命令。
编辑器提供的代码修改建议仍需人工判断；本插件不会将 VFS 内容写回原文件。

## 验证证据与未完成项

| 版本/项目 | 结果及边界 |
| --- | --- |
| 0.1.3 插件测试 | `npm test`：27 项通过；ESLint 0 error、11 个既有 warning；TypeScript 编译通过 |
| 0.1.3 定向故障实验 | 原始打开缓冲区路径复现 3 个 `__packed` + 6 个 `AC_SERVER_*` 错误；增加 fallback 后这 9 个错误消失 |
| 0.1.3 回归保护 | 单元测试确认数据库同时带有 `-D__packed=`、实际 packed 属性宏和 VFS；既有字节偏移、布局、字符串/注释边界、搜索顺序和刷新测试继续通过 |
| 0.1.3 VSIX | 生产 webpack 与打包通过；生成并安装 `keil-assistant-clangd-0.1.3.vsix` 到 VS Code `keil` Profile |
| 0.1.3 真实编辑器验收 | 安装成功，但仍需重载原 VS Code 窗口并刷新 Keil 工程；当前没有把截图中的 Problems 面板消失写成已验证 |
| 0.1.2 实际 HC300 数据库基线 | 69 个启用的 C/C++ 编译单元；未把禁用文件、头文件或静态库当作 C 编译单元 |
| 0.1.2 clangd 23.1.0 基线 | 69 个编译单元均无源码错误诊断；完整 `--check` 为 67 个退出 0、2 个失败 |
| 两个保留失败 | motor.c / xprintf.c 的宏表达式触发 clangd SwapBinaryOperands 重构自测替换重叠；未屏蔽或记为通过 |
| 布局样例基线 | ARMCC5 编译原始声明、Clang 检查转换声明，packed struct/union 大小、成员偏移、普通 struct 大小断言通过；不是整个固件 ABI 证明 |
| 原始工程保护 | 0.1.3 没有修改固件源码、Keil 工程或编辑器配置；只读取截图对应头文件和生成数据库进行定向实验 |
| 固件/硬件 | 没有执行本次完整 UV4 固件构建、烧录或硬件动作；编辑器检查不等于 Keil 或现场验收 |

离线检查使用实际生成数据库及本机安装的 clangd；不是全部 VS Code 交互路径的验收。
尤其不能用 `.c` 文件检查通过推导“直接打开所有 `.h` 文件也无报错”。
0.1.3 后续最小验收是重载已安装新版的 `keil` Profile，执行 `Refresh Keil Project`，
确认新数据库含 `-D__packed=`，再检查 `ServoProtocol.h` 的 9 个连锁错误、成员补全、
保存刷新，以及切回 none 后的设置恢复。

## 复查方式

执行 `npm test` 和 `npm run package` 检查插件。若要检查某个固件文件，在插件状态页确认
真实数据库目录，再执行本机 clangd：

```text
clangd --check=<实际源文件绝对路径> --compile-commands-dir=<实际数据库目录>
```

同时看诊断内容与进程退出码。不要通过删除失败用例、屏蔽全部诊断或修改正式固件的
编译器标识来获得通过。Keil 的实际编译结论必须来自对应 Target 的新构建日志。

## 结论

此次报错的直接原因不是 `AC_SERVER_M` 缺失，而是打开文档草稿覆盖 VFS 后，Clang 无法
解析 ARMCC5 的 `__packed` 关键字位置。3 个 typedef 先失败，6 个使用点才产生连锁错误。

0.1.3 已完成的修复是：保存文件继续通过 VFS 表达支持范围内的 packed 布局；打开文件
通过空 `__packed` fallback 恢复声明、跳转和补全。两条路径职责不同，不能把打开缓冲区
当成布局或 ABI 证据，也不能把 clangd 诊断当成 ARMCC5 编译结论。

当前代码、单元测试、打包和安装已完成；原窗口重载后的 Problems 面板复验仍未完成。
ARMCC5 专有汇编、调用约定、复杂 packed 形式和不完整依赖扫描仍无法由本插件原生解决。
详细缺陷、绕过方式和代价见 [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)。

参考：[clangd 编译命令](https://clangd.llvm.org/design/compile-commands)、
[ARM AC5/AC6 迁移说明](https://www.keil.com/appnotes/files/apnt_298.pdf)。
