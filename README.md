# 插件合集

每个插件的源码与安装包集中存放，可单独下载，无需下载整个仓库。

| 插件 | 版本 | 用途 | 下载与说明 |
| --- | --- | --- | --- |
| Tab Haven · 标签小憩 | 0.10.0 | 新标签页 Google 搜索、网站标签管理、重复提醒、首页快捷入口、固定标签、限时恢复与多选确认关闭、静音暂停与播放恢复、单页直接切换、固定页面保护、全选搜索结果、声音与固定快捷筛选、正式图标 | [下载安装包](https://github.com/monical2026/monical-plugin/raw/refs/heads/main/downloads/tab-haven/tab-haven-0.10.0.zip) · [使用说明](plugins/tab-haven/README.md) |
| VideoNote | 0.9.5 | YouTube 与 B 站已有字幕、双语逐字稿、AI 梳理、笔记与导出 | [下载安装包](https://github.com/monical2026/monical-plugin/raw/refs/heads/main/downloads/videonote/VideoNote-0.9.5-chrome.zip) · [使用说明](plugins/videonote/README.md) |

## 安装 Tab Haven

1. 下载上面的 ZIP，解压到准备长期保存的位置。
2. 在 Chrome 地址栏打开 `chrome://extensions`，开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择解压后的 `tab-haven-0.10.0` 文件夹，其中应包含 `manifest.json`。
4. 新建标签页即可使用。不同 Chrome 配置需分别安装。

安装包已经构建完成，无需 Node.js、pnpm 或编译操作。ZIP 需要先解压，加载后请保留该文件夹。安装会替换新标签页；停用扩展即可停止替换。

## 安装 VideoNote

下载上表的 ZIP 并解压，在 Chrome 的 `chrome://extensions` 开启开发者模式，选择“加载已解压的扩展程序”，加载其中的 `VideoNote` 文件夹。普通使用无需 Node.js、pnpm 或本机组件；AI 功能按需配置服务。详细步骤见 [VideoNote 安装指南](plugins/videonote/DOC/user-guide.md)。

## 仓库组织

- `plugins/tab-haven/`：Tab Haven 的源码、开发说明、测试与验证记录。
- `downloads/tab-haven/`：Tab Haven 的可加载 ZIP 和 SHA-256 校验值。
- `plugins/videonote/`：VideoNote 完整工程与开发记录。
- `downloads/videonote/`：VideoNote 成品 ZIP（当前 0.9.5，保留历史版本） 与 SHA-256 校验值。
- 后续插件沿用 `plugins/<插件名>/` 与 `downloads/<插件名>/`，在本页添加入口。

当前未上架 Chrome 应用商店。许可证见 [LICENSE](LICENSE)。

## 开发与交付

各插件在各自的独立项目中开发、验证和提交；本仓库保存交付版本的源码、文档与安装包，不用于日常功能修改。用户确认版本并授权交付后，再将对应插件的提交合入合集并推送。合集不自动回写独立项目；多个插件的开发互不依赖，合集交付依次进行。
