import { NextRequest, NextResponse } from "next/server";

const normalizeMessages = (contents?: any[], systemInstruction?: string) => {
  const normalized: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];

  if (systemInstruction) {
    normalized.push({ role: "system", content: systemInstruction });
  }

  for (const item of contents || []) {
    const role =
      item?.role === "assistant" || item?.role === "model"
        ? "assistant"
        : item?.role === "system"
          ? "system"
          : "user";

    const text = Array.isArray(item?.parts)
      ? item.parts.map((part: any) => part?.text || "").join("")
      : typeof item?.content === "string"
        ? item.content
        : "";

    if (text) {
      normalized.push({ role, content: text });
    }
  }

  return normalized;
};

export async function POST(req: NextRequest) {
  try {
    const groqKey =
      req.headers.get("x-groq-key") || process.env.GROQ_API_KEY || "";

    if (!groqKey.trim()) {
      return NextResponse.json(
        {
          error: "Groq API key is missing. Please add your key in the Settings page.",
        },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      action,
      model = "openai/gpt-oss-120b",
      messages,
      contents,
      systemInstruction,
    } = body;

    const requestMessages = Array.isArray(messages) && messages.length
      ? messages
          .filter((message: any) => message && typeof message.content === "string")
          .map((message: any) => ({
            role: message.role === "assistant" ? "assistant" : message.role === "system" ? "system" : "user",
            content: message.content,
          }))
      : normalizeMessages(contents, systemInstruction);

    if (action === "models") {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: {
          Authorization: `Bearer ${groqKey}`,
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        return NextResponse.json(
          { error: errorData?.error?.message || `Failed to fetch models (Status: ${res.status})` },
          { status: res.status }
        );
      }

      const data = await res.json();
      const models = (data.data || [])
        .filter((m: any) => !m.id.includes("whisper") && !m.id.includes("guard"))
        .map((m: any) => ({ id: m.id, active: m.active ?? true }));
      return NextResponse.json({ models });
    }

    if (action === "test") {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Reply with OK." }],
          max_tokens: 5,
          temperature: 0,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        // Check if key itself is valid via models list
        const keyCheck = await fetch("https://api.groq.com/openai/v1/models", {
          headers: { Authorization: `Bearer ${groqKey}` },
        });

        if (keyCheck.ok) {
          const modelsData = await keyCheck.json().catch(() => ({}));
          const availableModels = (modelsData.data || [])
            .filter((m: any) => !m.id.includes("whisper") && !m.id.includes("guard"))
            .map((m: any) => m.id);

          return NextResponse.json({
            success: true,
            warning: true,
            availableModels,
            message: `Key is valid! But model '${model}' is not active on your tier. Please pick from available models.`,
          });
        }

        const message =
          errorData?.error?.message ||
          `Groq API rejected key (Status: ${res.status})`;
        return NextResponse.json({ error: message }, { status: res.status });
      }

      return NextResponse.json({
        success: true,
        message: "Groq API Key is valid and active!",
      });
    }

    if (action === "chat_stream") {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: requestMessages,
          temperature: 0.7,
          max_tokens: 2048,
          stream: true,
        }),
      });

      if (!groqRes.ok) {
        const errJson = await groqRes.json().catch(() => ({}));
        const errMsg =
          errJson?.error?.message ||
          `Groq API returned status ${groqRes.status}`;
        return NextResponse.json({ error: errMsg }, { status: groqRes.status });
      }

      return new Response(groqRes.body, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    if (action === "generate") {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: requestMessages,
          temperature: 0.7,
          max_tokens: 2048,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        return NextResponse.json(
          { error: errJson?.error?.message || "Groq generation failed" },
          { status: res.status }
        );
      }

      const data = await res.json();
      const reply =
        data.choices?.[0]?.message?.content ||
        "";

      return NextResponse.json({ reply });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error: any) {
    console.error("Groq API route error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error." },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const groqKey =
      req.headers.get("x-groq-key") || process.env.GROQ_API_KEY || "";

    if (!groqKey.trim()) {
      return NextResponse.json(
        { error: "Groq API key is missing." },
        { status: 401 }
      );
    }

    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: {
        Authorization: `Bearer ${groqKey}`,
      },
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData?.error?.message || `Failed to fetch models (Status: ${res.status})` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const models = (data.data || [])
      .filter((m: any) => !m.id.includes("whisper") && !m.id.includes("guard"))
      .map((m: any) => ({ id: m.id, active: m.active ?? true }));

    return NextResponse.json({ models });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error." },
      { status: 500 }
    );
  }
}

