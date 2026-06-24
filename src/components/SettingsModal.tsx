import React, { useState } from 'react';
import { useChatStore } from '../store/useChatStore';
import { db } from '../services/db';
import { X, Key, Shield, Settings, Database, Eye, EyeOff } from 'lucide-react';

interface SettingsModalProps {
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const store = useChatStore();
  const [activeTab, setActiveTab] = useState<'connections' | 'prompt' | 'data'>('connections');
  
  // Show/hide API keys toggles
  const [showGemini, setShowGemini] = useState(false);
  const [showOpenAI, setShowOpenAI] = useState(false);
  const [showClaude, setShowClaude] = useState(false);
  const [showCustom, setShowCustom] = useState(false);

  // Custom model text state to allow input editing easily
  const [customModelText, setCustomModelText] = useState(store.customModels.join(', '));

  const handleCustomModelsBlur = async () => {
    const list = customModelText
      .split(',')
      .map((m) => m.trim())
      .filter((m) => m.length > 0);
    await store.updateSetting('customModels', list);
  };

  const handleExportData = async () => {
    try {
      const chats = await db.chats.toArray();
      const messages = await db.messages.toArray();
      
      const exportObj = {
        version: '1.0.0',
        exporter: 'Minase AI Chat',
        exportDate: Date.now(),
        chats,
        messages,
      };

      const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `minase-chats-export-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      alert('データのエクスポートに失敗しました。');
      console.error(error);
    }
  };

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const importObj = JSON.parse(evt.target?.result as string);
          if (!importObj.chats || !importObj.messages) {
            alert('無効なファイル形式です。MinaseのエクスポートJSONファイルを選択してください。');
            return;
          }

          // Import chats and messages into Dexie
          await db.transaction('rw', [db.chats, db.messages], async () => {
            for (const chat of importObj.chats) {
              await db.chats.put(chat);
            }
            for (const message of importObj.messages) {
              await db.messages.put(message);
            }
          });

          await store.loadChats();
          if (store.activeChatId) {
            await store.selectChat(store.activeChatId);
          }
          alert('データを正常にインポートしました！');
        } catch (err) {
          alert('JSONの解析に失敗しました。');
        }
      };
      reader.readAsText(file);
    } catch (error) {
      alert('ファイルの読み込みに失敗しました。');
    }
  };

  const handleClearAll = async () => {
    if (confirm('すべてのチャット履歴と設定データを削除しますか？この操作は取り消せません。')) {
      await store.clearAllChats();
      // Keep keys but reset chats
      alert('すべてのチャット履歴が消去されました。');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
      <div className="relative flex flex-col w-full max-w-2xl h-[550px] bg-bg-light dark:bg-sidebar-dark border border-border-light dark:border-border-dark rounded-xl shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-light dark:border-border-dark">
          <div className="flex items-center space-x-2 text-gray-900 dark:text-gray-100 font-semibold text-lg">
            <Settings className="w-5 h-5" />
            <span>設定</span>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Container */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Tabs */}
          <div className="w-48 bg-card-light dark:bg-sidebar-dark/40 border-r border-border-light dark:border-border-dark py-4 flex flex-col space-y-1">
            <button
              onClick={() => setActiveTab('connections')}
              className={`flex items-center space-x-2 px-4 py-2 text-sm text-left transition-colors cursor-pointer font-medium ${
                activeTab === 'connections'
                  ? 'bg-border-light/50 dark:bg-border-dark/50 text-accent-blue border-l-2 border-accent-blue'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-border-light/30 dark:hover:bg-border-dark/30 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <Key className="w-4 h-4" />
              <span>接続設定 (API)</span>
            </button>
            <button
              onClick={() => setActiveTab('prompt')}
              className={`flex items-center space-x-2 px-4 py-2 text-sm text-left transition-colors cursor-pointer font-medium ${
                activeTab === 'prompt'
                  ? 'bg-border-light/50 dark:bg-border-dark/50 text-accent-blue border-l-2 border-accent-blue'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-border-light/30 dark:hover:bg-border-dark/30 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>システムプロンプト</span>
            </button>
            <button
              onClick={() => setActiveTab('data')}
              className={`flex items-center space-x-2 px-4 py-2 text-sm text-left transition-colors cursor-pointer font-medium ${
                activeTab === 'data'
                  ? 'bg-border-light/50 dark:bg-border-dark/50 text-accent-blue border-l-2 border-accent-blue'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-border-light/30 dark:hover:bg-border-dark/30 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>データ・一般設定</span>
            </button>
          </div>

          {/* Form Content */}
          <div className="flex-1 p-6 overflow-y-auto bg-bg-light dark:bg-bg-dark">
            {activeTab === 'connections' && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider mb-2">API 認証情報</h3>
                
                {/* Gemini Key */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">Google Gemini API キー (CORS不要)</label>
                  <div className="relative">
                    <input
                      type={showGemini ? 'text' : 'password'}
                      value={store.geminiKey}
                      onChange={(e) => store.updateSetting('geminiKey', e.target.value)}
                      placeholder="AIzaSy..."
                      className="w-full px-3 py-2 text-sm bg-card-light dark:bg-sidebar-dark border border-border-light dark:border-border-dark rounded-md focus:outline-none focus:border-accent-blue dark:text-gray-100"
                    />
                    <button 
                      type="button"
                      onClick={() => setShowGemini(!showGemini)}
                      className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
                    >
                      {showGemini ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* OpenAI Key */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">OpenAI API キー (CORS回避推奨)</label>
                  <div className="relative">
                    <input
                      type={showOpenAI ? 'text' : 'password'}
                      value={store.openaiKey}
                      onChange={(e) => store.updateSetting('openaiKey', e.target.value)}
                      placeholder="sk-..."
                      className="w-full px-3 py-2 text-sm bg-card-light dark:bg-sidebar-dark border border-border-light dark:border-border-dark rounded-md focus:outline-none focus:border-accent-blue dark:text-gray-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOpenAI(!showOpenAI)}
                      className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
                    >
                      {showOpenAI ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Claude Key */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">Anthropic Claude API キー (CORS回避推奨)</label>
                  <div className="relative">
                    <input
                      type={showClaude ? 'text' : 'password'}
                      value={store.claudeKey}
                      onChange={(e) => store.updateSetting('claudeKey', e.target.value)}
                      placeholder="sk-ant-..."
                      className="w-full px-3 py-2 text-sm bg-card-light dark:bg-sidebar-dark border border-border-light dark:border-border-dark rounded-md focus:outline-none focus:border-accent-blue dark:text-gray-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowClaude(!showClaude)}
                      className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
                    >
                      {showClaude ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* CORS Proxy URL */}
                <div className="space-y-1 border-t border-border-light dark:border-border-dark pt-3 mt-3">
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center">
                    <span>CORS プロキシ URL</span>
                    <span className="ml-1 text-[10px] text-gray-400 font-normal">(OpenAI/ClaudeのCORS回避に必要)</span>
                  </label>
                  <input
                    type="text"
                    value={store.corsProxy}
                    onChange={(e) => store.updateSetting('corsProxy', e.target.value)}
                    placeholder="https://cors-anywhere.herokuapp.com/ または独自のCloudflare Worker URL"
                    className="w-full px-3 py-2 text-sm bg-card-light dark:bg-sidebar-dark border border-border-light dark:border-border-dark rounded-md focus:outline-none focus:border-accent-blue dark:text-gray-100"
                  />
                  <p className="text-[10px] text-gray-400 leading-tight">
                    ※ OpenAI / Claude をブラウザから直接叩く際はCORS制限がかかります。
                    Cloudflare Workers等に立てたリバースプロキシのアドレスを入力するか、一時的な開発用CORS回避拡張機能をお使いください（GeminiおよびローカルOllamaは設定不要です）。
                  </p>
                </div>

                {/* Custom Base URL & Key & Custom Models */}
                <div className="space-y-3 border-t border-border-light dark:border-border-dark pt-3">
                  <h4 className="text-xs font-semibold text-gray-900 dark:text-gray-100">カスタム / ローカルプロバイダー設定 (Ollama, LM Studioなど)</h4>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="block text-[11px] text-gray-600 dark:text-gray-400">ベースURL (Base URL)</label>
                      <input
                        type="text"
                        value={store.customEndpoint}
                        onChange={(e) => store.updateSetting('customEndpoint', e.target.value)}
                        placeholder="http://localhost:11434 (空欄時はローカルOllama)"
                        className="w-full px-2.5 py-1.5 text-sm bg-card-light dark:bg-sidebar-dark border border-border-light dark:border-border-dark rounded-md focus:outline-none focus:border-accent-blue dark:text-gray-100"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] text-gray-600 dark:text-gray-400">API キー (必要な場合)</label>
                      <div className="relative">
                        <input
                          type={showCustom ? 'text' : 'password'}
                          value={store.customKey}
                          onChange={(e) => store.updateSetting('customKey', e.target.value)}
                          placeholder="APIキーがあれば入力"
                          className="w-full px-2.5 py-1.5 text-sm bg-card-light dark:bg-sidebar-dark border border-border-light dark:border-border-dark rounded-md focus:outline-none focus:border-accent-blue dark:text-gray-100"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCustom(!showCustom)}
                          className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
                        >
                          {showCustom ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] text-gray-600 dark:text-gray-400">カスタムモデル名リスト (カンマ区切り)</label>
                    <input
                      type="text"
                      value={customModelText}
                      onChange={(e) => setCustomModelText(e.target.value)}
                      onBlur={handleCustomModelsBlur}
                      placeholder="llama3, gemma2, phi3, deepseek-coder"
                      className="w-full px-2.5 py-1.5 text-sm bg-card-light dark:bg-sidebar-dark border border-border-light dark:border-border-dark rounded-md focus:outline-none focus:border-accent-blue dark:text-gray-100"
                    />
                  </div>
                </div>

              </div>
            )}

            {activeTab === 'prompt' && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider mb-2">グローバルシステムプロンプト</h3>
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-normal">
                    すべての新しいチャットスレッドのデフォルトアシスタント人格を決定します。特定のチャットで変更することも可能です。
                  </p>
                  <textarea
                    rows={12}
                    value={store.globalSystemPrompt}
                    onChange={(e) => store.updateSetting('globalSystemPrompt', e.target.value)}
                    placeholder="例: あなたは親切なプログラミングアシスタントです。常に日本語で簡潔に回答し、コード例を提示してください。"
                    className="w-full px-3 py-2 text-sm bg-card-light dark:bg-sidebar-dark border border-border-light dark:border-border-dark rounded-md focus:outline-none focus:border-accent-blue dark:text-gray-100 font-sans resize-none"
                  />
                </div>
              </div>
            )}

            {activeTab === 'data' && (
              <div className="space-y-6">
                
                {/* Theme Selection */}
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider">カラーテーマ</h3>
                  <div className="flex space-x-2">
                    {(['light', 'dark', 'system'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => store.updateSetting('theme', t)}
                        className={`flex-1 px-3 py-2 text-sm font-medium border rounded-md transition-colors cursor-pointer capitalize ${
                          store.theme === t
                            ? 'bg-accent-blue/10 border-accent-blue text-accent-blue'
                            : 'bg-card-light dark:bg-sidebar-dark border-border-light dark:border-border-dark text-gray-700 dark:text-gray-300 hover:bg-border-light/30 dark:hover:bg-border-dark/30'
                        }`}
                      >
                        {t === 'light' ? 'ライト' : t === 'dark' ? 'ダーク' : 'システム同期'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Import / Export & Clear */}
                <div className="space-y-3 border-t border-border-light dark:border-border-dark pt-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider">データの管理</h3>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={handleExportData}
                      className="px-4 py-2.5 text-sm font-medium border border-border-light dark:border-border-dark bg-card-light dark:bg-sidebar-dark text-gray-700 dark:text-gray-300 rounded-md hover:bg-border-light/30 dark:hover:bg-border-dark/30 transition-colors cursor-pointer"
                    >
                      会話履歴のエクスポート (.json)
                    </button>
                    
                    <label className="flex items-center justify-center px-4 py-2.5 text-sm font-medium border border-border-light dark:border-border-dark bg-card-light dark:bg-sidebar-dark text-gray-700 dark:text-gray-300 rounded-md hover:bg-border-light/30 dark:hover:bg-border-dark/30 transition-colors cursor-pointer relative">
                      <span>会話履歴のインポート</span>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportData}
                        className="hidden"
                      />
                    </label>
                  </div>
                  
                  <div className="border-t border-border-light dark:border-border-dark pt-4 mt-2">
                    <button
                      onClick={handleClearAll}
                      className="w-full px-4 py-2.5 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors cursor-pointer"
                    >
                      すべてのチャット履歴を削除する
                    </button>
                    <p className="text-[10px] text-gray-400 mt-1 text-center">
                      ※この操作を行うと、ブラウザ内に保存されたすべてのメッセージ・添付ファイルが完全に消去されます。
                    </p>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
