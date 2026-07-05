import React, { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { SettingsModal } from './components/SettingsModal';
import { SearchModal } from './components/SearchModal';
import { UnlockModal } from './components/UnlockModal';
import { useChatStore } from './store/useChatStore';
import { useTranslation } from './hooks/useTranslation';
import { X } from 'lucide-react';
import { CommandPalette } from './components/CommandPalette';
import { OnboardingModal } from './components/OnboardingModal';
import { db } from './services/db';

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
  const [commandOpen, setCommandOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  useEffect(() => {
    void init().then(async () => setOnboardingOpen((await db.settings.get('onboardingComplete'))?.value !== true));
  }, [init]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommandOpen(true); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); void useChatStore.getState().createChat(); }
      if (event.key === 'Escape') setCommandOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // iOS Safari doesn't shrink the layout viewport when the on-screen keyboard
  // opens, so `100dvh` stays taller than what's actually visible and the
  // composer/footer can end up hidden behind the keyboard. Track the visual
  // viewport height and cap the app shell height — but only once the
  // keyboard has actually opened. Mobile browsers (Android Chrome in
  // particular) also fire `visualViewport.resize` continuously while their
  // own address bar auto-hides/shows during normal scrolling; reacting to
  // every one of those and mutating layout mid-gesture was cancelling taps
  // (a moving tap target gets treated as a scroll, not a click), which is
  // why the web search toggle stopped responding on Android. Only step in
  // once the visual viewport has shrunk by more than a toolbar animation
  // ever would, and otherwise leave `h-dvh` to handle it natively.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const KEYBOARD_HEIGHT_THRESHOLD = 150;
    const updateHeight = () => {
      const shrunkBy = window.innerHeight - viewport.height;
      if (shrunkBy > KEYBOARD_HEIGHT_THRESHOLD) {
        document.documentElement.style.setProperty('--app-height', `${viewport.height}px`);
      } else {
        document.documentElement.style.removeProperty('--app-height');
      }
    };
    updateHeight();
    viewport.addEventListener('resize', updateHeight);
    return () => viewport.removeEventListener('resize', updateHeight);
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
      {commandOpen && <CommandPalette onClose={() => setCommandOpen(false)} />}
      {onboardingOpen && <OnboardingModal onDone={() => setOnboardingOpen(false)} />}

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
