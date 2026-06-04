import { Badge } from "@/components/ui/badge";
import { STAGE_META, type StageKey } from "@/constants/config";

export function StageBadge({ stage }: { stage: StageKey | string }) {
  const meta = STAGE_META[stage as StageKey] ?? STAGE_META.FOUND;
  return <Badge variant={meta.token}>{meta.label}</Badge>;
}
