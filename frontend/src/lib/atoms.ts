import { atom } from 'jotai';

export interface Message {
  content: string;
  isUser: boolean;
  timestamp: Date;
  model: string;
  completedAt?: Date; // When the message was completed (for AI messages)
  status?: 'complete' | 'incomplete' | 'streaming' | 'terminated';
  isComplete?: boolean;
  tempId?: string; // For tracking optimistic messages
  tokens?: number; // Token count for this message
}

export interface User {
  id: number;
  login: string;
  avatar_url: string;
  name: string;
  email: string;
}

export interface Model {
  id: string;
  name: string;
  provider: string;
  supports_search: boolean;
  description: string;
}

export interface Chat {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: Message[];
  message_count?: number; // Count of messages in this chat
  isDraft?: boolean;
}

export const chatMessagesAtom = atom<Message[]>([]);
export const isLoadingAtom = atom(false);
export const chatPositionAtom = atom<'bottom' | 'top' | 'right'>('bottom');
export const isAutoScrollAtom = atom(true);
export const sidebarCollapsedAtom = atom(false);
export const userAtom = atom<User | null>(null);
export const isAuthLoadingAtom = atom(false);

// New atoms for chat management
export const chatsAtom = atom<{ chats: Chat[] } | null>(null);

// Search state atom for managing Google Search functionality
export const searchEnabledAtom = atom(false);

// Model selection atoms
export const selectedModelAtom = atom<Model>({
  id: "gemini-2.0-flash",
  name: "Gemini 2.0 Flash",
  provider: "google",
  supports_search: true,
  description: "Google's latest multimodal AI model"
});

export const availableModelsAtom = atom<Model[]>([]);

export const isOpenAtom = atom(false);

// activeChatId and isDraft are now handled by the router's sta te and URL.
// export const activeChatIdAtom = atom<string | null>(null);
// export const isDraftChatAtom = atom<boolean>(true); 