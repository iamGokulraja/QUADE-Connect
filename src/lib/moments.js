// Pure helpers for My Moments.
export const MOMENT_BUCKET = "my-moments";
export const MAX_IMAGE_MB = 10;
export const MAX_VIDEO_MB = 50;
export const MAX_FILES = 10;
export const PAGE_SIZE = 12;

// Chips exactly as designed, plus three the people asked for (promotion, goals, motivation).
export const MOMENT_CATEGORIES = [
  "Team Moments", "Team Celebration", "Project Achievement", "Appreciation", "Awards & Rewards",
  "Promotion", "Goal Achieved", "Motivation",
];

const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "gif"];
const VIDEO_EXT = ["mp4", "webm", "mov", "m4v"];
export const ACCEPT = [...IMAGE_EXT, ...VIDEO_EXT].map((e) => `.${e}`).join(",");

const extOf = (name = "") => (name.includes(".") ? name.split(".").pop().toLowerCase() : "");
export const mediaTypeOf = (file) => {
  const ext = extOf(file.name);
  if ((file.type || "").startsWith("video/") || VIDEO_EXT.includes(ext)) return "video";
  return "image";
};

// Error message, or null when the file can be added.
export function validateMedia(file) {
  const ext = extOf(file.name);
  if (!IMAGE_EXT.includes(ext) && !VIDEO_EXT.includes(ext)) return `${file.name}: only JPG, PNG, WEBP, GIF, MP4, WEBM or MOV files.`;
  if (file.size === 0) return `${file.name}: the file is empty.`;
  const limit = mediaTypeOf(file) === "video" ? MAX_VIDEO_MB : MAX_IMAGE_MB;
  if (file.size > limit * 1048576) return `${file.name}: larger than ${limit} MB.`;
  return null;
}

export const safeName = (n) => n.replace(/[^\w.\-]+/g, "_").slice(-80);
export const mediaPath = (userId, momentId, file) => `${userId}/${momentId}/${crypto.randomUUID()}-${safeName(file.name)}`;

export const fmtMomentDate = (iso) =>
  new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
