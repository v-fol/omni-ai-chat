import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAtom } from 'jotai';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme-context';
import { chatPositionAtom, isLoadingAtom } from '@/lib/atoms';
import { useCallback } from 'react';
import { useCreateChat } from '@/lib/queries';
import { FloatingChatContainer } from '@/components/chat/FloatingChatContainer';

export const Route = createFileRoute('/')({
  component: NewChatComponent,
})

function NewChatComponent() {
  const navigate = useNavigate();
  const [chatPosition] = useAtom(chatPositionAtom);
  const { theme } = useTheme();
  const [isLoading, setIsLoading] = useAtom(isLoadingAtom);
  const createChatMutation = useCreateChat();
  
  const handleSendMessage = useCallback((message: string) => {
    if (!message.trim() || createChatMutation.isPending) return;
    
    createChatMutation.mutate(message, {
      onSuccess: (data) => {
        navigate({ 
          to: '/chat/$chatId', 
          params: { chatId: data.id },
          state: { firstMessage: message }
        });
      },
      onError: (error) => {
        console.error('Failed to create chat:', error);
        alert('Failed to create chat. Please try again.');
      }
    });
  }, [createChatMutation, navigate]);
  
  return (
    <div className={cn("flex-1 flex", chatPosition === 'right' ? 'flex-row' : 'flex-col', chatPosition === 'top' && 'flex-col-reverse')}>
      <div className="flex-1 flex flex-col justify-center items-center">
      <h2 className="text-2xl font-semibold text-neutral-400">New Omni Chat</h2>

      </div>
      
      <FloatingChatContainer
        onSendMessage={handleSendMessage}
        onVoiceTranscription={() => {}}
        onTerminateGeneration={() => {}}
        isLoading={createChatMutation.isPending}
        placeholder="Type a message to start a new chat..."
      />
    </div>
  );
} 