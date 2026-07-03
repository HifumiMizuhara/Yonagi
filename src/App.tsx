import React, { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { SettingsModal } from './components/SettingsModal';
import { SearchModal } from './components/SearchModal';
import { UnlockModal } from './components/UnlockModal';
import { useChatStore } from './store/useChatStore';
import { useTranslation } from './hooks/useTranslation';
import { X } from 'lucide-react';

const App: React.FC = () => {
  const { t } = useTranslation();
  const init = useChatStore((state) => state.init);
  const settingsOpen = useChatStore((state) => state.settingsOpen);
  const searchOpen = useChatStore((state) => state.searchOpen);
  const keysLocked = useChatStore((state) => state.keysLocked);
  const unlockPromptOpen = useChatStore((state) => state.unlockPromptOpen);
  const storageNotice = useChatStore((state) => state.storageNotice);
  const setSettingsOpen = useChatStore((state) => state.setSettingsOpen);
  const setSearchOpen = useChatStore((state) => state.setSearchOpen);
  const clearStorageNotice = useChatStore((state) => state.clearStorageNotice);

  useEffect(() => {
    void init();
  }, [init]);

  // iOS Safari doesn't shrink the layout viewport when the on-screen keyboard
  // opens, so `100dvh` stays taller than what's actually visible and the
  // composer/footer can end up hidden behind the keyboard. Track the visual
  // viewport height explicitly and use it to cap the app shell height.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const updateHeight = () => {
      document.documentElement.style.setProperty('--app-height', `${viewport.height}px`);
    };
    updateHeight();
    viewport.addEventListener('resize', updateHeight);
    viewport.addEventListener('scroll', updateHeight);
    return () => {
      viewport.removeEventListener('resize', updateHeight);
      viewport.removeEventListener('scroll', updateHeight);
    };
  }, []);

  return (
    <div className="app-shell flex h-dvh w-screen overflow-hidden text-gray-800 dark:text-gray-100 font-sans antialiased" style={{ height: 'var(--app-height, 100dvh)' }}>

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-sky-200/35 blur-3xl dark:bg-sky-500/10" />
      </div>

      <div className="relative flex h-full w-full overflow-hidden p-2 sm:p-3">
        {/* Sidebar history panel */}
        <Sidebar />

        {/* Main chat window */}
        <ChatArea />
      </div>

      {/* Settings Modal Overlay */}
      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} />
      )}

      {/* Global message search */}
      {searchOpen && (
        <SearchModal onClose={() => setSearchOpen(false)} />
      )}

      {/* API key unlock prompt on startup */}
      {keysLocked && unlockPromptOpen && <UnlockModal />}

      {storageNotice && (
        <div className="fixed bottom-4 left-1/2 z-[90] w-[min(92vw,36rem)] -translate-x-1/2">
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200/70 dark:border-red-800/50 bg-red-50/95 dark:bg-red-950/90 px-4 py-3 text-sm text-red-700 dark:text-red-300 shadow-2xl backdrop-blur-md">
            <p className="flex-1 leading-relaxed">{storageNotice}</p>
            <button
              type="button"
              onClick={clearStorageNotice}
              aria-label={t.close}
              className="shrink-0 rounded-lg p-1 hover:bg-red-100 dark:hover:bg-red-900/40 cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
