import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  pickExportDirectory,
  writeBrowserObsidian,
  type BrowserExport,
  type ExportDirectory,
} from './browser-obsidian';
import {
  rememberDirectory,
  rememberedDirectory,
} from './browser-directory-store';
import {
  takeBrowserExport,
  clearBrowserExport,
} from './browser-export-request';
import { errorText } from '../lib/rpc';
import '../options/settings.css';
async function importRequest(
  directory: ExportDirectory,
  payload: BrowserExport,
  id: string,
  copy: boolean,
) {
  const result = await writeBrowserObsidian(directory, payload, copy);
  if (result.status === 'saved') {
    // 文件已成功写入，不把暂存请求清理失败误报为导出失败而诱发重复导出。
    try {
      await clearBrowserExport(id);
    } catch {
      /* 请求会按既有期限过期。 */
    }
  }
  return result;
}
function BrowserObsidianPage() {
  const [payload, setPayload] = useState<BrowserExport | null>(null);
  const [directory, setDirectory] = useState<ExportDirectory | null>(null);
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const id = new URLSearchParams(location.search).get('request') ?? '';
  const changeTarget = new URLSearchParams(location.search).has('changeTarget');
  useEffect(() => {
    let active = true;
    void (async () => {
      const input = await takeBrowserExport(id);
      const target = await rememberedDirectory();
      if (!active) return;
      setPayload(input);
      setDirectory(target);
      if (
        !target ||
        changeTarget ||
        (await target.queryPermission({ mode: 'readwrite' })) !== 'granted'
      )
        return;
      if (!active) return;
      const result = await importRequest(target, input, id, false);
      if (result.status === 'duplicate') setDuplicates(result.files);
      else setSaved(result.filename);
    })()
      .catch((e) => {
        if (active) setError(errorText(e));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [id, changeTarget]);
  async function complete(target: ExportDirectory, copy: boolean) {
    if (!payload) return;
    const result = await importRequest(target, payload, id, copy);
    if (result.status === 'duplicate') setDuplicates(result.files);
    else {
      setSaved(result.filename);
      setDuplicates([]);
    }
  }
  async function choose() {
    if (busy || !payload) return;
    setBusy(true);
    setError('');
    try {
      const chosen = await pickExportDirectory();
      await rememberDirectory(chosen);
      setDirectory(chosen);
      setDuplicates([]);
      await complete(chosen, false);
    } catch (e) {
      if (!(e instanceof DOMException) || e.name !== 'AbortError')
        setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function authorize(copy: boolean) {
    if (!directory || !payload || busy) return;
    setBusy(true);
    setError('');
    try {
      if (
        (await directory.requestPermission({ mode: 'readwrite' })) !== 'granted'
      )
        throw new Error(
          '未获得知识库写入权限，内容保留；请点击授权重试或更换知识库。',
        );
      await complete(directory, copy);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main style={{ maxWidth: 760, margin: '40px auto', padding: 24 }}>
      <h1>连接 Obsidian 知识库</h1>
      <h2>{payload?.title}</h2>
      <p>
        首次选择本地知识库或其中的文件夹并允许访问，本次内容会直接导入。连接会记住，以后从视频页面点击“导入知识库”即可；浏览器要求时才重新授权。
      </p>
      <p>请确认选择的是你的 Obsidian 知识库目录。无需安装本机组件。</p>
      {directory && <p>已连接：{directory.name}</p>}
      <button
        disabled={busy || !payload || !!saved}
        onClick={() => void choose()}
      >
        {directory ? '更换知识库并导入' : '选择知识库并导入'}
      </button>
      {directory && !changeTarget && !duplicates.length && (
        <button
          disabled={busy || !payload || !!saved}
          onClick={() => void authorize(false)}
        >
          授权并导入
        </button>
      )}
      {busy && <p role="status">正在处理…</p>}
      {!!duplicates.length && (
        <section>
          <h2>这个视频已导入过</h2>
          <p>{duplicates.join('、')}</p>
          <p>继续会生成副本，已有文件保持不变。</p>
          <button disabled={busy} onClick={() => void authorize(true)}>
            继续导入副本
          </button>
          <button
            disabled={busy}
            onClick={() => {
              setDuplicates([]);
              setError('已取消本次导入，原文件未改动。');
            }}
          >
            取消
          </button>
        </section>
      )}
      {error && <p role="alert">{error}</p>}
      {saved && (
        <p role="status">已导入：{saved}。知识库已连接，可以关闭此页。</p>
      )}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<BrowserObsidianPage />);
