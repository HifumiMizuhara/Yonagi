import type { Chat, Message } from '../services/db';

export const chatToMarkdown = (chat: Chat, messages: Message[]) => {
  const lines = [`# ${chat.title}`, '', `> ${new Date(chat.createdAt).toLocaleString()} · ${chat.modelId}`, ''];
  for (const message of messages) {
    const role = message.role === 'user' ? 'User' : message.role === 'assistant' ? 'Assistant' : 'System';
    lines.push(`## ${role}`, '', message.content || '', '');
    if (message.attachments?.length) lines.push(`Attachments: ${message.attachments.map((a) => a.name).join(', ')}`, '');
    if (message.citations?.length) {
      lines.push('Sources:', ...message.citations.map((c) => `- [${c.title || c.url}](${c.url})`), '');
    }
  }
  return lines.join('\n');
};

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 80) || 'chat';

export const downloadText = (name: string, text: string, type = 'text/markdown;charset=utf-8') => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeName(name)}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const printChat = (chat: Chat, messages: Message[]) => {
  const popup = window.open('', '_blank', 'width=900,height=720');
  if (!popup) return;
  const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
  popup.document.write(`<!doctype html><meta charset="utf-8"><title>${escape(chat.title)}</title><style>body{font:16px/1.65 system-ui;max-width:760px;margin:40px auto;padding:0 24px;color:#182230}h2{font-size:14px;margin-top:32px;color:#52606d}pre{white-space:pre-wrap;font:inherit}</style><h1>${escape(chat.title)}</h1>${messages.map((m) => `<h2>${m.role}</h2><pre>${escape(m.content)}</pre>`).join('')}<script>print();<` + '/script>');
  popup.document.close();
};
