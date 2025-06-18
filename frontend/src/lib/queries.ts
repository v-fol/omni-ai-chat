import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as chatApi from './api/chat';
import * as authApi from './api/auth';
import type { Chat, User, Model } from './atoms';

const API_BASE_URL = 'http://localhost:8000';

// Auth Queries
export const useAuthStatus = () => {
  return useQuery<User | null>({
    queryKey: ['authStatus'],
    queryFn: authApi.getAuthStatus,
    staleTime: Infinity, // User session is stable
  });
};

export const useLogout = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      queryClient.setQueryData(['authStatus'], null);
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },
  });
};

// Chat Queries
export const useChats = () => {
  const { data: user } = useAuthStatus();
  return useQuery<{ chats: Chat[] }>({
    queryKey: ['chats'],
    queryFn: chatApi.getChats,
    enabled: !!user, // Only fetch chats if user is logged in
  });
};

export const useChat = (chatId: string | null) => {
  return useQuery({
    queryKey: ['chat', chatId],
    queryFn: () => chatApi.getChat(chatId!),
    enabled: !!chatId,
  });
};

export const useCreateChat = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: chatApi.createChat,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },
  });
};

export const useDeleteChat = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chatId: string) => chatApi.deleteChat(chatId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },
  });
};

export const useModels = () => {
  return useQuery({
    queryKey: ['models'],
    queryFn: async (): Promise<{ models: Model[] }> => {
      const response = await fetch(`${API_BASE_URL}/models/available`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch models');
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Search functions
export async function searchChatTitles(query: string, limit: number = 20) {
  try {
    const response = await fetch(`${API_BASE_URL}/search/titles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ query, limit }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Search titles error:', error);
    throw error;
  }
}

export async function searchChatMessages(query: string, limit: number = 20) {
  try {
    const response = await fetch(`${API_BASE_URL}/search/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ query, limit }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Search messages error:', error);
    throw error;
  }
}

// React Query hooks for search
export function useSearchTitles(query: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['searchTitles', query],
    queryFn: () => searchChatTitles(query),
    enabled: enabled && query.trim().length > 0,
    staleTime: 30000, // 30 seconds
  });
}

export function useSearchMessages(query: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['searchMessages', query],
    queryFn: () => searchChatMessages(query),
    enabled: enabled && query.trim().length > 0,
    staleTime: 30000, // 30 seconds
  });
} 