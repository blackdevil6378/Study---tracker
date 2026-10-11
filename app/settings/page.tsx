"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Settings as SettingsIcon,
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Bell,
  Download,
  Upload,
  RotateCcw,
  ExternalLink,
  ShieldAlert,
  HardDrive,
  User,
  Sparkles,
  Loader2,
  RefreshCw,
  MessageSquareHeart,
} from "lucide-react";
import { useStudyStore } from "@/store/useStudyStore";
import { useNotifications } from "@/hooks/useNotifications";
import { getLocalStorageUsage } from "@/lib/storage";
import { useCloudSync } from "@/components/CloudSyncProvider";
import { toast } from "sonner";

export default function SettingsPage() {
  const settings = useStudyStore((s) => s.settings);
  const updateSettings = useStudyStore((s) => s.updateSettings);
  const resetAllData = useStudyStore((s) => s.resetAllData);
  const importAllData = useStudyStore((s) => s.importAllData);
  const feedbacks = useStudyStore((s) => s.feedbacks);
  const setIsFeedbackOpen = useStudyStore((s) => s.setIsFeedbackOpen);
  const allStoreState = useStudyStore.getState();
  const cloudSync = useCloudSync();

  const {
    permission,
    requestPermission,
    sendTestNotification,
  } = useNotifications();

  // Local state for keys
  const [geminiKeyInput, setGeminiKeyInput] = useState(settings.geminiKey || "");
  const [groqKeyInput, setGroqKeyInput] = useState(settings.groqKey || "");
  const [youtubeKeyInput, setYoutubeKeyInput] = useState(settings.youtubeKey || "");
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [showYoutubeKey, setShowYoutubeKey] = useState(false);

  // Testing Key States
  const [testingGemini, setTestingGemini] = useState(false);
  const [testingGroq, setTestingGroq] = useState(false);
  const [testingYoutube, setTestingYoutube] = useState(false);
  const [fetchingGroqModels, setFetchingGroqModels] = useState(false);
  const [liveGroqModels, setLiveGroqModels] = useState<string[]>([]);

  // Storage calculation
  const [storageUsage, setStorageUsage] = useState({
    usedBytes: 0,
    percentage: 0,
    formattedUsed: "0 KB",
    isNearLimit: false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setStorageUsage(getLocalStorageUsage());
    if (!settings.geminiModel || settings.geminiModel.includes("3.8") || settings.geminiModel.includes("2.5")) {
      updateSettings({ geminiModel: "gemini-1.5-flash" });
    }
    if (!settings.groqModel || settings.groqModel === "mixtral-8x7b-32768") {
      updateSettings({ groqModel: "openai/gpt-oss-120b" });
    }
    if (!settings.aiProvider) {
      updateSettings({ aiProvider: "gemini" });
    }
  }, [settings.geminiModel, settings.groqModel, settings.aiProvider, updateSettings]);

  const handleSaveKeys = () => {
    updateSettings({
      geminiKey: geminiKeyInput.trim(),
      groqKey: groqKeyInput.trim(),
      youtubeKey: youtubeKeyInput.trim(),
    });
    toast.success("API keys saved securely in browser storage!");
  };

  const handleTestGeminiKey = async () => {
    const keyToTest = geminiKeyInput.trim() || settings.geminiKey;
    if (!keyToTest) {
      toast.error("Please enter a Gemini API Key first.");
      return;
    }

    setTestingGemini(true);
    try {
      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gemini-key": keyToTest,
        },
        body: JSON.stringify({
          action: "test",
          model: settings.geminiModel || "gemini-1.5-flash",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gemini key verification failed.");
      }

      toast.success("✅ Gemini API Key is valid and working!");
      updateSettings({ geminiKey: keyToTest });
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setTestingGemini(false);
    }
  };

  const handleTestGroqKey = async () => {
    const keyToTest = groqKeyInput.trim() || settings.groqKey;
    if (!keyToTest) {
      toast.error("Please enter a Groq API Key first.");
      return;
    }

    setTestingGroq(true);
    try {
      const res = await fetch("/api/groq", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-groq-key": keyToTest,
        },
        body: JSON.stringify({
          action: "test",
          model: settings.groqModel || "openai/gpt-oss-120b",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Groq key verification failed.");
      }

      if (data.warning) {
        toast.warning(data.message, { duration: 6000 });
        if (data.availableModels && data.availableModels.length > 0) {
          setLiveGroqModels(data.availableModels);
        }
      } else {
        toast.success("✅ Groq API Key is valid and working!");
      }

      updateSettings({ groqKey: keyToTest });

      // Automatically fetch available models from their account
      handleFetchGroqModels(keyToTest, false);
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setTestingGroq(false);
    }
  };

  const handleFetchGroqModels = async (explicitKey?: string, showToast = true) => {
    const keyToUse = explicitKey || groqKeyInput.trim() || settings.groqKey;
    if (!keyToUse) {
      if (showToast) toast.error("Please enter a Groq API Key first.");
      return;
    }

    setFetchingGroqModels(true);
    try {
      const res = await fetch("/api/groq", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-groq-key": keyToUse,
        },
        body: JSON.stringify({
          action: "models",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch models.");
      }

      const modelList = (data.models || []).map((m: any) => m.id);
      setLiveGroqModels(modelList);
      if (showToast) {
        if (modelList.length > 0) {
          toast.success(`Fetched ${modelList.length} active models from your Groq account!`);
        } else {
          toast.info("No chat models returned from Groq.");
        }
      }
    } catch (err: any) {
      if (showToast) toast.error(`Error fetching models: ${err.message}`);
    } finally {
      setFetchingGroqModels(false);
    }
  };

  const handleTestYoutubeKey = async () => {
    const keyToTest = youtubeKeyInput.trim() || settings.youtubeKey;
    if (!keyToTest) {
      toast.error("Please enter a YouTube Data API Key first.");
      return;
    }

    setTestingYoutube(true);
    try {
      const res = await fetch("/api/youtube", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-youtube-key": keyToTest,
        },
        body: JSON.stringify({ action: "test" }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "YouTube key verification failed.");
      }

      toast.success("✅ YouTube API Key is valid and working!");
      updateSettings({ youtubeKey: keyToTest });
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setTestingYoutube(false);
    }
  };

  const handleExportJSON = () => {
    const exportData = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      subjects: allStoreState.subjects,
      playlists: allStoreState.playlists,
      lectures: allStoreState.lectures,
      events: allStoreState.events,
      sessions: allStoreState.sessions,
      threads: allStoreState.threads,
      settings: {
        ...allStoreState.settings,
        geminiKey: allStoreState.settings.geminiKey,
        groqKey: allStoreState.settings.groqKey,
        youtubeKey: allStoreState.settings.youtubeKey,
      },
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `study_tracker_backup_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("All data exported as JSON!");
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const success = importAllData(json);
        if (success) {
          toast.success("Successfully imported all study data!");
          setGeminiKeyInput(json.settings?.geminiKey || "");
          setGroqKeyInput(json.settings?.groqKey || "");
          setYoutubeKeyInput(json.settings?.youtubeKey || "");
          setStorageUsage(getLocalStorageUsage());
        } else {
          toast.error("Failed to parse backup format.");
        }
      } catch {
        toast.error("Invalid JSON file provided.");
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleResetEverything = () => {
    if (
      confirm(
        "⚠️ WARNING: This will permanently erase ALL your subjects, playlists, lectures, calendar events, chat history, and settings from this browser! Proceed?"
      )
    ) {
      resetAllData();
      setGeminiKeyInput("");
      setGroqKeyInput("");
      setYoutubeKeyInput("");
      setStorageUsage(getLocalStorageUsage());
      toast.success("All tracker data has been reset to defaults.");
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight font-heading flex items-center gap-2.5">
          <SettingsIcon className="w-7 h-7 text-[#00f0ff]" />
          <span>System Settings & API Keys</span>
        </h1>
        <p className="text-xs sm:text-sm text-gray-400 mt-1">
          Configure API credentials, study goals, notifications, and manage backups
        </p>
      </div>

      {/* Cloud Sync */}
      <div className="p-6 rounded-2xl glass-panel bg-white/[0.02] border border-white/10 space-y-3">
        <h2 className="text-sm uppercase tracking-wider font-semibold text-gray-300 font-heading">
          Cloud Database & Account
        </h2>
        {cloudSync.configured ? (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-xs">
                <p className="text-white">
                  Signed in as <span className="font-semibold">{cloudSync.email}</span>
                </p>
                <p className="text-gray-400 mt-1">
                  Sync status:{" "}
                  <span className={cloudSync.status === "error" ? "text-red-400" : "text-[#00f0ff]"}>
                    {cloudSync.status}
                  </span>
                </p>
                {cloudSync.error && (
                  <p className="text-red-400 mt-1">{cloudSync.error}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() =>
                  void cloudSync.signOut().catch((error: unknown) => {
                    toast.error(
                      error instanceof Error ? error.message : "Could not sign out."
                    );
                  })
                }
                className="self-start px-4 py-2 rounded-xl bg-white/[0.06] border border-white/15 text-xs text-white font-medium hover:bg-white/[0.1]"
              >
                Sign out
              </button>
            </div>
            <p className="text-[11px] text-gray-500">
              Study data syncs to your private account. AI provider and YouTube API keys stay in this browser and are not uploaded.
            </p>
          </>
        ) : (
          <div className="text-xs text-gray-400 space-y-1">
            <p>Cloud sync is not configured yet. Add your Supabase project URL and publishable/anon key to `.env.local`.</p>
            <p>See the Supabase setup steps in the README. Local browser storage remains active until configured.</p>
          </div>
        )}
      </div>

      {/* Profile & General Preferences */}
      <div className="p-6 rounded-2xl glass-panel bg-white/[0.02] border border-white/10 space-y-4">
        <h2 className="text-sm uppercase tracking-wider font-semibold text-gray-300 font-heading flex items-center gap-2">
          <User className="w-4 h-4 text-[#00f0ff]" />
          <span>Student Profile & Targets</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-300 block mb-1.5 font-medium">
              Your Name (Dashboard Greeting)
            </label>
            <input
              type="text"
              value={settings.userName}
              onChange={(e) => updateSettings({ userName: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs focus:outline-none focus:border-[#00f0ff]"
            />
          </div>

          <div>
            <label className="text-xs text-gray-300 block mb-1.5 font-medium">
              Daily Target Goal (Lectures / Day)
            </label>
            <input
              type="number"
              min="1"
              max="20"
              value={settings.dailyGoalLectures}
              onChange={(e) =>
                updateSettings({ dailyGoalLectures: parseInt(e.target.value, 10) || 1 })
              }
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-[#00f0ff]"
            />
          </div>
        </div>

        {/* AI Mentor Language Toggle */}
        <div className="pt-2">
          <label className="text-xs text-gray-300 block mb-1.5 font-medium">
            AI Mentor Persona Language
          </label>
          <div className="grid grid-cols-2 gap-3 max-w-sm">
            <button
              onClick={() => updateSettings({ language: "hinglish" })}
              className={`p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                settings.language === "hinglish"
                  ? "bg-[#00f0ff] text-black font-bold shadow-[0_0_15px_rgba(0,240,255,0.3)]"
                  : "bg-white/[0.03] border-white/10 text-gray-400 hover:text-white"
              }`}
            >
              Hinglish (Recommended)
            </button>
            <button
              onClick={() => updateSettings({ language: "english" })}
              className={`p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                settings.language === "english"
                  ? "bg-[#00f0ff] text-black font-bold shadow-[0_0_15px_rgba(0,240,255,0.3)]"
                  : "bg-white/[0.03] border-white/10 text-gray-400 hover:text-white"
              }`}
            >
              English Only
            </button>
          </div>
        </div>

        {/* Auto mark complete toggle */}
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <div>
            <span className="text-xs font-semibold text-white block">
              Auto-Mark Complete at 90%
            </span>
            <span className="text-[11px] text-gray-400">
              Automatically flags a lecture as completed when 90% is watched in the embedded player
            </span>
          </div>
          <input
            type="checkbox"
            checked={settings.autoMarkComplete}
            onChange={(e) => updateSettings({ autoMarkComplete: e.target.checked })}
            className="w-5 h-5 rounded accent-[#00f0ff] cursor-pointer"
          />
        </div>
      </div>

      {/* API Keys Configuration */}
      <div className="p-6 rounded-2xl glass-panel bg-white/[0.02] border border-white/10 space-y-6">
        <div>
          <h2 className="text-sm uppercase tracking-wider font-semibold text-gray-300 font-heading flex items-center gap-2">
            <Key className="w-4 h-4 text-[#a855f7]" />
            <span>API Keys & Credentials</span>
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Keys are stored solely in your local browser and sent over HTTPS request headers directly to Next.js API proxy routes. They are never logged or stored in any database.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-200 block">AI Provider</label>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <button
              type="button"
              onClick={() => updateSettings({ aiProvider: "gemini" })}
              className={`p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                settings.aiProvider === "gemini"
                  ? "bg-[#00f0ff] text-black font-bold shadow-[0_0_15px_rgba(0,240,255,0.3)]"
                  : "bg-white/[0.03] border-white/10 text-gray-400 hover:text-white"
              }`}
            >
              Gemini
            </button>
            <button
              type="button"
              onClick={() => updateSettings({ aiProvider: "groq" })}
              className={`p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                settings.aiProvider === "groq"
                  ? "bg-[#00f0ff] text-black font-bold shadow-[0_0_15px_rgba(0,240,255,0.3)]"
                  : "bg-white/[0.03] border-white/10 text-gray-400 hover:text-white"
              }`}
            >
              Groq
            </button>
          </div>
        </div>

        {/* Gemini API Key */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-gray-200">
              Google Gemini API Key
            </label>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-[#00f0ff] hover:underline flex items-center gap-1"
            >
              Get Free Key (Google AI Studio) <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showGeminiKey ? "text" : "password"}
                placeholder="AIzaSy..."
                value={geminiKeyInput}
                onChange={(e) => setGeminiKeyInput(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#00f0ff] pr-10"
              />
              <button
                type="button"
                onClick={() => setShowGeminiKey(!showGeminiKey)}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-white cursor-pointer"
              >
                {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button
              onClick={handleTestGeminiKey}
              disabled={testingGemini}
              className="px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/15 text-xs text-white font-medium hover:bg-white/[0.1] transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              {testingGemini ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#00f0ff]" />
                  <span>Testing...</span>
                </>
              ) : (
                <span>Test Key</span>
              )}
            </button>
          </div>

          <div className="pt-2 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-400">Gemini Model:</label>
              <span className="text-[11px] text-gray-500 font-mono">
                Active: <span className="text-[#00f0ff]">{settings.geminiModel || "gemini-1.5-flash"}</span>
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                { id: "gemini-1.5-flash", label: "gemini-1.5-flash (Recommended)" },
                { id: "gemini-2.0-flash", label: "gemini-2.0-flash" },
                { id: "gemini-1.5-pro", label: "gemini-1.5-pro" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => updateSettings({ geminiModel: m.id })}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-all cursor-pointer ${
                    settings.geminiModel === m.id
                      ? "bg-[#00f0ff]/20 border-[#00f0ff] text-[#00f0ff] shadow-[0_0_10px_rgba(0,240,255,0.2)]"
                      : "bg-white/[0.03] border-white/10 text-gray-400 hover:text-white"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={settings.geminiModel}
                onChange={(e) => updateSettings({ geminiModel: e.target.value })}
                placeholder="gemini-1.5-flash"
                className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-white text-xs font-mono w-full sm:w-72 focus:outline-none focus:border-[#00f0ff]"
              />
              <span className="text-[11px] text-gray-500 font-mono hidden sm:inline">
                (or type custom model)
              </span>
            </div>
          </div>
        </div>

        {/* Groq API Key */}
        <div className="space-y-2 pt-2 border-t border-white/5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-gray-200">
              Groq API Key
            </label>
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-[#00f0ff] hover:underline flex items-center gap-1"
            >
              Get Free Key (Groq Console) <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showGroqKey ? "text" : "password"}
                placeholder="gsk_..."
                value={groqKeyInput}
                onChange={(e) => setGroqKeyInput(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#00f0ff] pr-10"
              />
              <button
                type="button"
                onClick={() => setShowGroqKey(!showGroqKey)}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-white cursor-pointer"
              >
                {showGroqKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button
              onClick={handleTestGroqKey}
              disabled={testingGroq}
              className="px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/15 text-xs text-white font-medium hover:bg-white/[0.1] transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              {testingGroq ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#00f0ff]" />
                  <span>Testing...</span>
                </>
              ) : (
                <span>Test Key</span>
              )}
            </button>
          </div>

          <div className="pt-2 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400">Groq Model:</label>
                <button
                  type="button"
                  onClick={() => handleFetchGroqModels()}
                  disabled={fetchingGroqModels}
                  className="px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/10 text-[11px] text-gray-300 hover:text-white hover:bg-white/[0.1] transition-all flex items-center gap-1 cursor-pointer"
                  title="Fetch all currently active models from your Groq account"
                >
                  <RefreshCw className={`w-3 h-3 text-[#00f0ff] ${fetchingGroqModels ? "animate-spin" : ""}`} />
                  <span>{fetchingGroqModels ? "Fetching..." : "Fetch Live Models"}</span>
                </button>
              </div>
              <span className="text-[11px] text-gray-500 font-mono">
                Active: <span className="text-[#00f0ff]">{settings.groqModel || "openai/gpt-oss-120b"}</span>
              </span>
            </div>

            {/* Live models fetched from account */}
            {liveGroqModels.length > 0 && (
              <div className="p-2.5 rounded-xl bg-white/[0.02] border border-[#00f0ff]/20 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-[#00f0ff]">
                  <span className="font-semibold flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Live Models on Your Key ({liveGroqModels.length})
                  </span>
                  <span className="text-gray-500 text-[10px]">Click any to select</span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                  {liveGroqModels.map((modelId) => (
                    <button
                      key={modelId}
                      type="button"
                      onClick={() => updateSettings({ groqModel: modelId })}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-all cursor-pointer ${
                        settings.groqModel === modelId
                          ? "bg-[#00f0ff]/20 border-[#00f0ff] text-[#00f0ff] shadow-[0_0_8px_rgba(0,240,255,0.25)]"
                          : "bg-white/[0.03] border-white/10 text-gray-300 hover:text-white hover:border-white/20"
                      }`}
                    >
                      {modelId}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Curated Latest & Free Models */}
            <div>
              <div className="text-[11px] text-gray-400 mb-1.5">Latest & Free Models:</div>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "openai/gpt-oss-120b", label: "openai/gpt-oss-120b", tag: "Recommended" },
                  { id: "openai/gpt-oss-20b", label: "openai/gpt-oss-20b", tag: "Fast" },
                  { id: "qwen/qwen3.8-27b", label: "qwen/qwen3.8-27b", tag: "Multimodal" },
                  { id: "qwen-2.5-coder-32b", label: "qwen-2.5-coder-32b", tag: "Code" },
                  { id: "llama-3.3-70b-versatile", label: "llama-3.3-70b-versatile", tag: "Llama 70B" },
                  { id: "llama-3.1-8b-instant", label: "llama-3.1-8b-instant", tag: "Instant" },
                  { id: "deepseek-r1-distill-llama-70b", label: "deepseek-r1-distill-llama-70b", tag: "Reasoning" },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => updateSettings({ groqModel: m.id })}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-all cursor-pointer flex items-center gap-1.5 ${
                      settings.groqModel === m.id
                        ? "bg-[#00f0ff]/20 border-[#00f0ff] text-[#00f0ff] shadow-[0_0_10px_rgba(0,240,255,0.2)] font-medium"
                        : "bg-white/[0.03] border-white/10 text-gray-400 hover:text-white"
                    }`}
                  >
                    <span>{m.label}</span>
                    <span className="text-[9px] px-1 py-0.2 rounded bg-white/10 text-gray-300">
                      {m.tag}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={settings.groqModel}
                onChange={(e) => updateSettings({ groqModel: e.target.value })}
                placeholder="openai/gpt-oss-120b"
                className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-white text-xs font-mono w-full sm:w-80 focus:outline-none focus:border-[#00f0ff]"
              />
              <span className="text-[11px] text-gray-500 font-mono hidden sm:inline">
                (or enter any custom Groq model ID)
              </span>
            </div>
          </div>
        </div>

        {/* YouTube API Key */}
        <div className="space-y-2 pt-2 border-t border-white/5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-gray-200">
              YouTube Data API v3 Key
            </label>
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-[#00f0ff] hover:underline flex items-center gap-1"
            >
              Get Key (Google Cloud Console) <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showYoutubeKey ? "text" : "password"}
                placeholder="AIzaSy..."
                value={youtubeKeyInput}
                onChange={(e) => setYoutubeKeyInput(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#00f0ff] pr-10"
              />
              <button
                type="button"
                onClick={() => setShowYoutubeKey(!showYoutubeKey)}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-white cursor-pointer"
              >
                {showYoutubeKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button
              onClick={handleTestYoutubeKey}
              disabled={testingYoutube}
              className="px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/15 text-xs text-white font-medium hover:bg-white/[0.1] transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              {testingYoutube ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#00f0ff]" />
                  <span>Testing...</span>
                </>
              ) : (
                <span>Test Key</span>
              )}
            </button>
          </div>
        </div>

        <button
          onClick={handleSaveKeys}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#00f0ff] to-[#a855f7] text-black font-semibold text-xs hover:brightness-110 shadow-[0_0_15px_rgba(0,240,255,0.3)] transition-all cursor-pointer"
        >
          Save All Credentials
        </button>
      </div>

      {/* Notifications & Reminders */}
      <div className="p-6 rounded-2xl glass-panel bg-white/[0.02] border border-white/10 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm uppercase tracking-wider font-semibold text-gray-300 font-heading flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#ffb800]" />
            <span>Daily Reminders & Notifications</span>
          </h2>

          {permission !== "granted" ? (
            <button
              onClick={requestPermission}
              className="px-3.5 py-1.5 rounded-xl bg-white/10 text-white font-semibold text-xs hover:bg-white/20 transition-colors cursor-pointer"
            >
              Grant Permission
            </button>
          ) : (
            <span className="text-[11px] font-mono text-[#39ff14] flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Permission Granted
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Daily Morning Reminder */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">Morning Nudge</span>
              <input
                type="checkbox"
                checked={settings.reminderEnabled}
                onChange={(e) => updateSettings({ reminderEnabled: e.target.checked })}
                className="w-4 h-4 rounded accent-[#00f0ff]"
              />
            </div>
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>Scheduled Time:</span>
              <input
                type="time"
                value={settings.reminderTime}
                onChange={(e) => updateSettings({ reminderTime: e.target.value })}
                className="px-2 py-1 rounded bg-black/40 border border-white/10 text-white font-mono"
              />
            </div>
          </div>

          {/* Evening Streak Saver Nudge */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">Evening Streak Saver</span>
              <input
                type="checkbox"
                checked={settings.eveningReminderEnabled}
                onChange={(e) => updateSettings({ eveningReminderEnabled: e.target.checked })}
                className="w-4 h-4 rounded accent-[#ff2e97]"
              />
            </div>
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>Scheduled Time:</span>
              <input
                type="time"
                value={settings.eveningReminderTime}
                onChange={(e) => updateSettings({ eveningReminderTime: e.target.value })}
                className="px-2 py-1 rounded bg-black/40 border border-white/10 text-white font-mono"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-start pt-2">
          <button
            onClick={sendTestNotification}
            className="px-4 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-xs text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            Send Test Notification
          </button>
        </div>
      </div>

      {/* Feedback & Feature Requests */}
      <div className="p-6 rounded-2xl glass-panel bg-white/[0.02] border border-white/10 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-sm uppercase tracking-wider font-semibold text-gray-300 font-heading flex items-center gap-2">
              <MessageSquareHeart className="w-4 h-4 text-[#00f0ff]" />
              <span>Feedback & Feature Suggestions</span>
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Have an idea or facing an issue? Send us your feedback or report bugs directly.
            </p>
          </div>
          <button
            onClick={() => setIsFeedbackOpen(true)}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#00f0ff] to-[#a855f7] text-black font-semibold text-xs hover:brightness-110 shadow-[0_0_15px_rgba(0,240,255,0.3)] transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-black" />
            <span>Open Feedback Form</span>
          </button>
        </div>

        {feedbacks && feedbacks.length > 0 && (
          <div className="pt-2 space-y-2 border-t border-white/5">
            <span className="text-[11px] text-gray-400 font-mono block">
              Your Submitted Feedback ({feedbacks.length}):
            </span>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {feedbacks.map((fb) => (
                <div key={fb.id} className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-[#00f0ff] uppercase text-[10px] px-1.5 py-0.5 rounded bg-[#00f0ff]/10 border border-[#00f0ff]/20">
                      {fb.category}
                    </span>
                    <span className="text-gray-500 text-[10px] font-mono">
                      {new Date(fb.createdAt).toLocaleDateString()} • {"⭐".repeat(fb.rating)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-300 line-clamp-2">{fb.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Storage & Backup / Import */}
      <div className="p-6 rounded-2xl glass-panel bg-white/[0.02] border border-white/10 space-y-6">
        <div>
          <h2 className="text-sm uppercase tracking-wider font-semibold text-gray-300 font-heading flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-[#39ff14]" />
            <span>Local Storage & Backup Center</span>
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Export all courses, progress, schedules, and chat history as JSON to preserve or transfer devices.
          </p>
        </div>

        {/* LocalStorage Consumption Bar */}
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-300">Browser Storage Used:</span>
            <span className="font-mono text-white">
              {storageUsage.formattedUsed} ({storageUsage.percentage}% of 5MB quota)
            </span>
          </div>

          <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                storageUsage.isNearLimit ? "bg-red-500" : "bg-[#39ff14]"
              }`}
              style={{ width: `${Math.max(2, storageUsage.percentage)}%` }}
            />
          </div>

          {storageUsage.isNearLimit && (
            <div className="text-[11px] text-red-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Storage is nearing 80% limit. Export a JSON backup!</span>
            </div>
          )}
        </div>

        {/* Export / Import Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleExportJSON}
            className="px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/15 text-white font-semibold text-xs hover:bg-white/[0.1] transition-all flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4 text-[#00f0ff]" />
            <span>Export Backup (JSON)</span>
          </button>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportJSON}
            accept=".json"
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/15 text-white font-semibold text-xs hover:bg-white/[0.1] transition-all flex items-center gap-2 cursor-pointer"
          >
            <Upload className="w-4 h-4 text-[#a855f7]" />
            <span>Import Backup (JSON)</span>
          </button>

          <button
            onClick={handleResetEverything}
            className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 font-semibold text-xs transition-all flex items-center gap-2 cursor-pointer ml-auto"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset All Data</span>
          </button>
        </div>
      </div>
    </div>
  );
}
