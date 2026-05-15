/**
 * Normaliza telefone para formato canônico E.164 brasileiro: +55DDDNUMERO.
 * Aceita: "(11) 94945-4546", "11949454546", "5511949454546", "+55 11 94945-4546" etc.
 * Se não tiver DDI 55, assume Brasil. Se já tiver outro DDI, preserva.
 */
export function canonicalizePhone(raw: string): string {
  const digits = (raw || "").replace(/\D+/g, "");
  if (!digits) return "";
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    return `+${digits}`;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }
  return `+${digits}`;
}

/** Últimos 8 dígitos para matching aproximado entre formatos. */
export function phoneTail(raw: string): string {
  const d = (raw || "").replace(/\D+/g, "");
  return d.slice(-8);
}
