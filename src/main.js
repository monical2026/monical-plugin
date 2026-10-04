import './style.css';
import { version } from '../package.json';
import { api, isExtension } from './api.js';
import { address, eligible, groupsFor, duplicateSets, closeSnapshot } from './model.js';
import { siteTone, retainOrder, faviconSource } from './presentation.js';
const siteOrder = [];
const $ = selector => document.querySelector(selector);
const ownOrigin = isExtension ? `chrome-extension://${chrome.runtime.id}` : '';
let tabs = [], generation = 0, pending = null, busy = false, toastTimer, lastState = null;
const expanded = new Set();
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
  const query = $('#filter').value;
  retainOrder(groupsFor(tabs), siteOrder);
  const groups = retainOrder(groupsFor(tabs, query), siteOrder);
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
    const toggle = button('', 'group-toggle', `展开或收起 ${group.name}`, () => {
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
    const isOpen = expanded.has(group.key) || Boolean(query.trim()); card.classList.toggle('is-expanded', isOpen); toggle.setAttribute('aria-expanded', isOpen);
    const icon = pageIcon(group.tabs[0], 'site-icon', group.name.slice(0, 1).toUpperCase());
    toggle.append(icon);
    const text = node('span', 'site-text'); text.append(node('strong', '', group.name), node('span', 'domain', group.host)); toggle.append(text, node('span', 'chevron', isOpen ? '−' : '+'));
    header.append(toggle); card.append(header);
    const meta = node('div', 'card-meta'); meta.append(node('span', '', query.trim() ? `匹配 ${group.matched.length} 页 / 共 ${group.tabs.length} 页` : `${group.tabs.length} 个标签`));
    meta.append(button(`关闭全部 ${group.tabs.length} 页`, 'close-group', `关闭 ${group.name} 的 ${group.tabs.length} 个标签`, () => showConfirm(group.tabs, `关闭 ${group.name} 的 ${group.tabs.length} 个标签？`, false, query.trim() ? group.matched.length : null)));
    card.append(meta);
    if (isOpen) {
      const list = node('ul', 'tab-list');
      for (const tab of group.matched) {
        const item = node('li', 'tab-row');
        const jump = button('', 'tab-link', `切换到 ${tab.title || address(tab)}`, async () => { try { await api.activate(tab); if (!isExtension) message('演示模式：安装插件后将切换到真实标签'); } catch { message('标签可能已关闭，请刷新后重试'); await refresh(); } });
        jump.title = `${tab.title || '未命名页面'}\n${address(tab)}`;
        const details = node('span', 'tab-details');
        details.append(node('span', 'tab-title', tab.title || '未命名页面'));
        details.append(node('span', 'tab-address', address(tab)));
        details.append(node('span', 'tab-info', `窗口 ${windowIds.indexOf(tab.windowId) + 1}${tab.pinned ? ' · 已固定' : ''}${tab.active ? ' · 活动页' : ''}${duplicateIds.has(tab.id) ? ' · 重复' : ''}`));
        jump.append(pageIcon(tab, 'tab-favicon', group.name.slice(0, 1)), details);
        const close = button('×', 'close-tab', `关闭标签 ${tab.title || address(tab)}`, async () => { close.disabled = true; await performClose([tab], false); });
        item.append(jump, close); list.append(item);
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
function showConfirm(snapshot, title, duplicates, matchedCount = null) {
  pending = { snapshot: snapshot.map(tab => ({ ...tab })), duplicates };
  $('#dialog-title').textContent = title;
  $('#dialog-description').textContent = duplicates ? '优先保留已固定的标签，其次保留活动标签或最近使用的标签。以下为待关闭项。' : `将关闭该网站全部 ${snapshot.length} 页${matchedCount !== null ? `，包括搜索未匹配的 ${snapshot.length - matchedCount} 页（匹配 ${matchedCount} 页）` : ""}，涉及 ${new Set(snapshot.map(tab => tab.windowId)).size} 个窗口。未保存的页面内容可能丢失，请确认后继续。`;
  $('#dialog-details').replaceChildren(...snapshot.map(tab => node('div', 'confirm-item', tab.title || address(tab))));
  $('#confirm-action').textContent = `确认关闭 ${snapshot.length} 个标签`;
  $('#confirm-dialog').showModal();
}
async function performClose(snapshot, duplicates) {
  try {
    const result = await closeSnapshot(api, snapshot, ownOrigin, duplicates);
    message(`已关闭 ${result.closed} 个标签${result.skipped ? `，${result.skipped} 个已变化或无需关闭` : ''}${result.failed ? `，${result.failed} 个关闭失败，请重试` : ''}`);
  } catch { message('无法读取标签，未执行关闭，请刷新后重试'); }
  await refresh();
}
async function refresh() {
  const request = ++generation;
  try { const loaded = await api.list(); if (request !== generation) return; const next = loaded.filter(tab => eligible(tab, ownOrigin)); const state = JSON.stringify(next); if (state !== lastState) { tabs = next; lastState = state; render(); } }
  catch { message('读取标签失败，请点击刷新重试'); $('#summary').textContent = '暂时无法读取标签'; }
}
$('#confirm-action').addEventListener('click', async () => {
  if (busy || !pending) return;
  busy = true; $('#confirm-action').disabled = true;
  const action = pending; $('#confirm-dialog').close();
  try { await performClose(action.snapshot, action.duplicates); } finally { busy = false; $('#confirm-action').disabled = false; pending = null; }
});
$('#confirm-dialog').addEventListener('close', () => { if (!busy) pending = null; });
$('#review-duplicates').addEventListener('click', () => { const snapshot = duplicateSets(tabs).flatMap(set => set.remove); if (snapshot.length) showConfirm(snapshot, `清理 ${snapshot.length} 个重复标签？`, true); });
$('#filter').addEventListener('input', () => render());
$('#refresh').addEventListener('click', refresh);
$('#search').addEventListener('submit', event => { const input = $('#web-query'); if (!input.value.trim()) { event.preventDefault(); input.focus(); } else input.value = input.value.trim(); });
$('#demo-note').hidden = isExtension;
let refreshTimer;
api.subscribe(() => { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 80); });
window.addEventListener('focus', refresh);
await refresh();

const versionLabel = node('span', 'version-label', `v${version}`);
versionLabel.title = '当前插件版本';
document.querySelector('.brand').append(versionLabel);
