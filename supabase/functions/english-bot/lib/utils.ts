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

// Split a message into chunks all ≤ limit chars, breaking at newlines where possible
export function splitIfLong(text: string, limit = 4096): string[] {
  if (text.length <= limit) return [text];
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    const mid = remaining.lastIndexOf("\n", limit);
    const cutAt = mid > 0 ? mid : limit;
    parts.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt);
  }
  if (remaining) parts.push(remaining);
  return parts;
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

// Generate teacher guide PDF filename by appending _teacher before the extension
export function makeTeacherFilename(text: string): string {
  const base = makeFilename(text);
  return base.replace(".pdf", "_teacher.pdf");
}
