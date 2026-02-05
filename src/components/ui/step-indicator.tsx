import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface Step {
  id: string;
  label: string;
  description?: string;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: string;
  completedSteps: string[];
  onStepClick?: (stepId: string) => void;
}

export function StepIndicator({ 
  steps, 
  currentStep, 
  completedSteps,
  onStepClick 
}: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      {steps.map((step, index) => {
        const isCompleted = completedSteps.includes(step.id);
        const isCurrent = currentStep === step.id;
        const isClickable = onStepClick && (isCompleted || isCurrent);

        return (
          <div key={step.id} className="flex items-center">
            <button
              onClick={() => isClickable && onStepClick?.(step.id)}
              disabled={!isClickable}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                isCompleted && "bg-status-complete/10 text-status-complete",
                isCurrent && !isCompleted && "bg-primary/10 text-primary",
                !isCompleted && !isCurrent && "bg-muted text-muted-foreground",
                isClickable && "cursor-pointer hover:opacity-80"
              )}
            >
              <span className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full text-xs",
                isCompleted && "bg-status-complete text-white",
                isCurrent && !isCompleted && "bg-primary text-primary-foreground",
                !isCompleted && !isCurrent && "bg-muted-foreground/30 text-muted-foreground"
              )}>
                {isCompleted ? (
                  <Check className="h-3 w-3" />
                ) : (
                  index + 1
                )}
              </span>
              <span className="hidden sm:inline">{step.label}</span>
            </button>
            
            {index < steps.length - 1 && (
              <div className={cn(
                "w-8 h-0.5 mx-1",
                completedSteps.includes(steps[index + 1].id) || currentStep === steps[index + 1].id
                  ? "bg-primary/30"
                  : "bg-border"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}
