import React, { useState, useEffect, useRef } from 'react';
import { useChatStore, type SearchResult } from '../store/useChatStore';
import { useTranslation } from '../hooks/useTranslation';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';
import { Search, X, User, MessageSquare } from 'lucide-react';

interface SearchModalProps {
  onClose: () => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({ onClose }) => {
  const searchMessages = useChatStore((state) => state.searchMessages);
  const selectChat = useChatStore((state) => state.selectChat);
  const setScrollTargetMessageId = useChatStore((state) => state.setScrollTargetMessageId);
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  useDialogAccessibility(dialogRef, onClose);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced search — avoid synchronous setState in effect body
  const displayResults = query.trim() ? results : [];

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    if (!query.trim()) return;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchMessages(query);
        if (requestIdRef.current === requestId) setResults(res);
      } finally {
        if (requestIdRef.current === requestId) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, searchMessages]);

  const handleSelect = async (chatId: string, messageId: string) => {
    await selectChat(chatId);
    setScrollTargetMessageId(messageId);
    onClose();
  };

  const highlight = (text: string) => {
    const q = query.trim();
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-amber-300/60 dark:bg-amber-500/40 text-gray-900 dark:text-amber-100 rounded px-0.5">
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-md p-4 pt-[8dvh] sm:pt-[12dvh] animate-fade-in touch-none overscroll-none"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="search-dialog-title"
        tabIndex={-1}
        className="relative flex flex-col w-full max-w-2xl max-h-[80dvh] sm:max-h-[70dvh] bg-card-light/95 dark:bg-sidebar-dark/95 border border-border-light/80 dark:border-border-dark/80 rounded-3xl shadow-2xl shadow-black/30 overflow-hidden font-sans backdrop-blur-2xl touch-none"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="search-dialog-title" className="sr-only">{t.search}</h2>
        {/* Search input */}
        <div className="flex items-center px-5 py-4 border-b border-border-light dark:border-border-dark shrink-0">
          <Search className="w-5 h-5 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              const value = e.target.value;
              setQuery(value);
              if (!value.trim()) {
                requestIdRef.current += 1;
                setLoading(false);
                setResults([]);
              }
            }}
            placeholder={t.searchPlaceholder}
            aria-label={t.searchPlaceholder}
            className="flex-1 mx-3 bg-transparent focus:outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400"
          />
          <button
            onClick={onClose}
            aria-label={t.close}
            className="min-w-11 min-h-11 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer transition-colors shrink-0"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto touch-pan-y p-2">
          {!query.trim() ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-xs text-gray-400 dark:text-gray-500 space-y-2 select-none">
	              <Search className="w-8 h-8 stroke-[1.2] text-amber-500/40" />
	              <p>{t.searchHint}</p>
            </div>
          ) : loading ? (
            <div className="py-16 text-center text-xs text-gray-400 select-none">…</div>
          ) : displayResults.length === 0 ? (
            <div className="py-16 text-center text-xs text-gray-400 dark:text-gray-500 select-none">
              {t.searchNoResults}
            </div>
          ) : (
            <div className="space-y-1">
              {displayResults.map((r) => (
                <button
                  key={r.messageId}
                  onClick={() => handleSelect(r.chatId, r.messageId)}
                  className="w-full text-left px-3.5 py-3 rounded-xl hover:bg-amber-500/5 dark:hover:bg-amber-500/10 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center space-x-2 text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wide">
                    {r.role === 'user'
                      ? <User className="w-3 h-3" />
                      : <MessageSquare className="w-3 h-3" />}
                    <span className="truncate group-hover:text-amber-600 dark:group-hover:text-amber-400">{r.chatTitle}</span>
                  </div>
                  <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                    {highlight(r.snippet)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
