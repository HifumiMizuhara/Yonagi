import React, { useRef, useState } from 'react';
import { useChatStore } from '../store/useChatStore';
import { useTranslation } from '../hooks/useTranslation';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';
import { type Chat } from '../services/db';
import {
  MessageSquare, Plus, Settings, Trash2, Edit2, Check, X, PanelLeftClose, PanelLeft, MessageCircle, Search
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const store = useChatStore();
  const { t, language } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [pendingDeleteChatId, setPendingDeleteChatId] = useState<string | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  useDialogAccessibility(deleteDialogRef, () => setPendingDeleteChatId(null), !!pendingDeleteChatId);

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
    const today: Chat[] = [];
    const yesterday: Chat[] = [];
    const last7Days: Chat[] = [];
    const older: Chat[] = [];

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    const startOf7DaysAgo = startOfToday - 7 * 24 * 60 * 60 * 1000;

    chats.forEach((chat) => {
      const time = chat.updatedAt;
      if (time >= startOfToday) {
        today.push(chat);
      } else if (time >= startOfYesterday) {
        yesterday.push(chat);
      } else if (time >= startOf7DaysAgo) {
        last7Days.push(chat);
      } else {
        older.push(chat);
      }
    });

    return {
      '今日': today,
      '昨日': yesterday,
      '過去7日間': last7Days,
      'それ以前': older,
    };
  };

  const getGroupName = (label: string) => {
    if (language === 'en') {
      if (label === '今日') return 'Today';
      if (label === '昨日') return 'Yesterday';
      if (label === '過去7日間') return 'Last 7 Days';
      return 'Older';
    }
    if (language === 'zh') {
      if (label === '今日') return '今天';
      if (label === '昨日') return '昨天';
      if (label === '過去7日間') return '过去 7 天';
      return '更早';
    }
    return label;
  };

  const grouped = groupChats(store.chats);

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
      <div className="absolute left-4 top-4.5 z-40">
        <button
          onClick={store.toggleSidebar}
          aria-label={t.openSidebar}
          className="min-w-11 min-h-11 flex items-center justify-center border border-border-light/70 dark:border-border-dark bg-card-light/90 dark:bg-card-dark/90 text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-500 rounded-xl shadow-md shadow-black/5 hover:shadow-amber-500/10 cursor-pointer transition-all duration-200 backdrop-blur-md"
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
                className="min-h-11 px-4 py-2 rounded-xl border border-border-light dark:border-border-dark text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-amber-600 dark:hover:text-amber-400 cursor-pointer transition-colors"
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

      {/* Mobile overlay backdrop */}
      <div
        onClick={store.toggleSidebar}
        className="md:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
      />

      <div className="fixed md:relative inset-y-0 left-0 w-66 max-w-[80vw] h-full bg-sidebar-light/97 md:bg-sidebar-light/80 dark:bg-sidebar-dark/97 md:dark:bg-sidebar-dark/85 backdrop-blur-xl border-r border-border-light/60 dark:border-border-dark flex flex-col z-50 md:z-40">

        {/* Sidebar Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border-light/50 dark:border-border-dark/60 select-none shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="relative w-7 h-7 flex items-center justify-center bg-gradient-to-tr from-amber-600 to-yellow-400 rounded-lg shadow-sm shadow-amber-500/25 border border-amber-400/20">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-white fill-current" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2.25a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V3a.75.75 0 0 1 .75-.75ZM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5a.75.75 0 0 1 .75-.75ZM5.106 5.106a.75.75 0 0 1 1.06 0l1.06 1.06a.75.75 0 0 1-1.06 1.06l-1.06-1.06a.75.75 0 0 1 0-1.06Zm11.668 11.668a.75.75 0 0 1 1.06 0l1.06 1.06a.75.75 0 0 1-1.06 1.06l-1.06-1.06a.75.75 0 0 1 0-1.06ZM2.25 12a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5H3a.75.75 0 0 1-.75-.75Zm15.5 0a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75ZM5.106 18.894a.75.75 0 0 1 0-1.06l1.06-1.06a.75.75 0 1 1 1.06 1.06l-1.06 1.06a.75.75 0 0 1-1.06 0Zm11.668-11.668a.75.75 0 0 1 0-1.06l1.06-1.06a.75.75 0 1 1 1.06 1.06l-1.06 1.06a.75.75 0 0 1-1.06 0Z" />
              </svg>
            </div>
            <span className="font-bold text-gray-900 dark:text-gray-50 text-sm tracking-wide font-heading">Himawari</span>
          </div>

          <div className="flex items-center space-x-0.5">
            <button
              onClick={() => store.setSearchOpen(true)}
              aria-label={t.search}
              className="min-w-11 min-h-11 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-amber-600 dark:hover:text-amber-500 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg cursor-pointer transition-colors"
              title={t.search}
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              onClick={handleNewChat}
              aria-label={t.newChat}
              className="min-w-11 min-h-11 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-amber-600 dark:hover:text-amber-500 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg cursor-pointer transition-colors"
              title={t.newChat}
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={store.toggleSidebar}
              aria-label={t.close}
              className="min-w-11 min-h-11 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-amber-600 dark:hover:text-amber-500 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg cursor-pointer transition-colors"
              title={t.close}
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable chat list */}
        <div className="flex-1 overflow-y-auto px-2 pt-2 pb-2 space-y-3">
          {store.chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-36 text-center text-xs text-gray-400 dark:text-gray-500 px-4 space-y-2 select-none animate-pulse-slow">
              <MessageCircle className="w-7 h-7 stroke-[1.2] text-amber-500/40" />
              <p className="font-medium">{t.noHistory}</p>
            </div>
          ) : (
            Object.entries(grouped).map(([label, items]) => {
              if (items.length === 0) return null;
              return (
                <div key={label} className="space-y-0.5">
                  <h4 className="text-[10px] font-bold text-gray-400/60 dark:text-gray-600 uppercase tracking-widest px-3 py-1 select-none">
                    {getGroupName(label)}
                  </h4>
                  {items.map((chat) => {
                    const isActive = store.activeChatId === chat.id;
                    const isEditing = editingId === chat.id;

                    return (
                      <div
                        key={chat.id}
                        className={`group relative flex items-center w-full min-h-11 rounded-xl text-xs transition-all duration-150 ${
                          isActive
                            ? 'bg-amber-500/10 dark:bg-amber-500/12 text-amber-700 dark:text-amber-300 font-semibold'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-black/4 dark:hover:bg-white/4 hover:text-gray-900 dark:hover:text-gray-100'
                        }`}
                      >
                        {isEditing ? (
                          <>
                            <MessageSquare className="w-3.5 h-3.5 ml-3 mr-2.5 shrink-0 text-amber-500" />
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveRename(chat.id, e);
                                if (e.key === 'Escape') handleCancelRename(e);
                              }}
                              autoFocus
                              className="flex-1 min-w-0 bg-transparent border-b border-amber-500 focus:outline-none text-gray-900 dark:text-gray-100 text-xs py-0.5 font-normal"
                            />
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSelectChat(chat.id)}
                            aria-current={isActive ? 'page' : undefined}
                            className="min-h-11 w-full flex items-center px-3 pr-24 rounded-xl text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-500"
                          >
                            <MessageSquare className={`w-3.5 h-3.5 mr-2.5 shrink-0 transition-colors ${
                              isActive ? 'text-amber-500 dark:text-amber-400' : 'text-gray-400 dark:text-gray-600 group-hover:text-gray-500'
                            }`} />
                            <span className="flex-1 truncate leading-tight">
                              {chat.title === 'New Chat' ? t.newChat : chat.title}
                            </span>
                          </button>
                        )}

                        {!isEditing && (
                          <div className="hover-action absolute right-2 flex space-x-0.5 transition-opacity duration-150">
                            <button
                              onClick={(e) => handleStartRename(chat, e)}
                              aria-label={t.rename}
                              className="min-w-11 min-h-11 flex items-center justify-center text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-black/5 dark:hover:bg-white/8 rounded-md cursor-pointer transition-colors"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteChat(chat.id, e)}
                              aria-label={t.delete}
                              className="min-w-11 min-h-11 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-md cursor-pointer transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        {isEditing && (
                          <div className="flex space-x-0.5 ml-1 shrink-0">
                            <button
                              onClick={(e) => handleSaveRename(chat.id, e)}
                              aria-label={t.save}
                              className="p-1 text-accent-green hover:bg-accent-green/10 rounded-md cursor-pointer"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => handleCancelRename(e)}
                              aria-label={t.cancel}
                              className="p-1 text-red-500 hover:bg-red-500/10 rounded-md cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-border-light/50 dark:border-border-dark/60 shrink-0">
          <button
            onClick={() => store.setSettingsOpen(true)}
            className="min-h-11 flex items-center space-x-2.5 w-full px-3 py-2.5 text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-500 hover:bg-black/4 dark:hover:bg-white/4 rounded-xl cursor-pointer transition-all duration-200"
          >
            <Settings className="w-4 h-4 shrink-0" />
            <span className="font-semibold text-xs tracking-wide">{t.settings}</span>
          </button>
        </div>

      </div>
    </>
  );
};
