import React from "react";
import { 
  Lightbulb, 
  Compass, 
  Layers, 
  CheckCircle2, 
  TrendingUp,
  Zap
} from "lucide-react";
import { ProjectPhase } from "../types/project";

interface StepperProps {
  currentPhase: ProjectPhase;
  onChangePhase: (phase: ProjectPhase) => void;
}

interface StepConfig {
  id: ProjectPhase;
  number: number;
  label: string;
  desc: string;
  icon: React.ReactNode;
}

export default function Stepper({ currentPhase, onChangePhase }: StepperProps) {
  const steps: StepConfig[] = [
    {
      id: "ideation",
      number: 1,
      label: "Idéation",
      desc: "Notes & Clarification",
      icon: <Lightbulb className="w-4 h-4" />
    },
    {
      id: "benchmark",
      number: 2,
      label: "Benchmark & Faisabilité",
      desc: "Études & Budgets",
      icon: <Compass className="w-4 h-4" />
    },
    {
      id: "canvas",
      number: 3,
      label: "Canvas & Pivots",
      desc: "BMC & Analyses VC",
      icon: <Layers className="w-4 h-4" />
    },
    {
      id: "mvp",
      number: 4,
      label: "Exécution MVP",
      desc: "Priorités & Code",
      icon: <Zap className="w-4 h-4" />
    }
  ];

  const getStepIndex = (phase: ProjectPhase) => {
    return steps.findIndex(s => s.id === phase);
  };

  const currentIndex = getStepIndex(currentPhase);

  return (
    <div className="bg-white border border-slate-200/80 shadow-xs p-4 rounded-2xl w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 md:gap-4">
        
        {steps.map((step, idx) => {
          const isCompleted = idx < currentIndex;
          const isActive = idx === currentIndex;
          const isPending = idx > currentIndex;

          // Compute state colors
          let stepCircleStyle = "border-slate-200 bg-white text-slate-400";
          let labelStyle = "text-slate-400";
          let descStyle = "text-slate-400";

          if (isActive) {
            stepCircleStyle = "border-indigo-600 bg-indigo-50 text-indigo-600 ring-4 ring-indigo-500/10 font-black";
            labelStyle = "text-slate-900 font-extrabold";
            descStyle = "text-indigo-600 font-semibold";
          } else if (isCompleted) {
            stepCircleStyle = "border-emerald-600 bg-emerald-50 text-emerald-600 font-bold";
            labelStyle = "text-slate-700 font-bold";
            descStyle = "text-emerald-600 font-medium";
          }

          return (
            <React.Fragment key={step.id}>
              {/* Individual Step Element */}
              <button
                type="button"
                onClick={() => onChangePhase(step.id)}
                className="flex items-center text-left gap-3.5 focus:outline-hidden group cursor-pointer transition-all flex-1 min-w-0"
              >
                <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${stepCircleStyle}`}>
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : (
                    step.icon
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">
                      Étape {step.number}
                    </span>
                    {isCompleted && (
                      <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-100/60 px-1 py-0.2 rounded font-mono font-bold uppercase">
                        OK
                      </span>
                    )}
                  </div>
                  <p className={`text-xs truncate ${labelStyle}`}>
                    {step.label}
                  </p>
                  <p className={`text-[10px] truncate ${descStyle}`}>
                    {step.desc}
                  </p>
                </div>
              </button>

              {/* Connecting line between steps */}
              {idx < steps.length - 1 && (
                <div className="hidden md:block w-8 h-0.5 bg-slate-100 grow shrink-0 mx-2" />
              )}
            </React.Fragment>
          );
        })}

      </div>
    </div>
  );
}
