import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAtom } from 'jotai';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme-context';
import { chatPositionAtom, isAutoScrollAtom, isLoadingAtom } from '@/lib/atoms';
import { useState } from 'react';
import { LayoutGrid, ArrowDown, Sun, Moon } from 'lucide-react';
import { useCreateChat } from '@/lib/queries';
import { Switch } from '@/components/ui/switch';

const layoutConfig = {
  bottom: { inputWrapperClass: 'pl-0 pb-1 pt-2 pr-4', controlsWrapperClass: 'flex flex-col items-center gap-2 p-2', inputRows: 3, inputHeight: '' },
  top: { inputWrapperClass: 'pl-0 pb-1.5 pt-2 pr-4', controlsWrapperClass: 'flex flex-col items-center gap-2 p-2', inputRows: 3, inputHeight: '' },
  right: { sidebarClass: 'flex flex-col w-80 min-w-[16rem] max-w-xs p-4 border-l', inputWrapperClass: 'flex-1', controlsWrapperClass: 'flex flex-row items-center gap-4 mb-4', inputRows: 8, inputHeight: 'h-32' },
};

export const Route = createFileRoute('/')({
  component: NewChatComponent,
})

function NewChatComponent() {
  const navigate = useNavigate();
  const createChatMutation = useCreateChat();

  const [inputValue, setInputValue] = useState('');
  const [chatPosition, setChatPosition] = useAtom(chatPositionAtom);
  const [isAutoScroll, setIsAutoScroll] = useAtom(isAutoScrollAtom);
  const [isLoading, setIsLoading] = useAtom(isLoadingAtom);
  const { theme, toggleTheme } = useTheme();

  const handleSendMessage = () => {
    if (!inputValue.trim() || createChatMutation.isPending) return;
    
    createChatMutation.mutate(inputValue.trim(), {
      onSuccess: (newChat) => {
        navigate({
          to: '/chat/$chatId',
          params: { chatId: newChat.id },
          state: { firstMessage: inputValue.trim() }
        });
      },
      onError: (error) => {
        console.error("Failed to create chat:", error);
        alert("Could not start a new chat. Please try again.");
      },
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  const handlePositionChange = () => {
    const positions = Object.keys(layoutConfig) as (keyof typeof layoutConfig)[];
    const currentIndex = positions.indexOf(chatPosition);
    const nextIndex = (currentIndex + 1) % positions.length;
    setChatPosition(positions[nextIndex]);
  };
  
  const config = layoutConfig[chatPosition];

  const controls = (
    <div className={cn(config.controlsWrapperClass)}>
      <Tooltip>
        <TooltipTrigger asChild><Button variant="outline" size="icon" onClick={handlePositionChange} className="rounded-full size-6"><LayoutGrid className="w-3 h-3" /></Button></TooltipTrigger>
        <TooltipContent>Move input area</TooltipContent>
      </Tooltip>
      <div className="flex items-center gap-2">
        <Switch
          checked={isAutoScroll}
          onCheckedChange={setIsAutoScroll}
        />
        <span className="text-sm text-neutral-600 dark:text-neutral-400">Auto-scroll</span>
      </div>
      <Tooltip>
        <TooltipTrigger asChild><Button variant="outline" size="icon" onClick={toggleTheme} className="rounded-full size-6">{theme === 'dark' ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}</Button></TooltipTrigger>
        <TooltipContent>{theme === 'dark' ? "Light mode" : "Dark mode"}</TooltipContent>
      </Tooltip>
    </div>
  );

  const input = (
    <div className={cn(config.inputWrapperClass, config.inputHeight)}>
      <textarea
        className={cn("w-full p-2 rounded-md resize-none border focus:outline-none focus:ring-2 focus:ring-accent-blue/50", config.inputHeight, theme === 'dark' ? 'bg-background-dark-secondary text-text-light-primary border-border-dark' : 'bg-background-secondary text-text-primary border-border-light')}
        rows={config.inputRows}
        placeholder="Type a message to start a new chat..."
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyPress={handleKeyPress}
        disabled={createChatMutation.isPending}
      />
    </div>
  );
  
  return (
    <div className={cn("flex-1 flex", chatPosition === 'right' ? 'flex-row' : 'flex-col', chatPosition === 'top' && 'flex-col-reverse')}>
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <h2 className="text-2xl font-semibold text-neutral-400">New Omni Chat</h2>
      </div>
      
      {chatPosition === 'right' ? (
        <div className={cn('sidebarClass' in config && config.sidebarClass, theme === 'dark' ? 'border-border-dark' : 'border-border-light')}>
          <div className="flex flex-row items-center gap-4 p-4">{controls}</div>
          <div className="flex-1 p-4 pt-0">{input}</div>
        </div>
      ) : (
        <div className={cn("flex flex-row border-t", theme === 'dark' ? 'border-border-dark' : 'border-border-light')}>
          <div className="flex flex-col items-center gap-2 p-2">{controls}</div>
          <div className="flex-1">{input}</div>
        </div>
      )}
    </div>
  );
} 