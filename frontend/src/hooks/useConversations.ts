import { useState, useCallback, useEffect } from "react";
import { api, type Conversation } from "../lib/api.js";

interface UseConversationsReturn {
  conversations: Conversation[];
  activeId: string | null;
  loading: boolean;
  createConversation: () => Promise<string>;
  selectConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
}

export function useConversations(): UseConversationsReturn {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listConversations()
      .then((list) => {
        setConversations(list);
        if (list.length > 0) setActiveId(list[0]!.id);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const createConversation = useCallback(async (): Promise<string> => {
    const conv = await api.createConversation();
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    return conv.id;
  }, []);

  const selectConversation = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const renameConversation = useCallback(async (id: string, title: string) => {
    await api.renameConversation(id, title);
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c))
    );
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      await api.deleteConversation(id);
      setConversations((prev) => {
        const next = prev.filter((c) => c.id !== id);
        if (activeId === id) {
          setActiveId(next[0]?.id ?? null);
        }
        return next;
      });
    },
    [activeId]
  );

  return {
    conversations,
    activeId,
    loading,
    createConversation,
    selectConversation,
    renameConversation,
    deleteConversation,
  };
}
