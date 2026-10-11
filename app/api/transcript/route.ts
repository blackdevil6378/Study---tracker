import { NextRequest, NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";

export const maxDuration = 60; // Allow sufficient time for AI transcription

const LANGUAGE_MAP: Record<string, string> = {
  hi: "Hindi (हिंदी)",
  hinglish: "Hinglish (Conversational Hindi written in English/Latin alphabet, e.g., 'Is video me hum samjhenge...')",
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
      end: Number(it.end) >= Number(it.start) ? Number(it.end) : Number(it.start) + 3,
      text: String(it.text).trim(),
    }))
    .sort((a, b) => a.start - b.start);
}

// Translate a batch of lines using Groq or Gemini
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
Make sure the translation is natural, fluent, and highly accurate for learning.
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
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Groq translation failed (${res.status})`);
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || "";
    return extractJsonArray(reply);
  }

  // Gemini translation fallback or default
  if (geminiKey) {
    let model = geminiModel || "gemini-2.5-flash";
    if (model === "gemini-3.8-flash" || model === "gemini-2.0-flash") {
      model = "gemini-2.5-flash";
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            response_mime_type: "application/json",
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Gemini translation failed (${res.status})`);
    }

    const data = await res.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return extractJsonArray(reply);
  }

  throw new Error("No valid AI API key available for translation.");
}

// Direct video listening transcription with Gemini
async function transcribeVideoWithGemini({
  videoId,
  targetLangName,
  geminiKey,
  geminiModel,
}: {
  videoId: string;
  targetLangName: string;
  geminiKey: string;
  geminiModel?: string;
}): Promise<TranscriptItem[]> {
  let model = geminiModel || "gemini-2.5-flash";
  if (model === "gemini-3.8-flash" || model === "gemini-2.0-flash") {
    model = "gemini-2.5-flash";
  }

  const prompt = `Listen to this YouTube video carefully and generate a comprehensive, accurate timestamped transcript in ${targetLangName}.
Break speech down into sequential subtitle segments of 3 to 10 seconds each with 'start' and 'end' time in seconds.
Return STRICTLY a JSON array of objects formatted as:
[
  {"start": 0.0, "end": 4.5, "text": "First spoken sentence in ${targetLangName}..."},
  {"start": 4.5, "end": 9.2, "text": "Next spoken sentence in ${targetLangName}..."}
]
Do not wrap in markdown or include conversational text. Return only the raw JSON array.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                file_data: {
                  file_uri: `https://www.youtube.com/watch?v=${videoId}`,
                },
              },
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          response_mime_type: "application/json",
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini video transcription failed (${res.status})`);
  }

  const data = await res.json();
  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return extractJsonArray(reply);
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
              ? "Transcript is disabled for this video."
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
      req.headers.get("x-ai-provider") || (groqKey ? "groq" : "gemini");
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
    let baseLines: TranscriptItem[] = Array.isArray(existingLines) && existingLines.length > 0
      ? existingLines
      : [];

    // 2. If no baseLines, try fetching from YouTube in targetLang or fallback
    if (baseLines.length === 0) {
      try {
        const ytDirect = await YoutubeTranscript.fetchTranscript(videoId, { lang: targetLang });
        if (ytDirect && ytDirect.length > 0) {
          // Native subtitles directly matched requested language!
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
    // Direct audio/video transcription using Gemini
    if (geminiKey) {
      const generatedLines = await transcribeVideoWithGemini({
        videoId,
        targetLangName: langName,
        geminiKey,
        geminiModel: aiModel,
      });

      return NextResponse.json({
        success: true,
        lang: targetLang,
        source: "ai_audio_transcribed",
        lines: generatedLines,
      });
    }

    // Neither subtitles nor Gemini key available
    return NextResponse.json(
      {
        error:
          "This video has no YouTube subtitles. To generate transcript directly from video audio with AI, please enter your Gemini API key in Settings.",
        code: "NO_CAPTIONS_GEMINI_REQUIRED",
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
