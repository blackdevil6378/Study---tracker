import { NextRequest, NextResponse } from "next/server";

const GITHUB_REPO_OWNER = "blackdevil6378";
const GITHUB_REPO_NAME = "Study---tracker";

const CATEGORY_LABELS: Record<string, string[]> = {
  general: ["feedback", "general"],
  feature: ["feedback", "enhancement"],
  bug: ["feedback", "bug"],
  praise: ["feedback", "praise"],
};

const CATEGORY_EMOJI: Record<string, string> = {
  general: "💬",
  feature: "💡",
  bug: "🐛",
  praise: "❤️",
};

export async function POST(req: NextRequest) {
  try {
    const githubToken = process.env.GITHUB_FEEDBACK_TOKEN;

    if (!githubToken) {
      return NextResponse.json(
        { error: "GitHub feedback token not configured on the server." },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { category, message, rating, email } = body;

    if (!message || !message.trim()) {
      return NextResponse.json(
        { error: "Feedback message is required." },
        { status: 400 }
      );
    }

    const emoji = CATEGORY_EMOJI[category] || "💬";
    const stars = "⭐".repeat(rating || 0);
    const categoryLabel = (category || "general").charAt(0).toUpperCase() + (category || "general").slice(1);

    // Build the issue title
    const titlePreview = message.trim().substring(0, 60);
    const issueTitle = `${emoji} [${categoryLabel}] ${titlePreview}${message.trim().length > 60 ? "..." : ""}`;

    // Build the issue body
    const issueBody = [
      `## ${emoji} User Feedback — ${categoryLabel}`,
      "",
      `**Rating:** ${stars || "Not provided"}`,
      `**Category:** ${categoryLabel}`,
      email ? `**Contact Email:** ${email}` : "",
      "",
      "---",
      "",
      "### Message",
      "",
      message.trim(),
      "",
      "---",
      "",
      `> 🕒 Submitted at: ${new Date().toISOString()}`,
      `> 🌐 Source: Study Tracker App`,
    ]
      .filter(Boolean)
      .join("\n");

    const labels = CATEGORY_LABELS[category] || ["feedback"];

    // Create GitHub issue
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/issues`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          title: issueTitle,
          body: issueBody,
          labels,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("GitHub API Error:", response.status, errorData);
      return NextResponse.json(
        {
          error: "Failed to submit feedback to GitHub.",
          details: errorData.message || response.statusText,
        },
        { status: response.status }
      );
    }

    const issueData = await response.json();

    return NextResponse.json({
      success: true,
      issueUrl: issueData.html_url,
      issueNumber: issueData.number,
    });
  } catch (error) {
    console.error("Feedback API Error:", error);
    return NextResponse.json(
      { error: "Internal server error while submitting feedback." },
      { status: 500 }
    );
  }
}
