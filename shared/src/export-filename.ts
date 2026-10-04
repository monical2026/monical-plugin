export function safeTitle(title: string) {
  return (
    title
      .split('')
      .map((char) => (char.charCodeAt(0) < 32 ? '_' : char))
      .join('')
      .replace(/[/\\:*?"<>|]/g, '_')
      .replace(/^[. ]+|[. ]+$/g, '')
      .slice(0, 65) || '视频学习'
  );
}
