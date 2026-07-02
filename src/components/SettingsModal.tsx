import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useChatStore } from '../store/useChatStore';
import { useTranslation } from '../hooks/useTranslation';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';
import { db } from '../services/db';
import {
  X, Shield, Settings, Database, Eye, EyeOff, Check, AlertCircle, Search,
  Trash2, Plus, RefreshCw, Key, HelpCircle, DollarSign, Lock, Save, FileText, ChevronLeft, HardDrive
} from 'lucide-react';
import type { ModelPrice } from '../services/db';
import { EXPORT_VERSION, validateImportData } from '../utils/importExport';
import { isQuotaExceededError, runDbWrite } from '../utils/dbWrite';
import {
  computeStorageSummary,
  type StorageSummary,
} from '../utils/storageStats';
import { formatBytes, formatPercent } from '../utils/storageSize';
import { ModelIcon } from './ModelIcon';

interface SettingsModalProps {
  onClose: () => void;
}

const DEFAULT_BASE_URLS: Record<string, string> = {
  gemini: 'https://generativelanguage.googleapis.com',
  openai: 'https://api.openai.com',
  claude: 'https://api.anthropic.com',
  deepseek: 'https://api.deepseek.com',
  openrouter: 'https://openrouter.ai/api',
  ollama: 'http://localhost:11434',
  custom: '',
};

