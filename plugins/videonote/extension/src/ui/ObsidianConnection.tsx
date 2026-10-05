import { rpc, errorText } from '../lib/rpc';
import type { useObsidian } from './use-obsidian';
export function ObsidianConnection({
  connection,
  busy,
  selected,
  setMessage,
  onChoose,
  onRefresh,
}: {
  connection: ReturnType<typeof useObsidian>;
  busy: boolean;
  selected: boolean;
  setMessage: (message: string) => void;
  onChoose: (vault: string) => Promise<void>;
  onRefresh: () => void;
}) {
  return (
    <>
      <div className="export-target">
        <p role="status">{connection.hint}</p>
        {connection.detail && <p className="muted">{connection.detail}</p>}
        <button
          disabled={busy || connection.state === 'checking'}
          onClick={() => {
            onRefresh();
            void connection.refresh();
          }}
        >
          检查 Obsidian 连接
        </button>
        <button
          disabled={busy}
          onClick={() => {
            void rpc({ type: 'downloadObsidianConnection' })
              .then((result) => {
                if (result !== null)
                  setMessage(
                    '连接文件已提交下载。双击安装程序后，选择该 JSON 文件，无需输入或粘贴编号。',
                  );
              })
              .catch((error) => setMessage(errorText(error)));
          }}
        >
          下载安装连接文件
        </button>
        {connection.state === 'appMissing' && (
          <a
            href="https://obsidian.md/download"
            target="_blank"
            rel="noreferrer"
          >
            安装 Obsidian
          </a>
        )}
      </div>
      {selected && connection.state === 'ready' && (
        <div className="export-target">
          <label>
            Obsidian 知识库
            <select
              disabled={busy}
              value={connection.target?.vault ?? ''}
              onChange={(event) => void onChoose(event.target.value)}
            >
              <option value="" disabled>
                请选择知识库
              </option>
              {connection.vaults.map((vault) => (
                <option key={vault.vault} value={vault.vault}>
                  {vault.name} — {vault.folder}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </>
  );
}
