// ChatTab — the consumer-facing chat surface.
//
// Layout: sessions rail | message thread | composer.
// Streams from the existing provider registry; persists sessions via the
// Tauri `chat_*` commands (which gracefully degrade to in-memory if the
// backend commands are not yet present).

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { nanoid } from "nanoid";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

import {
  getProvider,
  listAllModels,
  parseProviderModelId,
} from "../providers";
import type { ChatMessage, ModelInfo } from "../providers/types";

const EXAMPLE_PROMPTS = [
  "What can you do?",
  "Summarize the differences between local and remote AI.",
  "Help me brainstorm names for a side project.",
];

type StoredMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: string;
  providerModelId?: string;
};

type ChatSession = {
  id: string;
  title: string;
  created: string;
  updated: string;
  messages: StoredMessage[];
};

type ChatSessionMeta = {
  id: string;
  title: string;
  created: string;
  updated: string;
};

function deriveTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= 40) return t || "New chat";
  return t.slice(0, 40) + "…";
}

function groupSessions(sessions: ChatSessionMeta[]): {
  today: ChatSessionMeta[];
  yesterday: ChatSessionMeta[];
  earlier: ChatSessionMeta[];
} {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const today: ChatSessionMeta[] = [];
  const yesterday: ChatSessionMeta[] = [];
  const earlier: ChatSessionMeta[] = [];
  for (const s of sessions) {
    const t = new Date(s.updated).getTime();
    if (t >= startOfToday) today.push(s);
    else if (t >= startOfYesterday) yesterday.push(s);
    else earlier.push(s);
  }
  return { today, yesterday, earlier };
}

function newDraft(): ChatSession {
  const ts = new Date().toISOString();
  return {
    id: nanoid(),
    title: "New chat",
    created: ts,
    updated: ts,
    messages: [],
  };
}

// ---- Code block renderer with copy button ----
type CodeRendererProps = {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
};

