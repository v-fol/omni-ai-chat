import { useRef, useCallback, memo, forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  theme: string;
  placeholder?: string;
  className?: string;
  inputWrapperClass?: string;
  inputHeight?: string;
  rows?: number;
  isFloating?: boolean;
  disabled?: boolean;
  onInputChange?: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

export interface ChatInputRef {
  setText: (text: string) => void;
  focus: () => void;
  getValue: () => string;
  clear: () => void;
}

const ChatInput = memo(forwardRef<ChatInputRef, ChatInputProps>(({
  theme,
  placeholder,
  className,
  inputWrapperClass = '',
  inputHeight = '',
  rows = 3,
  isFloating = false,
  disabled = false,
  onInputChange,
  onKeyDown
}, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [inputValue, setInputValue] = useState('');

  useImperativeHandle(ref, () => ({
    setText: (text: string) => {
      if (textareaRef.current) {
        textareaRef.current.value = text;
        setInputValue(text);
        onInputChange?.(text);
      }
    },
    focus: () => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    },
    getValue: () => {
      return textareaRef.current?.value || '';
    },
    clear: () => {
      if (textareaRef.current) {
        textareaRef.current.value = '';
        setInputValue('');
        onInputChange?.('');
      }
    }
  }), [onInputChange]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputValue(value);
    onInputChange?.(value);
  }, [onInputChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    onKeyDown?.(e);
  }, [onKeyDown]);

  const defaultPlaceholder = "Type your message...";

  return (
    <div className={cn(inputWrapperClass, inputHeight, "relative", className)}>
      <textarea
        ref={textareaRef}
        className={cn(
          "w-full resize-none focus:outline-none transition-all duration-200",
          isFloating ? (
            cn(
              "p-3 bg-transparent border-0 focus:ring-0",
              inputHeight || "min-h-[44px]",
              theme === 'dark' ? 'text-neutral-100 placeholder:text-neutral-400' : 'text-neutral-900 placeholder:text-neutral-500'
            )
          ) : (
            cn(
              "p-2 rounded-md border focus:ring-2 focus:ring-accent-blue/50",
              inputHeight,
              theme === 'dark' 
                ? 'bg-background-dark-secondary text-text-light-primary border-border-dark' 
                : 'bg-background-secondary text-text-primary border-border-light'
            )
          )
        )}
        rows={rows}
        placeholder={placeholder || defaultPlaceholder}
        onKeyDown={handleKeyDown}
        onChange={handleInputChange}
        disabled={disabled}
      />
    </div>
  );
}));

ChatInput.displayName = 'ChatInput';

export { ChatInput }; 