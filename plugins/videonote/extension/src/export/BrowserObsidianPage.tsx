import { createRoot } from 'react-dom/client';
import '../options/settings.css';
function BrowserObsidianPage() {
  return (
    <main style={{ maxWidth: 760, margin: '40px auto', padding: 24 }}>
      <h1>Obsidian 导出方式已更新</h1>
      <p>
        浏览器目录导入已停用。请双击安装包中的 Obsidian
        连接安装程序，再回到导出窗口点击“检查 Obsidian 连接”。
      </p>
      <p>
        只有检测到本机 Obsidian
        和可用知识库后才能导出。原知识库及文件不会被改动。
      </p>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<BrowserObsidianPage />);
