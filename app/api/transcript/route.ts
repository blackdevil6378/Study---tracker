import { NextRequest, NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";

export async function GET(req: NextRequest) {
  try {
    const videoId = req.nextUrl.searchParams.get("videoId");
    const lang = req.nextUrl.searchParams.get("lang") || "en";

    if (!videoId) {
      return NextResponse.json(
        { error: "videoId is required" },
        { status: 400 }
      );
    }

    // Try requested language first, then fallback to any available
    let transcript;
    try {
      transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang });
    } catch {
      // If requested language not available, try without language preference
      try {
        transcript = await YoutubeTranscript.fetchTranscript(videoId);
      } catch (fallbackError) {
        const errorMessage =
          fallbackError instanceof Error
            ? fallbackError.message
            : "Unknown error";

        // Check if transcript is disabled or unavailable
        if (
          errorMessage.includes("disabled") ||
          errorMessage.includes("Disabled")
        ) {
          return NextResponse.json(
            {
              error: "Transcript is disabled for this video.",
              code: "DISABLED",
            },
            { status: 404 }
          );
        }

        if (
          errorMessage.includes("unavailable") ||
          errorMessage.includes("Unavailable")
        ) {
          return NextResponse.json(
            {
              error: "Video is unavailable.",
              code: "UNAVAILABLE",
            },
            { status: 404 }
          );
        }

        return NextResponse.json(
          {
            error: "No transcript available for this video.",
            code: "NOT_FOUND",
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

    // Determine the actual language from the response
    const detectedLang = transcript[0]?.lang || lang;

    // Convert to our TranscriptLine format
    const lines = transcript.map((entry) => ({
      start: entry.offset / 1000, // ms → seconds
      end: (entry.offset + entry.duration) / 1000,
      text: entry.text,
    }));

    return NextResponse.json({
      success: true,
      lang: detectedLang,
      lines,
    });
  } catch (error) {
    console.error("Transcript API Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch transcript." },
      { status: 500 }
    );
  }
}
