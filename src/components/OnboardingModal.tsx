import React, { useRef } from 'react';
import { KeyRound, Lock, Sparkles } from 'lucide-react';
import { useChatStore } from '../store/useChatStore';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';

export const OnboardingModal: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const store = useChatStore();
  const ref = useRef<HTMLDivElement>(null);
  useDialogAccessibility(ref, onDone, true);
  const finish = async (openSettings = false) => { await store.updateSetting('onboardingComplete', true); onDone(); if (openSettings) store.setSettingsOpen(true); };
  return <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/55 p-4 backdrop-blur-md">
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="welcome-title" tabIndex={-1} className="w-full max-w-lg rounded-3xl border border-white/20 bg-white p-6 shadow-2xl dark:bg-[#171923]">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-500 text-white flex items-center justify-center"><Sparkles className="w-5 h-5" /></div>
      <h1 id="welcome-title" className="mt-5 text-2xl font-bold tracking-tight dark:text-white">Yonagiへようこそ</h1>
      <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">会話とAPIキーはこの端末に保存されます。まず利用するAIプロバイダーを設定してください。</p>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <div className="rounded-2xl border border-border-light dark:border-border-dark p-4"><Lock className="w-4 h-4 text-blue-500" /><p className="mt-2 text-xs font-bold dark:text-white">ローカル保存</p><p className="mt-1 text-xs text-gray-400">アカウントも独自サーバーも不要です。</p></div>
        <div className="rounded-2xl border border-border-light dark:border-border-dark p-4"><KeyRound className="w-4 h-4 text-violet-500" /><p className="mt-2 text-xs font-bold dark:text-white">APIキーは持ち込み</p><p className="mt-1 text-xs text-gray-400">設定で暗号化も有効にできます。</p></div>
      </div>
      <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2"><button onClick={() => finish(false)} className="min-h-11 px-4 rounded-xl text-xs font-semibold text-gray-500 cursor-pointer">後で設定</button><button onClick={() => finish(true)} className="min-h-11 px-5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 cursor-pointer">プロバイダーを設定</button></div>
    </div>
  </div>;
};
