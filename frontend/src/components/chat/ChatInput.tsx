import { useRef, useCallback, memo } from 'react';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';
import { VoiceRecordButton } from './VoiceRecordButton';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  onVoiceTranscription: (text: string) => void;
  isLoading: boolean;
  searchEnabled: boolean;
  theme: string;
  placeholder?: string;
  className?: string;
  inputWrapperClass?: string;
  inputHeight?: string;
  rows?: number;
}

const ChatInput = memo(({
  onSendMessage,
  onVoiceTranscription,
  isLoading,
  searchEnabled,
  theme,
  placeholder,
  className,
  inputWrapperClass = '',
  inputHeight = '',
  rows = 3
}: ChatInputProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const message = textareaRef.current?.value.trim();
      if (message) {
        onSendMessage(message);
        if (textareaRef.current) {
          textareaRef.current.value = '';
        }
      }
    }
  }, [onSendMessage]);

  const handleVoiceTranscription = useCallback((text: string) => {
    if (textareaRef.current) {
      textareaRef.current.value = text;
      textareaRef.current.focus();
    }
    onVoiceTranscription(text);
  }, [onVoiceTranscription]);

  const defaultPlaceholder = searchEnabled 
    ? "Type your message... (Google Search enabled)" 
    : "Type your message...";

  return (
    <div className={cn(inputWrapperClass, inputHeight, "relative", className)}>
      <textarea
        ref={textareaRef}
        className={cn(
          "w-full p-2 pr-12 rounded-md resize-none border focus:outline-none focus:ring-2 focus:ring-accent-blue/50",
          inputHeight,
          searchEnabled && "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20",
          theme === 'dark' 
            ? 'bg-background-dark-secondary text-text-light-primary border-border-dark' 
            : 'bg-background-secondary text-text-primary border-border-light'
        )}
        rows={rows}
        placeholder={placeholder || defaultPlaceholder}
        onKeyDown={handleKeyDown}
        disabled={isLoading}
      />
      {searchEnabled && (
        <div className="absolute left-2 top-2 flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
          <Search className="w-3 h-3" />
          <span className="font-medium">Search</span>
        </div>
      )}
      <div className="absolute right-2 top-2">
        <VoiceRecordButton
          onTranscriptionComplete={handleVoiceTranscription}
          disabled={isLoading}
          className="size-8"
        />
      </div>
    </div>
  );
});

ChatInput.displayName = 'ChatInput';

export { ChatInput }; 