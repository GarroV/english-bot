// Extract a PDF filename from the first line of generated homework text
export function makeFilename(text: string): string {
  const firstLine = text.split("\n")[0];
  const levelMatch = firstLine.match(/Level:\s*(\S+)/);
  const topicMatch = firstLine.match(/Topic:\s*([^·]+)/);
  const level = levelMatch ? levelMatch[1].trim() : "homework";
  const topic = topicMatch ? topicMatch[1].trim() : "";
  const topicSlug = topic.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
  return topicSlug ? `${level}_${topicSlug}.pdf` : `${level}.pdf`;
}

// Split a message into two parts if it exceeds Telegram's 4096-char limit
export function splitIfLong(
  text: string,
  limit = 4096
): [string, string | null] {
  if (text.length <= limit) return [text, null];
  const mid = text.lastIndexOf("\n", 4000);
  return [text.slice(0, mid), text.slice(mid)];
}

// Lowercase and strip punctuation from a user request string for comparison
export function normalizeRequest(userInput: string): string {
  return userInput
    .toLowerCase()
    .replace(/[,\.!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Generate a random 6-character uppercase alphanumeric invite code
export function generateInviteCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from(
    { length: 6 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}
