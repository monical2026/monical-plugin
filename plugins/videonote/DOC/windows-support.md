# Windows 支持（0.8.1）

> 0.9.1：普通 Windows 用户可使用成品 ZIP 的浏览器模式，无需下文本机组件开发环境；安装见 [user-guide.md](user-guide.md)。下文仅适用于可选本机能力。Windows 实机验收仍待完成。

## 范围与当前状态

用户要求保留原有 Mac 方案，在同一插件中增加 Windows 能力。0.8.1 已接入 Windows 构建、Chrome 本机组件注册、凭据管理器、配置目录和 Obsidian 文件夹选择，界面、笔记数据协议及 Mac 存储位置不变。

当前开发环境为 macOS。Mac 构建及共用自动化检查通过不代表 Windows 已验收：Windows C# 编译、原生 API、注册表、Chrome 启动及真实服务全流程仍需 Windows 实机验证。第一轮验收目标为 Windows 11 x64 + Chrome；其他 Windows 版本和 ARM64 不提前声明已验证。

本轮未提供签名的一键安装器、公开 Release 或应用商店发布。当前为源码构建与注册能力，普通用户成品分发仍是后续交付项。

## 两套系统实现

| 能力 | macOS（保留） | Windows（新增） |
| --- | --- | --- |
| 凭据 | 原 Swift Security 桥接；原 service/account 标识 | C# 调用 CredReadW/CredWriteW，通用凭据保存在当前用户凭据集中 |
| 配置 | ~/Library/Application Support/YouTubeNote | %LOCALAPPDATA%\\VideoNote |
| Chrome 注册 | 原 NativeMessagingHosts JSON 文件 | HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.youtube_note.host |
| 启动 | 原 launch.sh 与注册时 Node 路径 | videonote-host.exe 启动安装目录内的 node.exe，二进制转发 stdin/stdout |
| 文件夹选择 | 原 osascript | Windows FolderBrowserDialog；取消不写配置 |
| 设置界面 | 显示 macOS 钥匙串 | 显示 Windows 凭据管理器 |

密钥仅经标准输入传给桥接程序，不放命令行、日志或普通配置。Windows 通用凭据上限为 2560 字节（UTF-16 下最多 1280 个代码单元），超限拒绝保存，不降级明文。本机来源仍由 host.mjs 对照 allowed_origins 校验。安装为当前用户注册，不修改机器级注册表，不跨系统迁移旧密钥。

Windows 增加本机 Codex 的原生 codex.exe 查找及 Windows 环境、进程终止处理；可以通过 VIDEONOTE_CODEX_PATH 指定 exe 绝对路径。暂不执行 npm 的 .cmd 包装脚本，也不为兼容 Windows 放宽 Codex 的工具、沙箱和只读限制。真实 Codex 登录与调用需独立验收，普通 API 服务不依赖此入口。

## 在 Windows 构建与注册

开发环境需要 Node（版本约束见根 package.json）、项目约定的 pnpm，以及 .NET Framework 4.x 的 csc.exe；构建脚本先检查 Framework64，再检查 Framework。无需 Swift。请在项目根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm run check
```

Chrome 加载 extension/dist 后，复制扩展 ID，然后执行：

```sh
pnpm native:install 扩展ID
```

注册命令复制 host.mjs、videonote-host.exe 和运行当前脚本的 node.exe 到用户目录，再登记 Chrome。回到设置页重新连接、配置服务并保存。浏览器开启的环境变量可能尚未包含新装的 Codex 路径，修改后需重启 Chrome。

更新时关闭使用本机组件的任务，重新构建、注册并在 Chrome 重新加载扩展，刷新视频页面。复制失败或注册失败会明确报错，不能当作安装成功；不会清空笔记或凭据。

## Windows 专项验证

构建完成后执行：

```sh
pnpm run test:windows-native
```

该测试必须在 Windows 上运行。它在临时中文/空格路径复制本次产物，创建唯一 test- 前缀的虚构凭据，验证写入、读取、超长拒绝后旧值保留，再删除本次测试条目与临时文件；不读取真实 API Key，不调用收费服务，不注册 Chrome。另验证 Native Messaging 二进制长度帧和未授权扩展来源拒绝。

它不代替以下人工验收：

1. 实际 Chrome 注册与设置连接；非法扩展 ID 拒绝，其他用户不能复用注册。
2. 保存服务后关闭并重启 Chrome，模型测试、AI 整理与提问可用，失败不覆盖旧配置。
3. YouTube/B 站逐字稿、快捷笔记、历史、普通文件导出；中文路径、空格、长文件名。
4. Obsidian 选择、取消、目录无效、重复副本、权限拒绝；既有文件不被覆盖。
5. Codex 原生 exe、无登录、缺少 exe、超时终止；外部服务失败不自动重试收费任务。
6. 新装、更新与 Node 副本可启动；macOS 旧配置、凭据和 Obsidian 目标继续可用。

## 文件职责

- service/native/windows/Host.cs：Windows 系统凭据、文件夹选择及 Chrome 启动器。
- scripts/windows-native.mjs：Windows 编译和用户级注册；已有 build/install 脚本按系统分派。
- service/src/platform.ts：本机数据目录和凭据启动参数。
- service/src/folder-picker.ts：系统目录选择；obsidian.ts 保留公共校验与导出。
- service/src/providers/codex-platform.ts：系统对应的 Codex 查找与环境。
- tests/unit/native-platform.test.ts：路径、取消和凭据通信边界回归。
- scripts/test-windows-native.mjs：Windows 原生自检，不在 Mac 冒充通过。

原 settings 页面已超过 300 行，本轮只替换状态文案，不重排既有表单。Codex 的调用函数保留原有流式进程生命周期，系统差异提取到独立文件，避免在兼容性改动中重写已验证的任务流程。
