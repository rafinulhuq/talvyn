"use client";

import { FileDown, Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ReportActionsProps {
  triggering: boolean;
  onPrint: () => void;
  onExportDocx: () => void;
  onReevaluate: () => void;
}

export function ReportActions({
  triggering,
  onPrint,
  onExportDocx,
  onReevaluate,
}: ReportActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Button
        variant="secondary"
        size="sm"
        onClick={onPrint}
        leftIcon={<Printer className="h-3.5 w-3.5" />}
      >
        Print / PDF
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={onExportDocx}
        leftIcon={<FileDown className="h-3.5 w-3.5" />}
      >
        Export DOCX
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={onReevaluate}
        loading={triggering}
        leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
      >
        Re-evaluate
      </Button>
    </div>
  );
}
