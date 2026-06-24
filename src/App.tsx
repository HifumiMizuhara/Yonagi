import React, { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { SettingsModal } from './components/SettingsModal';
import { useChatStore } from './store/useChatStore';

const App: React.FC = () => {
  const store = useChatStore();

  useEffect(() => {
    // Load setting config and previous chats on mount
    store.init();
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-light dark:bg-bg-dark text-gray-800 dark:text-gray-100 font-sans antialiased">
      {/* Sidebar history panel */}
      <Sidebar />

      {/* Main chat window */}
      <ChatArea />

      {/* Settings Modal Overlay */}
      {store.settingsOpen && (
        <SettingsModal onClose={() => store.setSettingsOpen(false)} />
      )}
    </div>
  );
};

export default App;
