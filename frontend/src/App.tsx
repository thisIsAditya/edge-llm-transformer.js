import { useCallback } from "react";
import { Sidebar } from "./components/Sidebar.js";
import { ChatWindow } from "./components/ChatWindow.js";
import { LoadingScreen } from "./components/LoadingScreen.js";
import { useConversations } from "./hooks/useConversations.js";
import { useTitleGenerator } from "./hooks/useTitleGenerator.js";
import { useModelsContext } from "./context/ModelsContext.js";

export function App() {
  const { allReady } = useModelsContext();
  const {
    conversations,
    activeId,
    loading,
    createConversation,
    selectConversation,
    renameConversation,
    deleteConversation,
  } = useConversations();

  const { generateTitle } = useTitleGenerator();

  const handleTitleGenerated = useCallback(
    async (convId: string, userText: string) => {
      try {
        const title = await generateTitle(userText);
        if (title) await renameConversation(convId, title);
      } catch {
      }
    },
    [generateTitle, renameConversation]
  );

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;

  if (!allReady) {
    return <LoadingScreen />;
  }

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        loading={loading}
        onNew={createConversation}
        onSelect={selectConversation}
        onRename={renameConversation}
        onDelete={deleteConversation}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-app">
        {activeId ? (
          <ChatWindow
            key={activeId}
            conversationId={activeId}
            conversationTitle={activeConversation?.title ?? null}
            onTitleGenerated={(text) => handleTitleGenerated(activeId, text)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 select-none">
            <div className="w-14 h-14 rounded-2xl bg-panel border border-border flex items-center justify-center shadow-lg shadow-violet-200/50">
              <span className="text-3xl text-brand">✦</span>
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm text-ink-soft">Your private, on-device AI assistant</p>
              <p className="text-xs text-ink-dim">Nothing leaves your machine.</p>
            </div>
            <button
              onClick={createConversation}
              className="mt-1 px-5 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-medium transition-colors shadow-md shadow-violet-300/60"
            >
              Start a conversation
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
