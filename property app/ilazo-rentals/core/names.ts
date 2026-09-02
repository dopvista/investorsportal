/** 'Mr. Sunday Mtaki' → 'SM' (honorific stripped, first letters of first two words). */
export function initials(name: string): string {
  const parts = (name || '')
    .replace(/^(Mr\.|Ms\.|Mrs\.)\s*/, '')
    .trim()
    .split(/\s+/);
  return ((parts[0] || '')[0] || '') + ((parts[1] || '')[0] || '');
}
