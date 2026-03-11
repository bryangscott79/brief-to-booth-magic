import { cn } from "@/lib/utils";
import { ALL_PROJECT_TYPES, type ProjectTypeId } from "@/lib/projectTypes";
import { CheckCircle2 } from "lucide-react";

interface ProjectTypeSelectorProps {
  selected: ProjectTypeId | null;
  onSelect: (id: ProjectTypeId) => void;
}

export function ProjectTypeSelector({ selected, onSelect }: ProjectTypeSelectorProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">What are you designing?</h2>
        <p className="text-muted-foreground text-sm">
          Select a project type to unlock tailored AI strategy, spatial tools, and cost frameworks.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ALL_PROJECT_TYPES.map((type) => {
          const isSelected = selected === type.id;
          return (
            <button
              key={type.id}
              onClick={() => onSelect(type.id)}
              className={cn(
                "relative text-left rounded-2xl border-2 p-5 transition-all duration-200 group",
                "hover:-translate-y-0.5 hover:shadow-lg",
                isSelected
                  ? "border-primary bg-primary/8 shadow-[0_0_20px_hsl(var(--primary)/0.15)]"
                  : "border-border bg-card hover:border-primary/40"
              )}
            >
              {/* Selected check */}
              {isSelected && (
                <div className="absolute top-3 right-3">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                </div>
              )}

              {/* Accent bar */}
              <div
                className="absolute top-0 left-5 right-5 h-0.5 rounded-b-full opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ backgroundColor: type.accentColor, ...(isSelected ? { opacity: 1 } : {}) }}
              />

              <div className="flex items-start gap-3 mb-3">
                <span className="text-2xl leading-none mt-0.5">{type.icon}</span>
                <div className="min-w-0">
                  <div className="font-bold text-sm leading-tight">{type.label}</div>
                  <div
                    className="text-[10px] font-semibold uppercase tracking-wider mt-0.5 opacity-70"
                    style={{ color: type.accentColor }}
                  >
                    {type.elements.length} strategic elements
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                {type.description}
              </p>
            </button>
          );
        })}
      </div>

      {selected && (
        <div
          className="rounded-xl border px-5 py-4 text-sm animate-fade-in"
          style={{ borderColor: `${ALL_PROJECT_TYPES.find(t => t.id === selected)?.accentColor}40` }}
        >
          <span className="font-semibold text-foreground">
            {ALL_PROJECT_TYPES.find(t => t.id === selected)?.label}:
          </span>{" "}
          <span className="text-muted-foreground">
            {ALL_PROJECT_TYPES.find(t => t.id === selected)?.tagline}
          </span>
        </div>
      )}
    </div>
  );
}
