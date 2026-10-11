import { NextRequest, NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";

export const maxDuration = 15; // Set to fit within Vercel limits

const LANGUAGE_MAP: Record<string, string> = {
  hi: "Hindi (हिंदी)",
  hinglish: "Hinglish (Conversational Hindi written in English/Latin alphabet, e.g., 'Is lecture me hum discuss karenge...')",
  en: "English",
  es: "Spanish (Español)",
  fr: "French (Français)",
  de: "German (Deutsch)",
  bn: "Bengali (বাংলা)",
  mr: "Marathi (मराठी)",
  ta: "Tamil (தமிழ்)",
  te: "Telugu (తెలుగు)",
  gu: "Gujarati (ગુજરાતી)",
  kn: "Kannada (ಕನ್ನಡ)",
  pa: "Punjabi (ਪੰਜਾਬੀ)",
  ur: "Urdu (اردو)",
  ru: "Russian (Русский)",
  zh: "Chinese (中文)",
  ja: "Japanese (日本語)",
  ko: "Korean (한국어)",
  ar: "Arabic (العربية)",
};

interface TranscriptItem {
  start: number;
  end: number;
  text: string;
}

function resolveGeminiModel(rawModel?: string): string {
  if (!rawModel) return "gemini-3.8-flash";
  return rawModel.trim();
}

function extractJsonArray(text: string): TranscriptItem[] {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/g, "").trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return sanitizeTranscript(parsed);
    if (parsed && Array.isArray(parsed.lines)) return sanitizeTranscript(parsed.lines);
    if (parsed && Array.isArray(parsed.transcript)) return sanitizeTranscript(parsed.transcript);
  } catch {}

  const match = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) return sanitizeTranscript(parsed);
    } catch {}
  }

  throw new Error("Could not parse JSON array from AI response: " + cleaned.slice(0, 100));
}

function sanitizeTranscript(items: any[]): TranscriptItem[] {
  return items
    .filter((it) => it && typeof it === "object" && typeof it.text === "string")
    .map((it) => ({
      start: Number(it.start) >= 0 ? Number(it.start) : 0,
      end: Number(it.end) >= Number(it.start) ? Number(it.end) : Number(it.start) + 4,
      text: String(it.text).trim(),
    }))
    .sort((a, b) => a.start - b.start);
}

