const COLORS = ["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#06B6D4", "#EC4899"];
export const avatarColor = (id = "") => COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
