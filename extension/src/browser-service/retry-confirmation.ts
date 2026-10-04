export function confirmRetry(): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    const title = document.createElement('h3');
    title.textContent = '上一次相同 AI 请求尚未确认结果';
    const detail = document.createElement('p');
    detail.textContent =
      '页面关闭或网络中断后，服务商仍可能已经处理并计费。重新发送可能再次消耗额度。是否重新发送这一次请求？';
    const cancel = document.createElement('button');
    cancel.textContent = '取消';
    const retry = document.createElement('button');
    retry.textContent = '确认重新发送';
    dialog.style.maxWidth = '480px';
    dialog.style.borderRadius = '12px';
    dialog.append(title, detail, cancel, retry);
    let done = false;
    const finish = (accepted: boolean) => {
      if (done) return;
      done = true;
      dialog.remove();
      resolve(accepted);
    };
    cancel.onclick = () => finish(false);
    retry.onclick = () => finish(true);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(false);
    });
    document.body.append(dialog);
    dialog.showModal();
    cancel.focus();
  });
}
