import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isQuotaExceededError, runDbWrite, StorageQuotaError } from '../src/utils/dbWrite.ts';

describe('dbWrite', () => {
  it('detects quota exceeded errors from Dexie-like wrappers', () => {
    assert.equal(isQuotaExceededError({ name: 'QuotaExceededError' }), true);
    assert.equal(isQuotaExceededError({ inner: { name: 'QuotaExceededError' } }), true);
    assert.equal(isQuotaExceededError(new Error('QuotaExceededError Failed to write')), true);
    assert.equal(isQuotaExceededError(new Error('network error')), false);
  });

  it('maps quota failures to StorageQuotaError', async () => {
    await assert.rejects(
      () => runDbWrite(async () => {
        throw { name: 'QuotaExceededError', message: 'QuotaExceededError' };
      }),
      StorageQuotaError
    );
  });
});
