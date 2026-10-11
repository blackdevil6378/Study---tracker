"use client";

import React, { useState } from "react";
import {
  X,
  Star,
  MessageSquareHeart,
  Bug,
  Lightbulb,
  Heart,
  Send,
  CheckCircle2,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useStudyStore } from "@/store/useStudyStore";
import { FeedbackCategory } from "@/types";
import { toast } from "sonner";

const categories: { id: FeedbackCategory; label: string; icon: React.ElementType }[] = [
  { id: "general", label: "General Feedback", icon: MessageSquareHeart },
  { id: "feature", label: "Feature Request", icon: Lightbulb },
  { id: "bug", label: "Bug Report", icon: Bug },
  { id: "praise", label: "Praise", icon: Heart },
];

const ratingLabels = ["", "Needs Improvement", "Okay", "Good", "Great!", "Loved it! 🔥"];

export function FeedbackModal() {
  const isFeedbackOpen = useStudyStore((s) => s.isFeedbackOpen);
  const setIsFeedbackOpen = useStudyStore((s) => s.setIsFeedbackOpen);
  const addFeedback = useStudyStore((s) => s.addFeedback);

  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [category, setCategory] = useState<FeedbackCategory>("feature");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!isFeedbackOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      toast.error("Please enter a short feedback message.");
      return;
    }

    setIsSubmitting(true);
    try {
      addFeedback({
        rating,
        category,
        message: message.trim(),
        email: email.trim() || undefined,
      });

      setSubmitted(true);
      toast.success("Thank you! Your feedback has been recorded. 🚀");

      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch {
      toast.error("Failed to save feedback.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setIsFeedbackOpen(false);
    setMessage("");
    setEmail("");
    setRating(5);
    setHoverRating(0);
    setSubmitted(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl glass-panel bg-[#0d0d16]/95 border border-white/10 shadow-2xl p-6 sm:p-7">
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {submitted ? (
          <div className="text-center py-8 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-[#39ff14]/20 to-[#00f0ff]/20 border border-[#39ff14]/40 flex items-center justify-center text-[#39ff14]">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white font-heading">
                Feedback Received!
              </h3>
              <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
                Your thoughts help us continuously enhance the Study Tracker experience.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#00f0ff]/20 to-[#a855f7]/20 border border-[#00f0ff]/40 flex items-center justify-center text-[#00f0ff]">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white font-heading">
                  Give Feedback
                </h2>
                <p className="text-xs text-gray-400">
                  Suggest features, report bugs, or share what you love
                </p>
              </div>
            </div>

            {/* Rating Stars */}
            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.08] text-center space-y-2">
              <span className="text-xs text-gray-400 font-medium block">
                How is your experience with Study Tracker?
              </span>
              <div className="flex items-center justify-center gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => {
                  const active = (hoverRating || rating) >= star;
                  return (
                    <button
                      key={star}
                      type="button"
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setRating(star)}
                      className="p-1 rounded-lg transition-transform hover:scale-125 cursor-pointer"
                    >
                      <Star
                        className={`w-6 h-6 transition-colors ${
                          active
                            ? "text-[#ffb800] fill-[#ffb800] drop-shadow-[0_0_8px_rgba(255,184,0,0.5)]"
                            : "text-gray-600"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
              <span className="text-[11px] font-mono text-[#00f0ff] block h-4">
                {ratingLabels[hoverRating || rating]}
              </span>
            </div>

            {/* Category Chips */}
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-2">
                Feedback Category:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {categories.map((c) => {
                  const Icon = c.icon;
                  const isSelected = category === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategory(c.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-[#00f0ff]/15 border-[#00f0ff] text-[#00f0ff] shadow-[0_0_12px_rgba(0,240,255,0.2)]"
                          : "bg-white/[0.02] border-white/10 text-gray-400 hover:text-white hover:bg-white/[0.05]"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span>{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Feedback Message */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-300">
                  Your Message:
                </label>
                <span className="text-[10px] text-gray-500 font-mono">
                  {message.length}/1000
                </span>
              </div>
              <textarea
                rows={4}
                maxLength={1000}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  category === "bug"
                    ? "What went wrong? Steps to reproduce the issue..."
                    : category === "feature"
                      ? "Describe the feature you'd love to see in Study Tracker..."
                      : "Share your thoughts, suggestions, or general feedback..."
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-gray-500 text-xs focus:outline-none focus:border-[#00f0ff] focus:ring-1 focus:ring-[#00f0ff] resize-none"
              />
            </div>

            {/* Optional Email */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Email (Optional):
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@example.com (if you'd like a follow-up)"
                className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-gray-500 text-xs focus:outline-none focus:border-[#00f0ff]"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-xl text-xs text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !message.trim()}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#00f0ff] to-[#a855f7] text-black font-semibold text-xs hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 cursor-pointer shadow-[0_0_15px_rgba(0,240,255,0.3)]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5 text-black" />
                    <span>Submit Feedback</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
