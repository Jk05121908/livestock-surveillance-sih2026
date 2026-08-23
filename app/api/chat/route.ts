import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT =
  "You are a livestock health advisor for Indian farmers. Give quick, practical advice about cow/buffalo/goat/sheep health in simple English/Hindi. Always recommend consulting a vet for serious cases. Keep responses to 2-3 sentences max for mobile readability.";

type ChatRequest = {
  message?: string;
  animalType?: string | null;
  symptoms?: string[];
  history?: Array<{ role: "user" | "assistant"; content: string }>;
};

// Fallback mock when ANTHROPIC_API_KEY missing — still gives useful advice so UI doesn't block
function mockReply(message: string, animalType?: string | null, symptoms?: string[]): string {
  const lower = message.toLowerCase();
  const ctx = [animalType, ...(symptoms || [])].filter(Boolean).join(", ").toLowerCase();
  const combined = `${lower} ${ctx}`;

  if (combined.includes("not eating") || combined.includes("not eat")) {
    return "Not eating can be fever, FMD, or digestive issue. Isolate the animal, offer clean water, check temperature, and call your vet today — keep other animals separate.";
  }
  if (combined.includes("fmd") || combined.includes("foot and mouth")) {
    return "FMD spreads fast — isolate sick animals, disinfect shed, and vaccinate healthy ones. Call vet immediately and don't move animals between villages.";
  }
  if (combined.includes("mastitis") || combined.includes("swelling") || combined.includes("udder")) {
    return "Mastitis shows swelling/hot udder and less milk. Keep udder clean, milk regularly, and get vet treatment quickly — early care prevents loss.";
  }
  if (combined.includes("diarrhea") || combined.includes("dast")) {
    return "Diarrhea risks dehydration — give ORS/electrolytes and clean water, keep shed dry. If blood or >1 day, contact vet urgently.";
  }
  if (combined.includes("fever") || combined.includes("bukhar")) {
    return "Fever needs quick check — measure temp, keep animal shaded with water, and call vet. Note other signs like cough or discharge for the vet.";
  }
  if (combined.includes("cough") || combined.includes("khansi")) {
    return "Cough may be respiratory infection — keep animal warm, avoid dusty shed, and consult vet if breathing is labored or many animals cough.";
  }
  if (combined.includes("vaccination") || combined.includes("tika")) {
    return "Follow FMD, Brucellosis, and Anthrax schedule as per local vet. Keep vaccination cards and don't miss boosters — prevention is cheaper than cure.";
  }

  // Default: use farmer context if available
  if (animalType || (symptoms && symptoms.length)) {
    return `For your ${animalType || "animal"} with ${symptoms?.join(", ") || "reported signs"}: isolate, monitor water/feed, and contact your vet within 24 hours. Keep notes and photos for the vet.`;
  }

  return "Thanks for your question — for any sick animal, isolate it, ensure clean water and shade, and contact your vet promptly. Tell me the animal type and symptoms for more specific advice.";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatRequest;
    const message = (body.message || "").trim();
    const animalType = body.animalType || null;
    const symptoms: string[] = Array.isArray(body.symptoms) ? body.symptoms : [];
    const history: Array<{ role: "user" | "assistant"; content: string }> = Array.isArray(body.history)
      ? body.history.slice(-4)
      : [];

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Log for debugging (server)
    console.log("[api/chat] Request:", { message, animalType, symptoms, historyLen: history.length });

    const apiKey = process.env.ANTHROPIC_API_KEY;

    // If no key, return mock advice so farmer isn't blocked (deliverable says don't block form)
    if (!apiKey) {
      console.warn("[api/chat] ANTHROPIC_API_KEY missing — returning mock reply");
      const reply = mockReply(message, animalType, symptoms);
      return NextResponse.json({ reply, mocked: true, note: "Add ANTHROPIC_API_KEY to .env.local for Claude" });
    }

    // Build context-aware user prompt
    let contextualMessage = message;
    if (animalType || symptoms.length) {
      const ctxParts: string[] = [];
      if (animalType) ctxParts.push(`animal: ${animalType}`);
      if (symptoms.length) ctxParts.push(`symptoms: ${symptoms.join(", ")}`);
      contextualMessage = `Farmer context: ${ctxParts.join("; ")}. Farmer question: ${message}`;
      // If history exists, keep it, but ensure latest message has context
    }

    // Build messages array for Claude: history + current contextual message
    const claudeMessages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...history.map((h) => ({ role: h.role, content: h.content })),
      // Replace last user message with contextual one if we added context and history already has it
      // Simpler: just push contextual as latest user
    ];
    // If history already contains the current message as last user, replace it with contextual
    if (claudeMessages.length && claudeMessages[claudeMessages.length - 1]?.role === "user") {
      claudeMessages[claudeMessages.length - 1].content = contextualMessage;
    } else {
      claudeMessages.push({ role: "user", content: contextualMessage });
    }

    // Ensure alternating roles and that first message is user (Claude requirement)
    // Filter out any leading assistant messages
    while (claudeMessages.length && claudeMessages[0].role !== "user") claudeMessages.shift();

    console.log("[api/chat] Calling Claude with", claudeMessages.length, "messages");

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: claudeMessages,
      }),
    });

    const raw = await anthropicRes.text();
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw };
    }

    if (!anthropicRes.ok) {
      console.error("[api/chat] Claude error:", anthropicRes.status, data);
      // Fallback to mock so farmer still gets advice
      const fallback = mockReply(message, animalType, symptoms);
      return NextResponse.json(
        {
          reply: fallback,
          fallback: true,
          error: `Claude ${anthropicRes.status}`,
          details: data,
        },
        { status: 200 }
      );
    }

    const content = (data as { content?: Array<{ text?: string; type?: string }> })?.content;
    const reply =
      Array.isArray(content) && content[0]?.text
        ? content[0].text
        : (data as { completion?: string })?.completion || null;

    if (!reply) {
      console.error("[api/chat] No reply in Claude response:", data);
      return NextResponse.json({ reply: mockReply(message, animalType, symptoms), fallback: true });
    }

    // Trim to 2-3 sentences as per prompt (Claude should already, but ensure)
    const trimmed = reply.trim();

    console.log("[api/chat] Claude reply:", trimmed.slice(0, 200));

    return NextResponse.json({ reply: trimmed });
  } catch (err) {
    console.error("[api/chat] Unhandled error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    // Return mock advice even on error so UI doesn't block
    return NextResponse.json(
      {
        reply: "Sorry, the AI is temporarily unavailable. Quick advice: isolate the animal, ensure water, and call your vet soon.",
        error: message,
        fallback: true,
      },
      { status: 200 }
    );
  }
}
