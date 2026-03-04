import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  FileText,
  Loader2,
  Presentation,
  Settings2,
  Building2,
  Image,
  Sparkles,
  Check,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import { Link } from "react-router-dom";
import {
  generateProposalPDF,
  generateProposalPPTX,
  type ProposalConfig,
  type ProposalData,
} from "@/lib/proposalGenerator";
import {
  getClearbitLogoUrl,
  extractDomain,
  checkClearbitLogo,
} from "@/lib/logoUtils";

interface ProposalExportProps {
  brief: any;
  elements: any;
  images: Array<{ angle_name: string; public_url: string; angle_id: string; is_current: boolean }>;
  projectName: string;
}

export function ProposalExport({ brief, elements, images, projectName }: ProposalExportProps) {
  const { toast } = useToast();
  const { profile } = useCompanyProfile();
  
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isGeneratingPPTX, setIsGeneratingPPTX] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // Client logo state
  const [clientLogo, setClientLogo] = useState<string | null>(null);
  const [clientLogoLoading, setClientLogoLoading] = useState(false);
  const [, setClientLogoError] = useState(false);
  
  // Auto-fetch client logo on mount
  useEffect(() => {
    const fetchClientLogo = async () => {
      if (!brief?.brand) return;
      
      setClientLogoLoading(true);
      setClientLogoError(false);
      
      // Try to get logo from website domain
      const website = brief.brand.website || brief.brand.url;
      if (website) {
        const domain = extractDomain(website);
        if (domain) {
          const exists = await checkClearbitLogo(domain);
          if (exists) {
            setClientLogo(getClearbitLogoUrl(domain, 256));
            setClientLogoLoading(false);
            return;
          }
        }
      }
      
      // Try from company name
      const companyName = brief.brand.name;
      if (companyName) {
        const cleanName = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const extensions = ['.com', '.io', '.co'];
        
        for (const ext of extensions) {
          const exists = await checkClearbitLogo(cleanName + ext);
          if (exists) {
            setClientLogo(getClearbitLogoUrl(cleanName + ext, 256));
            setClientLogoLoading(false);
            return;
          }
        }
      }
      
      setClientLogoError(true);
      setClientLogoLoading(false);
    };
    
    fetchClientLogo();
  }, [brief?.brand]);
  
  // Check if company profile is set up
  const hasCompanyProfile = profile?.company_name && profile?.logo_url;
  
  // Build proposal config
  const buildProposalConfig = (): ProposalConfig => {
    return {
      clientLogo,
      exhibitHouseLogo: profile?.logo_url || null,
      exhibitHouseName: profile?.company_name || 'Your Company',
      exhibitHouseTagline: profile?.tagline || undefined,
      brandColor: profile?.brand_color || '#0047AB',
      secondaryColor: profile?.secondary_color || '#4682B4',
      contactInfo: profile?.contact_name ? {
        name: profile.contact_name,
        email: profile.contact_email || '',
        phone: profile.contact_phone || '',
      } : undefined,
    };
  };
  
  // Build proposal data
  const buildProposalData = (): ProposalData => {
    const currentImages = images.filter(img => img.is_current);
    return {
      brief,
      elements,
      images: currentImages,
      config: buildProposalConfig(),
    };
  };
  
  const handleGeneratePDF = async () => {
    setIsGeneratingPDF(true);
    try {
      const proposalData = buildProposalData();
      const pdfBlob = await generateProposalPDF(proposalData);
      
      // Download the PDF
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${brief.brand?.name || projectName}_Proposal.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Proposal PDF Generated",
        description: "Your proposal has been downloaded",
      });
    } catch (error) {
      console.error('PDF generation error:', error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPDF(false);
    }
  };
  
  const handleGeneratePPTX = async () => {
    setIsGeneratingPPTX(true);
    try {
      const proposalData = buildProposalData();
      const pptxBlob = await generateProposalPPTX(proposalData);
      
      // Download the PPTX
      const url = URL.createObjectURL(pptxBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${brief.brand?.name || projectName}_Proposal.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Proposal PPTX Generated",
        description: "Your PowerPoint proposal has been downloaded",
      });
    } catch (error) {
      console.error('PPTX generation error:', error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPPTX(false);
    }
  };
  
  const currentImageCount = images.filter(img => img.is_current).length;
  const completedElements = Object.values(elements).filter((e: any) => e.status === 'complete').length;
  
  return (
    <Card className="element-card border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Client Proposal
              <Badge className="bg-primary/20 text-primary text-xs">New</Badge>
            </CardTitle>
            <CardDescription className="mt-1">
              Generate a polished proposal document with all project elements
            </CardDescription>
          </div>
          <Dialog open={showSettings} onOpenChange={setShowSettings}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings2 className="h-4 w-4 mr-1" />
                Settings
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Proposal Settings</DialogTitle>
                <DialogDescription>
                  Configure branding and logos for your proposal
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                {/* Company Profile Status */}
                <div className="p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Your Company Branding
                    </Label>
                    {hasCompanyProfile ? (
                      <Badge variant="secondary" className="text-xs">
                        <Check className="h-3 w-3 mr-1" />
                        Configured
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-amber-600">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Not Set
                      </Badge>
                    )}
                  </div>
                  
                  {hasCompanyProfile ? (
                    <div className="flex items-center gap-3">
                      {profile?.logo_url && (
                        <img 
                          src={profile.logo_url} 
                          alt="Company logo" 
                          className="h-8 max-w-[100px] object-contain"
                        />
                      )}
                      <span className="text-sm">{profile?.company_name}</span>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      <p className="mb-2">Set up your company profile to include your logo and branding in proposals.</p>
                      <Link to="/company">
                        <Button variant="outline" size="sm">
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Go to Company Settings
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
                
                {/* Client Logo Status */}
                <div className="p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="flex items-center gap-2">
                      <Image className="h-4 w-4" />
                      Client Logo
                    </Label>
                    {clientLogoLoading ? (
                      <Badge variant="secondary" className="text-xs">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Loading
                      </Badge>
                    ) : clientLogo ? (
                      <Badge variant="secondary" className="text-xs">
                        <Check className="h-3 w-3 mr-1" />
                        Auto-fetched
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-amber-600">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Not Found
                      </Badge>
                    )}
                  </div>
                  
                  {clientLogo ? (
                    <div className="flex items-center gap-3">
                      <img 
                        src={clientLogo} 
                        alt="Client logo" 
                        className="h-8 max-w-[100px] object-contain bg-white rounded p-1"
                      />
                      <span className="text-sm text-muted-foreground">
                        via Clearbit
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Logo couldn't be auto-detected. You can add the client's website to their brief.
                      </p>
                      <Input
                        placeholder="Enter client website (e.g., samsung.com)"
                        onChange={async (e) => {
                          const domain = extractDomain(e.target.value);
                          if (domain) {
                            const exists = await checkClearbitLogo(domain);
                            if (exists) {
                              setClientLogo(getClearbitLogoUrl(domain, 256));
                              setClientLogoError(false);
                            }
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
              
              <DialogFooter>
                <Button onClick={() => setShowSettings(false)}>Done</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Status indicators */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="text-lg font-semibold">{completedElements}</div>
            <div className="text-xs text-muted-foreground">Elements</div>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="text-lg font-semibold">{currentImageCount}</div>
            <div className="text-xs text-muted-foreground">Renders</div>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="flex items-center justify-center gap-1">
              {hasCompanyProfile ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-500" />
              )}
            </div>
            <div className="text-xs text-muted-foreground">Branding</div>
          </div>
        </div>
        
        {/* Proposal preview structure */}
        <div className="p-3 rounded-lg border bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground mb-2">Proposal Includes:</p>
          <div className="grid grid-cols-2 gap-1 text-xs">
            <span>✓ Cover Page</span>
            <span>✓ Executive Summary</span>
            <span>✓ Design Vision</span>
            <span>✓ Spatial Design</span>
            <span>✓ Interactive Experience</span>
            <span>✓ Rendered Views</span>
            <span>✓ Investment Summary</span>
            <span>✓ Next Steps</span>
          </div>
        </div>
        
        {/* Export buttons */}
        <div className="flex gap-3">
          <Button 
            onClick={handleGeneratePDF}
            disabled={isGeneratingPDF || isGeneratingPPTX}
            className="flex-1"
            variant="outline"
          >
            {isGeneratingPDF ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4 mr-2" />
                Download PDF
              </>
            )}
          </Button>
          
          <Button 
            onClick={handleGeneratePPTX}
            disabled={isGeneratingPDF || isGeneratingPPTX}
            className="flex-1 btn-glow"
          >
            {isGeneratingPPTX ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Presentation className="h-4 w-4 mr-2" />
                Download PPTX
              </>
            )}
          </Button>
        </div>
        
        {!hasCompanyProfile && (
          <p className="text-xs text-center text-muted-foreground">
            <Link to="/company" className="text-primary hover:underline">
              Add your company branding
            </Link>
            {" "}for a more polished proposal
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default ProposalExport;
