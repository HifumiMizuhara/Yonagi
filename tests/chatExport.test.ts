import test from 'node:test';
import assert from 'node:assert/strict';
import { chatToMarkdown } from '../src/utils/chatExport.ts';
import type { Chat, Message } from '../src/services/db.ts';

test('chatToMarkdown exports roles, attachments, and citations', () => {
  const chat: Chat = { id: 'c1', title: 'Review', modelId: 'model', temperature: 0.7, createdAt: 0, updatedAt: 0 };
  const messages: Message[] = [
    { id: 'm1', chatId: 'c1', role: 'user', content: 'Hello', timestamp: 1, attachments: [{ name: 'brief.pdf', type: 'pdf', content: 'text', size: 4 }] },
    { id: 'm2', chatId: 'c1', role: 'assistant', content: 'Answer', timestamp: 2, citations: [{ title: 'Source', url: 'https://example.com' }] },
  ];
  const markdown = chatToMarkdown(chat, messages);
  assert.match(markdown, /# Review/);
  assert.match(markdown, /Attachments: brief\.pdf/);
  assert.match(markdown, /\[Source\]\(https:\/\/example\.com\)/);
});
