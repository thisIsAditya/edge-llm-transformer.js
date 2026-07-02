import { useState, useRef, useEffect } from "react";
import { Plus, Trash2, Pencil, Check, X, MessageSquare, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { Conversation } from "../lib/api.js";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  loading: boolean;
  onNew: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const COLLAPSE_KEY = "sidebar-collapsed";

function ConversationItem({
  conv,
  isActive,
  collapsed,
  onSelect,
  onRename,
  onDelete,
}: {
  conv: Conversation;
  isActive: boolean;
  collapsed: boolean;
  onSelect: () => void;
  onRename: (title: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(conv.title ?? "New chat");
  const inputRef              = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commitRename = async () => {
    const trimmed = draft.trim();
    if (trimmed) await onRename(trimmed);
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraft(conv.title ?? "New chat");
    setEditing(false);
  };

  if (collapsed) {
    return (
      <button
        onClick={onSelect}
        title={conv.title ?? "New chat"}
        className={`flex items-center justify-center w-9 h-9 mx-auto rounded-lg transition-colors ${
          isActive ? "bg-brand-soft text-brand" : "text-ink-dim hover:bg-hover hover:text-ink"
        }`}
      >
        <MessageSquare className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div
      onClick={() => !editing && onSelect()}
      className={`group relative flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm ${
        isActive
          ? "bg-brand-soft text-brand font-medium"
          : "text-ink-soft hover:bg-hover hover:text-ink"
      }`}
    >
      <MessageSquare className={`w-4 h-4 shrink-0 ${isActive ? "text-brand" : "text-ink-dim"}`} />

      {editing ? (
        <div className="flex-1 flex items-center gap-1 min-w-0">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter")  commitRename();
              if (e.key === "Escape") cancelEdit();
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-panel rounded px-1.5 py-0.5 text-xs outline-none border border-border-strong text-ink min-w-0"
          />
          <button
            onClick={(e) => { e.stopPropagation(); void commitRename(); }}
            className="text-emerald-600 hover:text-emerald-700"
          >
            <Check className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); cancelEdit(); }}
            className="text-ink-dim hover:text-ink"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <span className="flex-1 truncate">{conv.title ?? "New chat"}</span>
      )}

      {!editing && (
        <div className="hidden group-hover:flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            className="p-0.5 rounded text-ink-dim hover:text-ink"
            title="Rename"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); void onDelete(); }}
            className="p-0.5 rounded text-ink-dim hover:text-red-500"
            title="Delete"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

export function Sidebar({ conversations, activeId, loading, onNew, onSelect, onRename, onDelete }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <aside
      className={`sidebar-transition flex flex-col h-full bg-panel border-r border-border shrink-0 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <div className={`flex items-center gap-2 px-3 py-4 ${collapsed ? "flex-col" : ""}`}>
        <button
          onClick={onNew}
          title="New chat"
          className={`flex items-center justify-center gap-2 rounded-lg border border-border text-sm text-ink-soft hover:bg-hover hover:text-ink transition-colors ${
            collapsed ? "w-9 h-9 shrink-0" : "flex-1 px-3 py-2"
          }`}
        >
          <Plus className="w-4 h-4 shrink-0" />
          {!collapsed && "New chat"}
        </button>

        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex items-center justify-center w-9 h-9 shrink-0 rounded-lg text-ink-dim hover:bg-hover hover:text-ink transition-colors"
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      <div className={`flex-1 overflow-y-auto pb-4 space-y-0.5 ${collapsed ? "px-2" : "px-2"}`}>
        {loading && !collapsed && (
          <p className="text-xs text-ink-dim px-3 py-2">Loading…</p>
        )}
        {!loading && conversations.length === 0 && !collapsed && (
          <p className="text-xs text-ink-dim px-3 py-2">No conversations yet</p>
        )}
        {conversations.map((conv) => (
          <ConversationItem
            key={conv.id}
            conv={conv}
            isActive={conv.id === activeId}
            collapsed={collapsed}
            onSelect={() => onSelect(conv.id)}
            onRename={(title) => onRename(conv.id, title)}
            onDelete={() => onDelete(conv.id)}
          />
        ))}
      </div>

      {!collapsed && (
        <div className="px-3 py-3 border-t border-border">
          <p className="text-xs text-ink-dim text-center">Local LLM · Private</p>
        </div>
      )}
    </aside>
  );
}
