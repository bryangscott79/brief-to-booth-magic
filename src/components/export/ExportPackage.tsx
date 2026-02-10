import { useProjectStore, ELEMENT_META } from "@/store/projectStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Download, 
  FileText, 
  Folder,
  Check,
  Package
} from "lucide-react";
import { useProjectNavigate } from "@/hooks/useProjectNavigate";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import type { ElementType } from "@/types/brief";

const FILE_STRUCTURE = [
  {
    folder: "01_strategy",
    files: [
      { name: "big_idea.md", element: "bigIdea" as ElementType },
      { name: "experience_framework.md", element: "experienceFramework" as ElementType },
      { name: "interactive_mechanics.md", element: "interactiveMechanics" as ElementType },
      { name: "digital_storytelling.md", element: "digitalStorytelling" as ElementType },
      { name: "human_connection.md", element: "humanConnection" as ElementType },
      { name: "adjacent_activations.md", element: "adjacentActivations" as ElementType },
      { name: "budget_logic.md", element: "budgetLogic" as ElementType },
    ],
  },
  {
    folder: "02_spatial",
    files: [
      { name: "floor_plan_30x30.svg", element: "spatialStrategy" as ElementType },
      { name: "floor_plan_20x20.svg", element: "spatialStrategy" as ElementType },
      { name: "zone_data.json", element: "spatialStrategy" as ElementType },
      { name: "spatial_strategy.md", element: "spatialStrategy" as ElementType },
    ],
  },
  {
    folder: "03_prompts",
    files: [
      { name: "prompts_30x30.md", element: null },
      { name: "prompts_20x20.md", element: null },
      { name: "consistency_tokens.json", element: null },
    ],
  },
  {
    folder: "04_renders",
    files: [
      { name: "hero_34.png", element: null, placeholder: true },
      { name: "top.png", element: null, placeholder: true },
      { name: "front.png", element: null, placeholder: true },
    ],
  },
  {
    folder: "05_3d_ready",
    files: [
      { name: "rhino_import_guide.md", element: null },
      { name: "layer_structure.md", element: null },
      { name: "materials_spec.md", element: null },
    ],
  },
];

export function ExportPackage() {
  const { currentProject } = useProjectStore();
  const { navigate } = useProjectNavigate();
  const { toast } = useToast();
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(
    new Set(FILE_STRUCTURE.flatMap(f => f.files.map(file => `${f.folder}/${file.name}`)))
  );

  const brief = currentProject?.parsedBrief;
  const elements = currentProject?.elements;

  if (!brief || !elements) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No project data to export</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/upload")}>
          Start a New Project
        </Button>
      </div>
    );
  }

  const toggleFile = (path: string) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(path)) {
      newSelected.delete(path);
    } else {
      newSelected.add(path);
    }
    setSelectedFiles(newSelected);
  };

  const toggleFolder = (folder: string, files: typeof FILE_STRUCTURE[0]["files"]) => {
    const folderPaths = files.map(f => `${folder}/${f.name}`);
    const allSelected = folderPaths.every(p => selectedFiles.has(p));
    
    const newSelected = new Set(selectedFiles);
    if (allSelected) {
      folderPaths.forEach(p => newSelected.delete(p));
    } else {
      folderPaths.forEach(p => newSelected.add(p));
    }
    setSelectedFiles(newSelected);
  };

  const handleExport = () => {
    // In production, this would generate and download a ZIP file
    toast({
      title: "Export started",
      description: `Preparing ${selectedFiles.size} files for download...`,
    });
    
    // Simulate export
    setTimeout(() => {
      toast({
        title: "Export complete",
        description: "Your package has been downloaded.",
      });
    }, 1500);
  };

  const completedElements = Object.values(elements).filter(e => e.status === "complete").length;
  const totalElements = Object.keys(elements).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Export Package</h2>
          <p className="text-muted-foreground">
            Download your complete booth response package
          </p>
        </div>
        <Button onClick={handleExport} className="btn-glow">
          <Download className="mr-2 h-4 w-4" />
          Download Package
        </Button>
      </div>

      {/* Status Summary */}
      <Card className="element-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            Package Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-2xl font-semibold">{brief.brand.name}</div>
              <div className="text-sm text-muted-foreground">Project</div>
            </div>
            <div>
              <div className="text-2xl font-semibold">{completedElements}/{totalElements}</div>
              <div className="text-sm text-muted-foreground">Elements Complete</div>
            </div>
            <div>
              <div className="text-2xl font-semibold">{selectedFiles.size}</div>
              <div className="text-sm text-muted-foreground">Files Selected</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* File Selection */}
      <div className="space-y-4">
        {FILE_STRUCTURE.map((folder) => {
          const folderPaths = folder.files.map(f => `${folder.folder}/${f.name}`);
          const selectedCount = folderPaths.filter(p => selectedFiles.has(p)).length;
          const allSelected = selectedCount === folder.files.length;
          
          return (
            <Card key={folder.folder} className="element-card">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={() => toggleFolder(folder.folder, folder.files)}
                    />
                    <div className="flex items-center gap-2">
                      <Folder className="h-4 w-4 text-primary" />
                      <CardTitle className="text-base">{folder.folder}</CardTitle>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {selectedCount}/{folder.files.length} selected
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 md:grid-cols-2">
                  {folder.files.map((file) => {
                    const path = `${folder.folder}/${file.name}`;
                    const isSelected = selectedFiles.has(path);
                    const isComplete = file.element 
                      ? elements[file.element]?.status === "complete"
                      : !file.placeholder;
                    
                    return (
                      <div
                        key={file.name}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleFile(path)}
                        />
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm flex-1">{file.name}</span>
                        {file.placeholder ? (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            Upload
                          </Badge>
                        ) : isComplete ? (
                          <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Badge variant="outline" className="text-xs text-primary">
                            Pending
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Export Options */}
      <Card className="element-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Export Format</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1">
              ZIP Archive
            </Button>
            <Button variant="ghost" className="flex-1" disabled>
              PDF Report (Coming Soon)
            </Button>
            <Button variant="ghost" className="flex-1" disabled>
              Google Drive (Coming Soon)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
