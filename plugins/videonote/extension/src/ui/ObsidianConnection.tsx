import { useState } from 'react';
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
  const [choosing, setChoosing] = useState(false);
  if (connection.state === 'ready') {
    if (!selected) return null;
    return (
      <div className="export-target obsidian-connected">
        {connection.target && (
          <p>
            保存位置：<span>{connection.target.folder}</span>
          </p>
        )}
        {!connection.target || choosing ? (
          <div className="obsidian-vault-picker">
            <label htmlFor="obsidian-vault">选择知识库</label>
            <select
              id="obsidian-vault"
              disabled={busy}
              value={connection.target?.vault ?? ''}
              onChange={(event) => {
                void onChoose(event.target.value).then(() =>
                  setChoosing(false),
                );
              }}
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
            {connection.target && (
              <button disabled={busy} onClick={() => setChoosing(false)}>
                取消更换
              </button>
            )}
          </div>
        ) : (
          <button disabled={busy} onClick={() => setChoosing(true)}>
            更换知识库
          </button>
        )}
      </div>
    );
  }
  return (
    <>
      <div className="export-target obsidian-setup">
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
    </>
  );
}
