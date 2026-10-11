"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  CheckCircle2,
  Circle,
  Bookmark,
  BookmarkCheck,
  BotMessageSquare,
  Sparkles,
  Gauge,
  Loader2,
  RefreshCw,
  AlertCircle,
  Save,
  BookOpen,
  Languages,
  Copy,
  Check,
  ChevronDown,
} from "lucide-react";
import { useStudyStore } from "@/store/useStudyStore";
import { useYouTubePlayer } from "@/hooks/useYouTubePlayer";
import { formatDigitalTime } from "@/lib/utils";
import { toast } from "sonner";

interface LanguageOption {
  code: string;
  label: string;
  flag: string;
}

const AVAILABLE_LANGUAGES: LanguageOption[] = [
  { code: "hi", label: "Hindi (हिंदी)", flag: "🇮🇳" },
  { code: "hinglish", label: "Hinglish", flag: "🇮🇳" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "es", label: "Spanish (Español)", flag: "🇪🇸" },
  { code: "fr", label: "French (Français)", flag: "🇫🇷" },
  { code: "de", label: "German (Deutsch)", flag: "🇩🇪" },
  { code: "bn", label: "Bengali (বাংলা)", flag: "🇮🇳" },
  { code: "mr", label: "Marathi (मराठी)", flag: "🇮🇳" },
  { code: "ta", label: "Tamil (தமிழ்)", flag: "🇮🇳" },
  { code: "te", label: "Telugu (తెలుగు)", flag: "🇮🇳" },
  { code: "gu", label: "Gujarati (ગુજરાતી)", flag: "🇮🇳" },
  { code: "pa", label: "Punjabi (ਪੰਜਾਬੀ)", flag: "🇮🇳" },
  { code: "ur", label: "Urdu (اردو)", flag: "🇵🇰" },
  { code: "ru", label: "Russian (Русский)", flag: "🇷🇺" },
  { code: "zh", label: "Chinese (中文)", flag: "🇨🇳" },
  { code: "ja", label: "Japanese (日本語)", flag: "🇯🇵" },
  { code: "ar", label: "Arabic (العربية)", flag: "🇸🇦" },
];

const getLangMeta = (code: string): { label: string; flag: string } => {
  const normalized = code.toLowerCase();
  const match = AVAILABLE_LANGUAGES.find((l) => l.code === normalized);
  if (match) return { label: match.label, flag: match.flag };
  return { label: code.toUpperCase(), flag: "🌐" };
};

