import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { extractVars, applyTemplateVars, type MessageTemplate } from "@/lib/templates";

type Props = {
  template: MessageTemplate | null;
  contactName?: string;
  onClose: () => void;
  onConfirm: (text: string) => void;
};

export function TemplateVarsDialog({ template, contactName, onClose, onConfirm }: Props) {
  const vars = template ? extractVars(template.content) : [];
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!template) return;
    const init: Record<string, string> = {};
    for (const v of extractVars(template.content)) {
      if (v === "nome" || v === "name") init[v] = (contactName ?? "").split(" ")[0] ?? "";
      else init[v] = "";
    }
    setValues(init);
  }, [template, contactName]);

  if (!template) return null;
  const preview = applyTemplateVars(template.content, values);

  return (
    <Dialog open={!!template} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Preencher variáveis — /{template.shortcut}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {vars.map((v) => (
            <div key={v} className="space-y-1">
              <Label htmlFor={`var-${v}`} className="font-mono text-xs">{`{{${v}}}`}</Label>
              <Input
                id={`var-${v}`}
                value={values[v] ?? ""}
                onChange={(e) => setValues((p) => ({ ...p, [v]: e.target.value }))}
                autoFocus={vars[0] === v}
              />
            </div>
          ))}
          <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">{preview}</div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onConfirm(preview)}>Inserir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
