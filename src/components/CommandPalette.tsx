import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Plus, Search, Settings, X } from 'lucide-react';
import { useChatStore } from '../store/useChatStore';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';

export const CommandPalette: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const store = useChatStore();
  const [query, setQuery] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useDialogAccessibility(dialogRef, onClose, true);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const chats = store.chats.filter((chat) => chat.title.toLowerCase().includes(query.toLowerCase())).slice(0, 8);
  const run = (action: () => unknown | Promise<unknown>) => { void action(); onClose(); };
  return <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/45 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="コマンドパレット" tabIndex={-1} className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/20 bg-white/95 shadow-2xl dark:bg-[#171923]/95">
      <div className="flex items-center gap-3 border-b border-border-light dark:border-border-dark px-4">
        <Search className="w-4 h-4 text-gray-400" />
        <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="チャットまたはコマンドを検索…" className="min-h-14 flex-1 bg-transparent text-base outline-none dark:text-white" />
        <button onClick={onClose} aria-label="閉じる" className="min-w-11 min-h-11 flex items-center justify-center rounded-xl cursor-pointer"><X className="w-4 h-4" /></button>
      </div>
      <div className="max-h-[55vh] overflow-y-auto p-2">
        {!query && <>
          <PaletteItem icon={<Plus />} label="新しいチャット" hint="⌘ N" onClick={() => run(() => store.createChat())} />
          <PaletteItem icon={<Search />} label="全メッセージを検索" onClick={() => run(() => store.setSearchOpen(true))} />
          <PaletteItem icon={<Settings />} label="設定を開く" onClick={() => run(() => store.setSettingsOpen(true))} />
        </>}
        {chats.map((chat) => <PaletteItem key={chat.id} icon={<MessageSquare />} label={chat.title} onClick={() => run(() => store.selectChat(chat.id))} />)}
        {query && chats.length === 0 && <p className="p-6 text-center text-sm text-gray-400">一致するチャットがありません</p>}
      </div>
    </div>
  </div>;
};

const PaletteItem: React.FC<{ icon: React.ReactNode; label: string; hint?: string; onClick: () => void }> = ({ icon, label, hint, onClick }) => <button type="button" onClick={onClick} className="w-full min-h-12 flex items-center gap-3 rounded-xl px-3 text-left text-sm text-gray-700 hover:bg-blue-500/8 hover:text-blue-600 dark:text-gray-200 cursor-pointer">
  <span className="[&>svg]:w-4 [&>svg]:h-4 text-gray-400">{icon}</span><span className="flex-1 truncate">{label}</span>{hint && <kbd className="text-[10px] text-gray-400">{hint}</kbd>}
</button>;