export function YouTubePlayerModal() {
  const router = useRouter();
  const activeLecture = useStudyStore((s) => s.activeVideoLecture);
  const setActiveLecture = useStudyStore((s) => s.setActiveVideoLecture);
  const toggleLectureComplete = useStudyStore((s) => s.toggleLectureComplete);
  const toggleLectureDifficult = useStudyStore((s) => s.toggleLectureDifficult);
  const setLectureNotes = useStudyStore((s) => s.setLectureNotes);
  const updateLecture = useStudyStore((s) => s.updateLecture);
  const subjects = useStudyStore((s) => s.subjects);
  const settings = useStudyStore((s) => s.settings);

  const {
    containerId,
    duration,
    currentTime,
    playbackRate,
    changeSpeed,
    seekTo,
  } = useYouTubePlayer(activeLecture);

  const [notesText, setNotesText] = useState(activeLecture?.notes || "");
  const [isSavedNotes, setIsSavedNotes] = useState(true);
  const [selectedTranscriptLang, setSelectedTranscriptLang] = useState("en");
  const [targetGenerateLang, setTargetGenerateLang] = useState("hi");
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [generationStatus, setGenerationStatus] = useState("");
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [copiedTranscript, setCopiedTranscript] = useState(false);

  const activeTranscriptRef = useRef<HTMLButtonElement | null>(null);

  const transcriptLanguages = Object.keys(activeLecture?.transcript ?? {});
  const transcriptEntries = activeLecture?.transcript?.[selectedTranscriptLang] ?? [];
  const activeTranscriptIndex = transcriptEntries.findIndex(
    (entry) => currentTime >= entry.start && currentTime < entry.end
  );

  // Auto-scroll transcript to active line
  useEffect(() => {
    if (activeTranscriptRef.current) {
      activeTranscriptRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [activeTranscriptIndex]);

  // Fast fetch native YouTube transcript
  const fetchTranscript = useCallback(
    async (videoId: string, lectureId: string, lang: string = "en") => {
      setIsLoadingTranscript(true);
      setTranscriptError(null);
      try {
        const res = await fetch(`/api/transcript?videoId=${videoId}&lang=${lang}`);
        const data = await res.json();

        if (res.ok && data.success && Array.isArray(data.lines) && data.lines.length > 0) {
          const detectedLang = data.lang || lang;
          const existing = activeLecture?.transcript || {};
          updateLecture(lectureId, {
            transcript: {
              ...existing,
              [detectedLang]: data.lines,
            },
          });
          setSelectedTranscriptLang(detectedLang);
        } else {
          setTranscriptError(data.error || "No native YouTube captions available.");
        }
      } catch {
        setTranscriptError("Network error while fetching native transcript.");
      } finally {
        setIsLoadingTranscript(false);
      }
    },
    [activeLecture?.transcript, updateLecture]
  );

  // AI-Powered transcript generator / translator (in ANY chosen language)
  const generateAITranscript = useCallback(
    async (targetLang: string) => {
      if (!activeLecture?.videoId) return;

      const langInfo = getLangMeta(targetLang);
      setIsGeneratingAI(true);
      setTranscriptError(null);
      setGenerationStatus(`Generating AI transcript in ${langInfo.label}...`);

      const activeProvider = settings.aiProvider === "groq" ? "groq" : "gemini";
      const activeModel =
        activeProvider === "groq"
          ? settings.groqModel || "openai/gpt-oss-120b"
          : settings.geminiModel || "gemini-1.5-flash";

      try {
        // Collect existing transcript if any to translate faster
        const existingTranscripts = activeLecture.transcript || {};
        const baseLines = Object.values(existingTranscripts)[0] || [];

        const res = await fetch("/api/transcript", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-gemini-key": settings.geminiKey || "",
            "x-groq-key": settings.groqKey || "",
            "x-ai-provider": activeProvider,
            "x-ai-model": activeModel,
          },
          body: JSON.stringify({
            videoId: activeLecture.videoId,
            videoTitle: activeLecture.title,
            targetLang,
            existingLines: baseLines.length > 0 ? baseLines : undefined,
          }),
        });

        const data = await res.json();

        if (res.ok && data.success && Array.isArray(data.lines) && data.lines.length > 0) {
          updateLecture(activeLecture.id, {
            transcript: {
              ...existingTranscripts,
              [targetLang]: data.lines,
            },
          });
          setSelectedTranscriptLang(targetLang);
          toast.success(
            `AI Transcript generated in ${langInfo.label}! 🚀`
          );
        } else {
          const err = data.error || "Failed to generate AI transcript.";
          setTranscriptError(err);
          toast.error(err);
        }
      } catch (err: any) {
        const msg = err?.message || "Network error while generating AI transcript.";
        setTranscriptError(msg);
        toast.error(msg);
      } finally {
        setIsGeneratingAI(false);
        setGenerationStatus("");
      }
    },
    [
      activeLecture?.videoId,
      activeLecture?.id,
      activeLecture?.transcript,
      settings.aiProvider,
      settings.geminiKey,
      settings.groqKey,
      settings.geminiModel,
      settings.groqModel,
      updateLecture,
    ]
  );

  useEffect(() => {
    if (activeLecture) {
      setNotesText(activeLecture.notes || "");
      setIsSavedNotes(true);
      setTranscriptError(null);

      const availableLanguages = Object.keys(activeLecture.transcript ?? {});
      if (availableLanguages.length > 0 && !availableLanguages.includes(selectedTranscriptLang)) {
        setSelectedTranscriptLang(availableLanguages[0]);
      }
      if (availableLanguages.length === 0) {
        setSelectedTranscriptLang("en");
        // Auto-fetch transcript if not already loaded
        if (activeLecture.videoId) {
          fetchTranscript(activeLecture.videoId, activeLecture.id, "en");
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLecture?.id]);

  if (!activeLecture) return null;

  const currentSubject = subjects.find((s) => s.id === activeLecture.subjectId);

  const handleNotesChange = (val: string) => {
    setNotesText(val);
    setIsSavedNotes(false);
    const timer = setTimeout(() => {
      setLectureNotes(activeLecture.id, val);
      setIsSavedNotes(true);
    }, 600);
    return () => clearTimeout(timer);
  };

  const handleAskAI = () => {
    setActiveLecture(null);
    router.push(
      `/ai-mentor?subjectId=${activeLecture.subjectId}&lectureId=${activeLecture.id}`
    );
  };

  const handleCopyTranscript = () => {
    if (transcriptEntries.length === 0) return;
    const text = transcriptEntries
      .map(
        (t) =>
          `[${formatDigitalTime(t.start)} - ${formatDigitalTime(t.end)}] ${t.text}`
      )
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopiedTranscript(true);
    toast.success("Transcript copied to clipboard!");
    setTimeout(() => setCopiedTranscript(false), 2000);
  };

  const progressPct =
    duration > 0 ? Math.min(100, Math.round((currentTime / duration) * 100)) : 0;

  const currentLangMeta = getLangMeta(selectedTranscriptLang);
  const targetLangMeta = getLangMeta(targetGenerateLang);
  const hasTranscripts = transcriptLanguages.length > 0;
  const isSelectedLangAvailable = transcriptLanguages.includes(selectedTranscriptLang);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl max-h-[95vh] flex flex-col rounded-2xl glass-panel bg-[#090912]/95 border border-white/10 shadow-2xl overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3 min-w-0 pr-4">
            {currentSubject && (
              <span
                className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider shrink-0"
                style={{
                  backgroundColor: `${currentSubject.color}20`,
                  color: currentSubject.color,
                  border: `1px solid ${currentSubject.color}40`,
                }}
              >
                {currentSubject.name}
              </span>
            )}
            <h2 className="text-sm md:text-base font-semibold text-white truncate font-heading">
              {activeLecture.title}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleAskAI}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#00f0ff]/20 to-[#ff003c]/20 hover:from-[#00f0ff]/30 hover:to-[#ff003c]/30 border border-[#00f0ff]/30 text-white text-xs font-medium transition-all cursor-pointer shadow-[0_0_15px_rgba(0,240,255,0.15)]"
            >
              <BotMessageSquare className="w-3.5 h-3.5 text-[#00f0ff]" />
              <span className="hidden sm:inline">Ask AI Mentor</span>
            </button>

            <button
              onClick={() => setActiveLecture(null)}
              className="p-1.5 rounded-xl bg-white/[0.05] border border-white/10 text-gray-400 hover:text-white hover:bg-white/[0.1] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Layout */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 overflow-hidden min-h-[500px]">
          {/* Video Section (Left 2 cols) */}
          <div className="lg:col-span-2 flex flex-col bg-black/60 p-4 md:p-6 overflow-y-auto">
            {/* Player Container */}
            <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-2xl border border-white/10">
              <div id={containerId} className="w-full h-full" />
            </div>

            {/* Custom Control Ribbon */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-white/[0.02] border border-white/10">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs font-mono text-gray-300">
                  <span className="text-[#00f0ff]">
                    {formatDigitalTime(currentTime)}
                  </span>
                  <span className="text-gray-600">/</span>
                  <span className="text-gray-400">{formatDigitalTime(duration)}</span>
                </div>
                <div className="h-3 w-[1px] bg-white/10 hidden sm:block" />
                <div className="hidden sm:flex items-center gap-1 text-[11px] text-gray-400 font-mono">
                  <span>{progressPct}%</span>
                  <span>Watched</span>
                </div>
              </div>

              {/* Speed Controls */}
              <div className="flex items-center gap-1">
                <Gauge className="w-3.5 h-3.5 text-gray-400 mr-1 hidden sm:block" />
                {[1, 1.25, 1.5, 1.75, 2].map((rate) => (
                  <button
                    key={rate}
                    onClick={() => changeSpeed(rate)}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-mono transition-all cursor-pointer ${
                      playbackRate === rate
                        ? "bg-[#00f0ff]/20 text-[#00f0ff] border border-[#00f0ff]/40 shadow-[0_0_8px_rgba(0,240,255,0.2)]"
                        : "bg-white/[0.04] text-gray-400 border border-white/5 hover:text-white hover:bg-white/[0.08]"
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleLectureComplete(activeLecture.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                    activeLecture.completed
                      ? "bg-[#39ff14]/20 border-[#39ff14]/40 text-[#39ff14] shadow-[0_0_10px_rgba(57,255,20,0.2)]"
                      : "bg-white/[0.05] border-white/10 text-gray-300 hover:text-white hover:bg-white/[0.1]"
                  }`}
                >
                  {activeLecture.completed ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#39ff14]" />
                      <span>Completed</span>
                    </>
                  ) : (
                    <>
                      <Circle className="w-3.5 h-3.5" />
                      <span>Mark Done</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    const nextVal = !activeLecture.difficult;
                    toggleLectureDifficult(activeLecture.id);
                    toast(
                      nextVal
                        ? "Flagged for focused revision"
                        : "Removed from difficult list"
                    );
                  }}
                  className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                    activeLecture.difficult
                      ? "bg-[#ff2e97]/20 border-[#ff2e97]/40 text-[#ff2e97]"
                      : "bg-white/[0.05] border-white/10 text-gray-400 hover:text-white"
                  }`}
                  title={
                    activeLecture.difficult ? "Difficult Flagged" : "Flag as Difficult"
                  }
                >
                  {activeLecture.difficult ? (
                    <BookmarkCheck className="w-4 h-4 text-[#ff2e97]" />
                  ) : (
                    <Bookmark className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Transcript & Notes Side Panel (Right 1 col) */}
          <div className="flex flex-col border-t lg:border-t-0 lg:border-l border-white/10 bg-[#0d0d18] p-5 gap-4 overflow-y-auto">
            {/* Transcript Card Section */}
            <div className="space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div className="flex items-center gap-2 text-white font-medium text-xs uppercase tracking-wider font-heading">
                  <Languages className="w-4 h-4 text-[#00f0ff]" />
                  <span>Transcript</span>
                  {hasTranscripts && (
                    <span className="text-[10px] text-gray-400 font-mono normal-case">
                      ({currentLangMeta.flag} {currentLangMeta.label})
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {hasTranscripts && (
                    <button
                      onClick={handleCopyTranscript}
                      className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                      title="Copy full transcript"
                    >
                      {copiedTranscript ? (
                        <Check className="w-3.5 h-3.5 text-[#39ff14]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}

                  {/* Switch between saved transcript languages */}
                  {transcriptLanguages.length > 1 && (
                    <select
                      value={selectedTranscriptLang}
                      onChange={(e) => setSelectedTranscriptLang(e.target.value)}
                      className="bg-white/[0.04] border border-white/10 text-[11px] text-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-[#00f0ff]"
                    >
                      {transcriptLanguages.map((code) => {
                        const m = getLangMeta(code);
                        return (
                          <option key={code} value={code} className="bg-[#121222] text-white">
                            {m.flag} {m.label}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>
              </div>

              {/* AI Language Selector & Generator Bar */}
              <div className="flex flex-col gap-2 p-2.5 rounded-xl bg-white/[0.02] border border-white/10">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-300">
                    <Sparkles className="w-3 h-3 text-[#00f0ff]" />
                    <span>Language:</span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-1 justify-end">
                    <select
                      value={targetGenerateLang}
                      onChange={(e) => {
                        const newLang = e.target.value;
                        setTargetGenerateLang(newLang);
                        if (transcriptLanguages.includes(newLang)) {
                          setSelectedTranscriptLang(newLang);
                        }
                      }}
                      className="bg-white/[0.06] border border-white/10 text-[11px] text-white rounded-lg px-2 py-1 focus:outline-none focus:border-[#00f0ff]"
                    >
                      {AVAILABLE_LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code} className="bg-[#121222] text-white">
                          {l.flag} {l.label} {transcriptLanguages.includes(l.code) ? "✓" : ""}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={() => generateAITranscript(targetGenerateLang)}
                      disabled={isGeneratingAI || isLoadingTranscript}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gradient-to-r from-[#00f0ff]/20 to-[#a855f7]/20 hover:from-[#00f0ff]/30 hover:to-[#a855f7]/30 border border-[#00f0ff]/40 text-[#00f0ff] hover:text-white text-[11px] font-medium transition-all cursor-pointer shadow-[0_0_10px_rgba(0,240,255,0.15)] disabled:opacity-50"
                      title={`Generate or translate transcript to ${targetLangMeta.label} with AI`}
                    >
                      {isGeneratingAI ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      <span>
                        {transcriptLanguages.includes(targetGenerateLang)
                          ? "Re-translate"
                          : "AI Generate"}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Quick 1-Click Popular Language Pills */}
                <div className="flex items-center gap-1 overflow-x-auto pb-0.5 pt-1">
                  {[
                    { code: "hi", label: "Hindi 🇮🇳" },
                    { code: "hinglish", label: "Hinglish 🇮🇳" },
                    { code: "en", label: "English 🇬🇧" },
                    { code: "es", label: "Spanish 🇪🇸" },
                  ].map((item) => {
                    const isAvailable = transcriptLanguages.includes(item.code);
                    const isActive = selectedTranscriptLang === item.code;
                    return (
                      <button
                        key={item.code}
                        onClick={() => {
                          if (isAvailable) {
                            setSelectedTranscriptLang(item.code);
                          } else {
                            setTargetGenerateLang(item.code);
                            generateAITranscript(item.code);
                          }
                        }}
                        className={`px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap transition-all cursor-pointer ${
                          isActive
                            ? "bg-[#00f0ff]/20 text-[#00f0ff] border border-[#00f0ff]/40"
                            : isAvailable
                              ? "bg-white/[0.05] text-gray-200 border border-white/10 hover:border-[#00f0ff]/30"
                              : "bg-white/[0.02] text-gray-400 border border-dashed border-white/10 hover:text-white hover:border-[#a855f7]/40"
                        }`}
                      >
                        {item.label} {isAvailable ? "✓" : "+AI"}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Transcript Display Area */}
              {isGeneratingAI ? (
                <div className="rounded-xl border border-dashed border-[#00f0ff]/30 bg-[#00f0ff]/[0.03] p-6 flex flex-col items-center gap-2 text-center">
                  <div className="relative">
                    <Loader2 className="w-6 h-6 text-[#00f0ff] animate-spin" />
                    <Sparkles className="w-3 h-3 text-[#a855f7] absolute -top-1 -right-1 animate-pulse" />
                  </div>
                  <span className="text-xs text-white font-medium">
                    {generationStatus || "Generating AI Transcript..."}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    Synthesizing and aligning timestamps with {settings.aiProvider === "groq" ? "Groq" : "Gemini"}...
                  </span>
                </div>
              ) : isLoadingTranscript ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-6 flex flex-col items-center gap-2">
                  <Loader2 className="w-5 h-5 text-[#00f0ff] animate-spin" />
                  <span className="text-[11px] text-gray-400">
                    Checking native YouTube captions...
                  </span>
                </div>
              ) : isSelectedLangAvailable && transcriptEntries.length > 0 ? (
                <div className="max-h-64 overflow-y-auto pr-1 space-y-2">
                  {transcriptEntries.map((entry, index) => {
                    const isActive = index === activeTranscriptIndex;
                    return (
                      <button
                        key={`${entry.start}-${entry.end}-${index}`}
                        ref={isActive ? activeTranscriptRef : null}
                        type="button"
                        onClick={() => {
                          seekTo(entry.start);
                        }}
                        className={`w-full text-left rounded-xl border px-2.5 py-2 transition-all ${
                          isActive
                            ? "border-[#00f0ff]/60 bg-[#00f0ff]/15 text-white shadow-[0_0_12px_rgba(0,240,255,0.15)] ring-1 ring-[#00f0ff]/40"
                            : "border-white/5 bg-white/[0.02] text-gray-300 hover:border-white/10 hover:bg-white/[0.04]"
                        }`}
                      >
                        <div className="text-[10px] font-mono text-[#00f0ff] mb-1 flex items-center justify-between">
                          <span>
                            {formatDigitalTime(entry.start)} - {formatDigitalTime(entry.end)}
                          </span>
                          {isActive && (
                            <span className="text-[9px] uppercase tracking-wider text-[#39ff14] font-semibold">
                              Speaking
                            </span>
                          )}
                        </div>
                        <div className="text-xs leading-relaxed">{entry.text}</div>
                      </button>
                    );
                  })}
                </div>
              ) : transcriptError ? (
                <div className="rounded-xl border border-dashed border-amber-500/20 bg-amber-500/[0.03] p-3 space-y-2.5">
                  <div className="flex items-start gap-2 text-[11px] text-amber-400">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{transcriptError}</span>
                  </div>

                  {/* AI Generation Quick Action */}
                  <div className="pt-2 border-t border-white/5 space-y-1.5">
                    <div className="text-[11px] text-gray-300 font-medium flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-[#00f0ff]" />
                      <span>Video me subtitles nahi hain? AI se generate karein:</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => generateAITranscript("hi")}
                        className="px-2.5 py-1 rounded-lg bg-[#00f0ff]/10 hover:bg-[#00f0ff]/20 border border-[#00f0ff]/30 text-[#00f0ff] text-[10px] font-medium transition-colors cursor-pointer"
                      >
                        ✨ Hindi (हिंदी) 🇮🇳
                      </button>
                      <button
                        onClick={() => generateAITranscript("hinglish")}
                        className="px-2.5 py-1 rounded-lg bg-[#00f0ff]/10 hover:bg-[#00f0ff]/20 border border-[#00f0ff]/30 text-[#00f0ff] text-[10px] font-medium transition-colors cursor-pointer"
                      >
                        ✨ Hinglish 🇮🇳
                      </button>
                      <button
                        onClick={() => generateAITranscript("en")}
                        className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-gray-300 text-[10px] font-medium transition-colors cursor-pointer"
                      >
                        ✨ English 🇬🇧
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-[11px] leading-relaxed text-gray-400 space-y-2.5 text-center">
                  <p>Koi transcript loaded nahi hai.</p>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => generateAITranscript("hi")}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#00f0ff]/20 to-[#a855f7]/20 border border-[#00f0ff]/30 text-[11px] text-white hover:border-[#00f0ff]/60 transition-colors cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3 text-[#00f0ff]" />
                      <span>Generate in Hindi ✨</span>
                    </button>
                    <button
                      onClick={() =>
                        activeLecture &&
                        fetchTranscript(activeLecture.videoId, activeLecture.id, "en")
                      }
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/10 text-[11px] text-gray-300 hover:text-white transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Fetch Native</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Lecture Notes Section */}
            <div className="flex items-center justify-between pb-2 border-b border-white/10 pt-2">
              <div className="flex items-center gap-2 text-white font-medium text-xs uppercase tracking-wider font-heading">
                <BookOpen className="w-4 h-4 text-[#00f0ff]" />
                <span>Lecture Notes</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] font-mono text-gray-400">
                <Save
                  className={`w-3 h-3 ${isSavedNotes ? "text-[#39ff14]" : "text-amber-400"}`}
                />
                <span>{isSavedNotes ? "Autosaved" : "Saving..."}</span>
              </div>
            </div>

            <textarea
              value={notesText}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Write your key takeaways, formulas, doubts, or timestamps here (e.g. 14:20 recursion stack visual)..."
              className="flex-1 w-full min-h-[120px] p-3 rounded-xl bg-white/[0.03] border border-white/10 text-white placeholder-gray-500 text-xs leading-relaxed resize-none focus:outline-none focus:border-[#00f0ff] font-mono"
            />

            <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-gray-400">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#a855f7]" />
                Notes automatically sync with AI Mentor context
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
