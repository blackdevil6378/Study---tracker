"use client";

import React, { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  BookOpen,
  FileText,
  Code2,
  UploadCloud,
  Plus,
  Search,
  Filter,
  Trash2,
  Download,
  ExternalLink,
  Maximize2,
  Minimize2,
  X,
  Edit3,
  Tag,
  Calendar,
  Sparkles,
  Layers,
  FolderKanban,
  FileCode,
  Check,
  Copy,
  Eye,
  FilePlus,
  RefreshCw,
  Info,
} from "lucide-react";
import { useStudyStore } from "@/store/useStudyStore";
import { SubjectNote, NoteType } from "@/types";
import {
  saveNoteFile,
  saveNoteHtmlText,
  getNoteFile,
  getNoteHtmlText,
  deleteNoteFile,
} from "@/lib/notesDb";
import { toast } from "sonner";
import { format } from "date-fns";

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function NotesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSubjectId = searchParams.get("subjectId");

  const subjects = useStudyStore((s) => s.subjects);
  const notes = useStudyStore((s) => s.notes);
  const addNote = useStudyStore((s) => s.addNote);
  const updateNote = useStudyStore((s) => s.updateNote);
  const deleteNote = useStudyStore((s) => s.deleteNote);

  // Filters & Search
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | "all">(
    urlSubjectId || "all"
  );
  const [selectedType, setSelectedType] = useState<"all" | NoteType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "title" | "size">("newest");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Modals state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isHtmlEditorOpen, setIsHtmlEditorOpen] = useState(false);
  const [viewerNote, setViewerNote] = useState<SubjectNote | null>(null);
  const [editingNote, setEditingNote] = useState<SubjectNote | null>(null);

  // Sync selectedSubjectId if URL param changes
  useEffect(() => {
    if (urlSubjectId) {
      setSelectedSubjectId(urlSubjectId);
    }
  }, [urlSubjectId]);

  // Filtered & sorted notes
  const filteredNotes = useMemo(() => {
    return notes
      .filter((n) => {
        if (selectedSubjectId !== "all" && n.subjectId !== selectedSubjectId) return false;
        if (selectedType !== "all" && n.type !== selectedType) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = n.title.toLowerCase().includes(q);
          const matchFileName = n.fileName.toLowerCase().includes(q);
          const matchDesc = n.description?.toLowerCase().includes(q);
          const matchTags = n.tags?.some((t) => t.toLowerCase().includes(q));
          return matchTitle || matchFileName || matchDesc || matchTags;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (sortBy === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        if (sortBy === "title") return a.title.localeCompare(b.title);
        if (sortBy === "size") return (b.fileSize || 0) - (a.fileSize || 0);
        return 0;
      });
  }, [notes, selectedSubjectId, selectedType, searchQuery, sortBy]);

  // Statistics
  const totalNotes = notes.length;
  const pdfCount = notes.filter((n) => n.type === "pdf").length;
  const htmlCount = notes.filter((n) => n.type === "html").length;

  // Handle note download
  const handleDownload = async (note: SubjectNote) => {
    try {
      const fileData = await getNoteFile(note.id);
      if (!fileData) {
        toast.error("File data not found in browser storage.");
        return;
      }
      const url = URL.createObjectURL(fileData.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = note.fileName || `${note.title}.${note.type}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Downloaded "${note.fileName}"`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to download file.");
    }
  };

  // Handle note deletion
  const handleDelete = (note: SubjectNote) => {
    if (confirm(`Are you sure you want to delete note "${note.title}"?`)) {
      deleteNote(note.id);
      toast.success("Note deleted successfully.");
      if (viewerNote?.id === note.id) setViewerNote(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8 select-none">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-[#0c0c1a] via-[#101026] to-[#0a0a14] border border-white/[0.08] shadow-[0_0_50px_rgba(0,240,255,0.06)] relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-[#00f0ff]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 w-64 h-64 bg-[#a855f7]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/10 text-xs text-[#00f0ff] font-mono tracking-wider uppercase">
            <BookOpen className="w-3.5 h-3.5 text-[#00f0ff]" />
            <span>Subject Study Vault</span>
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white font-heading tracking-tight flex items-center gap-3">
            Notes & Resources
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 max-w-xl leading-relaxed">
            Organize subject-wise notes. Upload <strong className="text-gray-200">HTML guides</strong> and{" "}
            <strong className="text-gray-200">PDF documents</strong> with instant in-browser readers, full-screen study modes, and offline storage.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="relative flex flex-wrap items-center gap-3">
          <button
            onClick={() => setIsHtmlEditorOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/15 text-white font-medium text-xs sm:text-sm transition-all hover:scale-[1.02] cursor-pointer shadow-sm"
          >
            <Code2 className="w-4 h-4 text-[#a855f7]" />
            <span>New HTML Note</span>
          </button>

          <button
            onClick={() => setIsUploadOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#00f0ff] to-[#a855f7] text-black font-semibold text-xs sm:text-sm hover:brightness-110 transition-all hover:scale-[1.02] cursor-pointer shadow-[0_0_20px_rgba(0,240,255,0.4)]"
          >
            <UploadCloud className="w-4 h-4 stroke-[2.5]" />
            <span>Upload File (PDF / HTML)</span>
          </button>
        </div>
      </div>

      {/* Quick Summary Pill Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-[#00f0ff]/10 border border-[#00f0ff]/20 flex items-center justify-center text-[#00f0ff]">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-bold text-white font-mono">{totalNotes}</div>
            <div className="text-xs text-gray-400">Total Notes</div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-[#ff2e97]/10 border border-[#ff2e97]/20 flex items-center justify-center text-[#ff2e97]">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-bold text-white font-mono">{pdfCount}</div>
            <div className="text-xs text-gray-400">PDF Documents</div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-[#00f0ff]/10 border border-[#00f0ff]/20 flex items-center justify-center text-[#00f0ff]">
            <Code2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-bold text-white font-mono">{htmlCount}</div>
            <div className="text-xs text-gray-400">HTML Notes</div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-[#a855f7]/10 border border-[#a855f7]/20 flex items-center justify-center text-[#a855f7]">
            <FolderKanban className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-bold text-white font-mono">{subjects.length}</div>
            <div className="text-xs text-gray-400">Subjects</div>
          </div>
        </div>
      </div>

      {/* Filter by Subject Tabs */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-gray-400 font-mono uppercase tracking-wider">
          <span className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[#00f0ff]" /> Filter by Subject
          </span>
          <span>
            {selectedSubjectId === "all"
              ? "Showing All"
              : subjects.find((s) => s.id === selectedSubjectId)?.name || "Subject"}
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
          <button
            onClick={() => setSelectedSubjectId("all")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 border ${
              selectedSubjectId === "all"
                ? "bg-[#00f0ff]/15 text-[#00f0ff] border-[#00f0ff]/40 shadow-[0_0_15px_rgba(0,240,255,0.2)]"
                : "bg-white/[0.03] text-gray-400 border-white/10 hover:text-white hover:bg-white/[0.06]"
            }`}
          >
            <span>All Subjects</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-white/10">
              {notes.length}
            </span>
          </button>

          {subjects.map((subj) => {
            const count = notes.filter((n) => n.subjectId === subj.id).length;
            const isSelected = selectedSubjectId === subj.id;
            return (
              <button
                key={subj.id}
                onClick={() => setSelectedSubjectId(subj.id)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 border ${
                  isSelected
                    ? "bg-white/[0.1] text-white shadow-md"
                    : "bg-white/[0.03] text-gray-400 border-white/10 hover:text-white hover:bg-white/[0.06]"
                }`}
                style={{
                  borderColor: isSelected ? subj.color : "rgba(255,255,255,0.08)",
                  boxShadow: isSelected ? `0 0 15px ${subj.color}33` : undefined,
                }}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: subj.color }}
                />
                <span>{subj.name}</span>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-white/10 text-gray-300">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Search, Format Filter, and Sorting Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl bg-white/[0.02] border border-white/[0.08]">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search notes by title, file name, tags, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-xs sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#00f0ff]/50 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          {/* Format Type Pill Toggle */}
          <div className="flex items-center p-1 rounded-xl bg-white/[0.03] border border-white/10 text-xs">
            <button
              onClick={() => setSelectedType("all")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                selectedType === "all" ? "bg-white/15 text-white shadow-sm" : "text-gray-400 hover:text-white"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setSelectedType("pdf")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                selectedType === "pdf" ? "bg-[#ff2e97]/20 text-[#ff2e97] shadow-sm font-semibold" : "text-gray-400 hover:text-white"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>
            <button
              onClick={() => setSelectedType("html")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                selectedType === "html" ? "bg-[#00f0ff]/20 text-[#00f0ff] shadow-sm font-semibold" : "text-gray-400 hover:text-white"
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>HTML</span>
            </button>
          </div>

          {/* Sort Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-xs text-gray-300 focus:outline-none focus:border-[#00f0ff]/50 cursor-pointer"
          >
            <option value="newest" className="bg-[#0b0b14] text-white">Newest First</option>
            <option value="oldest" className="bg-[#0b0b14] text-white">Oldest First</option>
            <option value="title" className="bg-[#0b0b14] text-white">Title (A-Z)</option>
            <option value="size" className="bg-[#0b0b14] text-white">Size (Largest)</option>
          </select>
        </div>
      </div>

      {/* Notes Grid / List */}
      {filteredNotes.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white/[0.01] border border-dashed border-white/10 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center mx-auto text-gray-400">
            <BookOpen className="w-8 h-8 text-[#00f0ff]" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-semibold text-white">No Notes Found</h3>
            <p className="text-xs sm:text-sm text-gray-400 max-w-md mx-auto">
              {searchQuery
                ? `No notes matching "${searchQuery}". Try a different keyword.`
                : selectedSubjectId !== "all"
                ? "No notes added for this subject yet. Upload a PDF or write an HTML guide!"
                : "Your study vault is empty. Upload your first PDF or create an HTML note to get started."}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => setIsUploadOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#00f0ff] to-[#a855f7] text-black font-semibold text-xs transition-all hover:brightness-110 cursor-pointer"
            >
              <UploadCloud className="w-4 h-4 stroke-[2.5]" />
              <span>Upload PDF / HTML</span>
            </button>
            <button
              onClick={() => setIsHtmlEditorOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.06] border border-white/10 text-white font-medium text-xs hover:bg-white/10 transition-colors cursor-pointer"
            >
              <Code2 className="w-4 h-4 text-[#a855f7]" />
              <span>Write HTML Note</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {filteredNotes.map((note) => {
            const subject = subjects.find((s) => s.id === note.subjectId);
            const isPdf = note.type === "pdf";
            const isHtml = note.type === "html";

            return (
              <div
                key={note.id}
                className="group p-5 rounded-2xl bg-[#0c0c16]/90 border border-white/[0.08] hover:border-white/20 transition-all duration-300 hover:shadow-[0_0_25px_rgba(0,0,0,0.5)] flex flex-col justify-between relative overflow-hidden"
              >
                {/* Glow accent based on subject */}
                <div
                  className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-10 group-hover:opacity-25 transition-opacity pointer-events-none"
                  style={{ backgroundColor: subject?.color || "#00f0ff" }}
                />

                <div className="space-y-3.5 relative">
                  {/* Top Bar: Badges & More actions */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Format Badge */}
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold uppercase tracking-wider ${
                          isPdf
                            ? "bg-[#ff2e97]/15 text-[#ff2e97] border border-[#ff2e97]/30"
                            : "bg-[#00f0ff]/15 text-[#00f0ff] border border-[#00f0ff]/30"
                        }`}
                      >
                        {isPdf ? (
                          <FileText className="w-3.5 h-3.5 stroke-[2.5]" />
                        ) : (
                          <Code2 className="w-3.5 h-3.5 stroke-[2.5]" />
                        )}
                        <span>{note.type}</span>
                      </span>

                      {/* Subject Badge */}
                      {subject && (
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/[0.04] border border-white/10 text-gray-300"
                        >
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: subject.color }}
                          />
                          <span className="truncate max-w-[120px]">{subject.name}</span>
                        </span>
                      )}
                    </div>

                    {/* Edit & Delete quick buttons */}
                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditingNote(note)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                        title="Edit Details"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(note)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                        title="Delete Note"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h3
                      onClick={() => setViewerNote(note)}
                      className="text-base font-semibold text-white group-hover:text-[#00f0ff] transition-colors cursor-pointer line-clamp-2 leading-snug"
                    >
                      {note.title}
                    </h3>
                    {note.description && (
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                        {note.description}
                      </p>
                    )}
                  </div>

                  {/* Tags */}
                  {note.tags && note.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {note.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/[0.03] text-gray-400 border border-white/[0.06]"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bottom Footer Details & Actions */}
                <div className="mt-5 pt-3.5 border-t border-white/[0.06] flex items-center justify-between text-xs text-gray-400 relative">
                  <div className="flex items-center gap-2 text-[11px] font-mono">
                    <span>{formatFileSize(note.fileSize)}</span>
                    <span>•</span>
                    <span>{format(new Date(note.createdAt), "MMM d, yyyy")}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDownload(note)}
                      className="p-2 rounded-xl bg-white/[0.03] border border-white/10 hover:bg-white/10 text-gray-300 hover:text-white transition-colors cursor-pointer"
                      title="Download file"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => setViewerNote(note)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-[#00f0ff]/20 hover:text-[#00f0ff] border border-white/10 hover:border-[#00f0ff]/40 text-white font-medium text-xs transition-all cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{isPdf ? "Read PDF" : "Open HTML"}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Modal */}
      {isUploadOpen && (
        <UploadModal
          subjects={subjects}
          defaultSubjectId={selectedSubjectId !== "all" ? selectedSubjectId : subjects[0]?.id || ""}
          onClose={() => setIsUploadOpen(false)}
          onSuccess={(newNote) => {
            setIsUploadOpen(false);
            toast.success(`Note "${newNote.title}" uploaded successfully!`);
          }}
        />
      )}

      {/* Rich HTML Note In-App Editor Modal */}
      {isHtmlEditorOpen && (
        <HtmlEditorModal
          subjects={subjects}
          defaultSubjectId={selectedSubjectId !== "all" ? selectedSubjectId : subjects[0]?.id || ""}
          onClose={() => setIsHtmlEditorOpen(false)}
          onSuccess={(newNote) => {
            setIsHtmlEditorOpen(false);
            toast.success(`HTML note "${newNote.title}" saved!`);
          }}
        />
      )}

      {/* Note Details Edit Modal */}
      {editingNote && (
        <EditNoteModal
          note={editingNote}
          subjects={subjects}
          onClose={() => setEditingNote(null)}
          onSave={(updates) => {
            updateNote(editingNote.id, updates);
            setEditingNote(null);
            toast.success("Note details updated.");
          }}
        />
      )}

      {/* Note Document Viewer Modal (PDF / HTML Reader) */}
      {viewerNote && (
        <NoteViewerModal
          note={viewerNote}
          subject={subjects.find((s) => s.id === viewerNote.subjectId)}
          onClose={() => setViewerNote(null)}
          onDownload={() => handleDownload(viewerNote)}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Upload Modal Component (PDF / HTML Drag & Drop)
// -------------------------------------------------------------
function UploadModal({
  subjects,
  defaultSubjectId,
  onClose,
  onSuccess,
}: {
  subjects: any[];
  defaultSubjectId: string;
  onClose: () => void;
  onSuccess: (note: SubjectNote) => void;
}) {
  const addNote = useStudyStore((s) => s.addNote);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [subjectId, setSubjectId] = useState(defaultSubjectId || (subjects[0]?.id || ""));
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFileChange = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf" && ext !== "html" && ext !== "htm") {
      toast.error("Please select a PDF or HTML file (.pdf, .html, .htm)");
      return;
    }
    setSelectedFile(file);
    // Auto-generate clean title from filename if not set
    if (!title) {
      const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
      setTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      toast.error("Please choose a file to upload.");
      return;
    }
    if (!title.trim()) {
      toast.error("Please provide a title for the note.");
      return;
    }
    if (!subjectId) {
      toast.error("Please select a subject.");
      return;
    }

    setIsSubmitting(true);
    try {
      const ext = selectedFile.name.split(".").pop()?.toLowerCase();
      const type: NoteType = ext === "pdf" ? "pdf" : "html";
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      // Create note record in store
      const newNote = addNote({
        subjectId,
        title: title.trim(),
        type,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        description: description.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
      });

      // Save blob in IndexedDB
      await saveNoteFile(newNote.id, selectedFile);

      onSuccess(newNote);
    } catch (err) {
      console.error(err);
      toast.error("Failed to upload note file.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl bg-[#0d0d18] border border-white/15 p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#00f0ff]/15 border border-[#00f0ff]/30 flex items-center justify-center text-[#00f0ff]">
              <UploadCloud className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">Upload Subject Note</h2>
              <p className="text-xs text-gray-400">PDF documents or HTML reference pages</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Drag and Drop Box */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
              isDragging
                ? "border-[#00f0ff] bg-[#00f0ff]/10"
                : selectedFile
                ? "border-emerald-500/50 bg-emerald-500/5"
                : "border-white/15 hover:border-white/30 bg-white/[0.02]"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.html,.htm"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileChange(e.target.files[0]);
                }
              }}
            />

            {selectedFile ? (
              <div className="space-y-1.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
                  <Check className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div className="text-sm font-semibold text-white truncate max-w-xs">
                  {selectedFile.name}
                </div>
                <div className="text-xs text-gray-400 font-mono">
                  {formatFileSize(selectedFile.size)} • Click to choose another
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="w-10 h-10 rounded-xl bg-[#00f0ff]/10 text-[#00f0ff] flex items-center justify-center mx-auto border border-[#00f0ff]/20">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div className="text-sm font-medium text-gray-200">
                  Drop PDF or HTML file here, or <span className="text-[#00f0ff]">browse</span>
                </div>
                <div className="text-xs text-gray-400 font-mono">
                  Supports .pdf, .html, .htm (Stored locally in browser)
                </div>
              </div>
            )}
          </div>

          {/* Subject Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-300">Assign Subject *</label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs sm:text-sm text-white focus:outline-none focus:border-[#00f0ff]/50 cursor-pointer"
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id} className="bg-[#0d0d18] text-white">
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-300">Note Title *</label>
            <input
              type="text"
              placeholder="e.g. Recursion & Backtracking Master Sheet"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#00f0ff]/50"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-300">Description (Optional)</label>
            <textarea
              placeholder="Brief summary or chapters covered in this document..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#00f0ff]/50 resize-none"
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-300">Tags (Comma separated)</label>
            <input
              type="text"
              placeholder="e.g. Unit 1, Formulas, PYQ, CheatSheet"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#00f0ff]/50"
            />
          </div>

          {/* Submit Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs font-medium text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedFile}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-[#00f0ff] to-[#a855f7] text-black font-semibold text-xs transition-all hover:brightness-110 disabled:opacity-50 cursor-pointer shadow-[0_0_15px_rgba(0,240,255,0.4)]"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Upload & Save</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Built-in HTML Note Creator & Editor Modal with Live Preview
// -------------------------------------------------------------
function HtmlEditorModal({
  subjects,
  defaultSubjectId,
  onClose,
  onSuccess,
}: {
  subjects: any[];
  defaultSubjectId: string;
  onClose: () => void;
  onSuccess: (note: SubjectNote) => void;
}) {
  const addNote = useStudyStore((s) => s.addNote);

  const [subjectId, setSubjectId] = useState(defaultSubjectId || (subjects[0]?.id || ""));
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [activeTab, setActiveTab] = useState<"editor" | "preview" | "split">("editor");

  const [htmlContent, setHtmlContent] = useState(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0d0d18;
      color: #f3f4f6;
      padding: 24px;
      line-height: 1.6;
    }
    h1, h2, h3 { color: #00f0ff; }
    .badge {
      background: rgba(0, 240, 255, 0.15);
      color: #00f0ff;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: bold;
    }
    .box {
      background: #121224;
      border-left: 4px solid #00f0ff;
      padding: 12px 16px;
      margin: 16px 0;
      border-radius: 0 8px 8px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
    }
    th, td {
      border: 1px solid rgba(255, 255, 255, 0.12);
      padding: 8px 12px;
      text-align: left;
    }
    th { background: #1a1a32; color: #a855f7; }
    pre {
      background: #141428;
      padding: 12px;
      border-radius: 6px;
      color: #00f0ff;
      font-family: monospace;
      overflow-x: auto;
    }
  </style>
</head>
<body>
  <h1>📘 Subject Revision Guide</h1>
  <p><span class="badge">Revision Note</span></p>

  <div class="box">
    <strong>Key Concept:</strong> Write summary points, definitions, or critical exam formulas here.
  </div>

  <h2>1. Core Principles</h2>
  <ul>
    <li>Point 1: Define key theorem or concept</li>
    <li>Point 2: Edge conditions & limitations</li>
  </ul>
</body>
</html>`);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Quick HTML snippets insertion
  const insertSnippet = (snippet: string) => {
    setHtmlContent((prev) => prev + "\n" + snippet);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please enter a note title.");
      return;
    }
    if (!subjectId) {
      toast.error("Please select a subject.");
      return;
    }

    setIsSubmitting(true);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const fileName = `${title.toLowerCase().replace(/[^a-z0-9]/g, "_")}.html`;
      const sizeBytes = new Blob([htmlContent]).size;

      const newNote = addNote({
        subjectId,
        title: title.trim(),
        type: "html",
        fileName,
        fileSize: sizeBytes,
        description: description.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
      });

      // Save HTML content in IndexedDB
      await saveNoteHtmlText(newNote.id, htmlContent);

      onSuccess(newNote);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save HTML note.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl h-[90vh] max-h-[850px] rounded-2xl bg-[#0d0d18] border border-white/15 p-5 sm:p-6 shadow-2xl flex flex-col justify-between overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#a855f7]/15 border border-[#a855f7]/30 flex items-center justify-center text-[#a855f7]">
              <Code2 className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">Create HTML Note</h2>
              <p className="text-xs text-gray-400">Write or paste rich HTML study notes with live preview</p>
            </div>
          </div>

          {/* View Mode Tabs */}
          <div className="flex items-center gap-2">
            <div className="flex items-center p-1 rounded-xl bg-white/[0.04] border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab("editor")}
                className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  activeTab === "editor" ? "bg-white/15 text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                Editor
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("preview")}
                className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                  activeTab === "preview" ? "bg-[#00f0ff]/20 text-[#00f0ff]" : "text-gray-400 hover:text-white"
                }`}
              >
                <Eye className="w-3 h-3" />
                <span>Preview</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 pt-4 space-y-3">
          {/* Metadata Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-gray-300 block mb-1">Subject *</label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white focus:outline-none focus:border-[#00f0ff]/50 cursor-pointer"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id} className="bg-[#0d0d18] text-white">
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-gray-300 block mb-1">Title *</label>
              <input
                type="text"
                placeholder="e.g. Chemical Bonding Master Formulas"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white focus:outline-none focus:border-[#00f0ff]/50"
              />
            </div>
          </div>

          {/* Quick Snippet Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="text-[10px] text-gray-400 uppercase font-mono mr-1">Insert:</span>
            <button
              type="button"
              onClick={() => insertSnippet('<div class="box"><strong>Note:</strong> Key takeaway</div>')}
              className="px-2 py-1 rounded bg-white/[0.03] hover:bg-white/[0.08] text-gray-300 border border-white/10 text-[11px] whitespace-nowrap cursor-pointer"
            >
              + Note Box
            </button>
            <button
              type="button"
              onClick={() =>
                insertSnippet(
                  '<table><tr><th>Concept</th><th>Formula</th></tr><tr><td>Work Done</td><td>W = F &middot; d</td></tr></table>'
                )
              }
              className="px-2 py-1 rounded bg-white/[0.03] hover:bg-white/[0.08] text-gray-300 border border-white/10 text-[11px] whitespace-nowrap cursor-pointer"
            >
              + Table
            </button>
            <button
              type="button"
              onClick={() => insertSnippet('<pre><code>// Code or Algorithm here</code></pre>')}
              className="px-2 py-1 rounded bg-white/[0.03] hover:bg-white/[0.08] text-gray-300 border border-white/10 text-[11px] whitespace-nowrap cursor-pointer"
            >
              + Code Snippet
            </button>
            <button
              type="button"
              onClick={() => insertSnippet('<span class="badge">Important</span>')}
              className="px-2 py-1 rounded bg-white/[0.03] hover:bg-white/[0.08] text-gray-300 border border-white/10 text-[11px] whitespace-nowrap cursor-pointer"
            >
              + Badge
            </button>
          </div>

          {/* Editor vs Live Preview Container */}
          <div className="flex-1 min-h-[260px] relative rounded-xl border border-white/10 overflow-hidden bg-[#090912]">
            {activeTab === "editor" ? (
              <textarea
                value={htmlContent}
                onChange={(e) => setHtmlContent(e.target.value)}
                placeholder="Enter HTML markup here..."
                className="w-full h-full p-4 bg-transparent text-gray-200 font-mono text-xs sm:text-sm focus:outline-none resize-none leading-relaxed"
                spellCheck={false}
              />
            ) : (
              <iframe
                srcDoc={htmlContent}
                sandbox="allow-same-origin"
                className="w-full h-full border-0 bg-[#0d0d18]"
                title="Live HTML Preview"
              />
            )}
          </div>

          {/* Optional Tags & Description */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <input
              type="text"
              placeholder="Description (Optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#00f0ff]/50"
            />
            <input
              type="text"
              placeholder="Tags: formulas, summary, pyq"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#00f0ff]/50"
            />
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-white/10">
            <div className="text-[11px] font-mono text-gray-400">
              {new Blob([htmlContent]).size} bytes • HTML Document
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-gray-300 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !title.trim()}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-[#00f0ff] to-[#a855f7] text-black font-semibold text-xs transition-all hover:brightness-110 disabled:opacity-50 cursor-pointer shadow-[0_0_15px_rgba(0,240,255,0.4)]"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Save HTML Note</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Note Viewer Modal (Dedicated PDF Reader & HTML Viewer)
// -------------------------------------------------------------
function NoteViewerModal({
  note,
  subject,
  onClose,
  onDownload,
}: {
  note: SubjectNote;
  subject?: any;
  onClose: () => void;
  onDownload: () => void;
}) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [htmlText, setHtmlText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [htmlMode, setHtmlMode] = useState<"render" | "code">("render");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    async function loadData() {
      setIsLoading(true);
      try {
        const fileData = await getNoteFile(note.id);
        if (!fileData) {
          toast.error("File data could not be retrieved from local storage.");
          setIsLoading(false);
          return;
        }

        if (note.type === "pdf") {
          const url = URL.createObjectURL(fileData.blob);
          createdUrl = url;
          if (active) setFileUrl(url);
        } else {
          // HTML note
          const text = await fileData.blob.text();
          if (active) {
            setHtmlText(text);
            const url = URL.createObjectURL(fileData.blob);
            createdUrl = url;
            setFileUrl(url);
          }
        }
      } catch (err) {
        console.error(err);
        toast.error("Failed to load file.");
      } finally {
        if (active) setIsLoading(false);
      }
    }

    loadData();

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [note]);

  const handleCopyHtml = () => {
    if (htmlText) {
      navigator.clipboard.writeText(htmlText);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
      toast.success("HTML source copied to clipboard!");
    }
  };

  const handleOpenInNewTab = () => {
    if (fileUrl) {
      window.open(fileUrl, "_blank");
    }
  };

  const isPdf = note.type === "pdf";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`relative w-full rounded-2xl bg-[#0a0a14] border border-white/15 shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ${
          isFullscreen ? "h-[98vh] max-w-[98vw]" : "h-[90vh] max-w-6xl"
        }`}
      >
        {/* Reader Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-white/10 bg-[#0d0d18]/90">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                isPdf
                  ? "bg-[#ff2e97]/15 text-[#ff2e97] border border-[#ff2e97]/30"
                  : "bg-[#00f0ff]/15 text-[#00f0ff] border border-[#00f0ff]/30"
              }`}
            >
              {isPdf ? <FileText className="w-4 h-4 stroke-[2.5]" /> : <Code2 className="w-4 h-4 stroke-[2.5]" />}
            </div>

            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white truncate max-w-md">
                {note.title}
              </h2>
              <div className="flex items-center gap-2 text-[11px] text-gray-400 font-mono">
                {subject && (
                  <span className="flex items-center gap-1">
                    <span
                      className="w-2 h-2 rounded-full inline-block"
                      style={{ backgroundColor: subject.color }}
                    />
                    <span className="text-gray-300">{subject.name}</span>
                  </span>
                )}
                <span>•</span>
                <span>{formatFileSize(note.fileSize)}</span>
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2">
            {!isPdf && (
              <div className="hidden sm:flex items-center p-1 rounded-xl bg-white/[0.04] border border-white/10 text-xs mr-2">
                <button
                  onClick={() => setHtmlMode("render")}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                    htmlMode === "render"
                      ? "bg-[#00f0ff]/20 text-[#00f0ff]"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  Rendered View
                </button>
                <button
                  onClick={() => setHtmlMode("code")}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                    htmlMode === "code"
                      ? "bg-white/15 text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  Source Code
                </button>
              </div>
            )}

            {!isPdf && htmlMode === "code" && (
              <button
                onClick={handleCopyHtml}
                className="p-2 rounded-xl bg-white/[0.04] border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Copy HTML code"
              >
                {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            )}

            <button
              onClick={handleOpenInNewTab}
              className="p-2 rounded-xl bg-white/[0.04] border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Open in new browser tab"
            >
              <ExternalLink className="w-4 h-4" />
            </button>

            <button
              onClick={onDownload}
              className="p-2 rounded-xl bg-white/[0.04] border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Download file"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 rounded-xl bg-white/[0.04] border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/[0.04] border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Reader Frame Area */}
        <div className="flex-1 bg-[#07070f] relative overflow-hidden">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-gray-400">
              <RefreshCw className="w-6 h-6 animate-spin text-[#00f0ff]" />
              <p className="text-xs font-mono">Loading note document from local vault...</p>
            </div>
          ) : isPdf ? (
            /* PDF Viewer */
            fileUrl ? (
              <iframe
                src={`${fileUrl}#toolbar=1&navpanes=0`}
                className="w-full h-full border-0 bg-[#1e1e2d]"
                title={note.title}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-3">
                <FileText className="w-12 h-12 text-[#ff2e97]" />
                <p className="text-sm text-gray-300">Unable to load PDF preview in iframe.</p>
                <button
                  onClick={handleOpenInNewTab}
                  className="px-4 py-2 rounded-xl bg-[#ff2e97]/20 text-[#ff2e97] border border-[#ff2e97]/40 text-xs font-medium cursor-pointer"
                >
                  Open in New Tab
                </button>
              </div>
            )
          ) : (
            /* HTML Viewer */
            htmlMode === "render" ? (
              fileUrl ? (
                <iframe
                  src={fileUrl}
                  sandbox="allow-same-origin allow-scripts allow-popups"
                  className="w-full h-full border-0 bg-[#0d0d18]"
                  title={note.title}
                />
              ) : null
            ) : (
              /* Code mode */
              <div className="h-full overflow-auto p-4 sm:p-6 font-mono text-xs text-gray-300 bg-[#07070c] leading-relaxed select-text">
                <pre>{htmlText}</pre>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Edit Note Metadata Modal
// -------------------------------------------------------------
function EditNoteModal({
  note,
  subjects,
  onClose,
  onSave,
}: {
  note: SubjectNote;
  subjects: any[];
  onClose: () => void;
  onSave: (updates: Partial<SubjectNote>) => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [subjectId, setSubjectId] = useState(note.subjectId);
  const [description, setDescription] = useState(note.description || "");
  const [tagsInput, setTagsInput] = useState(note.tags?.join(", ") || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please enter a title.");
      return;
    }
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    onSave({
      title: title.trim(),
      subjectId,
      description: description.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-md rounded-2xl bg-[#0d0d18] border border-white/15 p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-[#00f0ff]" />
            <span>Edit Note Details</span>
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="text-xs font-semibold text-gray-300 block mb-1">Subject</label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white focus:outline-none focus:border-[#00f0ff]/50 cursor-pointer"
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id} className="bg-[#0d0d18] text-white">
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-300 block mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white focus:outline-none focus:border-[#00f0ff]/50"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-300 block mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white focus:outline-none focus:border-[#00f0ff]/50 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-300 block mb-1">Tags (Comma separated)</label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white focus:outline-none focus:border-[#00f0ff]/50"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-gray-300 hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#00f0ff] to-[#a855f7] text-black font-semibold text-xs transition-all hover:brightness-110 cursor-pointer shadow-[0_0_15px_rgba(0,240,255,0.4)]"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Root Export with Suspense wrapper
// -------------------------------------------------------------
export default function NotesPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-gray-400 font-mono text-xs">
          Loading Notes Vault...
        </div>
      }
    >
      <NotesContent />
    </Suspense>
  );
}
