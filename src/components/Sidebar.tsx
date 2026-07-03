import React, { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../store/useChatStore';
import { useTranslation } from '../hooks/useTranslation';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';
import { type Chat } from '../services/db';
import {
  MessageSquare, Plus, Settings, Trash2, Edit2, Check, X, PanelLeftClose, PanelLeft, MessageCircle, Search, FolderPlus, Folder, FolderOpen, ChevronRight, ChevronDown, MoreHorizontal
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const store = useChatStore();
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [pendingDeleteChatId, setPendingDeleteChatId] = useState<string | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  useDialogAccessibility(deleteDialogRef, () => setPendingDeleteChatId(null), !!pendingDeleteChatId);

  // Folder state
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [pendingDeleteFolderId, setPendingDeleteFolderId] = useState<string | null>(null);
  const [folderMenuChatId, setFolderMenuChatId] = useState<string | null>(null);
  const deleteFolderDialogRef = useRef<HTMLDivElement>(null);
  useDialogAccessibility(deleteFolderDialogRef, () => setPendingDeleteFolderId(null), !!pendingDeleteFolderId);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleCreateFolder = async () => {
    if (newFolderName.trim()) {
      await store.createFolder(newFolderName.trim());
      setNewFolderName('');
      setCreatingFolder(false);
    }
  };

  const handleSaveFolderRename = async (folderId: string) => {
    if (editFolderName.trim()) {
      await store.renameFolder(folderId, editFolderName.trim());
    }
    setEditingFolderId(null);
  };

  const handleMoveChatToFolder = async (chatId: string, folderId: string | null) => {
    await store.moveChatToFolder(chatId, folderId);
    setFolderMenuChatId(null);
  };

  // Close folder menu on outside click
  useEffect(() => {
    if (!folderMenuChatId) return;
    const handler = () => setFolderMenuChatId(null);
    const timer = setTimeout(() => document.addEventListener('click', handler), 0);
    return () => { clearTimeout(timer); document.removeEventListener('click', handler); };
  }, [folderMenuChatId]);

  const handleStartRename = (chat: Chat, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(chat.id);
    setEditTitle(chat.title);
  };

  const handleSaveRename = async (chatId: string, e: React.SyntheticEvent) => {
    e.stopPropagation();
    if (editTitle.trim()) {
      await store.renameChat(chatId, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleCancelRename = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteChatId(chatId);
  };

  const groupChats = (chats: Chat[]) => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    const startOf7DaysAgo = startOfToday - 7 * 24 * 60 * 60 * 1000;

    const today: Chat[] = [];
    const yesterday: Chat[] = [];
    const last7Days: Chat[] = [];
    const older: Chat[] = [];

    for (const chat of chats) {
      const time = chat.updatedAt;
      if (time >= startOfToday) today.push(chat);
      else if (time >= startOfYesterday) yesterday.push(chat);
      else if (time >= startOf7DaysAgo) last7Days.push(chat);
      else older.push(chat);
    }

    return [
      { label: t.groupToday, items: today },
      { label: t.groupYesterday, items: yesterday },
      { label: t.groupLast7Days, items: last7Days },
      { label: t.groupOlder, items: older },
    ];
  };

  const renderChatItem = (chat: Chat) => {
    const isActive = store.activeChatId === chat.id;
    const isEditing = editingId === chat.id;
    const showFolderMenu = folderMenuChatId === chat.id;
    const isGenerating = store.isChatGenerating(chat.id);

    return (
      <div
        key={chat.id}
        className={`group relative flex items-center w-full min-h-11 rounded-xl text-xs transition-all duration-150 overflow-hidden ${
          isActive
            ? 'bg-white/90 dark:bg-white/6 text-blue-700 dark:text-sky-300 font-semibold shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:bg-white/70 dark:hover:bg-white/4 hover:text-gray-900 dark:hover:text-gray-100'
        }`}
      >
        {isEditing ? (
          <>
            <MessageSquare className="w-3.5 h-3.5 ml-3 mr-2.5 shrink-0 text-blue-500" />
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveRename(chat.id, e);
                if (e.key === 'Escape') handleCancelRename(e);
              }}
              autoFocus
              className="flex-1 min-w-0 bg-transparent border-b border-blue-500 focus:outline-none text-gray-900 dark:text-gray-100 text-xs py-0.5 font-normal"
            />
          </>
        ) : (
          <button
            type="button"
            onClick={() => handleSelectChat(chat.id)}
            aria-current={isActive ? 'page' : undefined}
            className="min-h-11 w-full flex items-center px-3 pr-[6.75rem] md:pr-28 rounded-xl text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            <MessageSquare className={`w-3.5 h-3.5 mr-2.5 shrink-0 transition-colors ${
              isActive ? 'text-blue-500 dark:text-sky-400' : 'text-gray-400 dark:text-gray-600 group-hover:text-gray-500'
            }`} />
            <span className="flex-1 truncate leading-tight">
              {chat.title === 'New Chat' ? t.newChat : chat.title}
            </span>
            {isGenerating && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shrink-0 ml-1.5" aria-hidden="true" />
            )}
          </button>
        )}

        {!isEditing && (
          <div className="hover-action absolute right-2 inset-y-0 flex items-center space-x-0 transition-opacity duration-150">
            <button
              onClick={(e) => { e.stopPropagation(); setFolderMenuChatId(showFolderMenu ? null : chat.id); }}
              aria-label={t.moveToFolder}
              className="min-w-9 h-full md:min-w-9 md:h-9 flex items-center justify-center text-gray-400 hover:text-blue-600 dark:hover:text-sky-400 hover:bg-white/80 dark:hover:bg-white/8 rounded-md cursor-pointer transition-colors"
            >
              <MoreHorizontal className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => handleStartRename(chat, e)}
              aria-label={t.rename}
              className="min-w-9 h-full md:min-w-9 md:h-9 flex items-center justify-center text-gray-400 hover:text-blue-600 dark:hover:text-sky-400 hover:bg-white/80 dark:hover:bg-white/8 rounded-md cursor-pointer transition-colors"
            >
              <Edit2 className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => handleDeleteChat(chat.id, e)}
              aria-label={t.delete}
              className="min-w-9 h-full md:min-w-9 md:h-9 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-md cursor-pointer transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}

        {isEditing && (
          <div className="flex items-stretch space-x-0.5 ml-1 mr-1 shrink-0">
            <button
              onClick={(e) => handleSaveRename(chat.id, e)}
              aria-label={t.save}
              className="min-w-9 px-1 text-accent-green hover:bg-accent-green/10 rounded-md cursor-pointer flex items-center justify-center"
            >
              <Check className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => handleCancelRename(e)}
              aria-label={t.cancel}
              className="min-w-9 px-1 text-red-500 hover:bg-red-500/10 rounded-md cursor-pointer flex items-center justify-center"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Folder move dropdown */}
        {showFolderMenu && (
          <div className="absolute right-0 top-full z-50 mt-1 w-40 bg-card-light/98 dark:bg-card-dark/98 border border-border-light dark:border-border-dark rounded-2xl shadow-lg py-1 animate-scale-up backdrop-blur-xl">
            {store.folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => handleMoveChatToFolder(chat.id, folder.id)}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-white/80 dark:hover:bg-white/5 flex items-center gap-2 cursor-pointer transition-colors ${chat.folderId === folder.id ? 'text-blue-600 dark:text-sky-400 font-semibold' : 'text-gray-600 dark:text-gray-300'}`}
              >
                <Folder className="w-3 h-3" />
                {folder.name}
              </button>
            ))}
            {chat.folderId && (
              <button
                onClick={() => handleMoveChatToFolder(chat.id, null)}
                className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-2 cursor-pointer border-t border-border-light dark:border-border-dark transition-colors"
              >
                <X className="w-3 h-3" />
                {t.removeFromFolder}
              </button>
            )}
            {store.folders.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-400 italic">{t.noHistory}</div>
            )}
          </div>
        )}
      </div>
    );
  };

  const closeOnMobile = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      store.toggleSidebar();
    }
  };

  const handleSelectChat = (chatId: string) => {
    store.selectChat(chatId);
    closeOnMobile();
  };

  const handleNewChat = () => {
    store.createChat();
    closeOnMobile();
  };

  if (!store.sidebarOpen) {
    return (
      <div className="absolute left-5 top-5 z-40">
        <button
          onClick={store.toggleSidebar}
          aria-label={t.openSidebar}
          className="gemini-chip min-w-11 min-h-11 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-sky-400 rounded-2xl cursor-pointer transition-all duration-200 backdrop-blur-xl"
          title={t.openSidebar}
        >
          <PanelLeft className="w-4.5 h-4.5" />
        </button>
      </div>
    );
  }

  return (
    <>
      {pendingDeleteChatId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div
            ref={deleteDialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-chat-dialog-title"
            tabIndex={-1}
            className="w-full max-w-sm rounded-2xl border border-border-light dark:border-border-dark bg-card-light dark:bg-sidebar-dark p-5 shadow-2xl animate-scale-up"
          >
            <p id="delete-chat-dialog-title" className="text-sm font-semibold leading-relaxed text-gray-800 dark:text-gray-100">{t.deleteChatConfirm}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteChatId(null)}
                className="min-h-11 px-4 py-2 rounded-xl border border-border-light dark:border-border-dark text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-sky-400 cursor-pointer transition-colors"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const chatId = pendingDeleteChatId;
                  setPendingDeleteChatId(null);
                  await store.deleteChat(chatId);
                }}
                className="min-h-11 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-xs font-semibold text-white cursor-pointer transition-colors"
              >
                {t.delete}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteFolderId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div
            ref={deleteFolderDialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-folder-dialog-title"
            tabIndex={-1}
            className="w-full max-w-sm rounded-2xl border border-border-light dark:border-border-dark bg-card-light dark:bg-sidebar-dark p-5 shadow-2xl animate-scale-up"
          >
            <p id="delete-folder-dialog-title" className="text-sm font-semibold leading-relaxed text-gray-800 dark:text-gray-100">{t.deleteFolderConfirm}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteFolderId(null)}
                className="min-h-11 px-4 py-2 rounded-xl border border-border-light dark:border-border-dark text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-sky-400 cursor-pointer transition-colors"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const folderId = pendingDeleteFolderId;
                  setPendingDeleteFolderId(null);
                  await store.deleteFolder(folderId);
                }}
                className="min-h-11 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-xs font-semibold text-white cursor-pointer transition-colors"
              >
                {t.delete}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile overlay backdrop */}
      <div onClick={store.toggleSidebar} className="md:hidden fixed inset-0 bg-slate-950/20 backdrop-blur-sm z-40" />

      <div className="fixed md:relative inset-y-0 left-0 w-72 max-w-[84vw] h-full md:h-auto md:rounded-[2rem] bg-sidebar-light dark:bg-sidebar-dark md:bg-sidebar-light/92 md:dark:bg-sidebar-dark/88 md:backdrop-blur-2xl border border-white/60 dark:border-white/8 md:shadow-[0_16px_40px_rgba(148,163,184,0.16)] md:dark:shadow-[0_20px_50px_rgba(0,0,0,0.35)] flex flex-col z-50 md:z-40 overflow-hidden">

        {/* Sidebar Header */}
        <div className="flex items-center justify-between gap-1 px-3 md:px-4 py-3 md:py-4 border-b border-border-light/50 dark:border-border-dark/60 select-none shrink-0 min-w-0">
          <div className="flex items-center space-x-2 min-w-0 shrink">
            <div className="relative w-8 h-8 flex items-center justify-center bg-gradient-to-tr from-blue-500 via-violet-500 to-sky-400 rounded-xl shadow-sm shadow-blue-500/25 border border-white/40">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-white fill-current" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2.25a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V3a.75.75 0 0 1 .75-.75ZM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5a.75.75 0 0 1 .75-.75ZM5.106 5.106a.75.75 0 0 1 1.06 0l1.06 1.06a.75.75 0 0 1-1.06 1.06l-1.06-1.06a.75.75 0 0 1 0-1.06Zm11.668 11.668a.75.75 0 0 1 1.06 0l1.06 1.06a.75.75 0 0 1-1.06 1.06l-1.06-1.06a.75.75 0 0 1 0-1.06ZM2.25 12a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5H3a.75.75 0 0 1-.75-.75Zm15.5 0a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75ZM5.106 18.894a.75.75 0 0 1 0-1.06l1.06-1.06a.75.75 0 1 1 1.06 1.06l-1.06 1.06a.75.75 0 0 1-1.06 0Zm11.668-11.668a.75.75 0 0 1 0-1.06l1.06-1.06a.75.75 0 1 1 1.06 1.06l-1.06 1.06a.75.75 0 0 1-1.06 0Z" />
              </svg>
            </div>
            <span className="font-bold text-gray-900 dark:text-gray-50 text-sm tracking-wide font-heading truncate">Himawari</span>
          </div>

          <div className="flex items-center shrink-0 -mr-1 md:mr-0">
            <button
              onClick={() => store.setSettingsOpen(true)}
              aria-label={t.settings}
              className="min-w-9 min-h-9 md:min-w-11 md:min-h-11 md:hidden flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-sky-400 hover:bg-white/80 dark:hover:bg-white/6 rounded-xl cursor-pointer transition-colors"
              title={t.settings}
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={() => store.setSearchOpen(true)}
              aria-label={t.search}
              className="min-w-9 min-h-9 md:min-w-11 md:min-h-11 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-sky-400 hover:bg-white/80 dark:hover:bg-white/6 rounded-xl cursor-pointer transition-colors"
              title={t.search}
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              onClick={handleNewChat}
              aria-label={t.newChat}
              className="min-w-9 min-h-9 md:min-w-11 md:min-h-11 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-sky-400 hover:bg-white/80 dark:hover:bg-white/6 rounded-xl cursor-pointer transition-colors"
              title={t.newChat}
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={store.toggleSidebar}
              aria-label={t.close}
              className="min-w-9 min-h-9 md:min-w-11 md:min-h-11 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-sky-400 hover:bg-white/80 dark:hover:bg-white/6 rounded-xl cursor-pointer transition-colors"
              title={t.close}
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable chat list */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 md:px-2.5 pt-3 pb-3 space-y-3">
          {/* Folder creation input */}
          {creatingFolder && (
            <div className="flex items-center gap-1 px-2 py-1">
              <Folder className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder();
                  if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); }
                }}
                placeholder={t.folderNamePlaceholder}
                autoFocus
                className="flex-1 min-w-0 bg-transparent border-b border-blue-500 focus:outline-none text-gray-900 dark:text-gray-100 text-xs py-0.5"
              />
              <button onClick={handleCreateFolder} aria-label={t.save} className="min-w-9 min-h-9 flex items-center justify-center text-accent-green hover:bg-accent-green/10 rounded-md cursor-pointer"><Check className="w-3 h-3" /></button>
              <button onClick={() => { setCreatingFolder(false); setNewFolderName(''); }} aria-label={t.cancel} className="min-w-9 min-h-9 flex items-center justify-center text-red-500 hover:bg-red-500/10 rounded-md cursor-pointer"><X className="w-3 h-3" /></button>
            </div>
          )}

          {/* New folder button */}
          {!creatingFolder && (
            <button
              onClick={() => setCreatingFolder(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-sky-400 uppercase tracking-widest cursor-pointer transition-colors"
            >
              <FolderPlus className="w-3 h-3" />
              {t.newFolder}
            </button>
          )}

          {store.chats.length === 0 && store.folders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-36 text-center text-xs text-gray-400 dark:text-gray-500 px-4 space-y-2 select-none animate-pulse-slow">
              <MessageCircle className="w-7 h-7 stroke-[1.2] text-blue-500/40" />
              <p className="font-medium">{t.noHistory}</p>
            </div>
          ) : (
            <>
              {/* Folders */}
              {store.folders.map((folder) => {
                const folderChats = store.chats.filter(c => c.folderId === folder.id);
                const isExpanded = expandedFolders.has(folder.id);
                const isEditingFolder = editingFolderId === folder.id;

                return (
                  <div key={folder.id} className="space-y-0.5">
                    <div className="group flex items-center min-h-11 md:min-h-9 px-2 rounded-xl hover:bg-white/70 dark:hover:bg-white/4 transition-colors">
                      {isEditingFolder ? (
                        <div className="flex items-center gap-1 flex-1 min-w-0">
                          <Folder className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <input
                            type="text"
                            value={editFolderName}
                            onChange={(e) => setEditFolderName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveFolderRename(folder.id);
                              if (e.key === 'Escape') setEditingFolderId(null);
                            }}
                            autoFocus
                            className="flex-1 min-w-0 bg-transparent border-b border-blue-500 focus:outline-none text-gray-900 dark:text-gray-100 text-xs py-0.5"
                          />
                          <button onClick={() => handleSaveFolderRename(folder.id)} aria-label={t.save} className="min-w-9 min-h-9 flex items-center justify-center text-accent-green hover:bg-accent-green/10 rounded-md cursor-pointer"><Check className="w-3 h-3" /></button>
                          <button onClick={() => setEditingFolderId(null)} aria-label={t.cancel} className="min-w-9 min-h-9 flex items-center justify-center text-red-500 hover:bg-red-500/10 rounded-md cursor-pointer"><X className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => toggleFolder(folder.id)}
                            className="flex items-center gap-1.5 flex-1 min-w-0 py-1 cursor-pointer"
                          >
                            {isExpanded ? <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" /> : <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />}
                            {isExpanded ? <FolderOpen className="w-3.5 h-3.5 text-blue-500 shrink-0" /> : <Folder className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 truncate">{folder.name}</span>
                            <span className="text-[9px] text-gray-400 dark:text-gray-600 ml-1">{folderChats.length}</span>
                          </button>
                          <div className="hover-action flex space-x-0.5 transition-opacity duration-150">
                            <button
                              onClick={() => { setEditingFolderId(folder.id); setEditFolderName(folder.name); }}
                              aria-label={t.renameFolder}
                              className="min-w-9 h-full md:h-9 flex items-center justify-center text-gray-400 hover:text-blue-600 dark:hover:text-sky-400 hover:bg-white/80 dark:hover:bg-white/8 rounded-md cursor-pointer transition-colors"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => setPendingDeleteFolderId(folder.id)}
                              aria-label={t.deleteFolder}
                              className="min-w-9 h-full md:h-9 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-md cursor-pointer transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    {isExpanded && folderChats.length > 0 && (
                      <div className="ml-4 space-y-0.5">
                        {folderChats.map((chat) => renderChatItem(chat))}
                      </div>
                    )}
                    {isExpanded && folderChats.length === 0 && (
                      <div className="ml-6 text-[10px] text-gray-400 dark:text-gray-600 py-1 italic select-none">
                        {t.noHistory}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Uncategorized chats grouped by date */}
              {(() => {
                const uncategorizedChats = store.chats.filter(c => !c.folderId);
                if (uncategorizedChats.length === 0) return null;
                const grouped = groupChats(uncategorizedChats);
                return grouped.map(({ label, items }) => {
                  if (items.length === 0) return null;
                  return (
                    <div key={label} className="space-y-0.5">
                      <h4 className="text-[10px] font-bold text-gray-400/60 dark:text-gray-600 uppercase tracking-widest px-3 py-1 select-none">
                        {label}
                      </h4>
                      {items.map((chat) => renderChatItem(chat))}
                    </div>
                  );
                });
              })()}
            </>
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="hidden md:block p-3 border-t border-border-light/50 dark:border-border-dark/60 shrink-0">
          <button
            onClick={() => store.setSettingsOpen(true)}
              className="min-h-11 flex items-center space-x-2.5 w-full px-3 py-2.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-sky-400 hover:bg-white/70 dark:hover:bg-white/4 rounded-2xl cursor-pointer transition-all duration-200"
          >
            <Settings className="w-4 h-4 shrink-0" />
            <span className="font-semibold text-xs tracking-wide">{t.settings}</span>
          </button>
        </div>

      </div>
    </>
  );
};
