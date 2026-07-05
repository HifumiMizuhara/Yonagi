import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Plus, Search, Settings, X } from 'lucide-react';
import { useChatStore } from '../store/useChatStore';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';
import { useTranslation } from '../hooks/useTranslation';

interface PaletteAction {
  id: string;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  run: () => unknown | Promise<unknown>;
}

export const CommandPalette: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const store = useChatStore();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useDialogAccessibility(dialogRef, onClose, true);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const items = useMemo<PaletteAction[]>(() => {
    const commands: PaletteAction[] = [
      { id: 'new-chat', icon: <Plus />, label: t.newChat, hint: '⌘ N', run: () => store.createChat() },
      { id: 'search', icon: <Search />, label: t.searchMessagesCommand, run: () => store.setSearchOpen(true) },
      { id: 'settings', icon: <Settings />, label: t.openSettingsCommand, run: () => store.setSettingsOpen(true) },
    ];
    const matchingCommands = commands.filter((command) => !normalizedQuery || command.label.toLocaleLowerCase().includes(normalizedQuery));
    const matchingChats = store.chats
      .filter((chat) => !normalizedQuery || chat.title.toLocaleLowerCase().includes(normalizedQuery))
      .slice(0, 8)
      .map((chat) => ({ id: `chat:${chat.id}`, icon: <MessageSquare />, label: chat.title, run: () => store.selectChat(chat.id) }));
    return [...matchingCommands, ...matchingChats];
  }, [normalizedQuery, store, t]);
  const run = (action: () => unknown | Promise<unknown>) => { void action(); onClose(); };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!items.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + items.length) % items.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(items[activeIndex]?.run ?? items[0].run);
    }
  };
  return <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/45 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t.commandPalette} tabIndex={-1} className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/20 bg-white/95 shadow-2xl dark:bg-[#171923]/95">
      <div className="flex items-center gap-3 border-b border-border-light dark:border-border-dark px-4">
        <Search className="w-4 h-4 text-gray-400" />
        <input ref={inputRef} value={query} onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }} onKeyDown={handleKeyDown} placeholder={t.commandPalettePlaceholder} role="combobox" aria-expanded="true" aria-controls="command-palette-list" aria-activedescendant={items[activeIndex]?.id} className="min-h-14 flex-1 bg-transparent text-base outline-none dark:text-white" />
        <button onClick={onClose} aria-label={t.close} className="min-w-11 min-h-11 flex items-center justify-center rounded-xl cursor-pointer"><X className="w-4 h-4" /></button>
      </div>
      <div id="command-palette-list" role="listbox" className="max-h-[55vh] overflow-y-auto p-2">
        {items.map((item, index) => <PaletteItem key={item.id} id={item.id} icon={item.icon} label={item.label} hint={item.hint} active={index === activeIndex} onPointerMove={() => setActiveIndex(index)} onClick={() => run(item.run)} />)}
        {items.length === 0 && <p className="p-6 text-center text-sm text-gray-400">{t.commandPaletteNoResults}</p>}
      </div>
    </div>
  </div>;
};

const PaletteItem: React.FC<{ id: string; icon: React.ReactNode; label: string; hint?: string; active: boolean; onPointerMove: () => void; onClick: () => void }> = ({ id, icon, label, hint, active, onPointerMove, onClick }) => <button id={id} type="button" role="option" aria-selected={active} onPointerMove={onPointerMove} onClick={onClick} className={`w-full min-h-12 flex items-center gap-3 rounded-xl px-3 text-left text-sm dark:text-gray-200 cursor-pointer transition-colors ${active ? 'bg-blue-500/10 text-blue-600 dark:text-sky-400' : 'text-gray-700 hover:bg-blue-500/8 hover:text-blue-600'}`}>
  <span className="[&>svg]:w-4 [&>svg]:h-4 text-gray-400">{icon}</span><span className="flex-1 truncate">{label}</span>{hint && <kbd className="text-[10px] text-gray-400">{hint}</kbd>}
</button>;
