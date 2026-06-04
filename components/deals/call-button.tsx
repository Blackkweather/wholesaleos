"use client";

import * as React from "react";
import { toast } from "sonner";
import { Phone, Loader2, Voicemail, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useGenerateScript } from "@/lib/hooks/use-deals";
import { cn } from "@/lib/utils";

export interface CallTarget {
  id: string;
  address: string;
  ownerName?: string | null;
  ownerPhone?: string | null;
}

type Mode = "COLD_CALL" | "VOICEMAIL";

export function CallButton({
  deal,
  variant = "outline",
  size = "sm",
  label = "Call",
}: {
  deal: CallTarget;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<Mode>("COLD_CALL");
  const [script, setScript] = React.useState("");
  const gen = useGenerateScript();

  const load = (type: Mode) => {
    setMode(type);
    setScript("");
    gen.mutate(
      { id: deal.id, type },
      {
        onSuccess: setScript,
        onError: () => toast.error("Could not load script"),
      },
    );
  };

  if (!deal.ownerPhone) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={variant}
          size={size}
          onClick={() => {
            if (!script) load("COLD_CALL");
          }}
        >
          <Phone className="h-4 w-4" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Call {deal.ownerName ?? "the owner"}</DialogTitle>
        </DialogHeader>

        <Button asChild variant="brand" size="lg" className="w-full">
          <a href={`tel:${deal.ownerPhone}`}>
            <Phone className="h-4 w-4" /> Call {deal.ownerPhone}
          </a>
        </Button>

        <div className="flex gap-2">
          <Button
            variant={mode === "COLD_CALL" ? "secondary" : "ghost"}
            size="sm"
            className="flex-1"
            onClick={() => load("COLD_CALL")}
          >
            <Phone className="h-4 w-4" /> Call script
          </Button>
          <Button
            variant={mode === "VOICEMAIL" ? "secondary" : "ghost"}
            size="sm"
            className="flex-1"
            onClick={() => load("VOICEMAIL")}
          >
            <Voicemail className="h-4 w-4" /> Voicemail
          </Button>
        </div>

        <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-border bg-background p-4">
          {gen.isPending ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Writing your script…
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed">
              {script}
            </pre>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className={cn("self-start", gen.isPending && "opacity-50")}
          onClick={() => load(mode)}
          disabled={gen.isPending}
        >
          <RefreshCw className="h-4 w-4" /> Regenerate
        </Button>
      </DialogContent>
    </Dialog>
  );
}
