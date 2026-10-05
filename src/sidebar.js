import { preferences, setPreferences } from './preferences.js';
import { api, isExtension } from './api.js';
import { defaultShortcuts, addShortcut, homepage, openHomepage } from './shortcuts.js';
import { bundledIcon, createIconResolver, loadWebsiteIcon, discoverWebsiteIcons } from './shortcut-icons.js';
const icons = createIconResolver({ storage: localStorage, runtime: isExtension ? chrome.runtime : null, load: loadWebsiteIcon, discover: discoverWebsiteIcons });
const key = 'tab-haven-shortcuts-v1';
const list = document.querySelector('#shortcuts');
const status = document.querySelector('#shortcut-status');

let items = [];
const opening = new Set();
function read() {
  const saved = localStorage.getItem(key);
  if (saved === null) return defaultShortcuts.map(item => ({ ...item }));
  const parsed = JSON.parse(saved);
  if (!Array.isArray(parsed) || parsed.some(item => !item || typeof item.name !== 'string' || !item.name.trim() || typeof item.url !== 'string' || homepage(item.url) !== item.url)) throw new Error('快捷入口数据无法读取');
  return parsed;
}
function load() {
  try { items = read(); status.textContent = ''; }
  catch { items = []; status.textContent = '快捷入口无法读取，请刷新重试。'; }
  render();
}
function save(next) {
  try { localStorage.setItem(key, JSON.stringify(next)); items = next; render(); return true; }
  catch { status.textContent = '未能保存，请检查浏览器存储后重试。'; return false; }
}
function button(text, label, action) {
  const el = document.createElement('button'); el.type = 'button'; el.textContent = text; el.setAttribute('aria-label', label); el.addEventListener('click', action); return el;
}
function render() {
  for (const [target, editing] of [[list, false], [document.querySelector('#manage-shortcuts'), true]]) {
  target.replaceChildren();
  for (const [index, item] of items.entries()) {
    const row = document.createElement('li'); row.className = 'shortcut-row';
    const link = button('', `打开 ${item.name} 首页`, async () => {
      if (opening.has(item.url)) return;
      opening.add(item.url); link.disabled = true;
      try { await openHomepage(api, item.url); status.textContent = ''; }
      catch { status.textContent = '打开失败，请重试'; }
      finally { opening.delete(item.url); link.disabled = false; }
    });
    link.className = 'shortcut-link'; link.title = `${item.name} · ${item.url}`;
    const icon = document.createElement('span'); icon.className = 'shortcut-icon'; icon.textContent = item.name.slice(0, 1); icon.setAttribute('aria-hidden', 'true');
    icon.title = '正在获取网站图标';
    icons.resolve(item.url).then(src => {
      if (!src) { icon.title = '暂未取得网站图标，可在管理中重取'; return; }
      const img = document.createElement('img'); img.alt = ''; img.referrerPolicy = 'no-referrer';
      img.onload = () => { icon.replaceChildren(img); icon.title = ''; };
      img.onerror = () => { icon.title = '图标加载失败，可在管理中重取'; icons.forget(item.url); };
      img.src = src;
    });
    const label = document.createElement('span'); label.textContent = item.name;
    link.append(icon); if (editing) link.append(label); row.append(link);
    if (editing) {
      const controls = document.createElement('div'); controls.className = 'shortcut-controls';
      const up = button('↑', `上移 ${item.name}`, () => { const next = [...items]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; save(next); }); up.disabled = index === 0;
      const down = button('↓', `下移 ${item.name}`, () => { const next = [...items]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; save(next); }); down.disabled = index === items.length - 1;
      const remove = button('移除', `移除 ${item.name} 快捷入口`, () => { if (save(items.filter((_, i) => i !== index))) status.textContent = ''; });
      controls.append(up, down);
      if (!bundledIcon(item.url)) {
        const retry = button('重取图标', `重新获取 ${item.name} 图标`, async () => {
          retry.disabled = true;
          const feedback = document.querySelector('#manage-status'); feedback.textContent = `正在获取 ${item.name} 图标…`;
          let candidates = [], discoveryFailed = false;
          try {
            // request 必须直接由用户点击触发，只申请当前网站。
            const allowed = !isExtension || await chrome.permissions.request({ origins: [`${new URL(item.url).origin}/*`] });
            if (allowed) { try { candidates = await discoverWebsiteIcons(item.url); } catch { discoveryFailed = true; } }
            else discoveryFailed = true;
            const src = await icons.resolve(item.url, { candidates, refresh: true });
            feedback.textContent = src ? '' : `${item.name} 图标暂不可用${discoveryFailed ? '（未获读取授权或网站无法访问）' : ''}，仍可正常打开网站，稍后可重试。`;
            render();
          } catch { feedback.textContent = '图标获取失败，请稍后重试。'; }
          finally { retry.disabled = false; }
        });
        controls.append(retry);
      }
      controls.append(remove); row.append(controls);
    }
    target.append(row);
  }
  }
  document.querySelector('#shortcut-empty').hidden = items.length > 0;
}
const manageDialog = document.querySelector('#manage-dialog');
document.querySelector('#edit-shortcuts').addEventListener('click', () => { render(); manageDialog.showModal(); });
document.querySelector('#close-manage').addEventListener('click', () => manageDialog.close());
function applyPreferences() {
  const current = preferences();
  document.querySelector('.app-layout').classList.toggle('sidebar-collapsed', current.collapsed);
  document.querySelector('#sidebar-content').hidden = current.collapsed;
  const toggle = document.querySelector('#collapse-sidebar');
  toggle.classList.toggle('is-collapsed', current.collapsed);
  toggle.title = current.collapsed ? '展开侧栏' : '收起侧栏';
  toggle.setAttribute('aria-label', toggle.title); toggle.setAttribute('aria-expanded', !current.collapsed);
  document.querySelector(`input[name="view-mode"][value="${current.grouped ? 'grouped' : 'flat'}"]`).checked = true;
}
document.querySelector('#collapse-sidebar').addEventListener('click', () => {
  try { setPreferences({ collapsed: !preferences().collapsed }); }
  catch { status.textContent = '无法保存侧栏设置，请重试'; }
});
document.querySelectorAll('input[name="view-mode"]').forEach(input => input.addEventListener('change', () => {
  try { setPreferences({ grouped: input.value === 'grouped' }); document.querySelector('#manage-status').textContent = '已保存显示方式'; }
  catch { applyPreferences(); document.querySelector('#manage-status').textContent = '无法保存显示方式，请重试'; }
}));
window.addEventListener('preferences-changed', applyPreferences);
applyPreferences();
const dialog = document.querySelector('#shortcut-dialog');
const form = document.querySelector('#shortcut-form');
document.querySelector('#add-shortcut').addEventListener('click', () => { form.reset(); document.querySelector('#shortcut-error').textContent = ''; dialog.showModal(); });
document.querySelector('#cancel-shortcut').addEventListener('click', () => dialog.close());
form.addEventListener('submit', event => {
  event.preventDefault();
  try { const next = addShortcut(read(), form.elements.name.value, form.elements.url.value); if (save(next)) { dialog.close(); status.textContent = ''; } }
  catch (error) { document.querySelector('#shortcut-error').textContent = error.message; }
});
window.addEventListener('storage', event => { if (event.key === key || event.key === null) load(); });
load();
