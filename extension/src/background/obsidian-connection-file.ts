export async function downloadObsidianConnection() {
  const content = JSON.stringify({
    kind: 'videonote-connection',
    version: 1,
    extensionId: chrome.runtime.id,
  });
  try {
    return await chrome.downloads.download({
      url: `data:application/json;charset=utf-8,${encodeURIComponent(content)}`,
      filename: 'VideoNote-connection.json',
      saveAs: true,
      conflictAction: 'uniquify',
    });
  } catch (error) {
    if (error instanceof Error && /cancel/i.test(error.message)) return null;
    throw error;
  }
}
