"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  BotMessageSquare,
  Sparkles,
  Send,
  Square,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  Settings as SettingsIcon,
  AlertCircle,
  BookOpen,
  HelpCircle,
  FileDown,
  Lightbulb,
  CheckCircle2,
  XCircle,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { useStudyStore } from "@/store/useStudyStore";
import { useProgress } from "@/hooks/useProgress";
import { useStreak } from "@/hooks/useStreak";
import { ChatMessage } from "@/types";
import { toast } from "sonner";
import { format } from "date-fns";

function AiMentorContent() {
  const searchParams = useSearchParams();
  const urlSubjectId = searchParams.get("subjectId");
  const urlLectureId = searchParams.get("lectureId");

  const settings = useStudyStore((s) => s.settings);
  const subjects = useStudyStore((s) => s.subjects);
  const lectures = useStudyStore((s) => s.lectures);
  const events = useStudyStore((s) => s.events);
  const threads = useStudyStore((s) => s.threads);
  const getOrCreateThread = useStudyStore((s) => s.getOrCreateThread);
  const addMessageToThread = useStudyStore((s) => s.addMessageToThread);
  const clearThread = useStudyStore((s) => s.clearThread);
  const deleteThread = useStudyStore((s) => s.deleteThread);

  const { stats, dailyGoal } = useProgress();
  const { currentStreak } = useStreak();

  // Active Context Selectors
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(
    urlSubjectId || (subjects[0]?.id || "all")
  );
  const [selectedLectureId, setSelectedLectureId] = useState<string>(
    urlLectureId || ""
  );

  // Compute thread key: either `${subjectId}:${lectureId}` or `general`
  const activeThreadKey =
    selectedSubjectId === "all" || !selectedSubjectId
      ? "general"
      : selectedLectureId
      ? `${selectedSubjectId}:${selectedLectureId}`
      : `${selectedSubjectId}:general`;

  const activeThread = getOrCreateThread(activeThreadKey);

  // Input & Streaming States
  const [inputMessage, setInputMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Attachments State & Refs
  interface PendingAttachment {
    id: string;
    name: string;
    type: "image" | "pdf";
    mimeType: string;
    base64: string;
    previewUrl: string;
    size: number;
  }

  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingAttachmentsRef = useRef<PendingAttachment[]>([]);

  // Session-only thumbnails (in-memory ONLY, NOT persisted to localStorage)
  const [sessionPreviews, setSessionPreviews] = useState<
    Record<string, { previewUrl: string; name: string; type: "image" | "pdf" }[]>
  >({});

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments;
  }, [pendingAttachments]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Interactive Quiz state
  const [quizScore, setQuizScore] = useState<{ answered: number; correct: number } | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeThread.messages, streamedText]);

  // Client-side Canvas Image Resizer: max 1600px longest side, JPEG 0.85 quality
  const resizeImageToDataUrl = (
    file: File
  ): Promise<{ base64: string; mimeType: string; previewUrl: string; size: number }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new window.Image();
        img.onload = () => {
          try {
            let width = img.width;
            let height = img.height;
            const maxDim = 1600;

            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              reject(new Error("Canvas context creation failed"));
              return;
            }

            ctx.drawImage(img, 0, 0, width, height);
            const mimeType = "image/jpeg";
            const dataUrl = canvas.toDataURL(mimeType, 0.85);
            const base64 = dataUrl.split(",")[1];
            const approxSize = Math.round((base64.length * 3) / 4);
            resolve({ base64, mimeType, previewUrl: dataUrl, size: approxSize });
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => reject(new Error("Failed to load image file"));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error("Failed to read image file"));
      reader.readAsDataURL(file);
    });
  };

  // PDF Processor: Reject PDFs larger than 3 MB
  const processPdfFile = (
    file: File
  ): Promise<{ base64: string; mimeType: string; previewUrl: string; size: number }> => {
    return new Promise((resolve, reject) => {
      if (file.size > 3 * 1024 * 1024) {
        reject(new Error("PDF_TOO_LARGE"));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const base64 = dataUrl.split(",")[1] || "";
        resolve({
          base64,
          mimeType: "application/pdf",
          previewUrl: "",
          size: file.size,
        });
      };
      reader.onerror = () => reject(new Error("Failed to read PDF file"));
      reader.readAsDataURL(file);
    });
  };

  // Process incoming files (from input, drag-and-drop, or paste)
  const handleProcessFiles = async (files: File[]) => {
    if (!files || files.length === 0) return;

    const currentCount = pendingAttachmentsRef.current.length;
    if (currentCount >= 3) {
      toast.error("Maximum 3 attachments per message allowed.");
      return;
    }

    const remainingSlots = 3 - currentCount;
    if (files.length > remainingSlots) {
      toast.info(`Adding first ${remainingSlots} attachment(s). Maximum 3 per message.`);
    }

    const filesToAdd = files.slice(0, remainingSlots);
    const newAttachments: PendingAttachment[] = [];

    for (const file of filesToAdd) {
      const isImage = ["image/png", "image/jpeg", "image/webp"].includes(file.type);
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

      if (!isImage && !isPdf) {
        toast.error(`Unsupported file type: ${file.name}. Only PNG, JPEG, WEBP and PDF are accepted.`);
        continue;
      }

      try {
        if (isPdf) {
          if (file.size > 3 * 1024 * 1024) {
            toast.error("PDF too large (max 3 MB)");
            continue;
          }
          const { base64, mimeType, size } = await processPdfFile(file);
          newAttachments.push({
            id: `att-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            name: file.name,
            type: "pdf",
            mimeType,
            base64,
            previewUrl: "",
            size,
          });
        } else {
          const { base64, mimeType, previewUrl, size } = await resizeImageToDataUrl(file);
          newAttachments.push({
            id: `att-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            name: file.name,
            type: "image",
            mimeType,
            base64,
            previewUrl,
            size,
          });
        }
      } catch (err: any) {
        if (err?.message === "PDF_TOO_LARGE") {
          toast.error("PDF too large (max 3 MB)");
        } else {
          toast.error(`Failed to process ${file.name}: ${err?.message || "File read error"}`);
        }
      }
    }

    if (newAttachments.length > 0) {
      setPendingAttachments((prev) => {
        const combined = [...prev, ...newAttachments].slice(0, 3);
        const totalBytes = combined.reduce((sum, a) => sum + (a.base64?.length || 0), 0);
        if (totalBytes > 4 * 1024 * 1024) {
          toast.error("Total attachments exceed 4 MB (Vercel limit). Please attach smaller files.");
          return prev;
        }
        return combined;
      });
    }
  };

  const removeAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleProcessFiles(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      handleProcessFiles(files);
    }
  };

  // Global paste support
  useEffect(() => {
    const onGlobalPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && target.tagName === "INPUT" && target !== fileInputRef.current) {
        // Handled by input element's onPaste handler
        return;
      }
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        handleProcessFiles(files);
      }
    };

    window.addEventListener("paste", onGlobalPaste);
    return () => window.removeEventListener("paste", onGlobalPaste);
  }, []);

  // Sync from URL if present
  useEffect(() => {
    if (urlSubjectId) setSelectedSubjectId(urlSubjectId);
    if (urlLectureId) setSelectedLectureId(urlLectureId);
  }, [urlSubjectId, urlLectureId]);

  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId);
  const selectedLecture = lectures.find((l) => l.id === selectedLectureId);
  const subjectLectures = lectures.filter((l) => l.subjectId === selectedSubjectId);

  const activeAiProvider = settings.aiProvider === "groq" ? "groq" : "gemini";
  const activeAiKey = activeAiProvider === "groq" ? settings.groqKey : settings.geminiKey;
  const activeAiModel = activeAiProvider === "groq" ? settings.groqModel : settings.geminiModel;
  const activeAiRoute = activeAiProvider === "groq" ? "/api/groq" : "/api/gemini";
  const activeAiLabel = activeAiProvider === "groq" ? "Groq" : "Gemini";

  // Build System Prompt with real-time study context
  const buildSystemInstruction = () => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const overdueCount = lectures.filter(
      (l) => !l.completed && l.scheduledDate && l.scheduledDate < todayStr
    ).length;

    const progressSummary = {
      userName: settings.userName,
      language: settings.language,
      currentStreakDays: currentStreak,
      completedToday: stats.completedToday,
      dailyGoalLectures: dailyGoal,
      overdueLectures: overdueCount,
      totalSubjects: subjects.map((s) => {
        const sLecs = lectures.filter((l) => l.subjectId === s.id);
        const comp = sLecs.filter((l) => l.completed).length;
        return {
          name: s.name,
          completion: sLecs.length > 0 ? `${Math.round((comp / sLecs.length) * 100)}%` : "0%",
          examDate: s.examDate || "None",
        };
      }),
      activeTopicContext: selectedLecture
        ? {
            title: selectedLecture.title,
            subject: selectedSubject?.name,
            notes: selectedLecture.notes || "None",
            isDifficult: selectedLecture.difficult,
            watchedSec: selectedLecture.watchedSec,
            durationSec: selectedLecture.durationSec,
          }
        : "General Study Context",
    };

    const isHinglish = settings.language === "hinglish";

    return `You are a high-energy, empathetic, honest, and razor-sharp personal Study Mentor for ${settings.userName}.
Language style: ${
      isHinglish
        ? "Natural Hinglish (mix of Hindi + English like how Indian engineers talk). Use terms like 'bhai', 'dekh', 'funda clear kar', 'concept pakad'."
        : "Clear, engaging English with vivid real-life analogies."
    }

Mentorship Guidelines:
1. Honest Feedback: If user's progress is low or they have overdue lectures, call it out constructively. Don't blindly flatter.
2. Step-by-Step Clarity: Break down complex math, programming, algorithms, and theory using relatable analogies first, then technical rigor, followed by a crisp 2-line summary.
3. Math & Code: Always use LaTeX ($...$ for inline, $$...$$ for block) and clean Markdown with fenced code blocks.
4. Active Topic Context: If a specific lecture/topic is selected, tailor your explanation precisely to that lecture and user's saved notes.

User Real-time Stats JSON:
${JSON.stringify(progressSummary, null, 2)}`;
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = textToSend !== undefined ? textToSend : inputMessage;
    const currentAttachments = [...pendingAttachments];

    if ((!query.trim() && currentAttachments.length === 0) || isStreaming) return;

    // Requirement 5: Groq does not support image attachments
    if (currentAttachments.length > 0 && activeAiProvider === "groq") {
      toast.error("Images need Gemini. Switch provider in Settings.");
      setErrorMessage("Images need Gemini. Switch provider in Settings.");
      return;
    }

    if (!activeAiKey) {
      setErrorMessage(`${activeAiLabel} API key is not set. Please add it in Settings.`);
      return;
    }

    // Vercel limit check: Total attachment base64 payload under 4 MB
    const totalBytes = currentAttachments.reduce((sum, a) => sum + (a.base64?.length || 0), 0);
    if (totalBytes > 4 * 1024 * 1024) {
      toast.error("Total attachments exceed 4 MB (Vercel limit).");
      return;
    }

    setErrorMessage(null);
    setInputMessage("");
    setPendingAttachments([]);
    setStreamedText("");

    const userMsgId = `msg-${Date.now()}`;

    // Store thumbnail previews only in current session state (NOT in localStorage / Zustand)
    if (currentAttachments.length > 0) {
      setSessionPreviews((prev) => ({
        ...prev,
        [userMsgId]: currentAttachments.map((a) => ({
          previewUrl: a.previewUrl,
          name: a.name,
          type: a.type,
        })),
      }));
    }

    // Add user message to state with ONLY label / file names (NO base64 file data)
    addMessageToThread(activeThreadKey, {
      id: userMsgId,
      role: "user",
      content:
        query.trim() ||
        `[Attached: ${currentAttachments.map((a) => a.name).join(", ")}]`,
      attachments: currentAttachments.map((a) => ({
        name: a.name,
        type: a.type,
      })),
    });

    const effectivePrompt =
      query.trim() ||
      (currentAttachments.length > 0
        ? `Please analyze the attached ${currentAttachments.map((a) => a.type).join(" and ")} file(s) and explain key concepts in detail.`
        : "");

    const contents = [
      ...activeThread.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      {
        role: "user",
        parts: [{ text: effectivePrompt }],
      },
    ];

    setIsStreaming(true);
    abortControllerRef.current = new AbortController();
    let fullAssistantText = "";

    try {
      const res = await fetch(activeAiRoute, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(activeAiProvider === "groq"
            ? { "x-groq-key": activeAiKey }
            : { "x-gemini-key": activeAiKey }),
        },
        body: JSON.stringify({
          action: "chat_stream",
          model: activeAiModel || (activeAiProvider === "groq" ? "llama-3.3-70b-versatile" : "gemini-3.8-flash"),
          systemInstruction: buildSystemInstruction(),
          contents,
          attachments: currentAttachments.map((a) => ({
            name: a.name,
            mimeType: a.mimeType,
            data: a.base64,
          })),
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server responded with ${res.status}`);
      }

      if (!res.body) {
        throw new Error("No response body received.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let pendingLine = "";

      const processLine = (line: string) => {
        if (!line.startsWith("data:")) return;

        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") return;

        const parsed = JSON.parse(data);
        const partText =
          parsed.candidates?.[0]?.content?.parts?.[0]?.text ||
          parsed.choices?.[0]?.delta?.content ||
          "";
        if (partText) {
          fullAssistantText += partText;
          setStreamedText(fullAssistantText);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          pendingLine += decoder.decode();
          if (pendingLine.trim()) {
            try {
              processLine(pendingLine);
            } catch {
              // Ignore non-JSON SSE control events.
            }
          }
          break;
        }

        const rawChunk = pendingLine + decoder.decode(value, { stream: true });
        const lines = rawChunk.split(/\r?\n/);
        pendingLine = lines.pop() || "";

        for (const line of lines) {
          try {
            processLine(line);
          } catch {
            // Ignore non-JSON SSE control events.
          }
        }
      }

      if (fullAssistantText) {
        addMessageToThread(activeThreadKey, {
          role: "assistant",
          content: fullAssistantText,
        });
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        if (fullAssistantText) {
          addMessageToThread(activeThreadKey, {
            role: "assistant",
            content: fullAssistantText,
          });
        }
      } else {
        const errMsg = err.message || `Failed to communicate with ${activeAiLabel} API.`;
        setErrorMessage(errMsg);
        toast.error(errMsg);
      }
    } finally {
      setIsStreaming(false);
      setStreamedText("");
      abortControllerRef.current = null;
    }
  };

  const handleStopStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownloadNotes = () => {
    const threadNotes = activeThread.messages
      .map((m) => `### ${m.role.toUpperCase()}:\n\n${m.content}\n\n---\n`)
      .join("\n");

    const blob = new Blob([threadNotes], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Study_Notes_${activeThreadKey.replace(":", "_")}.md`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Notes downloaded as Markdown!");
  };

  // Quick Action Chips definitions
  const quickActions = [
    {
      label: "Today's plan",
      prompt: "Based on my streak, schedule, and pending items, what exact lectures and revisions should I prioritize today?",
    },
    {
      label: "Analyze my progress",
      prompt: "Honestly critique my study pace and tell me which subjects are getting neglected.",
    },
    {
      label: "Quiz me (5 MCQs)",
      prompt: selectedLecture
        ? `Create an interactive 5-question multiple choice quiz on '${selectedLecture.title}'. Format each question clearly with options A, B, C, D, and put the answer and explanation inside a collapsed or numbered spoiler at the end!`
        : "Create an interactive 5-question conceptual quiz on the subjects I am studying.",
    },
    {
      label: "Summarize this topic",
      prompt: selectedLecture
        ? `Summarize the core concepts of '${selectedLecture.title}' in 5 concise bullet points and 1 intuition analogy.`
        : "Summarize the key roadmap of my current subject.",
    },
    {
      label: "Explain like I'm 12",
      prompt: selectedLecture
        ? `Explain the core mechanism of '${selectedLecture.title}' like I am 12 years old using a fun real-world metaphor.`
        : "Explain the hardest concept I have pending in simple terms.",
    },
    {
      label: "Make revision notes",
      prompt: selectedLecture
        ? `Generate concise, high-yield cheat-sheet revision notes with formulas/syntax for '${selectedLecture.title}'.`
        : "Make a high-yield formula cheat sheet for my upcoming exams.",
    },
  ];

  return (
    <div
      className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto flex flex-col h-[calc(100vh-5rem)] md:h-[calc(100vh-2rem)] relative"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleProcessFiles(Array.from(e.dataTransfer.files));
        }
      }}
    >
      {/* Drag & Drop Visual Overlay */}
      {isDragging && (
        <div className="absolute inset-4 z-40 bg-[#0d0d18]/90 backdrop-blur-md border-2 border-dashed border-[#00f0ff] rounded-3xl flex flex-col items-center justify-center pointer-events-none shadow-[0_0_30px_rgba(0,240,255,0.2)]">
          <div className="w-14 h-14 rounded-2xl bg-[#00f0ff]/10 border border-[#00f0ff]/40 flex items-center justify-center text-[#00f0ff] mb-3 animate-bounce">
            <Paperclip className="w-6 h-6" />
          </div>
          <p className="text-base font-bold text-white">Drop images or PDFs here</p>
          <p className="text-xs text-gray-400 font-mono mt-1">
            Accepts PNG, JPEG, WEBP and PDF (max 3 attachments, max 3 MB for PDFs)
          </p>
        </div>
      )}

      {/* Top Header & Context Selectors */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#00f0ff]/20 to-[#a855f7]/20 border border-[#00f0ff]/40 flex items-center justify-center text-[#00f0ff]">
            <BotMessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white font-heading flex items-center gap-2">
              <span>AI Study Mentor</span>
              <span className="text-xs font-mono font-normal px-2 py-0.5 rounded-full bg-[#00f0ff]/10 text-[#00f0ff] border border-[#00f0ff]/30">
                {activeAiModel || (activeAiProvider === "groq" ? "llama-3.3-70b-versatile" : "gemini-3.8-flash")}
              </span>
            </h1>
            <p className="text-xs text-gray-400">
              Personal tutor grounded in your lectures, notes, and live progress
            </p>
          </div>
        </div>

        {/* Context Selectors */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Subject Dropdown */}
          <select
            value={selectedSubjectId}
            onChange={(e) => {
              setSelectedSubjectId(e.target.value);
              setSelectedLectureId("");
            }}
            className="px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs focus:outline-none focus:border-[#00f0ff]"
          >
            <option value="all" className="bg-[#0d0d18] text-white">
              All Subjects (General Mentor)
            </option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id} className="bg-[#0d0d18] text-white">
                {s.name}
              </option>
            ))}
          </select>

          {/* Lecture Dropdown (if subject selected) */}
          {selectedSubjectId !== "all" && subjectLectures.length > 0 && (
            <select
              value={selectedLectureId}
              onChange={(e) => setSelectedLectureId(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs max-w-[220px] truncate focus:outline-none focus:border-[#00f0ff]"
            >
              <option value="" className="bg-[#0d0d18] text-white">
                General Subject Level
              </option>
              {subjectLectures.map((l) => (
                <option key={l.id} value={l.id} className="bg-[#0d0d18] text-white">
                  #{l.order} {l.title}
                </option>
              ))}
            </select>
          )}

          {/* Download Notes */}
          {activeThread.messages.length > 0 && (
            <button
              onClick={handleDownloadNotes}
              className="p-2 rounded-xl bg-white/[0.04] border border-white/10 text-gray-300 hover:text-white transition-colors cursor-pointer"
              title="Download Thread as Markdown"
            >
              <FileDown className="w-4 h-4" />
            </button>
          )}

          {/* Clear Thread */}
          {activeThread.messages.length > 0 && (
            <button
              onClick={() => {
                if (confirm("Clear messages in this conversation thread?")) {
                  clearThread(activeThreadKey);
                  toast.success("Thread cleared.");
                }
              }}
              className="p-2 rounded-xl bg-white/[0.04] border border-white/10 text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
              title="Clear Thread"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Warning if API key is missing */}
      {!activeAiKey && (
        <div className="mt-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <span>
              {activeAiLabel} API key is required to chat with AI Mentor. Add it in Settings.
            </span>
          </div>
          <Link
            href="/settings"
            className="px-3 py-1 rounded-lg bg-amber-400 text-black font-semibold text-xs hover:bg-amber-300"
          >
            Configure Key
          </Link>
        </div>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Chat Messages Scrollable Box */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
        {activeThread.messages.length === 0 && !isStreaming ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4 max-w-lg mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#00f0ff]/20 to-[#a855f7]/20 border border-[#00f0ff]/30 flex items-center justify-center text-[#00f0ff]">
              <Sparkles className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-white font-heading">
                Ready to study, {settings.userName || "friend"}?
              </h3>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                {selectedLecture
                  ? `Topic locked: #${selectedLecture.order} ${selectedLecture.title}. Ask doubts, get a 5-question quiz, or ask for simple analogies.`
                  : "Ask about your progress, plan your day, or clear difficult concepts."}
              </p>
            </div>

            {/* Quick Action Chips in Empty State */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {quickActions.map((qa) => (
                <button
                  key={qa.label}
                  onClick={() => handleSendMessage(qa.prompt)}
                  className="px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 hover:border-[#00f0ff]/50 hover:bg-[#00f0ff]/10 text-xs text-gray-300 hover:text-white transition-all cursor-pointer font-medium"
                >
                  ⚡ {qa.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {activeThread.messages.map((msg, idx) => (
              <div
                key={msg.id || idx}
                className={`flex gap-3 ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#00f0ff]/20 to-[#a855f7]/20 border border-[#00f0ff]/30 flex items-center justify-center text-[#00f0ff] shrink-0 mt-1">
                    <BotMessageSquare className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed relative group ${
                    msg.role === "user"
                      ? "bg-gradient-to-r from-[#00f0ff]/20 to-[#a855f7]/20 border border-[#00f0ff]/30 text-white"
                      : "glass-panel bg-white/[0.03] border border-white/10 text-gray-200"
                  }`}
                >
                  {/* Copy Button */}
                  <button
                    onClick={() => handleCopy(msg.content, msg.id || String(idx))}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/40 text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Copy response"
                  >
                    {copiedId === (msg.id || String(idx)) ? (
                      <Check className="w-3.5 h-3.5 text-[#39ff14]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {/* Display Attached Images / PDFs (Session thumbnails or persistent labels) */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {msg.attachments.map((att, attIdx) => {
                        const sessionAtt = sessionPreviews[msg.id || ""]?.[attIdx];
                        const isImg = att.type === "image";
                        return (
                          <div
                            key={attIdx}
                            className="flex items-center gap-2 p-1.5 rounded-xl bg-black/40 border border-white/15 text-xs shadow-inner"
                          >
                            {isImg && sessionAtt?.previewUrl ? (
                              <img
                                src={sessionAtt.previewUrl}
                                alt={att.name || "image attached"}
                                className="w-12 h-12 object-cover rounded-lg border border-white/20 cursor-pointer hover:opacity-90 hover:scale-105 transition-all shadow-sm"
                                onClick={() => window.open(sessionAtt.previewUrl, "_blank")}
                                title="Click to view full image"
                              />
                            ) : isImg ? (
                              <div className="flex items-center gap-1.5 text-gray-300 px-2 py-1">
                                <ImageIcon className="w-4 h-4 text-[#00f0ff]" />
                                <span className="font-mono text-[11px] truncate max-w-[150px]">
                                  {att.name || "image attached"}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-gray-300 px-2 py-1">
                                <FileText className="w-4 h-4 text-red-400" />
                                <span className="font-mono text-[11px] truncate max-w-[150px]">
                                  {att.name || "PDF document"}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="prose prose-invert prose-dark max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>

                  <div className="text-[10px] text-gray-500 font-mono mt-2 text-right">
                    {format(new Date(msg.ts), "HH:mm")}
                  </div>
                </div>
              </div>
            ))}

            {/* In-flight Streamed Text Bubble */}
            {isStreaming && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#00f0ff]/20 to-[#a855f7]/20 border border-[#00f0ff]/30 flex items-center justify-center text-[#00f0ff] shrink-0 mt-1 animate-pulse">
                  <BotMessageSquare className="w-4 h-4" />
                </div>
                <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed glass-panel bg-white/[0.03] border border-[#00f0ff]/30 text-gray-200">
                  <div className="prose prose-invert prose-dark max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {streamedText || "Thinking and consulting your syllabus..."}
                    </ReactMarkdown>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[#00f0ff] font-mono">
                    <span className="w-2 h-2 rounded-full bg-[#00f0ff] animate-ping" />
                    <span>Streaming response...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Bottom Action Bar: Quick Action Chips + Input Form */}
      <div className="pt-3 border-t border-white/10 space-y-2.5">
        {/* Horizontal Quick Action Chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {quickActions.map((qa) => (
            <button
              key={qa.label}
              onClick={() => handleSendMessage(qa.prompt)}
              disabled={isStreaming}
              className="px-3 py-1 rounded-xl bg-white/[0.03] border border-white/10 hover:border-[#00f0ff]/40 hover:bg-[#00f0ff]/10 text-[11px] text-gray-300 hover:text-white transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              ⚡ {qa.label}
            </button>
          ))}
        </div>

        {/* Attachment Previews */}
        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1 pb-1">
            {pendingAttachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.06] border border-[#00f0ff]/30 text-white text-xs max-w-xs relative group shadow-[0_0_10px_rgba(0,240,255,0.1)]"
              >
                {att.type === "image" ? (
                  <img
                    src={att.previewUrl}
                    alt={att.name}
                    className="w-8 h-8 rounded-lg object-cover border border-white/10 shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                )}
                <div className="flex flex-col min-w-0 pr-6">
                  <span className="truncate text-xs text-gray-200 font-medium max-w-[120px] sm:max-w-[160px]" title={att.name}>
                    {att.name}
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">
                    {att.size < 1024 * 1024
                      ? `${Math.round(att.size / 1024)} KB`
                      : `${(att.size / (1024 * 1024)).toFixed(1)} MB`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeAttachment(att.id)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Remove attachment"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            <span className="text-[11px] text-gray-500 font-mono">
              ({pendingAttachments.length}/3)
            </span>

            {activeAiProvider === "groq" && (
              <span className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Images need Gemini. Switch provider in Settings.
              </span>
            )}
          </div>
        )}

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            placeholder={
              selectedLecture
                ? `Ask anything about #${selectedLecture.order} ${selectedLecture.title}...`
                : "Ask about your progress, explain a concept, or plan your day..."
            }
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onPaste={handlePaste}
            disabled={isStreaming}
            className="flex-1 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-gray-500 text-xs sm:text-sm focus:outline-none focus:border-[#00f0ff] transition-all"
          />

          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInputChange}
            multiple
            accept="image/png,image/jpeg,image/webp,application/pdf"
            className="hidden"
          />

          {/* Paperclip Attachment Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming || pendingAttachments.length >= 3}
            className="px-3.5 py-3 rounded-xl bg-white/[0.06] border border-white/15 text-gray-300 hover:text-white hover:bg-white/[0.1] hover:border-[#00f0ff]/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center cursor-pointer shrink-0"
            title="Attach image or PDF (max 3)"
          >
            <Paperclip className="w-4 h-4 text-[#00f0ff]" />
          </button>

          {isStreaming ? (
            <button
              type="button"
              onClick={handleStopStream}
              className="px-4 py-3 rounded-xl bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30 font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={(!inputMessage.trim() && pendingAttachments.length === 0) || isStreaming}
              className="px-5 py-3 rounded-xl bg-gradient-to-r from-[#00f0ff] to-[#a855f7] text-black font-semibold text-xs sm:text-sm hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(0,240,255,0.3)] transition-all flex items-center gap-2 cursor-pointer"
            >
              <Send className="w-4 h-4 text-black" />
              <span className="hidden sm:inline">Ask</span>
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

export default function AiMentorPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading AI Mentor...</div>}>
      <AiMentorContent />
    </Suspense>
  );
}
