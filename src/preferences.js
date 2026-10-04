const key = 'tab-haven-preferences-v1';
export function preferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    return { grouped: saved?.grouped !== false, collapsed: saved?.collapsed === true };
  } catch { return { grouped: true, collapsed: false }; }
}
export function setPreferences(update) {
  localStorage.setItem(key, JSON.stringify({ ...preferences(), ...update }));
  window.dispatchEvent(new Event('preferences-changed'));
}
window.addEventListener('storage', event => { if (event.key === key || event.key === null) window.dispatchEvent(new Event('preferences-changed')); });
