import { randomBytes } from "node:crypto";

// Personal student-cabinet token (capability): whoever has the link sees that student's cabinet.
// 24 bytes → 192 bits of entropy, base64url. Rotatable by the tutor (overwrite invalidates the old link).
export function newCabinetToken(): string {
  return randomBytes(24).toString("base64url");
}
