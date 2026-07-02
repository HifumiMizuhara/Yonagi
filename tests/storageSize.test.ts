import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  estimateMessageBytes,
  estimateObjectBytes,
  formatBytes,
  formatPercent,
  utf8ByteLength,
} from '../src/utils/storageSize.ts';
import type { Message } from '../src/services/db.ts';

describe('storageSize', () => {
  it('counts UTF-8 bytes', () => {
    assert.equal(utf8ByteLength('abc'), 3);
    assert.equal(utf8ByteLength('あ'), 3);
  });

  it('estimates serialized object size', () => {
    const bytes = estimateObjectBytes({ hello: 'world' });
    assert.ok(bytes > 0);
  });

  it('includes attachments and variants in message size', () => {
    const message: Message = {
      id: 'm1',
      chatId: 'c1',
      role: 'user',
      content: 'hello',
      timestamp: 1,
      attachments: [{ name: 'img.png', type: 'image', content: 'data:image/png;base64,AAAA', size: 4 }],
      variants: [{ id: 'v1', content: 'variant', timestamp: 2 }],
    };
    const base = estimateMessageBytes({ ...message, attachments: undefined, variants: undefined });
    const full = estimateMessageBytes(message);
    assert.ok(full > base);
  });

  it('formats byte sizes', () => {
    assert.equal(formatBytes(512), '512 B');
    assert.equal(formatBytes(2048), '2 KB');
    assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
  });

  it('formats percentages', () => {
    assert.equal(formatPercent(25, 100), '25%');
    assert.equal(formatPercent(0, 0), '0%');
  });
});
