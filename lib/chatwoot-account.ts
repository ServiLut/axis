type ChatAccount = { id: number; name: string };

const normalizeName = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, " ").trim().toUpperCase();

export function resolvePsychologyChatAccount<T extends ChatAccount>(accounts: T[], configuredId?: string): T | null {
  if (configuredId?.trim()) {
    const id = Number(configuredId);
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    return accounts.find((account) => account.id === id) ?? null;
  }
  const matches = accounts.filter((account) => ["PSICOLOGOS", "PSICOLOGOS EN COLOMBIA"].includes(normalizeName(account.name)));
  return matches.length === 1 ? matches[0] : null;
}
