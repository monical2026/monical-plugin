# 插件合集

每个插件的源码与安装包集中存放，可单独下载，无需下载整个仓库。

| 插件 | 版本 | 用途 | 下载与说明 |
| --- | --- | --- | --- |
| Tab Haven · 标签小憩 | 0.3.3 | 新标签页 Google 搜索、网站标签管理、重复提醒、首页快捷入口、固定标签与限时恢复 | [下载安装包](https://github.com/monical2026/plugin/raw/refs/heads/main/downloads/tab-haven/tab-haven-0.3.3.zip) · [使用说明](plugins/tab-haven/README.md) |

## 安装 Tab Haven

1. 下载上面的 ZIP，解压到准备长期保存的位置。
2. 在 Chrome 地址栏打开 `chrome://extensions`，开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择解压后的 `tab-haven-0.3.3` 文件夹，其中应包含 `manifest.json`。
4. 新建标签页即可使用。不同 Chrome 配置需分别安装。

安装包已经构建完成，无需 Node.js、pnpm 或编译操作。ZIP 需要先解压，加载后请保留该文件夹。安装会替换新标签页；停用扩展即可停止替换。

## 仓库组织

- `plugins/tab-haven/`：Tab Haven 的源码、开发说明、测试与验证记录。
- `downloads/tab-haven/`：Tab Haven 的可加载 ZIP 和 SHA-256 校验值。
- 后续插件沿用 `plugins/<插件名>/` 与 `downloads/<插件名>/`，在本页添加入口。

当前未上架 Chrome 应用商店。许可证见 [LICENSE](LICENSE)。
