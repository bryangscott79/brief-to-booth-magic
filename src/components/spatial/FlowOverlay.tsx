import { cn } from "@/lib/utils";

interface FlowPath {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  intensity: number; // 0-1
  curved?: boolean;
}

interface FlowOverlayProps {
  paths: FlowPath[];
  showHeatmap?: boolean;
  zones: any[];
}

export function FlowOverlay({ paths, showHeatmap = false, zones }: FlowOverlayProps) {
  return (
    <svg 
      className="absolute inset-0 pointer-events-none" 
      style={{ width: '100%', height: '100%' }}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <defs>
        {/* Arrow marker */}
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon 
            points="0 0, 10 3.5, 0 7" 
            className="fill-primary/60"
          />
        </marker>
        
        {/* Gradient for flow lines */}
        <linearGradient id="flowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
          <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity="0.6" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
        </linearGradient>
        
        {/* Heat map gradient */}
        <radialGradient id="heatGradient">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.4" />
          <stop offset="70%" stopColor="hsl(var(--primary))" stopOpacity="0.1" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </radialGradient>
      </defs>
      
      {/* Heat zones */}
      {showHeatmap && zones.map((zone) => (
        <ellipse
          key={`heat-${zone.id}`}
          cx={zone.position.x + zone.position.width / 2}
          cy={zone.position.y + zone.position.height / 2}
          rx={zone.position.width * 0.6}
          ry={zone.position.height * 0.6}
          fill="url(#heatGradient)"
          className="animate-pulse"
          style={{ animationDuration: '3s' }}
        />
      ))}
      
      {/* Flow paths */}
      {paths.map((path) => {
        const midX = (path.from.x + path.to.x) / 2;
        const midY = (path.from.y + path.to.y) / 2 - (path.curved ? 15 : 0);
        
        const d = path.curved
          ? `M ${path.from.x} ${path.from.y} Q ${midX} ${midY} ${path.to.x} ${path.to.y}`
          : `M ${path.from.x} ${path.from.y} L ${path.to.x} ${path.to.y}`;
        
        return (
          <g key={path.id}>
            {/* Glow effect */}
            <path
              d={d}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth={3 * path.intensity}
              strokeOpacity={0.2}
              strokeLinecap="round"
            />
            {/* Main path */}
            <path
              d={d}
              fill="none"
              stroke="url(#flowGradient)"
              strokeWidth={1.5 * path.intensity}
              strokeLinecap="round"
              strokeDasharray="4 2"
              markerEnd="url(#arrowhead)"
              className="animate-flow"
            />
          </g>
        );
      })}
      
      {/* Entry point indicator */}
      <g transform="translate(50, 95)">
        <circle r="3" className="fill-primary/40" />
        <circle r="1.5" className="fill-primary" />
        <text 
          y="8" 
          textAnchor="middle" 
          className="fill-muted-foreground text-[3px]"
        >
          Entry
        </text>
      </g>
    </svg>
  );
}

// Generate flow paths based on zone layout
export function generateFlowPaths(zones: any[]): FlowPath[] {
  const paths: FlowPath[] = [];
  const entry = { x: 50, y: 92 };
  
  // Find zones by type
  const hero = zones.find(z => z.id === 'hero');
  const reception = zones.find(z => z.id === 'reception');
  const lounge = zones.find(z => z.id === 'lounge');
  const demo = zones.find(z => z.id === 'demo');
  const storytelling = zones.find(z => z.id === 'storytelling');
  
  // Entry to reception (primary path)
  if (reception) {
    const recCenter = {
      x: reception.position.x + reception.position.width / 2,
      y: reception.position.y + reception.position.height / 2,
    };
    paths.push({
      id: 'entry-reception',
      from: entry,
      to: recCenter,
      intensity: 1,
    });
    
    // Reception to hero
    if (hero) {
      const heroCenter = {
        x: hero.position.x + hero.position.width / 2,
        y: hero.position.y + hero.position.height / 2,
      };
      paths.push({
        id: 'reception-hero',
        from: recCenter,
        to: heroCenter,
        intensity: 0.85,
        curved: true,
      });
    }
  }
  
  // Hero to other zones
  if (hero) {
    const heroCenter = {
      x: hero.position.x + hero.position.width / 2,
      y: hero.position.y + hero.position.height / 2,
    };
    
    if (storytelling) {
      const storyCenter = {
        x: storytelling.position.x + storytelling.position.width / 2,
        y: storytelling.position.y + storytelling.position.height / 2,
      };
      paths.push({
        id: 'hero-storytelling',
        from: heroCenter,
        to: storyCenter,
        intensity: 0.7,
      });
    }
    
    if (lounge) {
      const loungeCenter = {
        x: lounge.position.x + lounge.position.width / 2,
        y: lounge.position.y + lounge.position.height / 2,
      };
      paths.push({
        id: 'hero-lounge',
        from: heroCenter,
        to: loungeCenter,
        intensity: 0.6,
        curved: true,
      });
    }
    
    if (demo) {
      const demoCenter = {
        x: demo.position.x + demo.position.width / 2,
        y: demo.position.y + demo.position.height / 2,
      };
      paths.push({
        id: 'hero-demo',
        from: heroCenter,
        to: demoCenter,
        intensity: 0.5,
      });
    }
  }
  
  return paths;
}
