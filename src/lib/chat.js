// Pure helpers for Team Connect (no React, no Supabase).

export const CHAT_BUCKET = "chat-files";
export const MAX_FILE_MB = 25;
export const MAX_FILES_PER_MESSAGE = 10;
export const PAGE_SIZE = 40;
export const CALL_RING_SECONDS = 45;

export const REACTIONS = ["👍", "❤️", "😂", "🎉", "👏", "😮"];

// Compact emoji set for the composer (no external picker needed).
export const EMOJIS = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎", "🤔", "😅", "😢", "😭", "😡", "🥳", "😴", "🙏",
  "👍", "👎", "👏", "🙌", "💪", "🤝", "👌", "✌️", "🔥", "✨", "🎉", "💯", "❤️", "💙", "✅", "❌",
  "⭐", "🚀", "📌", "📎", "📞", "📅", "⏰", "☕", "🍕", "🏏", "⚽", "🎯", "💡", "🛠️", "📐", "🏗️",
];

const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "gif"];
export const ALLOWED_EXT = [
  ...IMAGE_EXT, "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "zip", "dwg", "dxf",
];
export const ACCEPT = ALLOWED_EXT.map((e) => `.${e}`).join(",");

export const extOf = (name = "") => (name.includes(".") ? name.split(".").pop().toLowerCase() : "");
export const isImageFile = (nameOrFile, mime) => {
  const name = typeof nameOrFile === "string" ? nameOrFile : nameOrFile?.name;
  const type = mime || (typeof nameOrFile === "object" ? nameOrFile?.type : "");
  return (type || "").startsWith("image/") || IMAGE_EXT.includes(extOf(name));
};

// Returns an error message, or null when the file may be sent.
export function validateFile(file) {
  if (!ALLOWED_EXT.includes(extOf(file.name))) return `${file.name}: this file type is not allowed.`;
  if (file.size > MAX_FILE_MB * 1048576) return `${file.name}: larger than ${MAX_FILE_MB} MB.`;
  if (file.size === 0) return `${file.name}: the file is empty.`;
  return null;
}

export const safeName = (n) => n.replace(/[^\w.\-]+/g, "_").slice(-90);
export const attachmentPath = (conversationId, file) =>
  `${conversationId}/${crypto.randomUUID()}-${safeName(file.name)}`;

export const fmtSize = (n) =>
  n == null ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;

export const initials = (name = "") =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

const sameDay = (a, b) => a.toDateString() === b.toDateString();
export const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "");

export function dayLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(d, now)) return "Today";
  if (sameDay(d, new Date(now.getTime() - 864e5))) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// Short label for the conversation list: time today, "Yesterday", otherwise a date.
export function listTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(d, now)) return clock(iso);
  if (sameDay(d, new Date(now.getTime() - 864e5))) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function lastSeenLabel(iso) {
  if (!iso) return "Offline";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Last seen just now";
  if (mins < 60) return `Last seen ${mins} min ago`;
  const d = new Date(iso);
  return sameDay(d, new Date()) ? `Last seen today at ${clock(iso)}` : `Last seen ${dayLabel(iso)}`;
}

export const fmtDuration = (secs) => {
  const s = Math.max(0, Math.floor(secs || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${String(m).padStart(2, "0")}:${r}`;
};

// Call log messages are stored as "<audio|video>|<status>|<seconds>".
export function parseCallLog(content = "") {
  const [type, status, secs] = content.split("|");
  return { type: type || "audio", status: status || "ended", seconds: Number(secs) || 0 };
}

export const CALL_STATUS_LABEL = {
  ringing: "Ringing",
  active: "In progress",
  ended: "Ended",
  missed: "Missed",
  declined: "Declined",
  cancelled: "Cancelled",
};

// The other person of a direct conversation.
export const otherMember = (conv, meId) => (conv?.members || []).find((m) => m.user_id !== meId)?.user_id;

export function convTitle(conv, meId, map) {
  if (!conv) return "";
  if (conv.conversation_type === "group") return conv.name || "Group";
  return map?.[otherMember(conv, meId)]?.full_name || "Direct message";
}

// Escape % _ \ so a user's search text is matched literally by ilike.
export const likeEscape = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

// Render "@Name" mentions: returns [{text, mention}] parts (split with a capture group -> odd parts are mentions).
export function splitMentions(text, names) {
  if (!names.length) return [{ text }];
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length);
  const re = new RegExp(`(@(?:${escaped.join("|")}))`);
  return text.split(re).map((part, i) => ({ text: part, mention: i % 2 === 1 })).filter((p) => p.text);
}
