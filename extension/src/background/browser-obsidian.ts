// 兼容旧请求，但不再允许目录句柄绕过本机应用检测。
export function browserObsidian(
  _action: 'status' | 'export',
  _payload: unknown,
): Promise<never> {
  return Promise.reject(
    new Error(
      '浏览器目录导入已停用，请安装 Obsidian 连接组件后，在导出窗口检查连接',
    ),
  );
}
