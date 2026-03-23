import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Sparkles,
  Coffee,
  Monitor,
  Tent,
  MessageSquare,
  Layers,
} from "lucide-react";
import type { ProjectSummary } from "@/types/brief";

interface SuiteOverviewProps {
  parentId: string;
  children: ProjectSummary[];
  onAddActivation: () => void;
}

const STATUS_DOTS: Record<string, string> = {
  draft: "bg-muted-foreground/40",
  parsing: "bg-yellow-500",
  reviewed: "bg-blue-500",
  generating: "bg-purple-500",
  completed: "bg-green-500",
};

// Map activation type slugs to icons
const ACTIVATION_ICONS: Record<string, React.ElementType> = {
  vip_lounge: Coffee,
  demo_station: Monitor,
  meeting_room: MessageSquare,
  outdoor_activation: Tent,
  digital_experience: Sparkles,
};

function getActivationIcon(activationType: string | null): React.ElementType {
  if (!activationType) return Layers;
  return ACTIVATION_ICONS[activationType] ?? Layers;
}

function formatScale(scale: string | null): string {
  if (!scale) return "";
  return scale.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SuiteOverview({ children, onAddActivation }: SuiteOverviewProps) {
  const navigate = useNavigate();

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {children.map((child) => {
        const Icon = getActivationIcon(child.activationType);
        const dotColor = STATUS_DOTS[child.status] ?? STATUS_DOTS.draft;

        return (
          <Card
            key={child.id}
            className="element-card cursor-pointer transition-colors hover:border-primary/30"
            onClick={() => navigate(`/review?project=${child.id}`)}
          >
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-4.5 w-4.5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold truncate">{child.name}</h3>
                    <span className={`h-2 w-2 rounded-full shrink-0 ${dotColor}`} />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {child.activationType && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {child.activationType.replace(/_/g, " ")}
                      </Badge>
                    )}
                    {child.scaleClassification && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {formatScale(child.scaleClassification)}
                      </Badge>
                    )}
                  </div>

                  {child.footprintSqft && (
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {child.footprintSqft.toLocaleString()} sqft
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Add Activation card */}
      <Card
        className="cursor-pointer border-dashed border-2 hover:border-primary/40 hover:bg-muted/30 transition-colors"
        onClick={onAddActivation}
      >
        <CardContent className="pt-5 pb-4 flex flex-col items-center justify-center min-h-[100px]">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <Plus className="h-4 w-4 text-muted-foreground" />
          </div>
          <span className="text-sm text-muted-foreground mt-2">Add Activation</span>
        </CardContent>
      </Card>
    </div>
  );
}
