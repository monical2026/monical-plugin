# Obsidian 连接安装指南

适用于 0.9.9。连接组件仅为 Obsidian 导出提供本机检测、知识库列表和写入能力。字幕、AI 浏览器模式、普通文件下载不需要组件。

## 用户安装步骤

1. 完整解压与你系统对应的 ZIP，到长期保留的位置。在 Chrome 的 `chrome://extensions` 中打开开发者模式，加载包内 `VideoNote` 文件夹。更新时覆盖原来路径并重新加载，勿卸载扩展；更换路径可能改变扩展 ID，造成原设置与笔记不可见。
2. 在 VideoNote 的“导出”窗口点击“下载安装连接文件”，保存 `VideoNote-connection.json`。
3. Windows 双击“安装 Obsidian 连接.cmd”；Mac 双击“安装 Obsidian 连接.app”。在系统文件选择窗口中选中刚下载的 `VideoNote-connection.json` 文件。无需输入命令、无需另装 Node.js 或 pnpm。
4. 安装成功后，返回导出窗口，点击“检查 Obsidian 连接”。从下拉列表选择已在 Obsidian 打开过的知识库，再导出。下次自动记住目标；同一视频重复导出会先确认，再创建副本，不覆盖已有文件。

连接文件只含当前扩展编号和格式标记，不含密钥、笔记或知识库路径；只授权当前 Chrome 插件连接本机组件。每个扩展身份安装一次，重启后不用重装；组件更新后重新运行安装程序。安装仅写入当前用户目录和 Chrome 本机消息注册信息，不修改浏览器服务模式、笔记、API Key 或 Obsidian 设置。

## 灰色状态

- 未安装组件、旧组件不支持检测或连接故障：Obsidian 不可选。按上方步骤安装/更新，再检查。
- 组件正常，但没有找到 Obsidian：仍不可选。点击“安装 Obsidian”前往官网，安装、启动并打开知识库，然后检查。
- 已安装但没有有效知识库：先在 Obsidian 创建或打开知识库，再检查。当前识别默认 `.obsidian` 配置目录；自定义配置目录暂不列出。
- 正常连接后，知识库从 Obsidian 自身登记列表读取，不再弹出任意文件夹选择器。知识库被移走或取消登记后会停止导出，要求重选。

旧版浏览器目录授权入口已停用，原目录句柄数据保留但不再用于写入。旧页面也不会继续导入。

## 系统要求与提示

Windows 包适用于 Windows x64，内含官方 Node 运行时。安装程序自动调用 Windows 自带 .NET Framework 4.x 编译器准备桥接程序，再注册到当前用户的 HKCU，无需管理员安装。如果系统精简掉该组件，安装会明确失败，不伪报成功。运行时已核对 Node 官方 SHA-256；Windows 实机仍待验收。

Mac 包目前适用于 Apple 芯片（arm64），内含运行时和本机桥接程序，Intel Mac 暂不使用此包。当前包未申请 Developer ID 签名和 Apple 公证；首次运行可能出现系统提示或被安全设置阻止。确认下载来源后按 macOS 官方正常授权流程处理；不要关闭 Gatekeeper 或运行所谓解除隔离命令。企业策略禁止时联系设备管理员。

请从 [Obsidian 官网](https://obsidian.md/download) 安装软件。连接程序不会自动下载 Obsidian，不会替用户创建知识库。

## 开发与验证入口

`pnpm run check` → `pnpm run package:extension` → `pnpm run package:desktop`。桌面打包脚本在 macOS 生成 Windows x64 与 Mac arm64 ZIP，下载并核对固定 Node 22.23.3 运行时；包内保留 Node 与 VideoNote 许可。扩展身份保持原规则，避免更换固定 manifest key 导致已有数据不可见。
