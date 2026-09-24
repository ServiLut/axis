/** Accept international notation and keep the legacy Colombian local format. */
export function normalizeClientPhone(value: string): string {
  const compact = value.trim().replace(/[\s().-]/g, "");
  if (!compact) return "";
  const phone = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
  if (!/^\+?[1-9]\d{6,14}$/.test(phone)) {
    throw new Error("Escribe un teléfono válido con indicativo, por ejemplo +57 3001234567 o +1 2025550123.");
  }
  // Existing ten-digit Colombian numbers remain compatible with old records.
  return phone;
}

/** Match the same number across existing local and international records. */
export function clientPhoneVariants(value: string): string[] {
  const phone = normalizeClientPhone(value);
  if (!phone) return [];
  const digits = phone.replace(/^\+/, "");
  const variants = new Set([phone, digits, `+${digits}`]);
  if (!phone.startsWith("+") && digits.length === 10) {
    variants.add(`57${digits}`);
    variants.add(`+57${digits}`);
  }
  if (digits.startsWith("57") && digits.length === 12) {
    variants.add(digits.slice(2));
  }
  return [...variants];
}

export function clientWhatsAppUrl(value: string): string | null {
  try {
    const phone = normalizeClientPhone(value);
    if (!phone) return null;
    const digits = phone.replace(/^\+/, "");
    const international = !phone.startsWith("+") && digits.length === 10
      ? `57${digits}` : digits;
    return `https://wa.me/${international}`;
  } catch {
    return null;
  }
}
