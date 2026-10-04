import { resetBrowserKeys } from '../browser-service/settings';
import { useState, useEffect } from 'react';
import { backend, store, type Backend } from '../browser-service/storage';
import { unlockVault, lockVault, vaultStatus } from '../browser-service/vault';
import { errorText } from '../lib/rpc';
export function ServiceMode({
  onChange,
}: {
  onChange: (mode: Backend) => Promise<void>;
}) {
  const [mode, setMode] = useState<Backend>('browser');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState({ initialized: false, unlocked: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void (async () => {
      const selected = await backend();
      setMode(selected);
      setStatus(await vaultStatus());
    })().catch((e) => setError(errorText(e)));
  }, []);
  async function change(value: Backend) {
    setBusy(true);
    setError('');
    try {
      await navigator.locks.request(
        'videonote:backend',
        { ifAvailable: true },
        async (lock) => {
          if (!lock) throw new Error('有服务任务正在运行，请完成后再切换模式');
          await store('serviceBackend', value);
          setMode(value);
        },
      );
      await onChange(value);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function unlock() {
    setBusy(true);
    setError('');
    try {
      await unlockVault(password);
      setPassword('');
      setStatus(await vaultStatus());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="服务运行方式">
      <h2>服务运行方式</h2>
      <label className="field">
        选择方式
        <select
          disabled={busy}
          value={mode}
          onChange={(e) => void change(e.target.value as Backend)}
        >
          <option value="browser">浏览器模式（无需安装组件）</option>
          <option value="native">本机组件模式（保留原有配置）</option>
        </select>
      </label>
      <p className="muted">
        两种方式分别保存服务配置，不迁移或覆盖已有密钥。切换前请先保存当前设置。浏览器模式也支持
        Obsidian 文件夹授权导出；本机 Codex 仍需可选组件。
      </p>
      {mode === 'browser' && (
        <>
          <p>
            {status.unlocked
              ? '密钥库已解锁，本次浏览器会话可用。'
              : status.initialized
                ? '密钥库已锁定，请输入密码解锁。'
                : '首次使用 AI 服务前，请设置密钥库密码。'}
          </p>
          <p className="muted">
            API Key
            加密保存在这台电脑。重启浏览器或重载扩展后需解锁一次；请记住密码，密码无法找回。阅读已有字幕、笔记及文件导出不需要解锁。
          </p>
          {!status.unlocked ? (
            <>
              <label className="field">
                {status.initialized ? '解锁密码' : '设置密码（至少 10 个字符）'}
                <input
                  type="password"
                  autoComplete="off"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button disabled={busy} onClick={() => void unlock()}>
                {status.initialized ? '解锁密钥库' : '创建密钥库'}
              </button>
            </>
          ) : (
            <button
              disabled={busy}
              onClick={() => {
                void lockVault()
                  .then(() => vaultStatus())
                  .then(setStatus)
                  .catch((e) => setError(errorText(e)));
              }}
            >
              锁定密钥库
            </button>
          )}
        </>
      )}
      {mode === 'browser' && status.initialized && (
        <button
          disabled={busy}
          onClick={() => {
            if (
              !window.confirm(
                '重置会删除浏览器模式保存的所有 API Key，需要重新填写。笔记、历史和本机模式密钥不受影响。确认重置？',
              )
            )
              return;
            setBusy(true);
            void resetBrowserKeys()
              .then(async () => {
                setStatus(await vaultStatus());
                await onChange(mode);
              })
              .catch((e) => setError(errorText(e)))
              .finally(() => setBusy(false));
          }}
        >
          忘记密码：重置浏览器密钥
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
