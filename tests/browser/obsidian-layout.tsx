import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ObsidianConnection } from '../../extension/src/ui/ObsidianConnection';
import '../../extension/src/ui/style.css';
function Fixture() {
  const targets = [
    {
      name: '学习知识库',
      vault: '/Users/example/Documents/学习知识库',
      folder: '/Users/example/Documents/学习知识库',
    },
    {
      name: '很长的知识库名称',
      vault: '/Users/example/Documents/' + '很长的中文路径/'.repeat(8),
      folder: '/Users/example/Documents/' + '很长的中文路径/'.repeat(8),
    },
  ];
  const [target, setTarget] = useState(targets[0]);
  const connection = {
    state: 'ready',
    hint: '已连接',
    detail: '',
    vaults: targets,
    target,
    setTarget,
    refresh: async () => {},
  };
  return (
    <div className="export-overlay">
      <section className="export-dialog" role="dialog">
        <div className="row">
          <h2>导出</h2>
          <button>关闭</button>
        </div>
        <fieldset>
          <legend>导出到</legend>
          <label>
            <input type="radio" readOnly />
            下载文件
          </label>
          <label>
            <input type="radio" checked readOnly />
            Obsidian
          </label>
        </fieldset>
        <ObsidianConnection
          connection={connection}
          busy={false}
          selected
          setMessage={() => {}}
          onRefresh={() => {}}
          onChoose={async (vault) => {
            setTarget(targets.find((t) => t.vault === vault)!);
          }}
        />
        <fieldset>
          <legend>选择内容（可多选）</legend>
          <label>
            <input type="checkbox" />
            逐字稿
          </label>
          <label>
            <input type="checkbox" />
            笔记
          </label>
          <label>
            <input type="checkbox" defaultChecked />
            视频脉络
          </label>
        </fieldset>
        <button className="primary">导出到 Obsidian</button>
      </section>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
