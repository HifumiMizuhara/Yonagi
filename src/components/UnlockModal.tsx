import React, { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../store/useChatStore';
import { useTranslation } from '../hooks/useTranslation';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';
import { Lock, KeyRound } from 'lucide-react';

/**
 * Shown on startup when API keys are encrypted and not yet unlocked.
 */
export const UnlockModal: React.FC = () => {
  const store = useChatStore();
  const { t } = useTranslation();
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const skipUnlock = store.dismissUnlockPrompt;
  useDialogAccessibility(dialogRef, skipUnlock);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleUnlock = async () => {
    if (!passphrase) return;
    setBusy(true);
    setError(false);
    const ok = await store.unlockKeys(passphrase);
    setBusy(false);
    if (!ok) {
      setError(true);
      setPassphrase('');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in touch-none overscroll-none">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="unlock-dialog-title"
        tabIndex={-1}
        className="relative flex flex-col w-full max-w-sm bg-card-light/95 dark:bg-sidebar-dark/95 border border-border-light/80 dark:border-border-dark/80 rounded-3xl shadow-2xl shadow-black/40 overflow-hidden font-sans backdrop-blur-2xl p-7 space-y-5 touch-none"
      >
        <div className="flex flex-col items-center text-center space-y-3 select-none">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-yellow-400/20 flex items-center justify-center text-amber-600 dark:text-amber-500 border border-amber-500/20">
            <Lock className="w-7 h-7" />
          </div>
	          <h2 id="unlock-dialog-title" className="text-lg font-bold text-gray-900 dark:text-gray-50 font-heading">{t.unlockTitle}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{t.unlockDesc}</p>
        </div>

        <div className="relative">
          <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            ref={inputRef}
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
	            placeholder={t.passphrase}
	            aria-label={t.passphrase}
            className="w-full pl-10 pr-3 py-2.5 text-sm bg-bg-light dark:bg-bg-dark border border-border-light dark:border-border-dark rounded-xl focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10 dark:text-gray-100"
          />
        </div>

        {error && (
          <p role="alert" className="text-xs text-red-500 font-semibold text-center -mt-2">{t.wrongPassphrase}</p>
        )}

        <div className="flex space-x-2">
          <button
            onClick={handleUnlock}
            disabled={busy || !passphrase}
            className="min-h-11 flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold cursor-pointer transition-colors shadow-sm"
          >
            {t.unlock}
          </button>
          <button
	            onClick={skipUnlock}
            className="min-h-11 px-4 py-2.5 bg-gray-100 dark:bg-card-dark text-gray-700 dark:text-gray-300 rounded-xl text-sm font-bold cursor-pointer transition-colors"
          >
            {t.skipUnlock}
          </button>
        </div>
      </div>
    </div>
  );
};
