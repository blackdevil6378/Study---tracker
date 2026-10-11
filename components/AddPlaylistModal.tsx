"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Youtube,
  FolderPlus,
  Clock,
  Video,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Sparkles,
  PlusCircle,
  Layers,
  ListPlus,
  PlaySquare,
} from "lucide-react";
import { useStudyStore } from "@/store/useStudyStore";
import { extractPlaylistId, extractVideoId, formatDurationHuman } from "@/lib/utils";
import { ImportPreviewData, SingleVideoPreviewData } from "@/types";
import { toast } from "sonner";

const subjectColors = [
  "#00f0ff", // cyan
  "#a855f7", // purple
  "#39ff14", // green
  "#ff2e97", // pink
  "#ffb800", // amber
  "#3b82f6", // blue
  "#ec4899", // rose
];

const subjectIcons = ["BookOpen", "Code", "Cpu", "Atom", "Brain", "Calculator", "Layers"];

export function AddPlaylistModal() {
  const isAddPlaylistOpen = useStudyStore((s) => s.isAddPlaylistOpen);
  const setIsAddPlaylistOpen = useStudyStore((s) => s.setIsAddPlaylistOpen);
  const addContentInitialMode = useStudyStore((s) => s.addContentInitialMode);
  const addContentTargetSubjectId = useStudyStore((s) => s.addContentTargetSubjectId);
  const addContentTargetPlaylistId = useStudyStore((s) => s.addContentTargetPlaylistId);

  const subjects = useStudyStore((s) => s.subjects);
  const playlists = useStudyStore((s) => s.playlists);
  const lectures = useStudyStore((s) => s.lectures);
  const settings = useStudyStore((s) => s.settings);

  const addSubject = useStudyStore((s) => s.addSubject);
  const addPlaylist = useStudyStore((s) => s.addPlaylist);
  const addLectures = useStudyStore((s) => s.addLectures);
  const addSingleLecture = useStudyStore((s) => s.addSingleLecture);
  const updatePlaylist = useStudyStore((s) => s.updatePlaylist);

  // Tab mode: 'playlist' or 'single_video'
  const [activeTab, setActiveTab] = useState<"playlist" | "single_video">("playlist");

  // Playlist Mode States
  const [urlInput, setUrlInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<ImportPreviewData | null>(null);
  const [duplicatePlaylist, setDuplicatePlaylist] = useState<any | null>(null);

  // Single Video Mode States
  const [videoUrlInput, setVideoUrlInput] = useState("");
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoPreview, setVideoPreview] = useState<SingleVideoPreviewData | null>(null);
  const [customVideoTitle, setCustomVideoTitle] = useState("");
  const [singleVideoDestination, setSingleVideoDestination] = useState<"existing" | "new_custom">("existing");
  const [targetPlaylistId, setTargetPlaylistId] = useState<string>("");
  const [newCustomPlaylistTitle, setNewCustomPlaylistTitle] = useState("");

  // Subject selection / creation state
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(
    subjects[0]?.id || "new"
  );
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newSubjectColor, setNewSubjectColor] = useState(subjectColors[0]);
  const [newSubjectIcon, setNewSubjectIcon] = useState(subjectIcons[0]);
  const [newSubjectExamDate, setNewSubjectExamDate] = useState("");

  // Initialize modal based on store triggers
  useEffect(() => {
    if (isAddPlaylistOpen) {
      if (addContentInitialMode) {
        setActiveTab(addContentInitialMode);
      }
      if (addContentTargetSubjectId) {
        setSelectedSubjectId(addContentTargetSubjectId);
      } else if (subjects.length > 0) {
        setSelectedSubjectId(subjects[0].id);
      }
      if (addContentTargetPlaylistId) {
        setTargetPlaylistId(addContentTargetPlaylistId);
        setSingleVideoDestination("existing");
      } else if (playlists.length > 0) {
        setTargetPlaylistId(playlists[0].id);
      } else {
        setSingleVideoDestination("new_custom");
      }
    }
  }, [isAddPlaylistOpen, addContentInitialMode, addContentTargetSubjectId, addContentTargetPlaylistId, subjects, playlists]);

  if (!isAddPlaylistOpen) return null;

  // Handle Playlist Preview Fetch
  const handleFetchPreview = async () => {
    setErrorMsg(null);
    setPreviewData(null);
    setDuplicatePlaylist(null);

    const playlistId = extractPlaylistId(urlInput);
    if (!playlistId) {
      // Check if user accidentally pasted a single video URL into playlist field
      const possibleVid = extractVideoId(urlInput);
      if (possibleVid) {
        setErrorMsg("This looks like a single video link! Switching to Single Video mode...");
        setVideoUrlInput(urlInput);
        setActiveTab("single_video");
        return;
      }
      setErrorMsg("Invalid YouTube Playlist link. Example: https://www.youtube.com/playlist?list=PL...");
      return;
    }

    const existing = playlists.find((p) => p.youtubePlaylistId === playlistId);
    if (existing) {
      setDuplicatePlaylist(existing);
    }

    setLoading(true);
    try {
      const res = await fetch("/api/youtube", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-youtube-key": settings.youtubeKey,
        },
        body: JSON.stringify({
          action: "fetch_playlist",
          playlistId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch playlist");
      }

      setPreviewData(data);
      if (subjects.length > 0 && selectedSubjectId === "new") {
        setSelectedSubjectId(subjects[0].id);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  // Handle Confirm Playlist Import
  const handleConfirmImport = (isResync = false) => {
    if (!previewData) return;

    let targetSubjectId = selectedSubjectId;

    if (selectedSubjectId === "new" || !targetSubjectId) {
      if (!newSubjectName.trim()) {
        toast.error("Please enter a subject name.");
        return;
      }
      const createdSubj = addSubject({
        name: newSubjectName.trim(),
        color: newSubjectColor,
        icon: newSubjectIcon,
        examDate: newSubjectExamDate || undefined,
      });
      targetSubjectId = createdSubj.id;
    }

    if (isResync && duplicatePlaylist) {
      const existingVideoIds = new Set(
        lectures.filter((l) => l.playlistId === duplicatePlaylist.id).map((l) => l.videoId)
      );

      const newVideos = previewData.items.filter((item) => !existingVideoIds.has(item.videoId));

      if (newVideos.length === 0) {
        toast.info("Playlist is already up to date. No new videos found.");
        handleClose();
        return;
      }

      const startingOrder =
        lectures.filter((l) => l.playlistId === duplicatePlaylist.id).length + 1;

      addLectures(
        newVideos.map((v, idx) => ({
          playlistId: duplicatePlaylist.id,
          subjectId: duplicatePlaylist.subjectId,
          videoId: v.videoId,
          title: v.title,
          thumbnail: v.thumbnail,
          durationSec: v.durationSec,
          order: startingOrder + idx,
        }))
      );

      updatePlaylist(duplicatePlaylist.id, {
        totalDurationSec: (duplicatePlaylist.totalDurationSec || 0) +
          newVideos.reduce((a, b) => a + b.durationSec, 0),
      });

      toast.success(`Re-synced playlist! Added ${newVideos.length} new lecture(s).`);
      handleClose();
      return;
    }

    const newPlaylist = addPlaylist({
      subjectId: targetSubjectId,
      youtubePlaylistId: previewData.playlistId,
      title: previewData.title,
      channelName: previewData.channelTitle,
      thumbnail: previewData.thumbnail,
      totalDurationSec: previewData.totalDurationSec,
    });

    addLectures(
      previewData.items.map((item) => ({
        playlistId: newPlaylist.id,
        subjectId: targetSubjectId,
        videoId: item.videoId,
        title: item.title,
        thumbnail: item.thumbnail,
        durationSec: item.durationSec,
        order: item.order,
      }))
    );

    toast.success(
      `Imported "${previewData.title}" with ${previewData.items.length} lectures!`
    );
    handleClose();
  };

  // Handle Single Video Fetch
  const handleFetchSingleVideo = async () => {
    setVideoError(null);
    setVideoPreview(null);

    const vidId = extractVideoId(videoUrlInput);
    if (!vidId) {
      setVideoError("Invalid YouTube Video link. Example: https://www.youtube.com/watch?v=... or https://youtu.be/...");
      return;
    }

    setVideoLoading(true);
    try {
      const res = await fetch("/api/youtube", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-youtube-key": settings.youtubeKey,
        },
        body: JSON.stringify({
          action: "fetch_video",
          videoId: vidId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch video details");
      }

      setVideoPreview(data);
      setCustomVideoTitle(data.title);
    } catch (err: any) {
      setVideoError(err.message || "Failed to fetch video details.");
    } finally {
      setVideoLoading(false);
    }
  };

  // Handle Confirm Single Video Add
  const handleConfirmSingleVideo = (addAnother = false) => {
    if (!videoPreview) return;

    let finalPlaylistId = targetPlaylistId;
    let finalSubjectId = selectedSubjectId;

    if (singleVideoDestination === "new_custom" || playlists.length === 0) {
      if (!newCustomPlaylistTitle.trim()) {
        toast.error("Please enter a title for your custom playlist.");
        return;
      }

      if (selectedSubjectId === "new" || !finalSubjectId) {
        if (!newSubjectName.trim()) {
          toast.error("Please enter a subject name.");
          return;
        }
        const createdSubj = addSubject({
          name: newSubjectName.trim(),
          color: newSubjectColor,
          icon: newSubjectIcon,
          examDate: newSubjectExamDate || undefined,
        });
        finalSubjectId = createdSubj.id;
      }

      const customPlaylist = addPlaylist({
        subjectId: finalSubjectId,
        youtubePlaylistId: `custom_${Date.now()}`,
        title: newCustomPlaylistTitle.trim(),
        channelName: videoPreview.channelTitle || "Custom Collection",
        thumbnail: videoPreview.thumbnail,
        totalDurationSec: 0,
        isCustom: true,
      });

      finalPlaylistId = customPlaylist.id;
      setTargetPlaylistId(customPlaylist.id);
    } else {
      const foundPl = playlists.find((p) => p.id === finalPlaylistId);
      if (!foundPl) {
        toast.error("Please select a target playlist.");
        return;
      }
      finalSubjectId = foundPl.subjectId;
    }

    addSingleLecture({
      playlistId: finalPlaylistId,
      subjectId: finalSubjectId,
      videoId: videoPreview.videoId,
      title: customVideoTitle.trim() || videoPreview.title,
      thumbnail: videoPreview.thumbnail,
      durationSec: videoPreview.durationSec || 0,
    });

    toast.success(`Added "${customVideoTitle.trim() || videoPreview.title}" to playlist! 🎉`);

    if (addAnother) {
      setVideoUrlInput("");
      setVideoPreview(null);
      setCustomVideoTitle("");
      setSingleVideoDestination("existing");
    } else {
      handleClose();
    }
  };

  const handleClose = () => {
    setIsAddPlaylistOpen(false);
    setUrlInput("");
    setPreviewData(null);
    setErrorMsg(null);
    setDuplicatePlaylist(null);
    setVideoUrlInput("");
    setVideoPreview(null);
    setVideoError(null);
    setCustomVideoTitle("");
    setNewCustomPlaylistTitle("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl glass-panel bg-[#0d0d16]/95 border border-white/10 shadow-2xl p-6 sm:p-8">
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#00f0ff]/20 to-[#a855f7]/20 border border-[#00f0ff]/40 flex items-center justify-center text-[#00f0ff]">
            <Youtube className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white font-heading">
              Add YouTube Study Material
            </h2>
            <p className="text-xs text-gray-400">
              Import entire playlists or add individual lectures to your custom playlists
            </p>
          </div>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="flex rounded-xl bg-white/[0.03] p-1 border border-white/10 mb-6">
          <button
            type="button"
            onClick={() => setActiveTab("playlist")}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === "playlist"
                ? "bg-gradient-to-r from-[#00f0ff]/20 to-[#a855f7]/20 border border-[#00f0ff]/40 text-white font-semibold shadow-[0_0_12px_rgba(0,240,255,0.2)]"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-[#00f0ff]" />
            <span>Import Full Playlist</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("single_video")}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === "single_video"
                ? "bg-gradient-to-r from-[#00f0ff]/20 to-[#a855f7]/20 border border-[#00f0ff]/40 text-white font-semibold shadow-[0_0_12px_rgba(0,240,255,0.2)]"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <PlaySquare className="w-3.5 h-3.5 text-[#a855f7]" />
            <span>Add Single Video / Custom Playlist</span>
          </button>
        </div>

        {/* TAB 1: FULL PLAYLIST IMPORT */}
        {activeTab === "playlist" && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1.5">
                YouTube Playlist Link
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="https://www.youtube.com/playlist?list=PL..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !loading) {
                      handleFetchPreview();
                    }
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#00f0ff] focus:ring-1 focus:ring-[#00f0ff] transition-all"
                />
                <button
                  onClick={handleFetchPreview}
                  disabled={loading || !urlInput.trim()}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#00f0ff] to-[#a855f7] text-black font-semibold text-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(0,240,255,0.3)] shrink-0"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-black" />
                      <span>Fetching...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-black" />
                      <span>Inspect</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {duplicatePlaylist && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between">
                <div>
                  <span className="font-semibold block">Playlist Already Imported</span>
                  <span>
                    &ldquo;{duplicatePlaylist.title}&rdquo; is already in your tracker. You can
                    re-sync to fetch newly uploaded videos.
                  </span>
                </div>
                <button
                  onClick={() => handleConfirmImport(true)}
                  className="ml-3 px-3 py-1.5 rounded-lg bg-amber-400 text-black font-semibold text-xs hover:bg-amber-300 flex items-center gap-1.5 shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Re-sync</span>
                </button>
              </div>
            )}

            {previewData && (
              <div className="mt-6 space-y-6 pt-4 border-t border-white/10 animate-in fade-in duration-300">
                <div className="flex gap-4 items-start p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.08]">
                  {previewData.thumbnail && (
                    <img
                      src={previewData.thumbnail}
                      alt={previewData.title}
                      className="w-28 h-18 object-cover rounded-lg border border-white/10 shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-white truncate">
                      {previewData.title}
                    </h4>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {previewData.channelTitle}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs font-mono text-gray-300">
                      <span className="flex items-center gap-1 text-[#00f0ff]">
                        <Video className="w-3.5 h-3.5" />
                        {previewData.itemCount} lectures
                      </span>
                      <span className="flex items-center gap-1 text-[#a855f7]">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDurationHuman(previewData.totalDurationSec)}
                      </span>
                      {previewData.skippedCount > 0 && (
                        <span className="text-amber-400/90 text-[11px]">
                          ({previewData.skippedCount} private/deleted skipped)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="block text-xs font-medium text-gray-300">
                    Assign to Subject
                  </label>

                  {subjects.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {subjects.map((sub) => (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => setSelectedSubjectId(sub.id)}
                          className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                            selectedSubjectId === sub.id
                              ? "bg-white/[0.08] border-[#00f0ff] shadow-[0_0_15px_rgba(0,240,255,0.2)]"
                              : "bg-white/[0.02] border-white/10 hover:bg-white/[0.05]"
                          }`}
                        >
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: sub.color }}
                          />
                          <span className="text-xs font-medium text-white truncate">
                            {sub.name}
                          </span>
                        </button>
                      ))}

                      <button
                        type="button"
                        onClick={() => setSelectedSubjectId("new")}
                        className={`p-3 rounded-xl border text-left flex items-center gap-2 transition-all cursor-pointer ${
                          selectedSubjectId === "new"
                            ? "bg-white/[0.08] border-[#a855f7] shadow-[0_0_15px_rgba(168,85,247,0.2)]"
                            : "bg-white/[0.02] border-dashed border-white/20 hover:bg-white/[0.05]"
                        }`}
                      >
                        <FolderPlus className="w-4 h-4 text-[#a855f7]" />
                        <span className="text-xs font-medium text-gray-300">
                          + New Subject
                        </span>
                      </button>
                    </div>
                  )}

                  {(selectedSubjectId === "new" || subjects.length === 0) && (
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-3 mt-3">
                      <span className="text-xs font-semibold text-gray-300 block">
                        Create New Subject
                      </span>
                      <input
                        type="text"
                        placeholder="Subject Name (e.g. Data Structures, Physics)"
                        value={newSubjectName}
                        onChange={(e) => setNewSubjectName(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-gray-500 text-xs focus:outline-none focus:border-[#00f0ff]"
                      />

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                        <div>
                          <span className="text-[11px] text-gray-400 block mb-1.5">
                            Accent Color:
                          </span>
                          <div className="flex gap-2">
                            {subjectColors.map((col) => (
                              <button
                                key={col}
                                type="button"
                                onClick={() => setNewSubjectColor(col)}
                                className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                                  newSubjectColor === col
                                    ? "ring-2 ring-white scale-110"
                                    : "opacity-70 hover:opacity-100"
                                }`}
                                style={{ backgroundColor: col }}
                              />
                            ))}
                          </div>
                        </div>

                        <div>
                          <span className="text-[11px] text-gray-400 block mb-1.5">
                            Target Exam Date (Optional):
                          </span>
                          <input
                            type="date"
                            value={newSubjectExamDate}
                            onChange={(e) => setNewSubjectExamDate(e.target.value)}
                            className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-[#00f0ff]"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-4 py-2 rounded-xl text-xs text-gray-400 hover:text-white transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmImport(false)}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#00f0ff] to-[#39ff14] text-black font-semibold text-xs hover:brightness-110 shadow-[0_0_20px_rgba(57,255,20,0.3)] transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4 text-black" />
                    <span>Import {previewData.items.length} Lectures</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SINGLE VIDEO / CUSTOM PLAYLIST */}
        {activeTab === "single_video" && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1.5">
                YouTube Video Link or ID
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                  value={videoUrlInput}
                  onChange={(e) => setVideoUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !videoLoading) {
                      handleFetchSingleVideo();
                    }
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#a855f7] focus:ring-1 focus:ring-[#a855f7] transition-all"
                />
                <button
                  type="button"
                  onClick={handleFetchSingleVideo}
                  disabled={videoLoading || !videoUrlInput.trim()}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#a855f7] to-[#00f0ff] text-black font-semibold text-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(168,85,247,0.3)] shrink-0"
                >
                  {videoLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-black" />
                      <span>Fetching...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-black" />
                      <span>Inspect Video</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {videoError && (
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{videoError}</span>
              </div>
            )}

            {videoPreview && (
              <div className="space-y-5 pt-3 border-t border-white/10 animate-in fade-in duration-300">
                {/* Video Preview Card */}
                <div className="flex gap-4 items-start p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.08]">
                  {videoPreview.thumbnail && (
                    <img
                      src={videoPreview.thumbnail}
                      alt={videoPreview.title}
                      className="w-32 h-20 object-cover rounded-lg border border-white/10 shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div>
                      <label className="text-[10px] text-gray-400 block">Lecture Title:</label>
                      <input
                        type="text"
                        value={customVideoTitle}
                        onChange={(e) => setCustomVideoTitle(e.target.value)}
                        className="w-full px-2.5 py-1 rounded bg-white/[0.04] border border-white/10 text-white text-xs font-semibold focus:outline-none focus:border-[#a855f7]"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400 font-mono">
                      <span>Channel: {videoPreview.channelTitle}</span>
                      <span className="text-[#00f0ff] flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {videoPreview.durationSec > 0
                          ? formatDurationHuman(videoPreview.durationSec)
                          : "Length auto-detected on play"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Destination Options */}
                <div className="space-y-3">
                  <label className="block text-xs font-medium text-gray-300">
                    Add to Playlist Destination:
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={playlists.length === 0}
                      onClick={() => setSingleVideoDestination("existing")}
                      className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                        singleVideoDestination === "existing" && playlists.length > 0
                          ? "bg-[#00f0ff]/15 border-[#00f0ff] text-white shadow-[0_0_12px_rgba(0,240,255,0.2)]"
                          : "bg-white/[0.02] border-white/10 text-gray-400 hover:text-white"
                      } ${playlists.length === 0 ? "opacity-40 cursor-not-allowed" : ""}`}
                    >
                      <ListPlus className="w-4 h-4 text-[#00f0ff] shrink-0" />
                      <div>
                        <div className="text-xs font-semibold">Existing Playlist</div>
                        <div className="text-[10px] text-gray-400">
                          {playlists.length > 0 ? `${playlists.length} available` : "None created yet"}
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSingleVideoDestination("new_custom")}
                      className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                        singleVideoDestination === "new_custom" || playlists.length === 0
                          ? "bg-[#a855f7]/15 border-[#a855f7] text-white shadow-[0_0_12px_rgba(168,85,247,0.2)]"
                          : "bg-white/[0.02] border-white/10 text-gray-400 hover:text-white"
                      }`}
                    >
                      <PlusCircle className="w-4 h-4 text-[#a855f7] shrink-0" />
                      <div>
                        <div className="text-xs font-semibold">New Custom Playlist</div>
                        <div className="text-[10px] text-gray-400">Create your own collection</div>
                      </div>
                    </button>
                  </div>

                  {/* Pick Existing Playlist */}
                  {singleVideoDestination === "existing" && playlists.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 space-y-2">
                      <label className="text-xs text-gray-400 block">
                        Select Target Playlist:
                      </label>
                      <select
                        value={targetPlaylistId}
                        onChange={(e) => setTargetPlaylistId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white text-xs focus:outline-none focus:border-[#00f0ff]"
                      >
                        {playlists.map((pl) => {
                          const subj = subjects.find((s) => s.id === pl.subjectId);
                          return (
                            <option key={pl.id} value={pl.id} className="bg-[#0d0d18] text-white">
                              {pl.title} {subj ? `(${subj.name})` : ""}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}

                  {/* Create New Custom Playlist */}
                  {(singleVideoDestination === "new_custom" || playlists.length === 0) && (
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-4">
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">
                          Custom Playlist Title:
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. My Best DSA Problems, One Shot Physics..."
                          value={newCustomPlaylistTitle}
                          onChange={(e) => setNewCustomPlaylistTitle(e.target.value)}
                          className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-gray-500 text-xs focus:outline-none focus:border-[#a855f7]"
                        />
                      </div>

                      {/* Select or create Subject for this new playlist */}
                      <div>
                        <label className="block text-xs font-medium text-gray-300 mb-2">
                          Assign to Subject:
                        </label>

                        {subjects.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {subjects.map((sub) => (
                              <button
                                key={sub.id}
                                type="button"
                                onClick={() => setSelectedSubjectId(sub.id)}
                                className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all cursor-pointer ${
                                  selectedSubjectId === sub.id
                                    ? "bg-white/[0.08] border-[#a855f7] shadow-[0_0_12px_rgba(168,85,247,0.2)]"
                                    : "bg-white/[0.02] border-white/10 hover:bg-white/[0.05]"
                                }`}
                              >
                                <div
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: sub.color }}
                                />
                                <span className="text-xs font-medium text-white truncate">
                                  {sub.name}
                                </span>
                              </button>
                            ))}

                            <button
                              type="button"
                              onClick={() => setSelectedSubjectId("new")}
                              className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all cursor-pointer ${
                                selectedSubjectId === "new"
                                  ? "bg-white/[0.08] border-[#00f0ff]"
                                  : "bg-white/[0.02] border-dashed border-white/20 hover:bg-white/[0.05]"
                              }`}
                            >
                              <FolderPlus className="w-3.5 h-3.5 text-[#00f0ff]" />
                              <span className="text-xs font-medium text-gray-300">
                                + New Subject
                              </span>
                            </button>
                          </div>
                        )}

                        {(selectedSubjectId === "new" || subjects.length === 0) && (
                          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 space-y-2.5 mt-2">
                            <span className="text-xs font-semibold text-gray-300 block">
                              New Subject Info
                            </span>
                            <input
                              type="text"
                              placeholder="Subject Name (e.g. Computer Science)"
                              value={newSubjectName}
                              onChange={(e) => setNewSubjectName(e.target.value)}
                              className="w-full px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-white placeholder-gray-500 text-xs focus:outline-none focus:border-[#a855f7]"
                            />

                            <div className="flex items-center gap-2 pt-1">
                              <span className="text-[11px] text-gray-400">Color:</span>
                              {subjectColors.slice(0, 5).map((col) => (
                                <button
                                  key={col}
                                  type="button"
                                  onClick={() => setNewSubjectColor(col)}
                                  className={`w-5 h-5 rounded-full cursor-pointer ${
                                    newSubjectColor === col ? "ring-2 ring-white" : "opacity-70"
                                  }`}
                                  style={{ backgroundColor: col }}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirm CTA */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-4 py-2 rounded-xl text-xs text-gray-400 hover:text-white transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={() => handleConfirmSingleVideo(true)}
                    className="px-4 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-xs text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    Add & Add Another
                  </button>

                  <button
                    type="button"
                    onClick={() => handleConfirmSingleVideo(false)}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#a855f7] to-[#00f0ff] text-black font-semibold text-xs hover:brightness-110 shadow-[0_0_20px_rgba(168,85,247,0.3)] transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4 text-black" />
                    <span>Add Video to Playlist</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
