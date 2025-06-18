import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react';
import { useAtom } from 'jotai';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme-context';
import { chatPositionAtom, isLoadingAtom, userAtom } from '@/lib/atoms';
import { useCreateChat } from '@/lib/queries';
import { FloatingChatContainer } from '@/components/chat/FloatingChatContainer';
import { Button } from '@/components/ui/button';
import { LogIn, MessageCircle } from 'lucide-react';
import { GitHubLoginButton } from '@/components/auth/GitHubLoginButton';

export const Route = createFileRoute('/')({
  component: NewChatComponent,
})

function NewChatComponent() {
  const navigate = useNavigate();
  const [chatPosition] = useAtom(chatPositionAtom);
  const { theme } = useTheme();
  const [isLoading, setIsLoading] = useAtom(isLoadingAtom);
  const [user] = useAtom(userAtom);
  const createChatMutation = useCreateChat();
  
  const handleSendMessage = useCallback((message: string) => {
    if (!user) return; // Prevent action if not authenticated
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
  }, [createChatMutation, navigate, user]);

  // Show login prompt if user is not authenticated
  if (!user) {
    return (
      <div className={cn("flex-1 flex", chatPosition === 'right' ? 'flex-row' : 'flex-col', chatPosition === 'top' && 'flex-col-reverse')}>
        <div className="flex-1 flex flex-col justify-center items-center">
          <div className="max-w-md text-center space-y-6">
            <div className="space-y-3">
              <MessageCircle className="w-16 h-16 text-neutral-400 mx-auto" />
              <h2 className="text-3xl font-semibold text-neutral-400">Welcome to Omni Chat</h2>
              <p className="text-neutral-500">
                Start intelligent conversations with multiple AI models. 
                Please sign in with GitHub to begin chatting.
              </p>
            </div>
            
            <div className="space-y-4 w-full flex flex-col items-center">
              <GitHubLoginButton />
              <p className="text-xs text-neutral-400">
                Your chats are private and associated with your GitHub account
              </p>
            </div>
          </div>
        </div>
        
        {/* Still show the chat container but disabled */}
        <FloatingChatContainer
          onSendMessage={handleSendMessage}
          onVoiceTranscription={() => {}}
          onTerminateGeneration={() => {}}
          isLoading={false}
          placeholder="Please sign in to start chatting..."
        />
      </div>
    );
  }
  
  return (
    <div className={cn("flex-1 flex", chatPosition === 'right' ? 'flex-row' : 'flex-col', chatPosition === 'top' && 'flex-col-reverse')}>
      <div className="flex-1 flex flex-col justify-center items-center">
        <h2 className="text-2xl font-semibold text-neutral-400">New Omni Chat</h2>
        <p className="text-neutral-500 mt-2">Start a conversation with AI</p>
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