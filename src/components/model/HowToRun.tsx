// HowToRun — the plain-English "what do I do with this file" block for the
// Model step. Two routes (Blender app, terminal) plus what to expect when the
// script finishes. Pure presentation.

import { SectionLabel, SpecMono } from "@/components/shell";

interface HowToRunProps {
  scriptFilename: string;
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] bg-navy font-mono text-[10px] font-bold text-white">
        {n}
      </span>
      <span className="text-[13px] leading-[19px] text-charcoal">{children}</span>
    </li>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-[4px] bg-cloud px-1.5 py-0.5 font-mono text-[12px] text-navy">
      {children}
    </code>
  );
}

export function HowToRun({ scriptFilename }: HowToRunProps) {
  return (
    <section className="rounded-square border border-cloud-line bg-cloud/40 p-5">
      <SectionLabel accent="blue">How to use this</SectionLabel>

      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div>
          <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate">
            In Blender
          </p>
          <ol className="space-y-2.5">
            <Step n={1}>
              Open Blender and switch to the <strong className="font-semibold">Scripting</strong>{" "}
              tab along the top.
            </Step>
            <Step n={2}>
              Click <strong className="font-semibold">Open</strong> in the text editor and pick the
              downloaded <SpecMono className="text-[12px]">{scriptFilename}</SpecMono>.
            </Step>
            <Step n={3}>
              Press <strong className="font-semibold">Run Script</strong> (or <Code>Alt+P</Code>),
              then switch to the Layout tab to see the booth.
            </Step>
          </ol>
        </div>

        <div>
          <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate">
            From a terminal
          </p>
          <div className="space-y-2">
            <div>
              <Code>blender -P {scriptFilename}</Code>
              <p className="mt-1 text-[12px] leading-[17px] text-slate">
                Opens Blender with the booth already built.
              </p>
            </div>
            <div>
              <Code>blender -b -P {scriptFilename}</Code>
              <p className="mt-1 text-[12px] leading-[17px] text-slate">
                Headless. Set <Code>CANOPY_OUT_DIR</Code> first and it also saves{" "}
                <SpecMono className="text-[12px]">booth.blend</SpecMono>, exports{" "}
                <SpecMono className="text-[12px]">booth.glb</SpecMono>, and renders a still from
                each camera.
              </p>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-5 border-t border-cloud-line pt-4 text-[12px] leading-[18px] text-slate">
        Re-running the script is safe: it deletes its own{" "}
        <SpecMono className="text-[12px]">CANOPY_Booth</SpecMono> collection and rebuilds it, so
        iterating on the layout never stacks duplicate geometry. Anything you added yourself —
        cameras, lighting, props — survives untouched. The{" "}
        <SpecMono className="text-[12px]">.gltf</SpecMono> download needs no software at all: drop
        it into any 3D viewer, Figma, Spline, or a client's browser.
      </p>
    </section>
  );
}
