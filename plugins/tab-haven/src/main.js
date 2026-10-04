import './style.css';
import './sidebar.js';
import { audioState, audioSummary } from './audio.js';
import { createRecovery } from './recovery.js';
import { preferences } from './preferences.js';
import { version } from '../package.json';
import { api, isExtension } from './api.js';
import { address, eligible, groupsFor, duplicateSets, closeSnapshot } from './model.js';
import { siteTone, retainOrder, faviconSource } from './presentation.js';
const siteOrder = [];
const recovery = createRecovery(api);
const $ = selector => document.querySelector(selector);
const ownOrigin = isExtension ? `chrome-extension://${chrome.runtime.id}` : '';
let tabs = [], generation = 0, pending = null, busy = false, toastTimer, lastState = null;
const expanded = new Set();
const selected = new Map();
let selecting = false;
function node(tag, className, text) { const el = document.createElement(tag); el.className = className; if (text !== undefined) el.textContent = text; return el; }
function message(text) { $('#toast').textContent = text; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500); }
function button(text, className, label, callback) { const el = node('button', className, text); el.type = 'button'; el.setAttribute('aria-label', label); el.addEventListener('click', callback); return el; }
function pageIcon(tab, className, fallback) {
  const icon = node('span', className, fallback);
  icon.setAttribute('aria-hidden', 'true');
  const source = faviconSource(address(tab), isExtension ? chrome.runtime : null);
  if (source) {
    const image = node('img', 'site-logo'); image.alt = '';
    image.addEventListener('load', () => icon.replaceChildren(image), { once: true });
    image.addEventListener('error', () => { icon.textContent = fallback; }, { once: true });
    image.src = source;
  }
  return icon;
}
function render(scrollToKey = null) {
  for (const [id, url] of selected) if (!tabs.some(tab => tab.id === id && address(tab) === url)) selected.delete(id);
  updateSelection();
  const query = $('#filter').value;
  retainOrder(groupsFor(tabs), siteOrder);
  const grouped = preferences().grouped;
  const filtered = groupsFor(tabs, query);
  const matchedIds = new Set(filtered.flatMap(group => group.matched.map(tab => tab.id)));
  const groups = grouped ? retainOrder(filtered, siteOrder) : (matchedIds.size ? [{ key: 'all', name: '全部页面', host: '', tabs, matched: tabs.filter(tab => matchedIds.has(tab.id)) }] : []);
  const duplicates = duplicateSets(tabs), duplicateIds = new Set(duplicates.flatMap(set => set.remove.map(tab => tab.id)));
  $('#total').textContent = tabs.length;
  $('#summary').textContent = `${groupsFor(tabs).length} 个网站 · ${new Set(tabs.map(tab => tab.windowId)).size} 个窗口 · 为每一个标签找到位置`;
  $('#duplicate-banner').hidden = !duplicateIds.size;
  $('#duplicate-count').textContent = `发现 ${duplicateIds.size} 个多余标签`;
  const windowIds = [...new Set(tabs.map(tab => tab.windowId))].sort((a, b) => a - b);
  const fragment = document.createDocumentFragment();
  for (const group of groups) {
    const card = node('article', 'group-card'); card.style.setProperty('--tone', siteTone(group.key)); card.dataset.siteKey = group.key;
    const header = node('div', 'card-header');
    const direct = grouped && !selecting && group.tabs.length === 1;
    const toggle = button('', 'group-toggle', direct ? `切换到 ${group.tabs[0].title || address(group.tabs[0])}` : `展开或收起 ${group.name}`, async () => {
      if (direct) {
        try { await api.activate(group.tabs[0]); if (!isExtension) message('演示模式：安装插件后将切换到真实标签'); }
        catch { message('标签可能已关闭，请刷新后重试'); await refresh(); }
        return;
      }
      if (expanded.has(group.key)) {
        expanded.delete(group.key);
        render();
      } else {
        expanded.add(group.key);
        const index = siteOrder.indexOf(group.key);
        if (index >= 0) siteOrder.splice(index, 1);
        siteOrder.unshift(group.key);
        render(group.key);
      }
    });
    const isOpen = selecting || !grouped || expanded.has(group.key) || Boolean(query.trim()); card.classList.toggle('is-expanded', isOpen); if (!direct) toggle.setAttribute('aria-expanded', isOpen);
    const icon = pageIcon(group.tabs[0], 'site-icon', group.name.slice(0, 1).toUpperCase());
    toggle.append(icon);
    const text = node('span', 'site-text'); text.append(node('strong', '', group.name), node('span', 'domain', group.host)); toggle.append(text, node('span', 'chevron', direct ? '↗' : isOpen ? '−' : '+'));
    if (direct) toggle.title = `切换到 ${group.tabs[0].title || address(group.tabs[0])}\n${address(group.tabs[0])}`;
    header.append(toggle); if (grouped) card.append(header);
    const meta = node('div', 'card-meta'); meta.append(node('span', '', query.trim() ? `匹配 ${group.matched.length} 页 / 共 ${group.tabs.length} 页` : `${group.tabs.length} 个标签`));
    if (direct) {
      const details = button(isOpen ? '−' : '⋯', 'group-details', `展开或收起 ${group.name} 的页面操作`, () => {
        if (expanded.has(group.key)) expanded.delete(group.key); else expanded.add(group.key);
        render();
      });
      details.title = '页面操作：固定、声音与关闭';
      details.setAttribute('aria-expanded', isOpen); header.append(details);
    }
    if (grouped) {
      const closeGroup = button('×', 'close-group', `关闭 ${group.name} 的 ${group.tabs.length} 个标签`, () => showConfirm(group.tabs, `关闭 ${group.name} 的 ${group.tabs.length} 个标签？`, false, query.trim() ? group.matched.length : null));
      closeGroup.title = `关闭整组 · ${group.tabs.length} 页`;
      header.append(closeGroup);
    }
    const soundSummary = audioSummary(group.tabs);
    if (soundSummary) meta.append(node('span', 'audio-summary', soundSummary));
    card.append(meta);
    if (isOpen) {
      const list = node('ul', 'tab-list');
      for (const tab of group.matched) {
        const item = node('li', 'tab-row');
        if (selecting) {
          const checkbox = node('input', 'select-tab'); checkbox.type = 'checkbox';
          checkbox.checked = selected.has(tab.id);
          checkbox.setAttribute('aria-label', `选择 ${tab.title || address(tab)}`);
          checkbox.addEventListener('change', () => {
            if (checkbox.checked) selected.set(tab.id, address(tab)); else selected.delete(tab.id);
            updateSelection();
          });
          item.append(checkbox);
        }
        const jump = button('', 'tab-link', `切换到 ${tab.title || address(tab)}`, async () => { try { await api.activate(tab); if (!isExtension) message('演示模式：安装插件后将切换到真实标签'); } catch { message('标签可能已关闭，请刷新后重试'); await refresh(); } });
        jump.title = `${tab.title || '未命名页面'}\n${address(tab)}`;
        const details = node('span', 'tab-details');
        details.append(node('span', 'tab-title', tab.title || '未命名页面'));
        details.append(node('span', 'tab-address', address(tab)));
        details.append(node('span', 'tab-info', `窗口 ${windowIds.indexOf(tab.windowId) + 1}${tab.pinned ? ' · 已固定' : ''}${tab.active ? ' · 活动页' : ''}${duplicateIds.has(tab.id) ? ' · 重复' : ''}`));
        jump.append(pageIcon(tab, 'tab-favicon', group.name.slice(0, 1)), details);
        const close = button('×', 'close-tab', `关闭标签 ${tab.title || address(tab)}`, async () => { close.disabled = true; await performClose([tab], false); });
        const pin = button('', 'pin-tab', `${tab.pinned ? '取消固定' : '固定标签'} ${tab.title || address(tab)}`, async () => {
          pin.disabled = true;
          try { await api.pin(tab.id, !tab.pinned); }
          catch { message('固定状态修改失败，标签可能已关闭，请重试'); }
          finally { await refresh(); pin.disabled = false; }
        });
        pin.title = tab.pinned ? '取消固定' : '固定到浏览器标签栏';
        pin.setAttribute('aria-pressed', Boolean(tab.pinned));
        pin.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5-4 1-3 5-4-4 5-3 1-4Z"/><path d="m10 10-3 3 4 4 3-3M9 15l-6 6"/></svg>';
        item.append(jump);
        const sound = audioState(tab);
        if (sound !== 'silent') {
          const muted = sound === 'muted';
          const mute = button('', `mute-tab ${sound}`, `${muted ? '恢复声音并继续播放' : '静音并暂停'} ${tab.title || address(tab)}`, async () => {
            mute.disabled = true;
            try { const result = await api.mute(tab, !muted); if (result.warning) message(result.warning); }
            catch { message('声音设置失败，标签可能已关闭，请重试'); }
            finally { await refresh(); mute.disabled = false; }
          });
          mute.title = muted ? '已静音 · 点击恢复声音并继续播放' : '正在出声 · 点击静音并暂停';
          mute.setAttribute('aria-pressed', muted);
          mute.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4 6 8H3v8h3l5 4Z"/>${muted ? '<path d="m16 9 5 6m0-6-5 6"/>' : '<path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>'}</svg>`;
          details.append(node('span', 'audio-status', muted ? '已静音' : '正在出声'));
          item.append(mute);
        }
        item.append(pin, close); list.append(item);
      }
      card.append(list);
    }
    fragment.append(card);
  }
  $('#groups').replaceChildren(fragment); $('#empty').hidden = groups.length > 0;
  $('#empty-text').textContent = query.trim() ? '没有匹配的标签，试试其他标题或网址。' : '暂时没有需要整理的标签，去发现点新东西吧。';
  if (scrollToKey) {
    const target = [...$('#groups').children].find(card => card.dataset.siteKey === scrollToKey);
    if (target) {
      target.querySelector('.group-toggle').focus({ preventScroll: true });
      target.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }

}
function showConfirm(snapshot, title, duplicates, matchedCount = null, multi = false) {
  pending = { snapshot: snapshot.map(tab => ({ ...tab })), duplicates, multi, title, matchedCount, includePinned: false };
  $('#include-pinned').checked = false;
  renderConfirmation();
  $('#confirm-dialog').showModal();
}
function renderConfirmation() {
  if (!pending) return;
  const { snapshot, duplicates, multi, title, matchedCount, includePinned } = pending;
  const groupClose = !duplicates && !multi;
  const pinned = snapshot.filter(tab => tab.pinned).length;
  const targets = groupClose && !includePinned ? snapshot.filter(tab => !tab.pinned) : snapshot;
  pending.targets = targets;
  $('#dialog-title').textContent = groupClose ? title.replace(/的 \d+ 个标签/, '的标签') : title;
  $('#pinned-option').hidden = !groupClose || !pinned;
  $('#pinned-option-text').textContent = `同时关闭已固定页面（${pinned} 个）`;
  $('#dialog-description').textContent = duplicates ? '优先保留已固定的标签，其次保留活动标签或最近使用的标签。以下为待关闭项。' :
    `将关闭 ${targets.length} 页，涉及 ${new Set(targets.map(tab => tab.windowId)).size} 个窗口。${groupClose && !includePinned && pinned ? `保留 ${pinned} 个已固定页面。` : ''}${matchedCount !== null ? `当前搜索匹配 ${matchedCount} 页，整组操作也包含未匹配的未固定页面${includePinned ? '及已固定页面' : ''}。` : ''}未保存的页面内容可能丢失，请确认后继续。`;
  $('#dialog-details').replaceChildren(...snapshot.map(tab => {
    const keeping = groupClose && !includePinned && tab.pinned;
    const entry = node('div', `confirm-item${keeping ? ' is-kept' : ''}`);
    entry.append(node('div', '', `${keeping ? '保留 · ' : ''}${tab.title || '未命名页面'}${tab.pinned ? ' · 已固定' : ''}`), node('div', 'confirm-url', address(tab)));
    return entry;
  }));
  $('#confirm-action').textContent = targets.length ? `确认关闭 ${targets.length} 个标签` : '没有需要关闭的标签';
  $('#confirm-action').disabled = !targets.length;
}
$('#include-pinned').addEventListener('change', () => {
  if (pending) { pending.includePinned = $('#include-pinned').checked; renderConfirmation(); }
});
async function performClose(snapshot, duplicates, protectPinned = false) {
  try {
    const closedTabs = [];
    const result = await closeSnapshot(api, snapshot, ownOrigin, duplicates, tab => closedTabs.push(tab), protectPinned);
    recovery.add(closedTabs);
    renderRecovery();
    if (result.failed || result.skipped) message(`${result.failed ? `${result.failed} 个标签关闭失败，请重试。` : ''}${result.skipped ? `${result.skipped} 个标签已变化或无需关闭。` : ''}`);
  } catch { message('无法读取标签，未执行关闭，请刷新后重试'); }
  await refresh();
}
function setRecoveryOpen(open) {
  $('#recovery-panel').hidden = !open;
  $('#reopen-tabs').setAttribute('aria-expanded', open);
}
let recoveryView = '';
function renderRecovery() {
  const trigger = $('#reopen-tabs');
  const items = recovery.items;
  const view = JSON.stringify([recovery.busy, items.map(tab => [tab.recoveryId, Math.ceil((tab.expiresAt - Date.now()) / 60000)])]);
  if (view === recoveryView) return;
  recoveryView = view;
  const label = items.length ? `选择重新打开的标签（${items.length}）` : '暂无可重新打开的标签';
  trigger.title = label;
  trigger.setAttribute('aria-label', label);
  trigger.disabled = !items.length;
  $('#recovery-list').replaceChildren(...items.map(tab => {
    const row = node('li', '');
    const restore = button('', 'recovery-item', `重新打开 ${tab.title || address(tab)}`, async () => {
      const operation = recovery.restore(tab.recoveryId);
      renderRecovery();
      const result = await operation;
      renderRecovery();
      if (result.failed) message('此页面重新打开失败，请重试');
      await refresh();
      if (!$('#recovery-panel').hidden) $('#recovery-list button')?.focus();
      else trigger.focus();
    });
    restore.disabled = recovery.busy;
    restore.title = `${tab.title || '未命名页面'}\n${address(tab)}`;
    restore.append(node('span', 'recovery-title', tab.title || '未命名页面'), node('span', 'recovery-url', address(tab)), node('span', 'recovery-expiry', `剩余 ${Math.max(1, Math.ceil((tab.expiresAt - Date.now()) / 60000))} 分钟`));
    row.append(restore); return row;
  }));
  if (!items.length) setRecoveryOpen(false);
}
// 定期清理，同时保留列表中正在使用的键盘焦点。
setInterval(() => {
  const focusedIndex = [...document.querySelectorAll('.recovery-item')].indexOf(document.activeElement);
  renderRecovery();
  if (focusedIndex >= 0) {
    const choices = document.querySelectorAll('.recovery-item');
    (choices[Math.min(focusedIndex, choices.length - 1)] || $('#reopen-tabs')).focus();
  }
}, 1000);
window.addEventListener('focus', renderRecovery);
$('#reopen-tabs').addEventListener('click', () => {
  const open = $('#recovery-panel').hidden;
  renderRecovery();
  setRecoveryOpen(open && recovery.items.length > 0);
  if (open) $('#recovery-list button')?.focus();
});
document.addEventListener('click', event => {
  if (!event.composedPath().includes($('.topbar-actions'))) setRecoveryOpen(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('#recovery-panel').hidden) { setRecoveryOpen(false); $('#reopen-tabs').focus(); }
});
async function refresh() {
  const request = ++generation;
  const retry = $('#retry-tabs');
  retry.disabled = true;
  try {
    const loaded = await api.list();
    if (request !== generation) return;
    const next = loaded.filter(tab => eligible(tab, ownOrigin));
    const state = JSON.stringify(next);
    if (state !== lastState) { tabs = next; lastState = state; render(); }
    $('#load-error').hidden = true;
  } catch {
    if (request !== generation) return;
    $('#load-error').hidden = false;
    if (lastState === null) $('#summary').textContent = '暂时无法读取标签';
  } finally {
    if (request === generation) retry.disabled = false;
  }
}
$('#confirm-action').addEventListener('click', async () => {
  if (busy || !pending || !pending.targets.length) return;
  busy = true; $('#confirm-action').disabled = true;
  const action = pending; $('#confirm-dialog').close();
  try { await performClose(action.targets, action.duplicates, !action.duplicates && !action.multi && !action.includePinned); } finally { busy = false; $('#confirm-action').disabled = false; pending = null; }
});
$('#confirm-dialog').addEventListener('close', () => { if (!busy) pending = null; });
function updateSelection() {
  $('#selection-toolbar').hidden = !selecting;
  $('#toggle-selection').textContent = selecting ? '退出多选' : '多选';
  $('#toggle-selection').setAttribute('aria-pressed', selecting);
  $('#selection-count').textContent = `已选 ${selected.size} 页（含搜索隐藏项）`;
  $('#close-selected').disabled = !selected.size;
}
$('#toggle-selection').addEventListener('click', () => { selecting = !selecting; selected.clear(); render(); });
$('#clear-selection').addEventListener('click', () => { selected.clear(); render(); });
$('#close-selected').addEventListener('click', () => {
  const snapshot = tabs.filter(tab => selected.get(tab.id) === address(tab));
  if (snapshot.length) showConfirm(snapshot, `关闭所选的 ${snapshot.length} 个标签？`, false, null, true);
});
$('#review-duplicates').addEventListener('click', () => { const snapshot = duplicateSets(tabs).flatMap(set => set.remove); if (snapshot.length) showConfirm(snapshot, `清理 ${snapshot.length} 个重复标签？`, true); });
$('#filter').addEventListener('input', () => render());
$('#retry-tabs').addEventListener('click', refresh);
$('#search').addEventListener('submit', event => { const input = $('#web-query'); if (!input.value.trim()) { event.preventDefault(); input.focus(); } else input.value = input.value.trim(); });
$('#demo-note').hidden = isExtension;
let refreshTimer;
api.subscribe(() => { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 80); });
window.addEventListener('focus', refresh);
window.addEventListener('preferences-changed', () => render());
await refresh();

const versionLabel = node('span', 'version-label', `v${version}`);
versionLabel.title = '当前插件版本';
document.querySelector('.brand').append(versionLabel);