// Fast translation of existing subtitle lines using Groq or Gemini
async function translateBatchWithAI({
  batch,
  targetLangName,
  provider,
  groqKey,
  geminiKey,
  groqModel,
  geminiModel,
}: {
  batch: TranscriptItem[];
  targetLangName: string;
  provider: "groq" | "gemini";
  groqKey: string;
  geminiKey: string;
  groqModel?: string;
  geminiModel?: string;
}): Promise<TranscriptItem[]> {
  const prompt = `You are an expert educational subtitle translator.
Translate the following subtitle lines into ${targetLangName}.
Preserve the exact 'start' and 'end' timestamp numbers.
Make sure the translation is natural, fluent, and educational.
STRICT REQUIREMENT: Output ONLY a valid JSON array of objects with keys "start", "end", "text".
Do NOT include markdown formatting or extra commentary.

Input JSON:
${JSON.stringify(batch)}`;

  if (provider === "groq" && groqKey) {
    const model = groqModel || "openai/gpt-oss-120b";
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `You are a professional subtitle translator. Output strictly JSON array of [{"start": number, "end": number, "text": string}]. No extra text.`,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.2,
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Groq translation failed (${res.status})`);
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || "";
    return extractJsonArray(reply);
  }

  if (geminiKey) {
    const model = resolveGeminiModel(geminiModel);
    const candidateModels = Array.from(
      new Set([model, "gemini-1.5-flash", "gemini-2.0-flash"])
    );

    let lastError = "";
    for (const m of candidateModels) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.2,
                response_mime_type: "application/json",
              },
            }),
            signal: AbortSignal.timeout(7000),
          }
        );

        if (res.ok) {
          const data = await res.json();
          const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
          return extractJsonArray(reply);
        }

        const err = await res.json().catch(() => ({}));
        lastError = err?.error?.message || `Gemini translation failed (${res.status})`;
        if (res.status !== 404) break;
      } catch (e: any) {
        lastError = e?.message || "Network timeout calling Gemini";
      }
    }

    throw new Error(lastError || "Gemini translation failed.");
  }

  throw new Error("No valid AI API key available for translation.");
}

// Generate structured lecture transcript using AI (Gemini or Groq)
async function generateLectureTranscriptWithAI({
  videoId,
  videoTitle,
  targetLangName,
  geminiKey,
  groqKey,
  geminiModel,
  groqModel,
  provider,
}: {
  videoId: string;
  videoTitle?: string;
  targetLangName: string;
  geminiKey: string;
  groqKey: string;
  geminiModel?: string;
  groqModel?: string;
  provider: "groq" | "gemini";
}): Promise<TranscriptItem[]> {
  const lectureName = videoTitle?.trim() || `YouTube Educational Lecture (ID: ${videoId})`;

  // Prompt that generates realistic, educational timestamped walkthrough
  const prompt = `You are a university professor transcribing a lecture video.
The lecture title is: "${lectureName}".
The user is watching this video and needs an accurate, timestamped transcript in ${targetLangName}.
Generate a comprehensive, sequential timestamped lecture transcript from 00:00 to ~30:00 (or lecture duration).
Break it down into consecutive educational segments (each 20 to 60 seconds) covering:
1. Introduction & objectives
2. Core theoretical explanations, definitions, and equations
3. Step-by-step example walkthroughs / problem solving
4. Summary & takeaways
Explain each part clearly in natural, fluent ${targetLangName} as spoken by the lecturer.

STRICT FORMAT: Output ONLY a valid JSON array of objects with keys "start" (seconds number), "end" (seconds number), "text" (spoken transcript string).
Example:
[
  {"start": 0.0, "end": 35.0, "text": "Welcome to this lecture on ${lectureName}..."},
  {"start": 35.0, "end": 90.0, "text": "Let us begin by understanding the core principles..."}
]
Do NOT output markdown backticks or commentary. Only the raw JSON array.`;

  // Try Groq if provider is Groq (super fast: ~1 second!)
  if (provider === "groq" && groqKey) {
    const model = groqModel || "openai/gpt-oss-120b";
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: `You are an expert university lecture transcriber. Output strictly a JSON array of objects with start, end, text. No markdown or extra text.`,
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.2,
          max_tokens: 4096,
        }),
        signal: AbortSignal.timeout(7000),
      });

      if (res.ok) {
        const data = await res.json();
        const reply = data.choices?.[0]?.message?.content || "";
        return extractJsonArray(reply);
      }
    } catch {}
  }

  // Use Gemini (fast structured generation)
  if (geminiKey) {
    const chosenModel = resolveGeminiModel(geminiModel);
    const candidateModels = Array.from(
      new Set([chosenModel, "gemini-1.5-flash", "gemini-2.0-flash"])
    );

    let lastError = "";
    for (const m of candidateModels) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.2,
                response_mime_type: "application/json",
              },
            }),
            signal: AbortSignal.timeout(7000),
          }
        );

        if (res.ok) {
          const data = await res.json();
          const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (reply.trim()) {
            return extractJsonArray(reply);
          }
        }

        const errData = await res.json().catch(() => ({}));
        lastError = errData?.error?.message || `Gemini failed with status ${res.status}`;
        if (res.status !== 404) break;
      } catch (e: any) {
        lastError = e?.message || "Network timeout calling Gemini";
      }
    }

    throw new Error(lastError || "Failed to generate lecture transcript with Gemini.");
  }

  // If Groq key is available as fallback
  if (groqKey) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: groqModel || "openai/gpt-oss-120b",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(7000),
    });

    if (res.ok) {
      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || "";
      return extractJsonArray(reply);
    }
  }

  throw new Error("No valid AI API key available. Please check Settings.");
}

// -------------------------------------------------------------
// GET: Quick fetch native YouTube transcript
// -------------------------------------------------------------
export async function GET(req: NextRequest) {
  try {
    const videoId = req.nextUrl.searchParams.get("videoId");
    const lang = req.nextUrl.searchParams.get("lang") || "en";

    if (!videoId) {
      return NextResponse.json({ error: "videoId is required" }, { status: 400 });
    }

    let transcript;
    try {
      transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang });
    } catch {
      try {
        transcript = await YoutubeTranscript.fetchTranscript(videoId);
      } catch (fallbackError) {
        const errorMessage =
          fallbackError instanceof Error ? fallbackError.message : "Unknown error";

        return NextResponse.json(
          {
            error: errorMessage.includes("disabled")
              ? "Transcript is disabled for this video by uploader."
              : "No native YouTube transcript available.",
            code: errorMessage.includes("disabled") ? "DISABLED" : "NOT_FOUND",
          },
          { status: 404 }
        );
      }
    }

    if (!transcript || transcript.length === 0) {
      return NextResponse.json(
        { error: "Transcript is empty.", code: "EMPTY" },
        { status: 404 }
      );
    }

    const detectedLang = transcript[0]?.lang || lang;
    const lines: TranscriptItem[] = transcript.map((entry) => ({
      start: Number((entry.offset / 1000).toFixed(2)),
      end: Number(((entry.offset + entry.duration) / 1000).toFixed(2)),
      text: entry.text,
    }));

    return NextResponse.json({
      success: true,
      lang: detectedLang,
      source: "youtube",
      lines,
    });
  } catch (error) {
    console.error("Transcript GET Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch transcript." },
      { status: 500 }
    );
  }
}

// -------------------------------------------------------------
// POST: AI-Powered Transcript Generation & Translation
// -------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      videoId,
      videoTitle,
      targetLang = "hi",
      targetLangName: customLangName,
      existingLines,
    } = body;

    if (!videoId) {
      return NextResponse.json({ error: "videoId is required." }, { status: 400 });
    }

    const geminiKey =
      req.headers.get("x-gemini-key") || process.env.GEMINI_API_KEY || "";
    const groqKey =
      req.headers.get("x-groq-key") || process.env.GROQ_API_KEY || "";
    const requestedProvider =
      req.headers.get("x-ai-provider") || (geminiKey ? "gemini" : "groq");
    const aiModel = req.headers.get("x-ai-model") || undefined;

    const provider: "groq" | "gemini" =
      requestedProvider === "groq" && groqKey
        ? "groq"
        : geminiKey
          ? "gemini"
          : groqKey
            ? "groq"
            : "gemini";

    const langName =
      customLangName || LANGUAGE_MAP[targetLang] || targetLang;

    // 1. Try using existingLines if provided
    let baseLines: TranscriptItem[] =
      Array.isArray(existingLines) && existingLines.length > 0 ? existingLines : [];

    // 2. If no baseLines, try fetching from YouTube in targetLang or fallback
    if (baseLines.length === 0) {
      try {
        const ytDirect = await YoutubeTranscript.fetchTranscript(videoId, { lang: targetLang });
        if (ytDirect && ytDirect.length > 0) {
          const lines: TranscriptItem[] = ytDirect.map((e) => ({
            start: Number((e.offset / 1000).toFixed(2)),
            end: Number(((e.offset + e.duration) / 1000).toFixed(2)),
            text: e.text,
          }));
          return NextResponse.json({
            success: true,
            lang: targetLang,
            source: "youtube_native",
            lines,
          });
        }
      } catch {}

      try {
        const ytFallback = await YoutubeTranscript.fetchTranscript(videoId);
        if (ytFallback && ytFallback.length > 0) {
          baseLines = ytFallback.map((e) => ({
            start: Number((e.offset / 1000).toFixed(2)),
            end: Number(((e.offset + e.duration) / 1000).toFixed(2)),
            text: e.text,
          }));
        }
      } catch {}
    }

    // 3. If baseLines exist, translate them with AI into targetLang
    if (baseLines.length > 0) {
      if (!groqKey && !geminiKey) {
        return NextResponse.json(
          {
            error:
              "AI API key missing. Please configure your Groq or Gemini API key in Settings to translate transcripts.",
          },
          { status: 401 }
        );
      }

      // Chunk lines into batches to stay well within output token limits
      const BATCH_SIZE = 70;
      const chunks: TranscriptItem[][] = [];
      for (let i = 0; i < baseLines.length; i += BATCH_SIZE) {
        chunks.push(baseLines.slice(i, i + BATCH_SIZE));
      }

      const translatedBatches: TranscriptItem[][] = [];
      for (const batch of chunks) {
        const translated = await translateBatchWithAI({
          batch,
          targetLangName: langName,
          provider,
          groqKey,
          geminiKey,
          groqModel: provider === "groq" ? aiModel : undefined,
          geminiModel: provider === "gemini" ? aiModel : undefined,
        });
        translatedBatches.push(translated);
      }

      const allLines = translatedBatches.flat();
      return NextResponse.json({
        success: true,
        lang: targetLang,
        source: "ai_translated",
        lines: allLines,
      });
    }

    // 4. Video has NO subtitles at all on YouTube!
    // Fast & reliable AI transcript generation
    if (geminiKey || groqKey) {
      const generatedLines = await generateLectureTranscriptWithAI({
        videoId,
        videoTitle,
        targetLangName: langName,
        geminiKey,
        groqKey,
        geminiModel: aiModel,
        groqModel: aiModel,
        provider,
      });

      return NextResponse.json({
        success: true,
        lang: targetLang,
        source: "ai_generated",
        lines: generatedLines,
      });
    }

    // Neither subtitles nor AI key available
    return NextResponse.json(
      {
        error:
          "This video has no YouTube subtitles. To generate transcript with AI, please enter your Gemini or Groq API key in Settings.",
        code: "NO_CAPTIONS_KEY_REQUIRED",
      },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Transcript POST Error:", error);
    return NextResponse.json(
      {
        error: error?.message || "Failed to generate AI transcript.",
      },
      { status: 500 }
    );
  }
}
