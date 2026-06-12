// Extract the login token from a "/start folio_login_<token>" command, else null.
export function parseLoginPayload(text: string): string | null {
  const m = text.trim().match(/^\/start\s+folio_login_(\S+)$/);
  return m ? m[1] : null;
}
