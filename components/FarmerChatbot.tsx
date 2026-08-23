"use client";

import { useState, useRef, useEffect } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type FarmerChatbotProps = {
  animalType?: string | null;
  symptoms?: string[];
};

const SUGGESTED_QUESTIONS = [
  "Why is my cow not eating?",
  "How to prevent FMD?",
  "What's mastitis?",
  "My buffalo has fever and is not eating",
  "How to treat diarrhea in goats?",
  "What is the vaccination schedule for cows?",
];

export default function FarmerChatbot({ animalType, symptoms }: FarmerChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Try to read farmer context from DOM if not passed via props (optional)
  const getContextFromForm = (): { animalType?: string; symptoms?: string[] } => {
    if (animalType) return { animalType, symptoms };
    // Fallback: try to read from page (best-effort, non-blocking)
    try {
      const select = document.querySelector('select') as HTMLSelectElement | null;
      const checked = Array.from(document.querySelectorAll('input[type="checkbox"]:checked')) as HTMLInputElement[];
      // This is heuristic; ReportForm's animalType select is the only select on report page
      const detectedAnimal = select?.value || undefined;
      // Symptoms are checkboxes with values like fever, swelling etc. — try to infer from nearby labels
      // Instead we just return what we have; if not found, return empty
      if (detectedAnimal && ["cow", "buffalo", "goat", "sheep"].includes(detectedAnimal)) {
        return { animalType: detectedAnimal, symptoms: symptoms || [] };
      }
    } catch {}
    return { animalType: animalType || undefined, symptoms: symptoms || [] };
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput("");
    setError(null);
    setIsLoading(true);

    // Keep last 3-4 messages for context
    const contextHistory = newHistory.slice(-4);

    // Optional farmer context
    const ctx = getContextFromForm();
    const payload: Record<string, unknown> = {
      message: trimmed,
      animalType: ctx.animalType || null,
      symptoms: ctx.symptoms || [],
      history: contextHistory,
    };

    try {
      console.log("[Chatbot] Sending to /api/chat:", payload);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as { reply?: string; error?: string; details?: string };

      if (!res.ok) {
        console.error("[Chatbot] API error:", data);
        throw new Error(data.error || data.details || `Chat failed: ${res.status}`);
      }

      const reply = data.reply || "Sorry, I couldn't get advice. Please try again or consult a vet.";
      console.log("[Chatbot] Reply:", reply);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to get advice";
      console.error("[Chatbot] Fetch error:", err);
      setError(msg);
      // Fallback advice so farmer isn't blocked
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Network or AI is unavailable right now. Quick advice: Isolate the animal, ensure clean water, and contact your vet today. For serious cases, don't delay vet visit.",
        },
      ]);
    } finally {
      setIsLoading(false);
      // Focus input after send (mobile friendly)
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleSuggestedClick = (q: string) => {
    sendMessage(q);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end">
      {/* Chat window */}
      {isOpen && (
        <div className="w-[92vw] max-w-sm sm:w-96 h-[70vh] max-h-[500px] sm:h-[460px] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden mb-3">
          {/* Header */}
          <div className="bg-emerald-600 text-white px-4 py-3 flex items-center justify-between">
            <div>
              <p className="font-bold text-sm">Farmer AI Advisor</p>
              <p className="text-xs opacity-90">Claude • Livestock health • हिंदी/English</p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-lg"
              aria-label="Minimize chat"
            >
              −
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-zinc-50 dark:bg-zinc-900">
            {messages.length === 0 && (
              <div className="space-y-3">
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3">
                  <p className="text-sm text-emerald-900 dark:text-emerald-100">
                    👋 Hi! Ask me about cow, buffalo, goat, or sheep health. I give quick 2-3 sentence advice and always recommend a vet for serious cases.
                  </p>
                </div>
                <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Try a quick question:</p>
                <div className="grid gap-2">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => handleSuggestedClick(q)}
                      className="text-left text-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-700 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-5 ${
                    m.role === "user"
                      ? "bg-emerald-600 text-white rounded-br-md"
                      : "bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-100 rounded-bl-md"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl rounded-bl-md px-3 py-2 text-sm text-zinc-600 dark:text-zinc-300">
                  Thinking...
                </div>
              </div>
            )}

            {error && <p className="text-xs text-red-600 dark:text-red-400 text-center">{error}</p>}

            <div ref={endRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-3 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your question..."
              className="flex-1 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full px-5 py-2.5 text-sm font-bold"
            >
              Send
            </button>
          </form>
        </div>
      )}

      {/* Floating toggle button */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl flex items-center justify-center text-2xl transition-colors"
        aria-label={isOpen ? "Close chat" : "Open farmer chatbot"}
      >
        {isOpen ? "×" : "💬"}
      </button>
    </div>
  );
}
