import { clientWhatsAppUrl } from "@/lib/client-phone";

export function ClientPhoneLink({ phone, enabled }: { phone: string; enabled: boolean }) {
  const href = enabled ? clientWhatsAppUrl(phone) : null;
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-4 hover:text-green-700"
      aria-label={`Abrir WhatsApp de ${phone}`}>{phone}</a>
  ) : <span>{phone}</span>;
}
