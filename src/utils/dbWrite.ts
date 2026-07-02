export class StorageQuotaError extends Error {
  constructor() {
    super('Storage quota exceeded');
    this.name = 'StorageQuotaError';
  }
}

export function isQuotaExceededError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const candidate = error as { name?: string; message?: string; inner?: unknown };
  if (candidate.name === 'QuotaExceededError' || candidate.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return true;
  }

  if (candidate.inner) {
    return isQuotaExceededError(candidate.inner);
  }

  const message = String(candidate.message || '');
  return /quota/i.test(message);
}

export async function runDbWrite<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isQuotaExceededError(error)) {
      throw new StorageQuotaError();
    }
    throw error;
  }
}
