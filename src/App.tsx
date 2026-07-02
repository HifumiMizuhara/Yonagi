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

  return (
    <div className="flex h-dvh w-screen overflow-hidden bg-bg-light dark:bg-bg-dark text-gray-800 dark:text-gray-100 font-sans antialiased">
      {/* Sidebar history panel */}
      <Sidebar />

      {/* Main chat window */}
      <ChatArea />

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