function CodeBlock({ inline, className, children }: CodeRendererProps) {
  const match = /language-(\w+)/.exec(className ?? "");
  const code = String(children ?? "").replace(/\n$/, "");
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  }, [code]);

  if (inline || !match) {
    return (
      <code className="rounded bg-neutral-800 px-1 py-0.5 font-mono text-[12px] text-neutral-200">
        {children}
      </code>
    );
  }
  return (
    <div className="my-2 overflow-hidden rounded-md border border-neutral-800">
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900 px-3 py-1 text-[10px] uppercase tracking-wider text-neutral-500">
        <span>{match[1]}</span>
        <button
          type="button"
          onClick={copy}
          className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-300 hover:border-neutral-500 hover:text-neutral-100"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <SyntaxHighlighter
        language={match[1]}
        style={vscDarkPlus}
        PreTag="div"
        customStyle={{
          margin: 0,
          padding: "12px 14px",
          background: "#0a0a0a",
          fontSize: "12.5px",
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

// ---- Backend bridge (defensive — works even if commands missing) ----
async function backendListSessions(): Promise<ChatSessionMeta[]> {
  try {
    return await invoke<ChatSessionMeta[]>("chat_list_sessions");
  } catch {
    return [];
  }
}

async function backendLoadSession(id: string): Promise<ChatSession | null> {
  try {
    return await invoke<ChatSession>("chat_load_session", { id });
  } catch {
    return null;
  }
}

async function backendSaveSession(session: ChatSession): Promise<void> {
  try {
    await invoke("chat_save_session", { session });
  } catch {
    // Silent — in-memory only until backend lands.
  }
}

async function backendDeleteSession(id: string): Promise<void> {
  try {
    await invoke("chat_delete_session", { id });
  } catch {
    // Silent.
  }
}

export function ChatTab() {
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [active, setActive] = useState<ChatSession>(() => newDraft());
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [model, setModel] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [attachedFile, setAttachedFile] = useState<string | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState<boolean>(true);
  const abortRef = useRef<AbortController | null>(null);

  // Refresh session list.
  const refreshSessions = useCallback(async () => {
    const list = await backendListSessions();
    setSessions(list);
  }, []);

  // Load model list + sessions on mount.
  useEffect(() => {
    void refreshSessions();
    void (async () => {
      const m = await listAllModels();
      setModels(m);
      // Default to first local Ollama model if present, else first remote.
      const local = m.find((x) => x.provider === "ollama");
      const choice = local ?? m[0] ?? null;
      if (choice) setModel(`${choice.provider}:${choice.id}`);
    })();
  }, [refreshSessions]);

  // Restart any in-flight stream when switching sessions.
  const switchSession = useCallback(
    async (id: string) => {
      if (streaming) abortRef.current?.abort();
      const loaded = await backendLoadSession(id);
      if (loaded) {
        setActive(loaded);
        setComposerError(null);
        setAttachedFile(null);
      }
    },
    [streaming],
  );

  const startNewChat = useCallback(() => {
    if (streaming) abortRef.current?.abort();
    setActive(newDraft());
    setComposerError(null);
    setAttachedFile(null);
  }, [streaming]);

  const deleteSession = useCallback(
    async (id: string) => {
      await backendDeleteSession(id);
      if (id === active.id) startNewChat();
      void refreshSessions();
    },
    [active.id, refreshSessions, startNewChat],
  );

  // ---- Message thread auto-scroll ----
  const threadRef = useRef<HTMLDivElement | null>(null);
  const stickyRef = useRef(true);
  const onScroll = useCallback(() => {
    const el = threadRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.clientHeight - el.scrollTop;
    stickyRef.current = distance < 60;
  }, []);

  useLayoutEffect(() => {
    if (stickyRef.current && threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [active.messages]);

  // ---- Composer ----
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const lineH = 20;
    const maxH = lineH * 6 + 16;
    ta.style.height = `${Math.min(ta.scrollHeight, maxH)}px`;
  }, [draft]);

  const send = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? draft).trim();
      if (!text || streaming) return;
      if (!model) {
        setComposerError("No model available — add an API key or start Ollama.");
        return;
      }
      setComposerError(null);

      const ts = new Date().toISOString();
      const userMsg: StoredMessage = {
        role: "user",
        content: text,
        timestamp: ts,
        providerModelId: model,
      };
      const assistantMsg: StoredMessage = {
        role: "assistant",
        content: "",
        timestamp: ts,
        providerModelId: model,
      };

      // Build the next session synchronously so we can stream into it.
      let next: ChatSession = {
        ...active,
        title:
          active.messages.length === 0 ? deriveTitle(text) : active.title,
        updated: ts,
        messages: [...active.messages, userMsg, assistantMsg],
      };
      setActive(next);
      setDraft("");
      stickyRef.current = true;

      // Persist immediately so the session shows up in the rail.
      void backendSaveSession(next).then(refreshSessions);

      const { provider: providerId, model: modelId } = parseProviderModelId(model);
      const provider = getProvider(providerId);

      const history: ChatMessage[] = next.messages
        .filter((m) => m !== assistantMsg)
        .map((m) => ({ role: m.role, content: m.content }));

      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);

      try {
        for await (const chunk of provider.stream({
          model: modelId,
          messages: history,
          signal: controller.signal,
        })) {
          if (chunk.delta) {
            assistantMsg.content += chunk.delta;
            next = {
              ...next,
              updated: new Date().toISOString(),
              messages: [...next.messages.slice(0, -1), { ...assistantMsg }],
            };
            setActive(next);
          }
          if (chunk.done) break;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (controller.signal.aborted) {
          assistantMsg.content += "\n\n_(stopped)_";
        } else {
          assistantMsg.content += `\n\n**Error:** ${msg}`;
          setComposerError(msg);
        }
        next = {
          ...next,
          updated: new Date().toISOString(),
          messages: [...next.messages.slice(0, -1), { ...assistantMsg }],
        };
        setActive(next);
      } finally {
        setStreaming(false);
        abortRef.current = null;
        void backendSaveSession(next).then(refreshSessions);
      }
    },
    [active, draft, model, streaming, refreshSessions],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const onComposerKey = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void send();
      }
    },
    [send],
  );

  const onAttach = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) setAttachedFile(f.name);
      // TODO: wire file content into message
    };
    input.click();
  }, []);

  const grouped = useMemo(() => groupSessions(sessions), [sessions]);
  const isEmpty = active.messages.length === 0;

  const modelOptions = useMemo(() => {
    const local = models.filter((m) => m.provider === "ollama");
    const remote = models.filter((m) => m.provider !== "ollama");
    return { local, remote };
  }, [models]);

  return (
    <div className="flex min-h-0 flex-1">
      {/* Sessions rail */}
      {railOpen ? (
        <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950">
          <div className="flex items-center justify-between px-3 py-2">
            <button
              type="button"
              onClick={startNewChat}
              className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-left text-xs text-neutral-200 hover:border-neutral-500 hover:text-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              + New chat
            </button>
            <button
              type="button"
              onClick={() => setRailOpen(false)}
              aria-label="Collapse sessions"
              className="ml-1 rounded p-1 text-neutral-500 hover:text-neutral-200"
            >
              ‹
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {sessions.length === 0 && (
              <div className="px-2 py-3 text-[11px] text-neutral-600">
                No chats yet.
              </div>
            )}
            <SessionGroup
              label="Today"
              items={grouped.today}
              activeId={active.id}
              onSelect={switchSession}
              onDelete={deleteSession}
            />
            <SessionGroup
              label="Yesterday"
              items={grouped.yesterday}
              activeId={active.id}
              onSelect={switchSession}
              onDelete={deleteSession}
            />
            <SessionGroup
              label="Earlier"
              items={grouped.earlier}
              activeId={active.id}
              onSelect={switchSession}
              onDelete={deleteSession}
            />
          </div>
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setRailOpen(true)}
          aria-label="Expand sessions"
          className="flex w-6 shrink-0 items-center justify-center border-r border-neutral-800 bg-neutral-950 text-neutral-500 hover:text-neutral-200"
        >
          ›
        </button>
      )}

      {/* Center column: thread + composer */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div
          ref={threadRef}
          onScroll={onScroll}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {isEmpty ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-6 text-center">
              <div className="mb-3 text-2xl text-neutral-200">
                What would you like to try?
              </div>
              <div className="mb-6 text-sm text-neutral-500">
                Your conversation stays on this machine unless you pick a cloud model.
              </div>
              <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
                {EXAMPLE_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => void send(p)}
                    className="rounded-md border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-left text-xs text-neutral-300 hover:border-neutral-600 hover:bg-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl px-4 py-6">
              {active.messages.map((m, i) => (
                <MessageBubble
                  key={i}
                  message={m}
                  streaming={streaming && i === active.messages.length - 1 && m.role === "assistant"}
                />
              ))}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-neutral-800 bg-neutral-950 px-4 py-3">
          <div className="mx-auto max-w-3xl">
            {attachedFile && (
              <div className="mb-2 inline-flex items-center gap-1 rounded bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-300">
                📎 {attachedFile}
                <button
                  type="button"
                  onClick={() => setAttachedFile(null)}
                  className="ml-1 text-neutral-500 hover:text-neutral-200"
                  aria-label="Remove attachment"
                >
                  ×
                </button>
              </div>
            )}
            <div className="flex flex-col rounded-lg border border-neutral-800 bg-neutral-900/60 focus-within:border-neutral-600">
              <div className="flex items-start gap-2 px-3 pt-2">
                <button
                  type="button"
                  onClick={onAttach}
                  aria-label="Attach file"
                  className="mt-0.5 rounded p-1 text-neutral-400 hover:text-neutral-100"
                >
                  📎
                </button>
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onComposerKey}
                  rows={1}
                  placeholder="Type a message…  ⌘/Ctrl + Enter to send"
                  className="flex-1 resize-none bg-transparent py-1 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
                />
              </div>
              <div className="flex items-center justify-between px-3 pb-2 pt-1">
                <div className="text-[10px] text-neutral-600">
                  {composerError && <span className="text-rose-400">{composerError}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={model ?? ""}
                    onChange={(e) => setModel(e.target.value || null)}
                    className="rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-[11px] text-neutral-300 focus:border-neutral-600 focus:outline-none"
                    aria-label="Model"
                  >
                    {models.length === 0 && (
                      <option value="">No models found</option>
                    )}
                    {modelOptions.local.length > 0 && (
                      <optgroup label="Local">
                        {modelOptions.local.map((m) => (
                          <option key={`${m.provider}:${m.id}`} value={`${m.provider}:${m.id}`}>
                            {m.label}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {modelOptions.remote.length > 0 && (
                      <optgroup label="Remote">
                        {modelOptions.remote.map((m) => (
                          <option key={`${m.provider}:${m.id}`} value={`${m.provider}:${m.id}`}>
                            {m.provider} · {m.label}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  {streaming ? (
                    <button
                      type="button"
                      onClick={stop}
                      className="rounded-md bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                    >
                      Stop
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void send()}
                      disabled={!draft.trim() || !model}
                      className="rounded-md bg-emerald-500 px-3 py-1 text-xs font-medium text-neutral-950 hover:bg-emerald-400 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                    >
                      Send →
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ---- Sub-components ----

function SessionGroup({
  label,
  items,
  activeId,
  onSelect,
  onDelete,
}: {
  label: string;
  items: ChatSessionMeta[];
  activeId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="px-2 pb-1 pt-2 text-[10px] uppercase tracking-wider text-neutral-600">
        {label}
      </div>
      <ul className="space-y-0.5">
        {items.map((s) => (
          <li key={s.id} className="group flex items-center">
            <button
              type="button"
              onClick={() => onSelect(s.id)}
              className={
                "flex-1 truncate rounded px-2 py-1 text-left text-xs " +
                (s.id === activeId
                  ? "bg-neutral-800 text-neutral-100"
                  : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200")
              }
              title={s.title}
            >
              {/* TODO: rename UI */}
              {s.title || "Untitled"}
            </button>
            <button
              type="button"
              onClick={() => onDelete(s.id)}
              aria-label="Delete chat"
              className="ml-1 hidden rounded p-1 text-neutral-500 hover:text-rose-400 group-hover:block"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MessageBubble({
  message,
  streaming,
}: {
  message: StoredMessage;
  streaming: boolean;
}) {
  const isUser = message.role === "user";
  return (
    <div className={"mb-5 flex flex-col " + (isUser ? "items-end" : "items-start")}>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-neutral-600">
        {message.role}
      </div>
      <div
        className={
          "max-w-full rounded-lg px-4 py-2.5 text-sm leading-relaxed " +
          (isUser
            ? "bg-emerald-500/15 text-neutral-100 ring-1 ring-emerald-500/30"
            : "bg-neutral-900 text-neutral-100 ring-1 ring-neutral-800")
        }
      >
        {message.role === "assistant" ? (
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code: CodeBlock as never,
              }}
            >
              {message.content || (streaming ? "…" : "")}
            </ReactMarkdown>
            {streaming && (
              <span
                className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-emerald-400 align-baseline"
                aria-hidden
              />
            )}
          </div>
        ) : (
          <div className="whitespace-pre-wrap">{message.content}</div>
        )}
      </div>
    </div>
  );
}
