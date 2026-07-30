import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { REPORT_REASONS, useReportUser, type ReportReason } from '@/hooks/useModeration';

export default function ReportUserDialog({
  open,
  onOpenChange,
  reportedUserId,
  reportedName,
  messageId = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportedUserId: string;
  reportedName: string;
  messageId?: string | null;
}) {
  const [reason, setReason] = useState<ReportReason>('spam');
  const [details, setDetails] = useState('');
  const report = useReportUser();

  const handleSubmit = () => {
    report.mutate(
      { reportedUserId, reason, details, messageId },
      {
        onSuccess: () => {
          toast.success('Denúncia enviada', {
            description: 'Vamos analisar. Obrigado por avisar.',
          });
          setDetails('');
          setReason('spam');
          onOpenChange(false);
        },
        onError: (e: any) => toast.error(e.message || 'Não foi possível enviar a denúncia'),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Denunciar {reportedName}</DialogTitle>
          <DialogDescription>
            Conte o que aconteceu. A denúncia é anônima — a pessoa denunciada não é avisada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Motivo</Label>
            <RadioGroup value={reason} onValueChange={(v) => setReason(v as ReportReason)}>
              {REPORT_REASONS.map((r) => (
                <div key={r.value} className="flex items-center gap-2">
                  <RadioGroupItem value={r.value} id={`reason-${r.value}`} />
                  <Label htmlFor={`reason-${r.value}`} className="text-sm font-normal cursor-pointer">
                    {r.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="report-details" className="text-xs text-muted-foreground">
              Detalhes (opcional)
            </Label>
            <Textarea
              id="report-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="O que aconteceu?"
            />
            <p className="text-[10px] text-muted-foreground text-right">{details.length}/1000</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={report.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={report.isPending}>
            {report.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar denúncia'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
