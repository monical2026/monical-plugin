import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { AnalysisDiagnosticButton } from '../../extension/src/ui/AnalysisDiagnosticButton';
import { withAnalysisDiagnostic } from '../../extension/src/ui/analysis-diagnostic';
import { parseReviewPlan } from '../../shared/src/ai/analysis-diagnostics';
import { planSchema } from '../../shared/src/ai/analysis-review-plan';
import '../../extension/src/ui/theme.css';
const area = {
  setAccessLevel: async () => {},
  get: async (key: string) => ({
    [key]: JSON.parse(localStorage.getItem(key) ?? 'null'),
  }),
  set: async (rows: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(rows))
      localStorage.setItem(key, JSON.stringify(value));
  },
};
Object.defineProperty(window, 'chrome', {
  value: {
    runtime: { getManifest: () => ({ version: '0.9.5-fixture' }) },
    storage: { local: area, session: area },
  },
});
function Fixture() {
  const [error, setError] = useState('');
  async function run() {
    try {
      await withAnalysisDiagnostic(
        'fixture-video',
        async (trace) => {
          trace('rpc.browser');
          trace('browser.reviewAnalysis');
          trace('network.response', { status: 200 });
          parseReviewPlan(
            planSchema,
            {
              summary: 'PRIVATE_TEXT',
              topics: [{ startId: '1', endId: '2' }],
              knowledge: [],
              methods: [{ indexes: [0], limitations: 'PRIVATE_TEXT' }],
              prerequisites: [],
              quotes: [],
            },
            '全片复核计划',
          );
        },
        () => true,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '失败');
    }
  }
  return (
    <main style={{ maxWidth: 600, padding: 24 }}>
      <h1>脉络诊断组件验证</h1>
      <p>模拟错误与 Chrome 存储接口，真实 React 诊断组件。</p>
      <button onClick={() => void run()}>模拟脉络失败</button>
      <p role="alert">{error}</p>
      <AnalysisDiagnosticButton key={error} videoId="fixture-video" />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
