export type MessageTemplate = {
  id: string;
  owner_id: string;
  shortcut: string;
  title: string;
  content: string;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
};

/** Replace {{var}} placeholders. Unknown vars are kept as-is. */
export function applyTemplateVars(content: string, vars: Record<string, string>) {
  return content.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

/** Extract unique {{var}} names from content, in order. */
export function extractVars(content: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /\{\{\s*([\w.-]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
}
