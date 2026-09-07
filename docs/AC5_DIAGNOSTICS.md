# ARMCC5 工程的 VS Code 报错分析与 0.1.2 修复总结

记录日期：2026-09-07。对象是本插件生成的 clangd 配置；参考工程为 STM32F407、
UV4/ARMCC5 的 HC300 工程，活动 Target 为 LCD7。未将该工程的源码或编译器改为 Clang。

## 原始现象与原因

在 VS Code 中打开 `USER/Func.c`，clangd 报 included file 中的 `expected identifier`、
`unknown type name '__packed'`，随后出现结构体没有 running、dir、in、out 等成员的错误。
沿头文件追踪后，先发生 CMSIS/AC5 声明解析失败，后续成员报错属于解析恢复后的连锁现象，
不能据此修改固件结构体。

| 原因 | 证据与影响 |
| --- | --- |
| clangd 使用 Clang 解析器 | 不执行 ARMCC5 的语法分析；配置 armcc.exe 路径不会切换解析器 |
| 命令中定义 `__CC_ARM` | CMSIS 进入 ARMCC 专用汇编和寄存器变量分支，Clang 无法完整解析 |
| `__packed struct` 的专有限定位置 | Clang 不识别；将 packed 简单变为空宏会丢失布局，放错 attribute 位置也可能被忽略 |
| ARMCC 库的 `__declspec`、废弃寄存器返回声明 | 需要区分可启用的语法与 Clang 无法表示的专有返回约定 |
| AC5 直接使用指令内建函数 | Clang 需要自己的 ACLE 声明，例如 `__nop`，不能伪造为固定返回值 |

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
4. 发布前修正 VFS 搜索顺序：quoted include 先查当前目录和 `-iquote`，再查 `-I`、
   `-isystem`；angle include 不查 `-iquote`。UTF-8 头文件名可解析，副本不重新编码。
5. `tsconfig.json`、`scripts/run-mocha.js`、`.vscodeignore`：编译只读取 src/lib，
   测试只收集 dist/src/test，打包排除历史参考仓库输出。原因是拉取到 artifacts 下的
   原版 TypeScript 被旧的宽泛编译范围收集，导致运行了不属于本插件的测试。

未修改旧 cpptools 的占位宏适配、固件源码、Keil 工程、UV4 构建和下载命令。
编辑器提供的代码修改建议仍需人工判断；本插件不会将 VFS 内容写回原文件。

## 本次验证与未完成项

| 项目 | 结果及边界 |
| --- | --- |
| 插件单元测试 | 27 项通过；覆盖配置生成、packed 定义/指针/字符串边界、头文件顺序、中文文件名、原始字节保留和快照刷新 |
| ESLint / TypeScript | 0 lint 错误、11 个既有 lint 警告；TypeScript 编译通过 |
| 实际 HC300 数据库 | 69 个启用的 C/C++ 编译单元；未把禁用文件、头文件或静态库当作 C 编译单元 |
| clangd 23.1.0 离线检查 | 69 个编译单元均无源码错误诊断；完整 `--check` 为 67 个退出 0、2 个失败 |
| 两个失败的性质 | motor.c / xprintf.c 的宏表达式触发 clangd SwapBinaryOperands 重构自测的替换重叠；保留失败，未屏蔽测试或记为通过 |
| 布局样例 | ARMCC5 编译原始声明、Clang 检查转换声明，packed struct/union 大小、成员偏移、普通 struct 大小断言通过；不是整个固件 ABI 证明 |
| VSIX | 发布前执行生产 webpack 和 VSIX 打包；安装包不包含固件、工具链、参考仓库或测试产物 |
| 新版 VS Code 集成检查 | 已尝试独立配置目录和临时 AC5 样例；在工作区未受信任的门槛处停止，没有完成数据库接入、保存刷新及设置恢复的本轮交互验收 |
| 原始工程保护 | 本次未写入固件、工程和编辑器配置。发布前复核最初记录的 8 个文件，5 个哈希相同，Func.h/main.c/ServoProtocol.h 已有其他变化；保留现状，不能声称工程全程未变化 |
| 固件/硬件 | 没有执行本次完整 UV4 固件构建、烧录或硬件动作；不把编辑器检查当作 Keil 或现场验收 |

离线检查使用实际生成数据库及本机安装的 clangd；不是全部 VS Code 交互路径的验收。
尤其不能用 `.c` 文件检查通过推导“直接打开所有 `.h` 文件也无报错”。
后续最小验收是在用户正常信任的临时样例工作区安装本版，检查成员补全、保存 packed
头文件后的数据库更新、直接打开头文件的限制，以及切回 none 后参数恢复。

## 复查方式

执行 `npm test` 和 `npm run package` 检查插件。若要检查某个固件文件，在插件状态页确认
真实数据库目录，再执行本机 clangd：

```text
clangd --check=<实际源文件绝对路径> --compile-commands-dir=<实际数据库目录>
```

同时看诊断内容与进程退出码。不要通过删除失败用例、屏蔽全部诊断或修改正式固件的
编译器标识来获得通过。Keil 的实际编译结论必须来自对应 Target 的新构建日志。

## 结论

此次问题来自 ARMCC5 与 Clang 的解析差异及不完整的编辑器配置，而不是已证明的
电机结构体字段缺失。0.1.2 解决了已复现的源码错误，并补上转换边界和发布范围问题。
它提供的是受限的编辑器适配；剩余问题及绕过代价见 [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)。

参考：[clangd 编译命令](https://clangd.llvm.org/design/compile-commands)、
[ARM AC5/AC6 迁移说明](https://www.keil.com/appnotes/files/apnt_298.pdf)。
