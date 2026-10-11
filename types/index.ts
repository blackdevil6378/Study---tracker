export interface Subject {
  id: string;
  name: string;
  color: string; // e.g. '#00f0ff', '#a855f7', '#39ff14', '#ff2e97', '#ffb800'
  icon: string; // lucide icon identifier e.g. 'BookOpen', 'Code', 'Atom', 'Brain', 'Calculator'
  createdAt: string; // ISO date string
  examDate?: string; // YYYY-MM-DD
}

export interface Playlist {
  id: string;
  subjectId: string;
  youtubePlaylistId: string;
  title: string;
  channelName: string;
  thumbnail: string;
  importedAt: string;
  totalDurationSec: number;
  isCustom?: boolean;
}

export interface TranscriptLine {
  start: number;
  end: number;
  text: string;
}

export type LectureTranscript = Record<string, TranscriptLine[]>;

export interface Lecture {
  id: string;
  playlistId: string;
  subjectId: string;
  videoId: string;
  title: string;
  thumbnail: string;
  durationSec: number;
  order: number;
  completed: boolean;
  completedAt?: string; // ISO date string
  watchedSec: number;
  notes: string;
  difficult: boolean;
  revisionCount: number;
  transcript?: LectureTranscript;
  scheduledDate?: string; // YYYY-MM-DD
  lastRevisedAt?: string; // ISO date string
}

export type CalendarEventType = 'exam' | 'test' | 'revision' | 'custom';

export type NoteType = 'html' | 'pdf' | 'markdown' | 'text';

export interface SubjectNote {
  id: string;
  subjectId: string;
  title: string;
  type: NoteType;
  fileName: string;
  fileSize: number; // bytes
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
  tags?: string[];
  description?: string;
  inlineContent?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  type: CalendarEventType;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  subjectId?: string;
  color?: string;
}

export interface StudySession {
  id: string;
  date: string; // YYYY-MM-DD
  lectureId?: string;
  minutes: number;
}

export interface ChatAttachmentMeta {
  name: string;
  type: 'image' | 'pdf';
}

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  ts: number;
  attachments?: ChatAttachmentMeta[];
}

export interface ChatThread {
  id: string;
  key: string; // 'general' or `${subjectId}:${lectureId}` or `${subjectId}:general`
  title?: string;
  messages: ChatMessage[];
  updatedAt: number;
}

export type AIProvider = 'gemini' | 'groq';

export interface Settings {
  userName: string;
  aiProvider: AIProvider;
  geminiKey: string;
  groqKey: string;
  youtubeKey: string;
  geminiModel: string; // default 'gemini-3.8-flash'
  groqModel: string; // default 'openai/gpt-oss-120b'
  dailyGoalLectures: number; // default 3
  language: 'hinglish' | 'english';
  reminderEnabled: boolean;
  reminderTime: string; // e.g. "09:00"
  eveningReminderEnabled: boolean;
  eveningReminderTime: string; // e.g. "20:00"
  autoMarkComplete: boolean; // 90% watched
}

export interface YouTubePlaylistItem {
  videoId: string;
  title: string;
  thumbnail: string;
  durationSec: number;
  order: number;
}

export interface ImportPreviewData {
  playlistId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  itemCount: number;
  totalDurationSec: number;
  skippedCount: number;
  items: YouTubePlaylistItem[];
}

export interface SingleVideoPreviewData {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  durationSec: number;
}

export type FeedbackCategory = 'general' | 'bug' | 'feature' | 'praise';

export interface UserFeedback {
  id: string;
  rating: number; // 1 to 5
  category: FeedbackCategory;
  message: string;
  email?: string;
  createdAt: string; // ISO date string
}

