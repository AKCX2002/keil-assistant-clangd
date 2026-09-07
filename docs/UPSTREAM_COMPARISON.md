# 原版仓库实现对照

2026-09-07 实际拉取默认分支，固定版本：

- [huiyi-li/keil2clangd 5281918](https://github.com/huiyi-li/keil2clangd/tree/52819185ef98a0ce64a887947804c1ad48ce9e96)
- [ruiwarn/keil-assistant 82e1516](https://github.com/ruiwarn/keil-assistant/tree/82e151660e6ce60498bd71f9bada61469f22d44d)

两者与本项目记录的参考版本一致。本次不向原版仓库提 PR；发布对象仅为 AKCX2002/keil-assistant-clangd。

| 能力 | keil2clangd | keil-assistant |
| --- | --- | --- |
| 形态 | Python/C++ 命令行生成器 | VS Code 扩展 |
| 编辑器配置 | compile_commands.json | c_cpp_properties.json、C/C++ 配置选择 |
| 工程/目标 | Keil Target 选择；另有 IAR/Makefile | ARM/C51 工程树、Target、刷新和状态管理 |
| AC5/AC6 区分 | 决定库 include；命令仍固定 arm-none-eabi-gcc | 库头文件选择、宏占位列表；AC6 会查询编译器宏 |
| 逐文件参数 | 未处理 | 工程树识别排除状态；语言配置仍为 Target 级 |
| CPU/FPU/语言转换 | Keil 路径未转换 | 自动配置未完整设置；保留用户配置字段 |
| AC5 专有语义 | 无适配层 | 空宏/常量占位，非原生解析 |
| 构建 | 独立 UV4 动作 | Uv4Caller → UV4，完成后处理日志 |

keil2clangd 的 Python 与 C++ 生成路径都直接收集 FilePath，固定 arm-none-eabi-gcc 与
-D__GNUC__；宏按逗号拆分并忽略大小写去重。隔离样例确认了禁用文件仍进入数据库、
函数宏和带逗号字符串宏拆坏、Flag/FLAG 丢失其一，以及逐组/逐文件参数遗漏。
实际 HC300 工程生成 75 条命令，包含 2 个禁用 C、2 个 H、1 个 S 和 1 个 LIB；
活动目标的启用 C/C++ 单元为 69 个。用原版配置检查 Func.c 仍出现 packed 连锁报错。

Keil Assistant 的 armccMacros 中 __packed、attribute、value_in_regs 等被替换为空，
部分内建函数被替换为常量；这一数组与本项目旧 cpptools 路径一致。
工程管理和构建日志处理存在实际实现，不能因附近遗留 TODO 而判为完全未实现。

验证边界：原版 Python 解析和生成函数通过隔离目录执行，没有调用配置向导、UV4 或 Make；
C++ 仅做对应路径静态对照。Keil Assistant 的 12 项纯测试用本地依赖和内存转译执行，
最终 11 通过、1 个 README 文案断言失败；没有完整构建或安装原版插件。
这些测试不覆盖 ARMCC5 布局、汇编和真实 IntelliSense 精度。

结论：原版可作为工程管理与基础参数提取的参考，不可作为完整 ARMCC5 兼容性的证明。
本插件新增参数转换和有限语法适配有具体故障依据，也保留 [已知限制](KNOWN_LIMITATIONS.md)。
