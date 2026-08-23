export const USERNAME_EMAIL_DOMAIN = "rushstore.local";

export function normalizeUsername(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "");
}

export function usernameToEmail(raw: string) {
  return `${normalizeUsername(raw)}@${USERNAME_EMAIL_DOMAIN}`;
}
