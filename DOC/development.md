# VideoNote 开发说明

## 仅构建与分发扩展（0.9.2）

普通用户使用成品 ZIP，不需要以下开发环境。开发者安装锁定依赖后执行：

```sh
pnpm run build:extension
pnpm run package:extension
```

第二条会重新构建并生成 `artifacts/releases/VideoNote-0.9.2-chrome.zip`，包含扩展、安装说明及许可证；使用 Node 内置能力生成 ZIP，不依赖系统 zip、Swift 或 Windows 编译器。完整 `pnpm run build` 仍构建可选本机组件。发布 ZIP 前检查内容、验证加载并人工验收，再按明确授权上传。浏览器服务实现见 [browser-mode.md](browser-mode.md)。

本文面向需要从源码构建或参与开发的人。普通使用方式见[README](../README.md)与[安装与使用指南](user-guide.md)。

## 环境与源码

从[项目仓库](https://github.com/monical2026/YouTube---)克隆源码，或通过 Code → Download ZIP 下载并解压。在项目根目录运行下面的命令。

- Node.js：根 package.json 要求 >=22.12；已有开发记录使用 26.3.1。
- pnpm：packageManager 固定为 11.19.0，依赖以 pnpm-lock.yaml 为准；不要混用其他包管理器。
- macOS 构建需要可运行 swiftc 的命令行开发工具；Windows 构建需要 .NET Framework 4.x 的 C# 编译器（csc.exe）。分别在目标系统构建，不需要在 Windows 安装 Swift。

## 安装依赖与构建

```sh
pnpm install --frozen-lockfile
pnpm run check
```

check 依次执行类型检查、lint、格式检查、单元测试和构建；不包含真实 Chrome 端到端验收。只需重新生成已有源码的构建产物时，可执行：

```sh
pnpm run build
```

产物：

| 路径 | 用途 |
| --- | --- |
| extension/dist | Chrome 加载的扩展成品，含 manifest.json |
| service/dist | 本机组件及钥匙串桥接程序 |

dist 目录不在 Git 中，因此 GitHub 下载源码不包含成品。构建后按[安装指南](user-guide.md#安装扩展)加载 extension/dist。

## 安装本机组件

AI 服务调用、Supadata、密钥保存及 Obsidian 导出使用该组件。已有字幕的直接读取与普通笔记不要求先安装它。

1. 完成构建并在 Chrome 加载扩展。
2. 在 chrome://extensions 找到 VideoNote，复制其扩展 ID。
3. 在项目根目录执行下面命令，将最后一项替换为真实扩展 ID：

```sh
pnpm native:install 扩展ID
```

4. 回到插件设置页，重新连接本机组件，配置所需服务并测试模型、保存。

macOS 上，脚本将 host.mjs 和 keychain-bridge 复制到 `~/Library/Application Support/YouTubeNote`，并在 `~/Library/Application Support/Google/Chrome/NativeMessagingHosts` 注册 `com.youtube_note.host`，只允许所填扩展 ID 连接。旧目录和内部标识保留是为了兼容既有安装，不是遗漏产品更名。

Windows 上，同一注册命令将 host.mjs、videonote-host.exe 与当前 node.exe 安装到 `%LOCALAPPDATA%\VideoNote`，并登记当前用户的 Chrome Native Messaging 注册表项，无需修改机器级注册表。详情与未验收项见 [Windows 支持](windows-support.md)。

macOS 启动脚本记录执行安装时的 Node 绝对路径。移动或删除该 Node 运行时可能导致连接失败，需要在有效环境下重新注册。当前没有独立运行时安装包或跨电脑通用的一键安装器，不能把这份本机注册文件直接作为通用安装包分发。

组件由 Chrome 按需启动，不要求手动启动后台服务。API Key 通过设置页存入 macOS 钥匙串或 Windows 凭据管理器，不写入命令行、源码或普通配置文件。系统授权由用户本人处理。

## 更新与调试

扩展源码重新构建后，在 Chrome 扩展管理页点击重新加载，并刷新已打开的视频页面。本机组件有变化时，构建后再次执行注册命令以更新安装副本。

检查命令包括 `pnpm run typecheck`、`pnpm run lint`、`pnpm run format:check`、`pnpm run test:unit` 和 `pnpm run build`。integration/e2e 命令尚未建立，不要将单元测试或独立页面验证称为完整浏览器验收。

## 项目结构与协作

- extension：Chrome 扩展、视频平台适配、页面与本地存储。
- service：Native Messaging 本机组件、凭据与外部服务适配。
- shared：共用类型、协议及校验。
- tests：测试；scripts：构建和本机注册脚本；DOC：项目文档。

修改前阅读[协作规则](../AGENTS.md)，按任务查阅[架构](architecture.md)、[技术方案](technical-design.md)、[界面设计](design.md)和[测试方案](test-plan.md)。实际结果记录在[测试反馈](test-feedback.md)，版本变化记录在[更新日志](changelog.md)。

## 成品分发状态

当前没有公开 Release 成品包。后续若提供扩展 ZIP，应包含完整的 extension/dist 内容，让用户解压后选择含 manifest.json 的目录。扩展 ZIP 与本机组件安装是两项不同的交付；准备扩展压缩包不代表组件已可跨电脑安装。发布前还需验证安装流程，并取得发布授权。
