import { expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { recordSchema } from '../../shared/src';
const state = vi.hoisted(() => ({ value: 'checking' }));
vi.mock('../../extension/src/ui/use-obsidian', () => ({
  useObsidian: () => ({
    state: state.value,
    hint: '连接说明',
    detail: '',
    vaults: [],
    target: null,
    setTarget: vi.fn(),
    refresh: vi.fn(),
  }),
}));
import { ExportDialog } from '../../extension/src/ui/ExportDialog';
const require = createRequire(resolve('extension/package.json'));
const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
it.each(['checking', 'unavailable', 'appMissing', 'noVaults', 'ready'])(
  'Obsidian UI 状态 %s，普通下载仍可选',
  (value) => {
    state.value = value;
    const record = recordSchema.parse({
      videoId: 'abcdefghijk',
      title: '视频',
      revision: 0,
      segments: [],
      notes: [],
      analysis: null,
    });
    const html = renderToStaticMarkup(
      createElement(ExportDialog, {
        record,
        mode: 'original',
        onClose: () => {},
      }),
    );
    const radios = html.match(/<input[^>]*type="radio"[^>]*>/g)!;
    const obsidian = radios[1];
    expect(obsidian.includes('disabled')).toBe(value !== 'ready');
    expect(radios[0]).not.toContain('disabled');
    if (value === 'ready') expect(html).not.toContain('检查 Obsidian 连接');
    else expect(html).toContain('检查 Obsidian 连接');
    expect(html).not.toContain('选择文件夹');
    if (value === 'appMissing')
      expect(html).toContain('https://obsidian.md/download');
  },
);
