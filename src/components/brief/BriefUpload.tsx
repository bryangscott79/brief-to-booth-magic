import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, Copy, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/projectStore";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

export function BriefUpload() {
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [pasteText, setPasteText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const { createProject, setRawBrief, setParsedBrief, setActiveStep } = useProjectStore();
  const navigate = useNavigate();
  const { toast } = useToast();

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      // For now, we'll read text files directly
      // In production, we'd use a document parser service
      const text = await file.text();
      createProject(file.name.replace(/\.[^/.]+$/, ""));
      setRawBrief(text);
      
      // Simulate parsing (would call AI in production)
      await simulateParsing(text);
      
      toast({
        title: "Brief uploaded successfully",
        description: "Review the parsed data before generating elements.",
      });
      navigate("/review");
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "There was an error processing your file.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [createProject, setRawBrief, setParsedBrief, navigate, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "text/plain": [".txt"],
    },
    maxFiles: 1,
  });

  const handlePasteSubmit = async () => {
    if (!pasteText.trim()) return;
    
    setIsProcessing(true);
    try {
      createProject("Pasted Brief");
      setRawBrief(pasteText);
      await simulateParsing(pasteText);
      
      toast({
        title: "Brief processed successfully",
        description: "Review the parsed data before generating elements.",
      });
      navigate("/review");
    } catch (error) {
      toast({
        title: "Processing failed",
        description: "There was an error parsing your brief.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Simulate AI parsing (would be replaced with actual API call)
  const simulateParsing = async (text: string) => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Mock parsed data based on the NexusVault example
    const mockParsedBrief = {
      brand: {
        name: "NexusVault",
        category: "Enterprise Cybersecurity",
        pov: "Making the invisible visible",
        personality: ["intelligent", "sophisticated", "forward-thinking"],
        competitors: ["CrowdStrike", "Palo Alto", "Zscaler"],
        visualIdentity: {
          colors: ["deep blue", "silver", "amber accent"],
          avoidColors: ["dark fortress aesthetic", "matrix green"],
          avoidImagery: ["hooded hackers", "locks and shields", "dark caves"],
        },
      },
      objectives: {
        primary: "Position as intelligent, forward-thinking cybersecurity partner",
        secondary: [
          "Demonstrate situational awareness capabilities",
          "Create memorable experiences",
          "Drive qualified booth traffic",
        ],
        competitiveContext: "competitive bid",
        differentiationGoals: [
          "Light, intelligent space vs. dark fortress",
          "Participatory experience vs. passive demo",
        ],
      },
      events: {
        shows: [
          { name: "RSA Conference", location: "San Francisco", dates: "May 2025" },
          { name: "Black Hat", location: "Las Vegas", dates: "August 2025" },
        ],
        primaryShow: "RSA Conference",
      },
      spatial: {
        footprints: [
          { size: "30x30", sqft: 900, priority: "primary" as const },
          { size: "20x20", sqft: 400, priority: "secondary" as const },
        ],
        modular: true,
        reuseRequirement: "3+ shows per year",
        trafficRequirements: "High visibility from main aisles",
      },
      audiences: [
        {
          name: "CISOs/CTOs",
          description: "Senior security executives",
          priority: 1,
          characteristics: ["time-constrained", "decision-makers"],
          engagementNeeds: "High-level strategic conversations",
        },
        {
          name: "Security Architects",
          description: "Technical practitioners",
          priority: 2,
          characteristics: ["detail-oriented", "hands-on"],
          engagementNeeds: "Deep technical demonstrations",
        },
        {
          name: "Partners/Resellers",
          description: "Channel partners",
          priority: 3,
          characteristics: ["relationship-focused", "ROI-driven"],
          engagementNeeds: "Partner program information",
        },
      ],
      creative: {
        avoid: ["hooded hackers", "fortress metaphors", "fear-based messaging"],
        embrace: ["light", "intelligence", "systems thinking", "data visualization"],
        coreStrategy: "Make the invisible visible",
        thinkingFramework: ["systems thinking", "cause and effect"],
        designPhilosophy: "Sophisticated intelligence over dark fortress",
      },
      experience: {
        hero: {
          required: true,
          description: "Central interactive installation",
          attributes: ["participatory", "data-driven", "memorable"],
        },
        storytelling: {
          required: true,
          description: "Multi-track content for different audiences",
          audienceAdaptation: true,
        },
        humanConnection: {
          required: true,
          capacity: "2-6 people",
          integrationRequirement: "Integrated with overall experience",
        },
        adjacentActivations: {
          required: true,
          count: "1-2",
          criteria: ["exclusive feel", "thought leadership positioning"],
        },
      },
      budget: {
        perShow: 400000,
        range: { min: 350000, max: 450000 },
        inclusions: ["design", "fabrication", "A/V", "installation"],
        exclusions: ["shipping", "show services", "staffing"],
        efficiencyNotes: "Amortize across 3+ shows",
      },
      requiredDeliverables: [
        "Strategic narrative",
        "Experience framework",
        "Floor plans (30x30, 20x20)",
        "Render concepts",
        "Budget breakdown",
      ],
      winningCriteria: [
        "Think like experience architects",
        "Balance intelligence with accessibility",
        "Make something complex feel effortless",
      ],
    };
    
    setParsedBrief(mockParsedBrief);
    setActiveStep("review");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Mode Toggle */}
      <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit">
        <button
          onClick={() => setMode("upload")}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-colors",
            mode === "upload" 
              ? "bg-card text-foreground shadow-sm" 
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Upload className="inline-block h-4 w-4 mr-2" />
          Upload File
        </button>
        <button
          onClick={() => setMode("paste")}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-colors",
            mode === "paste" 
              ? "bg-card text-foreground shadow-sm" 
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Copy className="inline-block h-4 w-4 mr-2" />
          Paste Text
        </button>
      </div>

      {/* Upload Zone */}
      {mode === "upload" && (
        <div
          {...getRootProps()}
          className={cn(
            "upload-zone rounded-xl p-12 text-center cursor-pointer",
            isDragActive && "dragging",
            isProcessing && "pointer-events-none opacity-50"
          )}
        >
          <input {...getInputProps()} />
          {isProcessing ? (
            <div className="space-y-4">
              <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin" />
              <p className="text-lg font-medium">Processing brief...</p>
              <p className="text-sm text-muted-foreground">
                Extracting requirements and data
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="text-lg font-medium">
                  {isDragActive ? "Drop your brief here" : "Upload your brief"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Drag and drop or click to browse
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <span className="px-2 py-1 bg-muted rounded">PDF</span>
                <span className="px-2 py-1 bg-muted rounded">DOCX</span>
                <span className="px-2 py-1 bg-muted rounded">TXT</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Paste Zone */}
      {mode === "paste" && (
        <div className="space-y-4">
          <Textarea
            placeholder="Paste your brief text here..."
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            className="min-h-[300px] font-mono text-sm"
            disabled={isProcessing}
          />
          <Button 
            onClick={handlePasteSubmit}
            disabled={!pasteText.trim() || isProcessing}
            className="w-full btn-glow"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Process Brief
              </>
            )}
          </Button>
        </div>
      )}

      {/* Help Text */}
      <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
        <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
        <div className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1">What happens next?</p>
          <p>
            We'll parse your brief to extract brand information, objectives, 
            spatial requirements, and creative constraints. You can review and 
            edit all extracted data before generating response elements.
          </p>
        </div>
      </div>
    </div>
  );
}
