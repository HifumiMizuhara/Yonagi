import React, { useState } from 'react';
import { useChatStore } from '../store/useChatStore';
import { type Chat } from '../services/db';
import { 
  MessageSquare, Plus, Settings, Trash2, Edit2, Check, X, PanelLeftClose, PanelLeft, MessageCircle
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const store = useChatStore();
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

  // Group chats by date helper
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

  const grouped = groupChats(store.chats);

  if (!store.sidebarOpen) {
    return (
      <div className="absolute left-4 top-4 z-40">
        <button
          onClick={store.toggleSidebar}
          className="p-2 border border-border-light dark:border-border-dark bg-bg-light dark:bg-sidebar-dark text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 rounded-lg shadow-md cursor-pointer transition-transform duration-200 hover:scale-105"
          title="サイドバーを開く"
        >
          <PanelLeft className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 h-full bg-sidebar-light dark:bg-sidebar-dark border-r border-border-light dark:border-border-dark flex flex-col z-40 transition-all duration-300">
      
      {/* Sidebar Header */}
      <div className="flex items-center justify-between p-4 border-b border-border-light dark:border-border-dark">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-accent-blue flex items-center justify-center text-white font-bold text-lg shadow-sm">
            M
          </div>
          <span className="font-bold text-gray-900 dark:text-gray-100 text-md tracking-wider">Minase AI</span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => store.createChat()}
            className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-border-light/40 dark:hover:bg-border-dark/40 rounded-lg cursor-pointer transition-colors"
            title="新規チャット"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={store.toggleSidebar}
            className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-border-light/40 dark:hover:bg-border-dark/40 rounded-lg cursor-pointer transition-colors"
            title="サイドバーを閉じる"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* New Chat Big Button */}
      <div className="px-3 pt-4 pb-2">
        <button
          onClick={() => store.createChat()}
          className="w-full flex items-center justify-center space-x-2 px-4 py-2 border border-border-light dark:border-border-dark hover:bg-border-light/30 dark:hover:bg-border-dark/30 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>新しいチャット</span>
        </button>
      </div>

      {/* Sidebar List (Scrollable) */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
        {store.chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-28 text-center text-xs text-gray-400 dark:text-gray-500 px-4 space-y-1">
            <MessageCircle className="w-6 h-6 stroke-[1.5]" />
            <p>チャット履歴がありません。</p>
          </div>
        ) : (
          Object.entries(grouped).map(([label, items]) => {
            if (items.length === 0) return null;
            return (
              <div key={label} className="space-y-1">
                <h4 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-2">
                  {label}
                </h4>
                <div className="space-y-0.5">
                  {items.map((chat) => {
                    const isActive = store.activeChatId === chat.id;
                    const isEditing = editingId === chat.id;

                    return (
                      <div
                        key={chat.id}
                        onClick={() => !isEditing && store.selectChat(chat.id)}
                        className={`group relative flex items-center w-full px-2.5 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                          isActive
                            ? 'bg-border-light/70 dark:bg-border-dark/70 text-gray-900 dark:text-gray-100 font-medium'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-border-light/30 dark:hover:bg-border-dark/30 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                      >
                        <MessageSquare className="w-4 h-4 mr-2.5 shrink-0 text-gray-400 dark:text-gray-500" />
                        
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
                            className="flex-1 min-w-0 bg-transparent border-b border-accent-blue focus:outline-none text-gray-900 dark:text-gray-100 text-sm py-0.5"
                          />
                        ) : (
                          <span className="flex-1 truncate pr-8 leading-tight">
                            {chat.title}
                          </span>
                        )}

                        {/* Actions (Rename / Delete) */}
                        {!isEditing && (
                          <div className="absolute right-2 opacity-0 group-hover:opacity-100 flex space-x-1 transition-opacity">
                            <button
                              onClick={(e) => handleStartRename(chat, e)}
                              className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded cursor-pointer"
                              title="タイトル変更"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteChat(chat.id, e)}
                              className="p-1 text-gray-400 hover:text-red-500 rounded cursor-pointer"
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
                              className="p-1 text-accent-green hover:bg-accent-green/10 rounded cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleCancelRename(e)}
                              className="p-1 text-red-500 hover:bg-red-500/10 rounded cursor-pointer"
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
      <div className="p-3 border-t border-border-light dark:border-border-dark flex items-center justify-between">
        <button
          onClick={() => store.setSettingsOpen(true)}
          className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-border-light/40 dark:hover:bg-border-dark/40 rounded-lg cursor-pointer transition-colors"
        >
          <Settings className="w-4 h-4" />
          <span className="font-medium text-xs">設定</span>
        </button>
      </div>

    </div>
  );
};
