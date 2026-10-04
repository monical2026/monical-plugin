import { useState } from 'react';
import { readAnalysisDiagnostic } from './analysis-diagnostic';
export function AnalysisDiagnosticButton({ videoId }: { videoId: string }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  async function copy() {
    try {
      const report = await readAnalysisDiagnostic(videoId);
      setText(report);
      try {
        await navigator.clipboard.writeText(report);
        setStatus('诊断已复制，请粘贴给开发者。');
      } catch {
        setStatus('浏览器未允许自动复制，请在下方选中文本手动复制。');
      }
    } catch {
      setStatus('诊断读取失败，请保留当前错误提示。');
    }
  }
  return (
    <div>
      <button onClick={() => void copy()}>复制脉络诊断</button>
      {status && <p role="status">{status}</p>}
      {text && (
        <details open>
          <summary>诊断内容（不含密钥、字幕或笔记正文）</summary>
          <textarea
            aria-label="脉络诊断内容"
            readOnly
            value={text}
            rows={8}
            style={{ width: '100%' }}
            onFocus={(event) => event.currentTarget.select()}
          />
        </details>
      )}
    </div>
  );
}
