import { useRef, useCallback, memo, forwardRef, useImperativeHandle } from 'react';
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
  isFloating?: boolean;
}

export interface ChatInputRef {
  setText: (text: string) => void;
  focus: () => void;
}

const ChatInput = memo(forwardRef<ChatInputRef, ChatInputProps>(({
  onSendMessage,
  isLoading,
  searchEnabled,
  theme,
  placeholder,
  className,
  inputWrapperClass = '',
  inputHeight = '',
  rows = 3,
  isFloating = false
}, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    setText: (text: string) => {
      if (textareaRef.current) {
        textareaRef.current.value = text;
      }
    },
    focus: () => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
  }), []);

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

  const defaultPlaceholder = searchEnabled 
    ? "Type your message... (Google Search enabled)" 
    : "Type your message...";

  return (
    <div className={cn(inputWrapperClass, inputHeight, "relative", className)}>
      <textarea
        ref={textareaRef}
        className={cn(
          "w-full resize-none focus:outline-none transition-all duration-200",
          isFloating ? (
            cn(
              "p-3 pr-12 bg-transparent border-0 focus:ring-0",
              searchEnabled && "pl-16",
              inputHeight || "min-h-[44px]",
              theme === 'dark' ? 'text-neutral-100 placeholder:text-neutral-400' : 'text-neutral-900 placeholder:text-neutral-500'
            )
          ) : (
            cn(
              "p-2 pr-12 rounded-md border focus:ring-2 focus:ring-accent-blue/50",
              inputHeight,
              searchEnabled && "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20",
              theme === 'dark' 
                ? 'bg-background-dark-secondary text-text-light-primary border-border-dark' 
                : 'bg-background-secondary text-text-primary border-border-light'
            )
          )
        )}
        rows={rows}
        placeholder={placeholder || defaultPlaceholder}
        onKeyDown={handleKeyDown}
        disabled={isLoading}
      />
      {searchEnabled && (
        <div className={cn(
          "absolute flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400",
          isFloating ? "left-3 top-1/2 transform -translate-y-1/2" : "left-2 top-2"
        )}>
          <Search className="w-3 h-3" />
          <span className="font-medium">Search</span>
        </div>
      )}
    </div>
  );
}));

ChatInput.displayName = 'ChatInput';

export { ChatInput }; 