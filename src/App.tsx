import React, { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { SettingsModal } from './components/SettingsModal';
import { SearchModal } from './components/SearchModal';
import { UnlockModal } from './components/UnlockModal';
import { useChatStore } from './store/useChatStore';

const App: React.FC = () => {
  const init = useChatStore((state) => state.init);
  const settingsOpen = useChatStore((state) => state.settingsOpen);
  const searchOpen = useChatStore((state) => state.searchOpen);
  const keysLocked = useChatStore((state) => state.keysLocked);
  const setSettingsOpen = useChatStore((state) => state.setSettingsOpen);
  const setSearchOpen = useChatStore((state) => state.setSearchOpen);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-light dark:bg-bg-dark text-gray-800 dark:text-gray-100 font-sans antialiased">
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
      {keysLocked && <UnlockModal />}
    </div>
  );
};

export default App;
