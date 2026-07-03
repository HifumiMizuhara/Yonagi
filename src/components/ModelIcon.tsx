import React from 'react';
import { Globe } from 'lucide-react';

interface ModelIconProps {
  providerId?: string;
  providerName?: string;
  modelId?: string;
  className?: string;
}

const detectProviderKey = ({ providerId, providerName, modelId }: Omit<ModelIconProps, 'className'>) => {
  const haystack = [providerId, providerName, modelId].filter(Boolean).join(' ').toLowerCase();

  if (haystack.includes('gemini') || haystack.includes('google')) return 'gemini';
  if (haystack.includes('claude') || haystack.includes('anthropic')) return 'claude';
  if (haystack.includes('openrouter')) return 'openrouter';
  if (haystack.includes('openai') || haystack.includes('chatgpt') || haystack.includes('gpt-')) return 'openai';
  if (haystack.includes('deepseek')) return 'deepseek';
  if (haystack.includes('ollama') || haystack.includes('llama') || haystack.includes('gemma') || haystack.includes('phi')) return 'ollama';
  if (haystack.includes('custom')) return 'custom';

  return 'default';
};

const baseClassName = 'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[0.7rem] border border-white/60 bg-white shadow-sm dark:border-white/10';

const iconUrl = (name: string) => `${import.meta.env.BASE_URL}model-icons/${name}`;

const iconMap = {
  gemini: {
    src: iconUrl('gemini.svg'),
    alt: 'Google Gemini',
    container: 'bg-white dark:bg-white',
  },
  claude: {
    src: iconUrl('anthropic.ico'),
    alt: 'Anthropic Claude',
    container: 'bg-white dark:bg-white',
  },
  openai: {
    src: iconUrl('openai.svg'),
    alt: 'OpenAI',
    container: 'bg-white dark:bg-white',
  },
  deepseek: {
    src: iconUrl('deepseek.ico'),
    alt: 'DeepSeek',
    container: 'bg-white dark:bg-white',
  },
  openrouter: {
    src: iconUrl('openrouter.ico'),
    alt: 'OpenRouter',
    container: 'bg-white dark:bg-white',
  },
  ollama: {
    src: iconUrl('ollama.png'),
    alt: 'Ollama',
    container: 'bg-white dark:bg-white',
  },
  custom: {
    container: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  },
  default: {
    container: 'bg-gray-100 text-gray-600 dark:bg-white/8 dark:text-gray-300',
  },
} as const;

export const ModelIcon: React.FC<ModelIconProps> = ({
  providerId,
  providerName,
  modelId,
  className = 'w-5 h-5',
}) => {
  const key = detectProviderKey({ providerId, providerName, modelId });
  const icon = iconMap[key];

  return (
    <span className={`${baseClassName} ${icon.container} ${className}`} aria-hidden="true">
      {'src' in icon ? (
        <img src={icon.src} alt={icon.alt} className="h-full w-full object-contain" />
      ) : (
        <Globe className="h-[62%] w-[62%]" strokeWidth={2.2} />
      )}
    </span>
  );
};