const PROVIDER_KEY_LINKS: Record<string, string> = {
  gemini: 'https://aistudio.google.com/app/apikey',
  openai: 'https://platform.openai.com/api-keys',
  claude: 'https://console.anthropic.com/settings/keys',
  deepseek: 'https://platform.deepseek.com/api_keys',
  openrouter: 'https://openrouter.ai/keys',
};

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const store = useChatStore();
  const { t, language } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogAccessibility(dialogRef, onClose);
  const [activeTab, setActiveTab] = useState<'connections' | 'prompt' | 'pricing' | 'security' | 'data'>('connections');
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void | Promise<void>;
    onCancel?: () => void;
  } | null>(null);
  const nestedDialogRef = useRef<HTMLDivElement>(null);

  // Prompt preset form state
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetContent, setNewPresetContent] = useState('');

  // Pricing form state
  const [newPriceModel, setNewPriceModel] = useState('');
  const [newPriceIn, setNewPriceIn] = useState('');
  const [newPriceOut, setNewPriceOut] = useState('');

  // Encryption form state
  const [encPass, setEncPass] = useState('');
  const [encPass2, setEncPass2] = useState('');
  const [encError, setEncError] = useState<string | null>(null);

  const [storageSummary, setStorageSummary] = useState<StorageSummary | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);

  const refreshStorage = useCallback(async () => {
    setStorageLoading(true);
    try {
      setStorageSummary(await computeStorageSummary());
    } finally {
      setStorageLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'data') {
      queueMicrotask(() => {
        void refreshStorage();
      });
    }
  }, [activeTab, refreshStorage]);

  const handleSavePreset = async () => {
    if (!newPresetName.trim() || !newPresetContent.trim()) return;
    await store.addPromptPreset(newPresetName.trim(), newPresetContent.trim());
    setNewPresetName('');
    setNewPresetContent('');
  };

  const handleAddPrice = async () => {
    const inp = parseFloat(newPriceIn);
    const out = parseFloat(newPriceOut);
    if (!newPriceModel.trim() || isNaN(inp) || isNaN(out)) return;
    await store.setModelPrice(newPriceModel.trim(), { input: inp, output: out });
    setNewPriceModel('');
    setNewPriceIn('');
    setNewPriceOut('');
  };

  const handleEnableEncryption = async () => {
    setEncError(null);
    if (!encPass) return;
    if (encPass !== encPass2) {
      setEncError(t.passphraseMismatch);
      return;
    }
    await store.enableKeyEncryption(encPass);
    setEncPass('');
    setEncPass2('');
  };
  
  // Left Sidebar State
  const [selectedProviderId, setSelectedProviderId] = useState<string>('gemini');
  // On mobile the connections pane is a drill-down: list first, then detail.
  const [mobileDetailView, setMobileDetailView] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [newCustomName, setNewCustomName] = useState('');
  const [newCustomUrl, setNewCustomUrl] = useState('');

  // Right Form State
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'failed' | null>(null);
  
  // Model State
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isAddingModel, setIsAddingModel] = useState(false);
  const [newModelId, setNewModelId] = useState('');

  const activeProvider = store.providers[selectedProviderId] || store.providers.gemini;
  const apiKeyDraftRef = useRef<HTMLInputElement>(null);
  const baseUrlDraftRef = useRef<HTMLInputElement>(null);
  const corsProxyDraftRef = useRef<HTMLInputElement>(null);
  const apiKeyInputId = `api-key-${selectedProviderId}`;
  const apiHostInputId = `api-host-${selectedProviderId}`;
  const corsProxyInputId = `cors-proxy-${selectedProviderId}`;

  const openConfirm = (
    message: string,
    onConfirm: () => void | Promise<void>,
    onCancel?: () => void
  ) => {
    setConfirmDialog({ message, onConfirm, onCancel });
  };

  const closeConfirm = () => {
    confirmDialog?.onCancel?.();
    setConfirmDialog(null);
  };
  useDialogAccessibility(
    nestedDialogRef,
    () => confirmDialog ? closeConfirm() : setNotice(null),
    !!(notice || confirmDialog)
  );

  const acceptConfirm = async () => {
    const next = confirmDialog;
    if (!next) return;
    setConfirmDialog(null);
    await next.onConfirm();
  };

  const handleProviderConfigChange = async (key: string, value: string | boolean | string[]) => {
    await store.updateProvider(selectedProviderId, { [key]: value });
  };

  const handleResetUrl = async () => {
    const defaultUrl = DEFAULT_BASE_URLS[selectedProviderId] || '';
    if (baseUrlDraftRef.current) baseUrlDraftRef.current.value = defaultUrl;
    await handleProviderConfigChange('baseUrl', defaultUrl);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const ok = await store.testProviderConnection(selectedProviderId);
      setTestResult(ok ? 'success' : 'failed');
    } catch {
      setTestResult('failed');
    } finally {
      setIsTesting(false);
    }
  };

  const handleFetchModels = async () => {
    setIsFetchingModels(true);
    setFetchError(null);
    try {
      await store.fetchModelsForProvider(selectedProviderId);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : t.fileLoadError);
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleAddCustomModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newModelId.trim()) {
      await store.addModelToProvider(selectedProviderId, newModelId.trim());
      setNewModelId('');
      setIsAddingModel(false);
    }
  };

  const handleCreateCustomProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newCustomName.trim()) {
      // Fix #6: capture existing IDs before adding so the diff finds the new one reliably
      const existingIds = new Set(Object.keys(store.providers));
      await store.addProvider(newCustomName.trim(), newCustomUrl.trim());
      const newId = Object.keys(useChatStore.getState().providers).find(k => !existingIds.has(k));
      if (newId) setSelectedProviderId(newId);

      setNewCustomName('');
      setNewCustomUrl('');
      setIsAddingCustom(false);
    }
  };

  const handleDeleteProvider = async (pId: string, name: string) => {
    openConfirm(t.deleteProviderConfirm.replace('{name}', name), async () => {
      await store.deleteProvider(pId);
      if (selectedProviderId === pId) {
        setSelectedProviderId('gemini');
      }
    });
  };

  // Group models helper
  const groupModels = (models: string[]) => {
    const groups: Record<string, string[]> = {};
    models.forEach((model) => {
      let group = 'Other';
      if (model.includes('/')) {
        group = model.split('/')[0];
      } else if (model.includes(':')) {
        group = model.split(':')[0];
      } else if (model.startsWith('gpt-') || model.startsWith('o1-')) {
        group = 'OpenAI';
      } else if (model.startsWith('claude-')) {
        group = 'Anthropic';
      } else if (model.startsWith('gemini-')) {
        group = 'Google';
      } else if (model.startsWith('deepseek-')) {
        group = 'DeepSeek';
      } else {
        const firstPart = model.split('-')[0];
        if (firstPart && firstPart.length > 2) {
          group = firstPart;
        }
      }
      
      const normalizedGroup = group.charAt(0).toUpperCase() + group.slice(1);
      if (!groups[normalizedGroup]) groups[normalizedGroup] = [];
      groups[normalizedGroup].push(model);
    });

    return groups;
  };

  const getFilteredProviders = () => {
    return Object.values(store.providers).filter((p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  const filteredProviders = getFilteredProviders();
  const groupedModels = groupModels(activeProvider.models);

  // Data Export/Import
  const handleExportData = async () => {
    try {
      const chats = await db.chats.toArray();
      const messages = await db.messages.toArray();
      const folders = await db.folders.toArray();
      const exportObj = { version: EXPORT_VERSION, exporter: 'Himawari AI Chat', chats, messages, folders };
      const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `himawari-chats-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setNotice(t.fileLoadError);
    }
  };

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    const runImport = async () => {
      try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const importObj = JSON.parse(evt.target?.result as string);
          const validation = validateImportData(importObj);
          if (!validation.ok) {
            setNotice(t.fileLoadError);
            return;
          }
          const { chats, messages, folders } = validation.data;
          try {
            await runDbWrite(() => db.transaction('rw', [db.chats, db.messages, db.folders], async () => {
              for (const chat of chats) await db.chats.put(chat);
              for (const message of messages) await db.messages.put(message);
              for (const folder of folders) await db.folders.put(folder);
            }));
          } catch (error) {
            if (isQuotaExceededError(error)) {
              useChatStore.setState({ storageNotice: t.storageQuotaError });
            }
            setNotice(t.fileLoadError);
            return;
          }
          await store.loadChats();
          await store.loadFolders();
          setNotice(t.importSuccess);
          await refreshStorage();
        } catch {
          setNotice(t.fileLoadError);
        } finally {
          input.value = '';
        }
      };
      reader.onerror = () => {
        input.value = '';
        setNotice(t.fileLoadError);
      };
      reader.readAsText(file);
    } catch {
      setNotice(t.fileLoadError);
    }
    };

    openConfirm(
      t.importOverwriteConfirm,
      runImport,
      () => { input.value = ''; }
    );
  };

  const handleClearAll = async () => {
    openConfirm(t.clearAllConfirm, async () => {
      await store.clearAllChats();
      setNotice(t.clearAllSuccess);
      await refreshStorage();
    });
  };

  const handleDeleteChatFromStorage = (chatId: string) => {
    openConfirm(t.deleteChatConfirm, async () => {
      await store.deleteChat(chatId);
      await refreshStorage();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        tabIndex={-1}
        className="relative flex flex-col w-full max-w-4xl h-[90vh] md:h-[650px] bg-card-light dark:bg-sidebar-dark md:bg-card-light/95 md:dark:bg-sidebar-dark/95 border border-border-light/80 dark:border-border-dark/80 rounded-3xl shadow-2xl shadow-black/30 overflow-hidden font-sans md:backdrop-blur-2xl"
      >
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-border-light dark:border-border-dark bg-card-light/30 dark:bg-sidebar-dark/20 shrink-0 select-none">
          <div className="flex items-center space-x-2.5 text-gray-900 dark:text-gray-50 font-bold text-md font-heading">
            <Settings className="w-5 h-5 text-blue-600 dark:text-sky-400" />
            <span id="settings-dialog-title">{t.settings}</span>
          </div>
          <button
            onClick={onClose}
            aria-label={t.close}
            className="min-w-11 min-h-11 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Tabs */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* Main settings tabs (Leftmost strip) */}
          <div className="w-14 md:w-48 bg-card-light/50 dark:bg-sidebar-dark/30 border-r border-border-light dark:border-border-dark flex flex-col py-4 space-y-1 shrink-0 select-none overflow-hidden">
            <button
              onClick={() => setActiveTab('connections')}
              aria-label={t.connections}
              aria-pressed={activeTab === 'connections'}
              className={`flex flex-col md:flex-row items-center justify-center md:justify-start w-full md:space-x-2.5 px-1.5 md:px-4 py-3 text-center md:text-left transition-all duration-200 cursor-pointer text-xs md:text-sm font-semibold border-l-[3px] ${
                activeTab === 'connections'
                  ? 'border-blue-600 dark:border-sky-400 bg-card-light/60 dark:bg-card-dark/60 text-blue-600 dark:text-sky-400 font-bold'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:bg-card-light/30 dark:hover:bg-card-dark/30 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <Key className="w-4 h-4 shrink-0" />
              <span className="hidden md:inline">{t.connections}</span>
            </button>
            <button
              onClick={() => setActiveTab('prompt')}
              aria-label={t.systemPrompt}
              aria-pressed={activeTab === 'prompt'}
              className={`flex flex-col md:flex-row items-center justify-center md:justify-start w-full md:space-x-2.5 px-1.5 md:px-4 py-3 text-center md:text-left transition-all duration-200 cursor-pointer text-xs md:text-sm font-semibold border-l-[3px] ${
                activeTab === 'prompt'
                  ? 'border-blue-600 dark:border-sky-400 bg-card-light/60 dark:bg-card-dark/60 text-blue-600 dark:text-sky-400 font-bold'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:bg-card-light/30 dark:hover:bg-card-dark/30 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <Shield className="w-4 h-4 shrink-0" />
              <span className="hidden md:inline">{t.systemPrompt}</span>
            </button>
            <button
              onClick={() => setActiveTab('pricing')}
              aria-label={t.pricing}
              aria-pressed={activeTab === 'pricing'}
              className={`flex flex-col md:flex-row items-center justify-center md:justify-start w-full md:space-x-2.5 px-1.5 md:px-4 py-3 text-center md:text-left transition-all duration-200 cursor-pointer text-xs md:text-sm font-semibold border-l-[3px] ${
                activeTab === 'pricing'
                  ? 'border-blue-600 dark:border-sky-400 bg-card-light/60 dark:bg-card-dark/60 text-blue-600 dark:text-sky-400 font-bold'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:bg-card-light/30 dark:hover:bg-card-dark/30 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <DollarSign className="w-4 h-4 shrink-0" />
              <span className="hidden md:inline">{t.pricing}</span>
            </button>
            <button
              onClick={() => setActiveTab('security')}
              aria-label={t.security}
              aria-pressed={activeTab === 'security'}
              className={`flex flex-col md:flex-row items-center justify-center md:justify-start w-full md:space-x-2.5 px-1.5 md:px-4 py-3 text-center md:text-left transition-all duration-200 cursor-pointer text-xs md:text-sm font-semibold border-l-[3px] ${
                activeTab === 'security'
                  ? 'border-blue-600 dark:border-sky-400 bg-card-light/60 dark:bg-card-dark/60 text-blue-600 dark:text-sky-400 font-bold'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:bg-card-light/30 dark:hover:bg-card-dark/30 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <Lock className="w-4 h-4 shrink-0" />
              <span className="hidden md:inline">{t.security}</span>
            </button>
            <button
              onClick={() => setActiveTab('data')}
              aria-label={t.dataManagement}
              aria-pressed={activeTab === 'data'}
              className={`flex flex-col md:flex-row items-center justify-center md:justify-start w-full md:space-x-2.5 px-1.5 md:px-4 py-3 text-center md:text-left transition-all duration-200 cursor-pointer text-xs md:text-sm font-semibold border-l-[3px] ${
                activeTab === 'data'
                  ? 'border-blue-600 dark:border-sky-400 bg-card-light/60 dark:bg-card-dark/60 text-blue-600 dark:text-sky-400 font-bold'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:bg-card-light/30 dark:hover:bg-card-dark/30 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <Database className="w-4 h-4 shrink-0" />
              <span className="hidden md:inline">{t.dataManagement}</span>
            </button>
          </div>

          {/* Form Content pane */}
          <div className="flex-1 flex overflow-hidden bg-bg-light dark:bg-bg-dark text-gray-800 dark:text-gray-100">
            
            {activeTab === 'connections' && (
              /* Connections 2-Column pane (stacks vertically on mobile) */
              <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

                {/* Connections Column 1: Providers List (Width: 1/3) */}
                <div className={`${mobileDetailView ? 'hidden md:flex' : 'flex'} w-full md:w-64 border-b md:border-b-0 md:border-r border-border-light dark:border-border-dark flex-col bg-card-light/10 dark:bg-sidebar-dark/10 flex-1 md:flex-none md:h-full select-none`}>
                  
                  {/* Search providers box */}
                  <div className="p-3.5 border-b border-border-light dark:border-border-dark shrink-0">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                      <input
                        type="text"
                        placeholder={t.searchProviders}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-card-light dark:bg-sidebar-dark text-xs border border-border-light dark:border-border-dark rounded-xl focus:outline-none focus:border-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400"
                      />
                    </div>
                  </div>

                  {/* Scrollable list of providers */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-1">
                    {filteredProviders.map((p) => {
                      const isSelected = selectedProviderId === p.id;
                      const isCustom = p.id.startsWith('custom_');

                      return (
                        <div
                          key={p.id}
                          className={`group flex items-center justify-between w-full rounded-xl text-xs font-semibold transition-all overflow-hidden ${
                            isSelected
                              ? 'bg-card-light dark:bg-card-dark text-blue-600 dark:text-sky-400 shadow-sm'
                              : 'text-gray-600 dark:text-gray-400 hover:bg-card-light/40 dark:hover:bg-card-dark/40 hover:text-gray-950 dark:hover:text-gray-100'
                          }`}
                        >
                          <button
                            type="button"
                            aria-current={isSelected ? 'true' : undefined}
                            onClick={() => {
                              setSelectedProviderId(p.id);
                              setTestResult(null);
                              setFetchError(null);
                              setMobileDetailView(true);
                            }}
                            className={`min-h-11 flex flex-1 items-center gap-2 min-w-0 py-2.5 text-left cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:outline-blue-500 border-l-[3px] pl-3 pr-3 ${
                              isSelected
                                ? 'border-blue-600 dark:border-sky-400'
                                : 'border-transparent'
                            }`}
                          >
                            <ModelIcon
                              providerId={p.id}
                              providerName={p.name}
                              className="w-5 h-5"
                            />
                            <span className="truncate">{p.name}</span>
                            <span
                              className={`ml-auto w-1.5 h-1.5 rounded-full shrink-0 ${
                                p.enabled ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-gray-300 dark:bg-gray-600'
                              }`}
                            />
                          </button>

                          {/* Delete custom provider option */}
                          {isCustom && (
	                            <button
	                              onClick={(e) => {
	                                e.stopPropagation();
	                                handleDeleteProvider(p.id, p.name);
	                              }}
	                              aria-label={`${t.delete}: ${p.name}`}
                              className="hover-action min-w-11 min-h-11 flex items-center justify-center hover:text-red-500 hover:bg-red-500/10 rounded-md cursor-pointer transition-all z-10"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Add provider form / button at bottom */}
                  <div className="p-3.5 border-t border-border-light dark:border-border-dark shrink-0">
                    {isAddingCustom ? (
                      <form onSubmit={handleCreateCustomProvider} className="space-y-2 animate-scale-up">
                        <input
                          type="text"
	                          required
	                          aria-label={t.customProviderPlaceholder}
	                          placeholder={t.customProviderPlaceholder}
                          value={newCustomName}
                          onChange={(e) => setNewCustomName(e.target.value)}
                          className="w-full px-3 py-1.5 bg-card-light dark:bg-sidebar-dark border border-border-light dark:border-border-dark rounded-xl text-xs focus:outline-none"
                        />
                        <input
	                          type="text"
	                          aria-label={t.customUrlPlaceholder}
	                          placeholder={t.customUrlPlaceholder}
                          value={newCustomUrl}
                          onChange={(e) => setNewCustomUrl(e.target.value)}
                          className="w-full px-3 py-1.5 bg-card-light dark:bg-sidebar-dark border border-border-light dark:border-border-dark rounded-xl text-xs focus:outline-none"
                        />
                        <div className="flex space-x-2">
                          <button
                            type="submit"
                            className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-bold cursor-pointer transition-colors shadow-sm"
                          >
                            {t.save}
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsAddingCustom(false)}
                            className="flex-1 py-1.5 bg-gray-100 dark:bg-card-dark text-gray-700 dark:text-gray-300 rounded-xl text-[10px] font-bold cursor-pointer transition-colors"
                          >
                            {t.close}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        onClick={() => setIsAddingCustom(true)}
                        className="w-full flex items-center justify-center space-x-1.5 px-3 py-2.5 border border-dashed border-border-light dark:border-border-dark hover:border-blue-500/50 hover:bg-card-light/40 dark:hover:bg-card-dark/40 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-sky-400 rounded-xl text-xs font-semibold cursor-pointer transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{t.addProvider}</span>
                      </button>
                    )}
                  </div>

                </div>

                {/* Connections Column 2: Provider detail Form (Width: 2/3) */}
                <div className={`${mobileDetailView ? 'block' : 'hidden md:block'} flex-1 overflow-y-auto p-4 md:p-6 space-y-6 min-h-0 h-full`}>

                  {/* Mobile-only back button to return to the provider list */}
                  <button
                    onClick={() => setMobileDetailView(false)}
                    className="md:hidden flex items-center space-x-1.5 -mt-1 mb-1 px-2.5 py-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-sky-400 hover:bg-card-light dark:hover:bg-card-dark rounded-lg cursor-pointer transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>{t.providerList}</span>
                  </button>

                  {/* Top Bar Header with switch */}
                  <div className="flex items-center justify-between border-b border-border-light dark:border-border-dark pb-4.5 select-none">
                    <div className="flex items-center space-x-1.5">
                      <ModelIcon
                        providerId={activeProvider.id}
                        providerName={activeProvider.name}
                        className="w-6 h-6"
                      />
                      <span className="font-bold text-gray-900 dark:text-gray-50 text-lg font-heading">{activeProvider.name}</span>
                      <span title={t.howCanIHelpSub}>
                        <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
                      </span>
                    </div>
                    
                    {/* On/Off Switch */}
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-gray-400 font-medium">{activeProvider.enabled ? t.activeStatus : t.inactiveStatus}</span>
	                      <button
	                        onClick={() => handleProviderConfigChange('enabled', !activeProvider.enabled)}
	                        aria-label={activeProvider.enabled ? t.inactiveStatus : t.activeStatus}
	                        className={`w-11 h-6 rounded-full flex items-center p-0.5 cursor-pointer transition-colors duration-200 ${
                          activeProvider.enabled ? 'bg-emerald-500 shadow-sm shadow-emerald-500/30' : 'bg-gray-200 dark:bg-card-dark'
                        }`}
                      >
                        <div 
                          className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
                            activeProvider.enabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* API Key Box */}
                  {selectedProviderId !== 'ollama' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between select-none">
                        <label htmlFor={apiKeyInputId} className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">{t.apiKey}</label>
                        
                        {/* Get Key Link */}
                        {PROVIDER_KEY_LINKS[selectedProviderId] && (
                          <a
                            href={PROVIDER_KEY_LINKS[selectedProviderId]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-blue-600 hover:text-blue-700 dark:text-sky-400 dark:hover:text-sky-400 hover:underline cursor-pointer font-semibold flex items-center space-x-0.5"
                          >
                            <span>{t.getApiKey}</span>
                          </a>
                        )}
                      </div>

                      <div className="flex space-x-2">
                        <div className="relative flex-1">
                          <input
                            type={showKey ? 'text' : 'password'}
                            key={`${selectedProviderId}-api-key`}
                            ref={apiKeyDraftRef}
                            id={apiKeyInputId}
                            defaultValue={activeProvider.apiKey}
                            onBlur={(event) => {
                              if (event.currentTarget.value !== activeProvider.apiKey) void handleProviderConfigChange('apiKey', event.currentTarget.value);
                            }}
                            disabled={store.keysLocked}
                            placeholder="********************************"
                            className="w-full pl-3.5 pr-10 py-2.5 text-sm bg-card-light dark:bg-sidebar-dark border border-border-light dark:border-border-dark rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                          <button
                            type="button"
                            onClick={() => setShowKey(!showKey)}
                            aria-label={showKey ? t.hideApiKey : t.showApiKey}
                            className="absolute right-3.5 top-3.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
                          >
                            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        
                        {/* Check button */}
                        <button
                          type="button"
                          onClick={handleTestConnection}
                          disabled={isTesting}
                          className="px-4 py-2.5 bg-card-light hover:bg-card-light/80 dark:bg-sidebar-dark dark:hover:bg-sidebar-dark/80 border border-border-light dark:border-border-dark text-xs font-bold rounded-xl cursor-pointer transition-all shrink-0 flex items-center space-x-1.5 shadow-sm active:scale-95 duration-100"
                        >
                          {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                          <span>{t.check}</span>
                        </button>
                      </div>

                      {store.keysLocked && (
                        <button
                          type="button"
                          onClick={store.openUnlockPrompt}
                          className="min-h-11 px-3 py-2 text-xs font-bold text-blue-700 dark:text-sky-300 bg-blue-500/10 border border-blue-500/20 rounded-xl cursor-pointer"
                        >
                          {t.unlock}
                        </button>
                      )}

                      {/* Check result feedback */}
                      {testResult && (
                        <div className="flex items-center text-xs space-x-1 mt-1.5 select-none animate-scale-up">
                          {testResult === 'success' ? (
                            <>
                              <Check className="w-4 h-4 text-emerald-500" />
                              <span className="text-emerald-500 font-semibold">{t.connectionSuccess}</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-4 h-4 text-red-500" />
                              <span className="text-red-500 font-semibold">{t.connectionFailed}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* API Host Box */}
                  <div className="space-y-2">
                    <label htmlFor={apiHostInputId} className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide select-none">{t.apiHost}</label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        key={`${selectedProviderId}-base-url`}
                        ref={baseUrlDraftRef}
                        id={apiHostInputId}
                        defaultValue={activeProvider.baseUrl}
                        onBlur={(event) => {
                          if (event.currentTarget.value !== activeProvider.baseUrl) void handleProviderConfigChange('baseUrl', event.currentTarget.value);
                        }}
                        placeholder="http://localhost:port"
                        className="flex-1 px-3.5 py-2.5 text-sm bg-card-light dark:bg-sidebar-dark border border-border-light dark:border-border-dark rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:text-gray-100"
                      />
                      
                      {/* Reset Button */}
                      <button
                        type="button"
                        onClick={handleResetUrl}
                        className="px-3.5 py-2 bg-card-light hover:bg-card-light/80 dark:bg-sidebar-dark dark:hover:bg-sidebar-dark/80 border border-border-light dark:border-border-dark text-xs text-red-500 dark:text-red-400 font-bold rounded-xl cursor-pointer transition-all shrink-0 active:scale-95"
                      >
                        {t.reset}
                      </button>
                    </div>

                    {/* Host Compile Preview */}
                    <p className="text-[10px] text-gray-400 leading-normal select-none break-all">
                      {t.preview}
                      <span className="font-mono bg-card-light/50 dark:bg-sidebar-dark/60 border border-border-light/40 dark:border-border-dark/40 px-2 py-0.5 rounded-lg ml-1 text-gray-500 dark:text-gray-300 select-all font-semibold break-all">
                        {activeProvider.baseUrl || 'Base URL empty'}
                        {activeProvider.id === 'gemini' 
                          ? '/v1beta/models/...:streamGenerateContent' 
                          : activeProvider.id === 'ollama' 
                          ? '/api/chat' 
                          : '/v1/chat/completions'}
                      </span>
                    </p>
                  </div>

                  {/* CORS Proxy Override field */}
                  <div className="space-y-2">
                    <label htmlFor={corsProxyInputId} className="block text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center uppercase tracking-wide select-none">
                      <span>{t.corsProxy}</span>
                      <span className="ml-1.5 text-[10px] text-gray-400 font-normal normal-case">{t.corsProxySubtext}</span>
                    </label>
                    <input
                      type="text"
                      key={`${selectedProviderId}-cors-proxy`}
                      ref={corsProxyDraftRef}
                      id={corsProxyInputId}
                      defaultValue={activeProvider.corsProxy}
                      onBlur={(event) => {
                        if (event.currentTarget.value !== activeProvider.corsProxy) void handleProviderConfigChange('corsProxy', event.currentTarget.value);
                      }}
                      placeholder="例: https://cors-anywhere.herokuapp.com/"
                      className="w-full px-3.5 py-2.5 text-sm bg-card-light dark:bg-sidebar-dark border border-border-light dark:border-border-dark rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:text-gray-100"
                    />
                  </div>

                  {/* Models grouped section */}
                  <div className="space-y-4.5 pt-4.5 border-t border-border-light dark:border-border-dark">
                    <div className="flex items-center justify-between select-none">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                          {t.models}
                        </span>
                        <span className="px-2 py-0.5 bg-blue-500/10 dark:bg-blue-500/15 text-blue-600 dark:text-sky-400 font-bold font-mono text-[10px] rounded-full">
                          {activeProvider.models.length}
                        </span>
                      </div>

                      <div className="flex space-x-2 shrink-0">
                        {/* Add custom model toggle button */}
	                        <button
	                          type="button"
	                          onClick={() => setIsAddingModel(!isAddingModel)}
	                          aria-label={t.addModelPlaceholder}
	                          className="p-1.5 border border-border-light dark:border-border-dark hover:bg-card-light dark:hover:bg-card-dark rounded-lg text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-sky-400 transition-colors cursor-pointer"
                          title="手動でモデルを追加"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        
                        {/* Fetch models button */}
                        <button
                          type="button"
                          onClick={handleFetchModels}
                          disabled={isFetchingModels}
                          className="px-3 py-1.5 bg-card-light hover:bg-card-light/80 dark:bg-sidebar-dark dark:hover:bg-sidebar-dark/80 border border-border-light dark:border-border-dark text-[11px] font-bold rounded-lg cursor-pointer transition-colors flex items-center space-x-1"
                        >
                          <RefreshCw className={`w-3 h-3 ${isFetchingModels ? 'animate-spin' : ''}`} />
                          <span>{isFetchingModels ? t.fetchModelsLoading : t.fetchModels}</span>
                        </button>
                      </div>
                    </div>

                    {/* Add custom model inline input */}
                    {isAddingModel && (
                      <form onSubmit={handleAddCustomModel} className="flex space-x-2 animate-scale-up bg-card-light/45 dark:bg-sidebar-dark/40 p-2.5 rounded-xl border border-border-light dark:border-border-dark">
                        <input
                          type="text"
	                          required
	                          aria-label={t.addModelPlaceholder}
	                          placeholder={t.addModelPlaceholder}
                          value={newModelId}
                          onChange={(e) => setNewModelId(e.target.value)}
                          className="flex-1 px-3 py-1.5 text-xs bg-bg-light dark:bg-bg-dark border border-border-light dark:border-border-dark rounded-lg focus:outline-none focus:border-blue-500"
                        />
                        <button
                          type="submit"
                          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors"
                        >
                          {t.add}
                        </button>
                      </form>
                    )}

                    {/* Fetch error display */}
                    {fetchError && (
                      <div className="flex items-start text-[11px] text-red-500 space-x-1.5 bg-red-500/10 border border-red-500/20 p-3 rounded-xl leading-tight animate-scale-up select-none">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span className="font-semibold">{fetchError}</span>
                      </div>
                    )}

                    {/* Grouped list of models */}
                    <div className="space-y-4 max-h-[170px] overflow-y-auto p-2 border border-border-light dark:border-border-dark rounded-xl bg-card-light/10 dark:bg-sidebar-dark/5 shadow-inner">
                      {activeProvider.models.length === 0 ? (
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center py-6 font-semibold select-none">
                          {t.noModels}
                        </p>
                      ) : (
                        Object.entries(groupedModels).map(([groupName, mList]) => (
                          <div key={groupName} className="space-y-1.5">
                            {/* Group name sub-header */}
                            <div className="px-2.5 py-1 text-[9px] font-bold text-gray-500 dark:text-gray-500 uppercase tracking-widest border-b border-border-light/40 dark:border-border-dark/40 select-none bg-card-light/20 dark:bg-sidebar-dark/20 rounded">
                              {groupName}
                            </div>
                            
                            {/* Models rows */}
                            <div className="space-y-0.5 pl-1">
                              {mList.map((mId) => (
                                <div
                                  key={mId}
                                  className="group flex items-center justify-between py-1.5 px-2.5 hover:bg-card-light dark:hover:bg-card-dark rounded-lg transition-all"
                                >
                                  <div className="flex items-center space-x-2.5 truncate pr-4">
                                    <ModelIcon
                                      providerId={selectedProviderId}
                                      providerName={activeProvider.name}
                                      modelId={mId}
                                      className="w-4.5 h-4.5"
                                    />
                                    <span className="text-xs font-mono truncate select-all text-gray-800 dark:text-gray-200">{mId}</span>
                                  </div>

                                  {/* Delete model from provider list */}
	                                  <button
	                                    onClick={() => store.removeModelFromProvider(selectedProviderId, mId)}
	                                    aria-label={`${t.delete}: ${mId}`}
	                                    className="hover-action p-1 hover:text-red-500 text-gray-400 dark:text-gray-500 rounded-md cursor-pointer transition-all"
                                    title="このモデルを削除"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                </div>
              </div>
            )}

            {activeTab === 'prompt' && (
              <div className="flex-1 p-4 md:p-6 space-y-5 overflow-y-auto">
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-50 uppercase tracking-widest select-none font-heading">{t.systemPrompt}</h3>
                <div className="space-y-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed select-none">
                    {t.globalSystemPromptText}
                  </p>
                  <textarea
                    rows={7}
                    value={store.globalSystemPrompt}
                    onChange={(e) => store.updateSetting('globalSystemPrompt', e.target.value)}
                    placeholder="例: あなたは親切なプログラミングアシスタントです。常に日本語で簡潔に回答し、コード例を提示してください。"
                    className="w-full px-4 py-3.5 text-sm bg-card-light dark:bg-sidebar-dark border border-border-light dark:border-border-dark rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:text-gray-100 font-sans resize-none shadow-inner"
                  />
                  <button
                    onClick={() => {
                      setNewPresetContent(store.globalSystemPrompt);
                      setNewPresetName('');
                    }}
                    className="flex items-center space-x-1.5 px-3 py-1.5 text-[11px] font-bold border border-border-light dark:border-border-dark bg-card-light dark:bg-sidebar-dark text-gray-600 dark:text-gray-300 rounded-lg hover:text-blue-600 dark:hover:text-sky-400 cursor-pointer transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{t.saveCurrentAsPreset}</span>
                  </button>
                </div>

                {/* Preset library */}
                <div className="space-y-3 border-t border-border-light dark:border-border-dark pt-5">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-50 uppercase tracking-widest select-none font-heading">{t.promptPresets}</h3>

                  {/* New preset form */}
                  <div className="space-y-2 bg-card-light/40 dark:bg-sidebar-dark/30 p-3 rounded-xl border border-border-light dark:border-border-dark">
                    <input
                      type="text"
                      value={newPresetName}
                      onChange={(e) => setNewPresetName(e.target.value)}
                      placeholder={t.presetName}
                      className="w-full px-3 py-2 text-xs bg-bg-light dark:bg-bg-dark border border-border-light dark:border-border-dark rounded-lg focus:outline-none focus:border-blue-500 dark:text-gray-100"
                    />
                    <textarea
                      rows={3}
                      value={newPresetContent}
                      onChange={(e) => setNewPresetContent(e.target.value)}
                      placeholder={t.presetContentPlaceholder}
                      className="w-full px-3 py-2 text-xs bg-bg-light dark:bg-bg-dark border border-border-light dark:border-border-dark rounded-lg focus:outline-none focus:border-blue-500 dark:text-gray-100 resize-none"
                    />
                    <button
                      onClick={handleSavePreset}
                      disabled={!newPresetName.trim() || !newPresetContent.trim()}
                      className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg text-[11px] font-bold cursor-pointer transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{t.savePreset}</span>
                    </button>
                  </div>

                  {/* Preset list */}
                  {store.promptPresets.length === 0 ? (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center py-4 select-none">{t.noPresets}</p>
                  ) : (
                    <div className="space-y-2">
                      {store.promptPresets.map((p) => (
                        <div key={p.id} className="group flex items-start justify-between p-3 rounded-xl border border-border-light dark:border-border-dark bg-card-light/20 dark:bg-sidebar-dark/10">
                          <div className="min-w-0 flex-1 pr-3">
                            <div className="flex items-center space-x-1.5 mb-1">
                              <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-sky-400 shrink-0" />
                              <span className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">{p.name}</span>
                            </div>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">{p.content}</p>
                          </div>
                          <div className="flex items-center space-x-1 shrink-0">
                            <button
                              onClick={() => store.updateSetting('globalSystemPrompt', p.content)}
                              title={t.applyToGlobal}
                              className="px-2 py-1 text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-sky-400 rounded-md hover:bg-blue-500/20 cursor-pointer transition-colors"
                            >
                              {t.useThisPreset}
                            </button>
	                            <button
	                              onClick={() => store.deletePromptPreset(p.id)}
	                              aria-label={`${t.delete}: ${p.name}`}
	                              className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-md cursor-pointer transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'pricing' && (
              <div className="flex-1 p-4 md:p-6 space-y-5 overflow-y-auto">
                <div className="space-y-1.5 select-none">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-50 uppercase tracking-widest font-heading">{t.pricing}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{t.pricingDesc}</p>
                </div>

                {/* Add price form */}
                <div className="grid grid-cols-12 gap-2 bg-card-light/40 dark:bg-sidebar-dark/30 p-3 rounded-xl border border-border-light dark:border-border-dark items-center">
	                  <input
	                    type="text"
	                    aria-label={t.priceModelPlaceholder}
	                    value={newPriceModel}
                    onChange={(e) => setNewPriceModel(e.target.value)}
                    placeholder={t.priceModelPlaceholder}
                    className="col-span-12 sm:col-span-5 px-3 py-2 text-xs bg-bg-light dark:bg-bg-dark border border-border-light dark:border-border-dark rounded-lg focus:outline-none focus:border-blue-500 dark:text-gray-100"
                  />
	                  <input
	                    type="number" step="0.01"
	                    aria-label={t.priceInputLabel}
	                    value={newPriceIn}
                    onChange={(e) => setNewPriceIn(e.target.value)}
                    placeholder={t.priceInputLabel}
                    className="col-span-5 sm:col-span-3 px-2 py-2 text-xs bg-bg-light dark:bg-bg-dark border border-border-light dark:border-border-dark rounded-lg focus:outline-none focus:border-blue-500 dark:text-gray-100"
                  />
	                  <input
	                    type="number" step="0.01"
	                    aria-label={t.priceOutputLabel}
	                    value={newPriceOut}
                    onChange={(e) => setNewPriceOut(e.target.value)}
                    placeholder={t.priceOutputLabel}
                    className="col-span-5 sm:col-span-3 px-2 py-2 text-xs bg-bg-light dark:bg-bg-dark border border-border-light dark:border-border-dark rounded-lg focus:outline-none focus:border-blue-500 dark:text-gray-100"
                  />
	                  <button
	                    onClick={handleAddPrice}
	                    aria-label={t.addPrice}
	                    className="col-span-2 sm:col-span-1 flex items-center justify-center p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {/* User overrides list */}
                <div className="space-y-1.5">
                  {Object.keys(store.modelPricing).length === 0 ? (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center py-4 select-none">{t.noModels}</p>
                  ) : (
                    Object.entries(store.modelPricing).map(([modelId, price]) => (
                      <div key={modelId} className="group flex items-center justify-between py-2 px-3 rounded-lg border border-border-light dark:border-border-dark bg-card-light/20 dark:bg-sidebar-dark/10">
                        <span className="text-xs font-mono text-gray-800 dark:text-gray-200 truncate pr-3">{modelId}</span>
                        <div className="flex items-center space-x-3 shrink-0">
                          <span className="text-[11px] font-mono text-gray-500 dark:text-gray-400">
                            ${(price as ModelPrice).input} / ${(price as ModelPrice).output} <span className="text-gray-400">/1M</span>
                          </span>
	                          <button
	                            onClick={() => store.removeModelPrice(modelId)}
	                            aria-label={`${t.delete}: ${modelId}`}
	                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-md cursor-pointer transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="flex-1 p-4 md:p-6 space-y-5 overflow-y-auto">
                <div className="space-y-1.5 select-none">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-50 uppercase tracking-widest font-heading">{t.security}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{t.encryptKeysDesc}</p>
                </div>

                <div className="p-4 rounded-2xl border border-border-light dark:border-border-dark bg-card-light/30 dark:bg-sidebar-dark/20 space-y-4">
                  <div className="flex items-center space-x-2">
                    <Lock className={`w-4 h-4 ${store.keyEncryptionEnabled ? 'text-emerald-500' : 'text-gray-400'}`} />
                    <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{t.encryptKeys}</span>
                    {store.keyEncryptionEnabled && (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full">ON</span>
                    )}
                  </div>

                  {!store.keyEncryptionEnabled ? (
                    <div className="space-y-2.5">
	                      <input
	                        type="password"
	                        aria-label={t.passphrase}
	                        value={encPass}
                        onChange={(e) => setEncPass(e.target.value)}
                        placeholder={t.passphrase}
                        className="w-full px-3.5 py-2.5 text-sm bg-bg-light dark:bg-bg-dark border border-border-light dark:border-border-dark rounded-xl focus:outline-none focus:border-blue-500 dark:text-gray-100"
                      />
	                      <input
	                        type="password"
	                        aria-label={t.passphraseConfirm}
	                        value={encPass2}
                        onChange={(e) => setEncPass2(e.target.value)}
                        placeholder={t.passphraseConfirm}
                        className="w-full px-3.5 py-2.5 text-sm bg-bg-light dark:bg-bg-dark border border-border-light dark:border-border-dark rounded-xl focus:outline-none focus:border-blue-500 dark:text-gray-100"
                      />
                      {encError && <p className="text-xs text-red-500 font-semibold">{encError}</p>}
                      <button
                        onClick={handleEnableEncryption}
                        disabled={!encPass || !encPass2}
                        className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-sm font-bold cursor-pointer transition-colors"
                      >
                        {t.enableEncryption}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => store.disableKeyEncryption()}
                      disabled={store.keysLocked}
                      className="min-h-11 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold cursor-pointer transition-colors shadow-sm"
                    >
                      {t.disableEncryption}
                    </button>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'data' && (
              <div className="flex-1 p-4 md:p-6 space-y-6 overflow-y-auto">
                
                {/* Theme Selection */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-50 uppercase tracking-widest font-heading select-none">{t.theme}</h3>
                  <div className="flex space-x-2">
                    {(['light', 'dark', 'system'] as const).map((tVal) => (
                      <button
                        key={tVal}
                        onClick={() => store.updateSetting('theme', tVal)}
                        className={`flex-1 px-4 py-2.5 text-xs sm:text-sm font-semibold border rounded-xl transition-all cursor-pointer capitalize active:scale-98 shadow-sm ${
                          store.theme === tVal
                            ? 'bg-blue-600/10 border-blue-600 text-blue-600 dark:text-sky-400 font-bold'
                            : 'bg-card-light dark:bg-sidebar-dark border-border-light dark:border-border-dark text-gray-700 dark:text-gray-300 hover:bg-card-light dark:hover:bg-card-dark'
                        }`}
                      >
                        {tVal === 'light' ? t.themeLight : tVal === 'dark' ? t.themeDark : t.themeSystem}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Language Selection */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-50 uppercase tracking-widest font-heading select-none">{t.language}</h3>
                  <select
                    value={language}
                    onChange={(e) => store.updateSetting('language', e.target.value)}
                    className="w-full px-4 py-3 text-sm bg-card-light dark:bg-sidebar-dark border border-border-light dark:border-border-dark rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:text-gray-100 font-semibold cursor-pointer shadow-sm"
                  >
                    <option value="ja">日本語 (Japanese)</option>
                    <option value="en">English</option>
                    <option value="zh">简体中文 (Simplified Chinese)</option>
                  </select>
                </div>

                {/* Storage usage */}
                <div className="space-y-3.5 border-t border-border-light dark:border-border-dark pt-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 select-none">
                      <div className="flex items-center gap-2">
                        <HardDrive className="w-4 h-4 text-blue-600 dark:text-sky-400 shrink-0" />
                        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-50 uppercase tracking-widest font-heading">{t.storageUsage}</h3>
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">{t.storageUsageDesc}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void refreshStorage()}
                      disabled={storageLoading}
                      aria-label={t.storageRefresh}
                      className="shrink-0 min-h-9 px-3 py-1.5 flex items-center gap-1.5 text-[11px] font-bold border border-border-light dark:border-border-dark bg-card-light dark:bg-sidebar-dark text-gray-600 dark:text-gray-300 rounded-lg hover:text-blue-600 dark:hover:text-sky-400 disabled:opacity-50 cursor-pointer transition-colors"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${storageLoading ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">{storageLoading ? t.storageLoading : t.storageRefresh}</span>
                    </button>
                  </div>

                  {storageSummary && (
                    <div className="space-y-3">
                      {storageSummary.browserQuota != null && storageSummary.browserQuota > 0 && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                            <span>{t.storageBrowserQuota}</span>
                            <span className="font-mono text-gray-500 dark:text-gray-400">
                              {formatBytes(storageSummary.browserUsage ?? 0)} / {formatBytes(storageSummary.browserQuota)}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-black/5 dark:bg-white/8 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-blue-500 transition-all duration-300"
                              style={{
                                width: `${Math.min(100, ((storageSummary.browserUsage ?? 0) / storageSummary.browserQuota) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: t.storageAppData, value: storageSummary.totalAppBytes },
                          { label: t.storageChatData, value: storageSummary.chatDataBytes },
                          { label: t.storageOtherData, value: storageSummary.settingsBytes + storageSummary.foldersBytes },
                        ].map((item) => (
                          <div
                            key={item.label}
                            className="rounded-xl border border-border-light dark:border-border-dark bg-card-light/30 dark:bg-sidebar-dark/20 px-3 py-2.5 text-center"
                          >
                            <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 leading-tight">{item.label}</div>
                            <div className="mt-1 text-xs font-bold font-mono text-gray-800 dark:text-gray-100">{formatBytes(item.value)}</div>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-1.5">
                        <h4 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-0.5 select-none">
                          {t.storagePerChat}
                        </h4>
                        {storageSummary.chats.length === 0 ? (
                          <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center py-4 select-none">{t.storageNoChats}</p>
                        ) : (
                          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-0.5">
                            {storageSummary.chats.map((entry) => {
                              const share = formatPercent(entry.totalBytes, storageSummary.chatDataBytes);
                              const barWidth = storageSummary.chatDataBytes
                                ? Math.max(4, (entry.totalBytes / storageSummary.chatDataBytes) * 100)
                                : 0;
                              const title = entry.title === 'New Chat' ? t.newChat : entry.title;

                              return (
                                <div
                                  key={entry.chatId}
                                  className="group flex items-center gap-2.5 px-3 py-2 rounded-xl border border-border-light dark:border-border-dark bg-card-light/20 dark:bg-sidebar-dark/10"
                                >
                                  <div className="flex-1 min-w-0 space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{title}</span>
                                      <span className="text-[11px] font-mono font-bold text-blue-700 dark:text-sky-400 shrink-0">{formatBytes(entry.totalBytes)}</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-black/5 dark:bg-white/8 overflow-hidden">
                                      <div
                                        className="h-full rounded-full bg-blue-500/80"
                                        style={{ width: `${barWidth}%` }}
                                      />
                                    </div>
                                    <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-500">
                                      <span>{t.storageMessageCount.replace('{count}', String(entry.messageCount))}</span>
                                      <span>{share}</span>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteChatFromStorage(entry.chatId)}
                                    aria-label={`${t.delete}: ${title}`}
                                    className="shrink-0 min-w-8 min-h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg cursor-pointer transition-colors opacity-70 group-hover:opacity-100"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Import / Export & Clear */}
                <div className="space-y-3.5 border-t border-border-light dark:border-border-dark pt-5 select-none">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-50 uppercase tracking-widest font-heading">{t.dataManagement}</h3>
                  
                  <div className="grid grid-cols-2 gap-3.5">
                    <button
                      onClick={handleExportData}
                      className="px-4 py-3 text-xs sm:text-sm font-bold border border-border-light dark:border-border-dark bg-card-light dark:bg-sidebar-dark text-gray-700 dark:text-gray-300 rounded-xl hover:bg-card-light dark:hover:bg-card-dark transition-all cursor-pointer shadow-sm active:scale-[0.98]"
                    >
                      {t.exportHistory}
                    </button>
                    
                    <label className="flex items-center justify-center px-4 py-3 text-xs sm:text-sm font-bold border border-border-light dark:border-border-dark bg-card-light dark:bg-sidebar-dark text-gray-700 dark:text-gray-300 rounded-xl hover:bg-card-light dark:hover:bg-card-dark transition-all cursor-pointer shadow-sm active:scale-[0.98] relative">
                      <span>{t.importHistory}</span>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportData}
                        className="hidden"
                      />
                    </label>
                  </div>
                  
                  <div className="border-t border-border-light dark:border-border-dark pt-5 mt-3 select-none">
                    <button
                      onClick={handleClearAll}
                      className="w-full px-4 py-3 text-xs sm:text-sm font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-md shadow-red-600/15 hover:shadow-red-700/25 transition-all cursor-pointer active:scale-[0.98] duration-100"
                    >
                      {t.clearAllData}
                    </button>
                    <p className="text-[10px] text-gray-400 mt-2 text-center font-medium leading-normal">
                      {t.clearDataWarning}
                    </p>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>

        {(notice || confirmDialog) && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div
              ref={nestedDialogRef}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="settings-notice-title"
              tabIndex={-1}
              className="w-full max-w-sm rounded-2xl border border-border-light dark:border-border-dark bg-card-light dark:bg-sidebar-dark p-5 shadow-2xl"
            >
              <p id="settings-notice-title" className="text-sm font-semibold leading-relaxed text-gray-800 dark:text-gray-100">
                {notice || confirmDialog?.message}
              </p>
              <div className="mt-5 flex justify-end gap-2">
                {confirmDialog ? (
                  <>
                    <button
                      type="button"
                      onClick={closeConfirm}
                      className="px-3.5 py-2 rounded-xl border border-border-light dark:border-border-dark text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-sky-400 cursor-pointer transition-colors"
                    >
                      {t.cancel}
                    </button>
                    <button
                      type="button"
                      onClick={acceptConfirm}
                      className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white cursor-pointer transition-colors"
                    >
                      {t.ok}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setNotice(null)}
                    className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white cursor-pointer transition-colors"
                  >
                    {t.ok}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
