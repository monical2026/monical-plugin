export function audioState(tab) {
  if (tab.mutedInfo?.muted) return 'muted';
  return tab.audible ? 'audible' : 'silent';
}
export function audioSummary(tabs) {
  const audible = tabs.filter(tab => audioState(tab) === 'audible').length;
  const muted = tabs.filter(tab => audioState(tab) === 'muted').length;
  return [audible ? `${audible} 页正在出声` : '', muted ? `${muted} 页已静音` : ''].filter(Boolean).join(' · ');
}
