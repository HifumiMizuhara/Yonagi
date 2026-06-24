import React, { useState } from 'react';
import { useChatStore } from '../store/useChatStore';
import { useTranslation } from '../hooks/useTranslation';
import { type Chat } from '../services/db';
import { 
  MessageSquare, Plus, Settings, Trash2, Edit2, Check, X, PanelLeftClose, PanelLeft, MessageCircle, Search
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const store = useChatStore();
  const { t, language } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const handleStartRename = (chat: Chat, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(chat.id);
    setEditTitle(chat.title);
  };

  const handleSaveRename = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (editTitle.trim()) {
      await store.renameChat(chatId, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleCancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('この会話履歴を削除しますか？')) {
      await store.deleteChat(chatId);
    }
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

  if (!store.sidebarOpen) {
    return (
      <div className="absolute left-4 top-4.5 z-40">
        <button
          onClick={store.toggleSidebar}
          className="p-2 border border-border-light/80 dark:border-border-dark bg-card-light/90 dark:bg-card-dark/90 text-gray-600 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-500 rounded-xl shadow-lg shadow-black/5 hover:shadow-amber-500/10 cursor-pointer transition-all duration-300 backdrop-blur-md"
          title={t.newChat}
        >
          <PanelLeft className="w-4.5 h-4.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-66 h-full bg-sidebar-light/75 dark:bg-sidebar-dark/75 backdrop-blur-xl border-r border-border-light/80 dark:border-border-dark flex flex-col z-40 transition-all duration-300">
      
      {/* Sidebar Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border-light/70 dark:border-border-dark/70 select-none">
        <div className="flex items-center space-x-2">
          {/* Customized Sunflower Logo */}
          <div className="relative w-8 h-8 flex items-center justify-center bg-gradient-to-tr from-amber-600 to-yellow-400 rounded-xl shadow-md shadow-amber-500/20 border border-amber-400/20">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-white fill-current" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2.25a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V3a.75.75 0 0 1 .75-.75ZM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5a.75.75 0 0 1 .75-.75ZM5.106 5.106a.75.75 0 0 1 1.06 0l1.06 1.06a.75.75 0 0 1-1.06 1.06l-1.06-1.06a.75.75 0 0 1 0-1.06Zm11.668 11.668a.75.75 0 0 1 1.06 0l1.06 1.06a.75.75 0 0 1-1.06 1.06l-1.06-1.06a.75.75 0 0 1 0-1.06ZM2.25 12a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5H3a.75.75 0 0 1-.75-.75Zm15.5 0a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75ZM5.106 18.894a.75.75 0 0 1 0-1.06l1.06-1.06a.75.75 0 1 1 1.06 1.06l-1.06 1.06a.75.75 0 0 1-1.06 0Zm11.668-11.668a.75.75 0 0 1 0-1.06l1.06-1.06a.75.75 0 1 1 1.06 1.06l-1.06 1.06a.75.75 0 0 1-1.06 0Z" />
            </svg>
          </div>
          <span className="font-bold text-gray-950 dark:text-gray-50 text-md tracking-wider font-heading">Himawari</span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => store.setSearchOpen(true)}
            className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-500 hover:bg-card-light dark:hover:bg-card-dark rounded-lg cursor-pointer transition-colors"
            title={t.search}
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={() => store.createChat()}
            className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-500 hover:bg-card-light dark:hover:bg-card-dark rounded-lg cursor-pointer transition-colors"
            title={t.newChat}
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={store.toggleSidebar}
            className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-500 hover:bg-card-light dark:hover:bg-card-dark rounded-lg cursor-pointer transition-colors"
            title={t.close}
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* New Chat Big Button */}
      <div className="px-4 pt-4 pb-2">
        <button
          onClick={() => store.createChat()}
          className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600 text-white rounded-xl text-sm font-semibold transition-all duration-300 shadow-md shadow-amber-500/15 hover:shadow-amber-500/25 hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{t.newChat}</span>
        </button>
      </div>

      {/* Sidebar List (Scrollable) */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
        {store.chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-28 text-center text-xs text-gray-400 dark:text-gray-500 px-4 space-y-2 select-none animate-pulse-slow">
            <MessageCircle className="w-8 h-8 stroke-[1.2] text-amber-500/50" />
            <p>{t.noHistory}</p>
          </div>
        ) : (
          Object.entries(grouped).map(([label, items]) => {
            if (items.length === 0) return null;
            return (
              <div key={label} className="space-y-1">
                <h4 className="text-[10px] font-bold text-gray-400/80 dark:text-gray-500/80 uppercase tracking-widest px-3 py-1.5 select-none">
                  {getGroupName(label)}
                </h4>
                <div className="space-y-1">
                  {items.map((chat) => {
                    const isActive = store.activeChatId === chat.id;
                    const isEditing = editingId === chat.id;

                    return (
                      <div
                        key={chat.id}
                        onClick={() => !isEditing && store.selectChat(chat.id)}
                        className={`group relative flex items-center w-full px-3 py-2.5 rounded-xl text-xs sm:text-sm cursor-pointer transition-all duration-200 ${
                          isActive
                            ? 'bg-card-light dark:bg-card-dark text-amber-600 dark:text-amber-400 font-semibold shadow-sm border-l-3 border-amber-600 dark:border-amber-500 pl-2'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-card-light/50 dark:hover:bg-card-dark/40 hover:text-gray-900 dark:hover:text-gray-100 border-l-3 border-transparent pl-2.5'
                        }`}
                      >
                        <MessageSquare className={`w-4 h-4 mr-2.5 shrink-0 transition-colors ${
                          isActive ? 'text-amber-500' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-600'
                        }`} />
                        
                        {isEditing ? (
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRename(chat.id, e as any);
                              if (e.key === 'Escape') handleCancelRename(e as any);
                            }}
                            autoFocus
                            className="flex-1 min-w-0 bg-transparent border-b border-amber-500 focus:outline-none text-gray-900 dark:text-gray-100 text-sm py-0.5 font-normal"
                          />
                        ) : (
                          <span className="flex-1 truncate pr-8 leading-tight font-medium">
                            {chat.title === 'New Chat' ? t.newChat : chat.title}
                          </span>
                        )}

                        {/* Actions (Rename / Delete) */}
                        {!isEditing && (
                          <div className="absolute right-2.5 opacity-0 group-hover:opacity-100 flex space-x-1.5 transition-opacity duration-200">
                            <button
                              onClick={(e) => handleStartRename(chat, e)}
                              className="p-1 text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md cursor-pointer transition-colors"
                              title="タイトル変更"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteChat(chat.id, e)}
                              className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-md cursor-pointer transition-colors"
                              title="削除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {/* Save Rename actions */}
                        {isEditing && (
                          <div className="flex space-x-0.5 ml-1 shrink-0 z-10">
                            <button
                              onClick={(e) => handleSaveRename(chat.id, e)}
                              className="p-1 text-accent-green hover:bg-accent-green/10 rounded-md cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleCancelRename(e)}
                              className="p-1 text-red-500 hover:bg-red-500/10 rounded-md cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Sidebar Footer */}
      <div className="p-4 border-t border-border-light/70 dark:border-border-dark/70 flex items-center justify-between bg-sidebar-light/30 dark:bg-sidebar-dark/20 backdrop-blur-md">
        <button
          onClick={() => store.setSettingsOpen(true)}
          className="flex items-center space-x-2.5 w-full px-3.5 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-500 hover:bg-card-light dark:hover:bg-card-dark rounded-xl cursor-pointer transition-all duration-300 shadow-sm shadow-transparent hover:shadow-black/5"
        >
          <Settings className="w-4.5 h-4.5" />
          <span className="font-semibold text-xs tracking-wide">{t.settings}</span>
        </button>
      </div>

    </div>
  );
};
