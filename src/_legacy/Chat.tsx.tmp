import { useEffect, useRef, useState } from "react";
import "./App.css";

const BRAIN_URL = "http://localhost:8100";

type Message = {
  role: "user" | "aiia";
  content: string;
};

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, pending]);

  async function send() {
    const question = input.trim();
    if (!question || pending) return;
    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setPending(true);
    try {
      const res = await fetch(`${BRAIN_URL}/v1/aiia/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) throw new Error(`brain returned ${res.status}`);
      const data = (await res.json()) as { answer?: string };
      const answer = data.answer ?? "(no answer)";
      setMessages((prev) => [...prev, { role: "aiia", content: answer }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold tracking-tight">AIIA</span>
          <span className="text-xs text-neutral-500">local</span>
        </div>
        <span className="text-xs text-neutral-500">
          {pending ? "thinking…" : "ready"}
        </span>
      </header>

      <main
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-5 py-6"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-neutral-500">
            Ask AIIA anything.
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "self-end max-w-[85%] rounded-lg bg-neutral-800 px-4 py-2.5 text-sm whitespace-pre-wrap"
                    : "self-start max-w-[85%] text-sm whitespace-pre-wrap leading-relaxed"
                }
              >
                {m.content}
              </div>
            ))}
            {pending && (
              <div className="self-start text-sm text-neutral-500">…</div>
            )}
          </div>
        )}
      </main>

      {error && (
        <div className="mx-5 mb-2 rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
          {error} — is the local brain running on port 8100?
        </div>
      )}

      <form
        className="border-t border-neutral-800 px-5 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="mx-auto flex max-w-3xl gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="message AIIA"
            disabled={pending}
            className="flex-1 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm placeholder-neutral-600 focus:border-neutral-600 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            className="rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

export default App;
