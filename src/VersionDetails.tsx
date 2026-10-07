import React, { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { 
  Briefcase, 
  Sparkles, 
  AlertTriangle, 
  Target, 
  Gauge, 
  HelpCircle, 
  Edit3, 
  RotateCw, 
  Check,
  RefreshCw,
  X,
  Compass,
  Star,
  CheckCircle,
  Activity,
  ArrowRight
} from "lucide-react";
import { BMC, Version } from "./ProjectEditor";
import InteractiveCanvas from "./InteractiveCanvas";
import PreQualificationWidget from "./PreQualificationWidget";
import SolopreneurViabilityTab from "./components/SolopreneurViabilityTab";
import InvestorDealMemo from "./components/InvestorDealMemo";

interface VersionDetailsProps {
  userId: string;
  projectId: string;
  version: Version;
  priorVersionAnalysis?: any | null; // Optional: context for pivots
  onEnrichStart?: () => void;
  onEnrichSuccess?: () => void;
  onEnrichError?: (error: string) => void;
  onStartEdit?: () => void;
  onStartPivot?: () => void;
  projectStatus?: 'active' | 'sleeping' | 'abandoned';
  onStatusChange?: (newStatus: 'active' | 'sleeping' | 'abandoned') => void;
  currentPhase?: 'ideation' | 'benchmark' | 'canvas' | 'mvp';
}

// Help details for each rating metric
const metricDescriptions: { [key: string]: { title: string; desc: string } } = {
  pain_desirability: {
    title: "Désirabilité / Intensité du Problème",
    desc: "Évalue si la douleur du client est profonde, urgente et s'ils recherchent activement une solution pour laquelle ils sont prêts à payer cher."
  },
  timing_why_now: {
    title: "Timing / Pourquoi Maintenant ?",
    desc: "Analyse si les barrières technologiques, les changements de réglementation ou les nouvelles tendances sociétales favorisent le lancement idéal de cette solution aujourd'hui."
  },
  market_size_potential: {
    title: "Taille & Potentiel du Marché",
    desc: "Estime la taille globale du marché adressable (TAM/SAM/SOM) et le potentiel d'expansion géographique, de up-selling ou de diversification."
  },
  defensibility_moat: {
    title: "Défendabilité (Moat)",
    desc: "Capacité à résister aux assauts des concurrents (effets de réseau, technologie brevetée, coûts de changement élevés pour le client, ou partenariats exclusifs)."
  },
  execution_simplicity: {
    title: "Simplicité d'Exécution",
    desc: "Difficulté de mise en œuvre initiale. Un score élevé signifie peu de complexité technique, pas de barrières réglementaires insurmontables et un time-to-market rapide."
  },
  economic_viability: {
    title: "Viabilité Économique",
    desc: "Clarté et marges du business model. Analyse la récurrence des revenus, le rapport coût d'acquisition client (CAC) sur valeur de vie client (LTV) et la structure de coûts."
  }
};

const categoryLabels: { [key: string]: string } = {
  problem: "Problème",
  solution: "Solution",
  customer_segments: "Segments de clients",
  value_props: "Proposition de valeur",
  channels: "Canaux",
  revenue: "Sources de revenus",
  costs: "Structure des coûts",
  partners: "Partenaires / Indicateurs"
};

export default function VersionDetails({
  userId,
  projectId,
  version,
  priorVersionAnalysis = null,
  onEnrichStart,
  onEnrichSuccess,
  onEnrichError,
  onStartEdit,
  onStartPivot,
  projectStatus,
  onStatusChange,
  currentPhase = 'benchmark'
}: VersionDetailsProps) {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'lean' | 'market' | 'solopreneur' | 'mvp'>('market');
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [validationLoading, setValidationLoading] = useState(false);
  const [marketLoading, setMarketLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Synchronize active tab based on project pipeline stage
  React.useEffect(() => {
    if (currentPhase === 'benchmark') {
      setActiveTab('market');
    } else if (currentPhase === 'canvas') {
      setActiveTab('lean');
    } else if (currentPhase === 'mvp') {
      setActiveTab('mvp');
    }
  }, [currentPhase]);

  // Trigger Gemini VC analysis enrichment
  const handleRunAIEnrichment = async () => {
    if (enrichLoading || validationLoading) return;
    setEnrichLoading(true);
    setLocalError(null);
    if (onEnrichStart) onEnrichStart();

    const docRef = doc(db, "projects", projectId, "versions", version.id);

    try {
      await updateDoc(docRef, {
        aiAnalysisStatus: 'pending',
        aiErrorMessage: null
      });

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userInput: version.userInput,
          pivotReason: version.pivotReason || null,
          previousAnalysis: priorVersionAnalysis || null
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Une erreur s'est produite lors de l'appel de l'API IA.");
      }

      const geminiData = await res.json();

      // Help mapper
      const ensureItems = (arr: any[]) => {
        return (arr || []).map((txt, idx) => ({
          id: `item_${idx}_` + Math.random().toString(36).substring(2, 7),
          text: typeof txt === "string" ? txt : (txt.text || ""),
          confidence: typeof txt === "object" && typeof txt.confidence === "number" ? txt.confidence : 3
        }));
      };

      // Merge function that preserves user existing items and appends unique AI suggestions
      const mergeZoneUnique = (existingItems: any[] | undefined, newItems: any[]) => {
        const merged = [...(existingItems || [])];
        const existingTexts = new Set(merged.map(item => item.text.trim().toLowerCase()));

        newItems.forEach(newItem => {
          const trimmedNew = newItem.text.trim();
          if (trimmedNew && !existingTexts.has(trimmedNew.toLowerCase())) {
            merged.push(newItem);
            existingTexts.add(trimmedNew.toLowerCase());
          }
        });

        return merged;
      };

      const existingCanvas = version.businessModelCanvas || {};

      const mappedBMC: BMC = {
        problems: mergeZoneUnique(existingCanvas.problems, ensureItems(geminiData.business_model_canvas?.problems)),
        customerSegments: mergeZoneUnique(existingCanvas.customerSegments, ensureItems(geminiData.business_model_canvas?.customer_segments)),
        valuePropositions: mergeZoneUnique(existingCanvas.valuePropositions, ensureItems(geminiData.business_model_canvas?.value_propositions)),
        solution: mergeZoneUnique(existingCanvas.solution, ensureItems(geminiData.business_model_canvas?.solution)),
        channels: mergeZoneUnique(existingCanvas.channels, ensureItems(geminiData.business_model_canvas?.channels)),
        revenueStreams: mergeZoneUnique(existingCanvas.revenueStreams, ensureItems(geminiData.business_model_canvas?.revenue_streams)),
        costStructure: mergeZoneUnique(existingCanvas.costStructure, ensureItems(geminiData.business_model_canvas?.cost_structure)),
        keyMetrics: mergeZoneUnique(existingCanvas.keyMetrics, ensureItems(geminiData.business_model_canvas?.key_metrics)),
        unfairAdvantage: mergeZoneUnique(existingCanvas.unfairAdvantage, ensureItems(geminiData.business_model_canvas?.unfair_advantage))
      };

      const mappedAnalysis = {
        indicators: {
          pain_desirability: {
            score_10: geminiData.indicators?.pain_desirability?.score_10 ?? 5,
            comment: geminiData.indicators?.pain_desirability?.comment ?? ""
          },
          timing_why_now: {
            score_10: geminiData.indicators?.timing_why_now?.score_10 ?? 5,
            comment: geminiData.indicators?.timing_why_now?.comment ?? ""
          },
          market_size_potential: {
            score_10: geminiData.indicators?.market_size_potential?.score_10 ?? 5,
            comment: geminiData.indicators?.market_size_potential?.comment ?? ""
          },
          defensibility_moat: {
            score_10: geminiData.indicators?.defensibility_moat?.score_10 ?? 5,
            comment: geminiData.indicators?.defensibility_moat?.comment ?? ""
          },
          execution_simplicity: {
            score_10: geminiData.indicators?.execution_simplicity?.score_10 ?? 5,
            comment: geminiData.indicators?.execution_simplicity?.comment ?? ""
          },
          economic_viability: {
            score_10: geminiData.indicators?.economic_viability?.score_10 ?? 5,
            comment: geminiData.indicators?.economic_viability?.comment ?? ""
          }
        },
        overall_score_100: geminiData.overall_score_100 ?? 50,
        red_flags: geminiData.red_flags || [],
        critical_hypotheses_to_test: geminiData.critical_hypotheses_to_test || [],
        pivot_analysis: geminiData.pivot_analysis || geminiData.project_summary || ""
      };

      await updateDoc(docRef, {
        businessModelCanvas: mappedBMC,
        analysisResult: mappedAnalysis,
        aiAnalysisStatus: 'completed'
      });

      // Update parent project document with the latest score for fast sidebar rendering
      const parentProjectRef = doc(db, "projects", projectId);
      await updateDoc(parentProjectRef, {
        latestOverallScore: mappedAnalysis.overall_score_100
      });

      if (onEnrichSuccess) onEnrichSuccess();

    } catch (err: any) {
      console.error("Enrichment API Call failed:", err);
      const errMsg = err.message || "Impossible de joindre le service d'analyse stratégique.";
      setLocalError(errMsg);
      
      try {
        await updateDoc(docRef, {
          aiAnalysisStatus: 'error',
          aiErrorMessage: errMsg
        });
      } catch (dbErr) {
        console.error("Failed to write error state to db:", dbErr);
      }

      if (onEnrichError) onEnrichError(errMsg);
    } finally {
      setEnrichLoading(false);
    }
  };

  // Trigger expert Lean Startup and hypothesis testing audit
  const handleRunLeanValidationAudit = async () => {
    if (enrichLoading || validationLoading) return;
    setValidationLoading(true);
    setLocalError(null);

    const docRef = doc(db, "projects", projectId, "versions", version.id);

    try {
      await updateDoc(docRef, {
        validationStatus: 'pending',
        validationErrorMessage: null
      });

      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bmc: version.businessModelCanvas,
          userInput: version.userInput
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Une erreur s'est produite lors de la validation.");
      }

      const auditData = await res.json();

      await updateDoc(docRef, {
        validationResult: auditData,
        validationStatus: 'completed'
      });

      if (onEnrichSuccess) onEnrichSuccess();

    } catch (err: any) {
      console.error("Lean Validation failed:", err);
      const errMsg = err.message || "L'audit de validation Lean a échoué.";
      setLocalError(errMsg);

      try {
        await updateDoc(docRef, {
          validationStatus: 'error',
          validationErrorMessage: errMsg
        });
      } catch (dbErr) {
        console.error("Failed to save validation error status:", dbErr);
      }
    } finally {
      setValidationLoading(false);
    }
  };

  // Trigger Gemini Market & Competition Analysis
  const handleRunMarketAnalysis = async () => {
    if (marketLoading || enrichLoading || validationLoading) return;
    setMarketLoading(true);
    setLocalError(null);

    const docRef = doc(db, "projects", projectId, "versions", version.id);

    try {
      await updateDoc(docRef, {
        "marketAnalysis.status": "pending",
        "marketAnalysis.errorMessage": null
      });

      const res = await fetch("/api/market-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userInput: version.userInput,
          bmc: version.businessModelCanvas || null
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Une erreur s'est produite lors du benchmark de marché.");
      }

      const marketData = await res.json();

      await updateDoc(docRef, {
        marketAnalysis: {
          status: "completed",
          updatedAt: new Date().toISOString(),
          leaders: marketData.leaders || [],
          monetizationTrends: marketData.monetizationTrends || [],
          marketDynamics: marketData.marketDynamics || { trend: "Stable", comment: "" },
          strategicGaps: marketData.strategicGaps || []
        }
      });

      if (onEnrichSuccess) onEnrichSuccess();

    } catch (err: any) {
      console.error("Market Benchmark failed:", err);
      const errMsg = err.message || "L'analyse de marché IA a échoué.";
      setLocalError(errMsg);

      try {
        await updateDoc(docRef, {
          marketAnalysis: {
            status: "error",
            errorMessage: errMsg,
            leaders: [],
            monetizationTrends: [],
            marketDynamics: { trend: "Stable", comment: "" },
            strategicGaps: []
          }
        });
      } catch (dbErr) {
        console.error("Failed to save market error status:", dbErr);
      }
    } finally {
      setMarketLoading(false);
    }
  };

  const canvas = version.businessModelCanvas || {};

  return (
    <div className="space-y-8 max-w-7xl mx-auto w-full animate-in fade-in duration-300">
      
      {/* 1. Header Area with dynamic badges & actions */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono mb-1">
            <span className="text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded">
              Version #{version.versionNumber} (Lean Canvas)
            </span>
            <span>·</span>
            {version.aiAnalysisStatus === 'completed' && version.analysisResult ? (
              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold">
                VC Analysé
              </span>
            ) : version.aiAnalysisStatus === 'pending' || enrichLoading ? (
              <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-bold animate-pulse">
                VC en cours...
              </span>
            ) : (
              <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded font-bold">
                Local-First
              </span>
            )}
            <span>·</span>
            {version.validationStatus === 'completed' && version.validationResult ? (
              <span className="text-purple-700 bg-purple-50 px-2 py-0.5 rounded font-bold">
                Audit Lean Validé
              </span>
            ) : version.validationStatus === 'pending' || validationLoading ? (
              <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-bold animate-pulse">
                Audit Lean en cours...
              </span>
            ) : null}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Analyse et Structure Strategique (Lean Canvas)
            </h2>
            {projectStatus && onStatusChange && (
              <div className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200/80 p-1 rounded-xl shrink-0">
                <button
                  type="button"
                  onClick={() => onStatusChange('active')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    projectStatus === 'active'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-500 hover:bg-slate-200/60 hover:text-slate-700'
                  }`}
                  title="Marquer comme Actif"
                >
                  Actif
                </button>
                <button
                  type="button"
                  onClick={() => onStatusChange('sleeping')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    projectStatus === 'sleeping'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'text-slate-500 hover:bg-slate-200/60 hover:text-slate-700'
                  }`}
                  title="Marquer comme En sommeil"
                >
                  En sommeil
                </button>
                <button
                  type="button"
                  onClick={() => onStatusChange('abandoned')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    projectStatus === 'abandoned'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-500 hover:bg-slate-200/60 hover:text-slate-700'
                  }`}
                  title="Marquer comme Abandonné"
                >
                  Abandonné
                </button>
              </div>
            )}
          </div>

          {version.pivotReason && (
            <div className="mt-3 text-sm bg-amber-50 text-amber-950 p-3 rounded-lg border border-amber-200/40 flex items-start gap-2 max-w-3xl">
              <RotateCw className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <p>
                <strong>Déclencheur de Pivot :</strong> "{version.pivotReason}"
              </p>
            </div>
          )}
        </div>

        {/* Dashboard actions */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {onStartEdit && (
            <button
              onClick={onStartEdit}
              disabled={enrichLoading || validationLoading || version.aiAnalysisStatus === 'pending' || version.validationStatus === 'pending'}
              className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-bold py-2.5 px-4 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Edit3 className="w-4.5 h-4.5" />
              Éditer Canvas
            </button>
          )}

          <button
            onClick={handleRunAIEnrichment}
            disabled={enrichLoading || validationLoading || version.aiAnalysisStatus === 'pending' || version.validationStatus === 'pending'}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold py-2.5 px-4 rounded-xl shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Génère la note de viabilité VC globale, le résumé stratégique et les risques"
          >
            <Sparkles className="w-4.5 h-4.5" />
            {enrichLoading ? "Analyse en cours..." : version.aiAnalysisStatus === 'completed' ? "Relancer l'Analyse VC" : "Lancer l'Analyse VC"}
          </button>

          <button
            onClick={handleRunLeanValidationAudit}
            disabled={enrichLoading || validationLoading || version.aiAnalysisStatus === 'pending' || version.validationStatus === 'pending'}
            className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold py-2.5 px-4 rounded-xl shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Évalue la criticité et le niveau de preuve de vos hypothèses, et propose des expériences concrètes"
          >
            <Compass className="w-4.5 h-4.5" />
            {validationLoading ? "Audit en cours..." : version.validationResult ? "Relancer l'Audit Lean" : "Lancer le Lean Audit"}
          </button>

          {onStartPivot && (
            <button
              onClick={onStartPivot}
              disabled={enrichLoading || validationLoading || version.aiAnalysisStatus === 'pending' || version.validationStatus === 'pending'}
              className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold py-2.5 px-4 rounded-xl shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RotateCw className="w-4 h-4" />
              Pivoter l'Idée
            </button>
          )}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-slate-200 gap-6 mt-2">
        {/* Canvas & Pivots Tab (Locked in Benchmark phase) */}
        <button
          onClick={() => {
            if (currentPhase === 'canvas' || currentPhase === 'mvp') {
              setActiveTab('lean');
            }
          }}
          disabled={currentPhase !== 'canvas' && currentPhase !== 'mvp'}
          className={`pb-3 text-sm font-bold transition-all relative flex items-center gap-1.5 ${
            currentPhase !== 'canvas' && currentPhase !== 'mvp'
              ? 'opacity-45 cursor-not-allowed text-slate-400'
              : activeTab === 'lean'
              ? 'text-indigo-600 font-extrabold cursor-pointer'
              : 'text-slate-500 hover:text-slate-800 cursor-pointer'
          }`}
        >
          Analyse Stratégique & Lean Canvas
          {currentPhase !== 'canvas' && currentPhase !== 'mvp' && (
            <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono font-bold uppercase">🔒 Bloqué</span>
          )}
          {activeTab === 'lean' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />
          )}
        </button>

        {/* Benchmark / Market Tab (Always open after ideation) */}
        <button
          onClick={() => setActiveTab('market')}
          className={`pb-3 text-sm font-bold transition-all relative flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'market'
              ? 'text-indigo-600 font-extrabold'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Analyse de Marché & Concurrence
          <span className="bg-purple-100 text-purple-700 text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase font-mono">IA</span>
          {activeTab === 'market' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />
          )}
        </button>

        {/* Solopreneur Tab (Always open after ideation) */}
        <button
          onClick={() => setActiveTab('solopreneur')}
          className={`pb-3 text-sm font-bold transition-all relative flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'solopreneur'
              ? 'text-indigo-600 font-extrabold'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Faisabilité Solopreneur
          <span className="bg-emerald-100 text-emerald-800 text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase font-mono">MVP</span>
          {activeTab === 'solopreneur' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />
          )}
        </button>

        {/* MVP Execution Tab (Locked if not in MVP phase) */}
        <button
          onClick={() => {
            if (currentPhase === 'mvp') {
              setActiveTab('mvp');
            }
          }}
          disabled={currentPhase !== 'mvp'}
          className={`pb-3 text-sm font-bold transition-all relative flex items-center gap-1.5 ${
            currentPhase !== 'mvp'
              ? 'opacity-45 cursor-not-allowed text-slate-400'
              : activeTab === 'mvp'
              ? 'text-indigo-600 font-extrabold cursor-pointer'
              : 'text-slate-500 hover:text-slate-800 cursor-pointer'
          }`}
        >
          Exécution MVP
          {currentPhase !== 'mvp' ? (
            <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono font-bold uppercase">🔒 Bloqué</span>
          ) : (
            <span className="bg-amber-100 text-amber-800 text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase font-mono">LAUNCH</span>
          )}
          {activeTab === 'mvp' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />
          )}
        </button>
      </div>

      {activeTab === 'lean' && (
        <>
          {/* Pre-qualification Micro-Test opportunity score and Market TAM Calculator */}
          <PreQualificationWidget
            userId={userId}
            projectId={projectId}
            version={version}
            onSaveSuccess={onEnrichSuccess}
          />

          {/* 2. Loader View for pending AI status */}
          {(version.aiAnalysisStatus === 'pending' || enrichLoading || version.validationStatus === 'pending' || validationLoading) && (
            <div className="flex-1 flex flex-col justify-center items-center py-16 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-8 animate-in fade-in">
              <div className="relative flex items-center justify-center">
                <div className="w-16 h-16 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin"></div>
                <Sparkles className="w-6 h-6 text-indigo-600 absolute animate-pulse" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mt-6 mb-2">Analyse intelligente en cours...</h3>
              <p className="text-sm text-slate-500 text-center max-w-md">
                L'IA d'élite examine de manière critique les éléments de votre Lean Canvas, les scores de confiance et suggère des actions de validation concrètes.
              </p>
            </div>
          )}

          {/* 3. Error Callout for failed states */}
          {(version.aiAnalysisStatus === 'error' || version.validationStatus === 'error') && !enrichLoading && !validationLoading && (
            <div className="bg-red-50 border border-red-200 text-red-950 p-5 rounded-2xl flex items-start gap-3 animate-in fade-in">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
              <div className="text-xs space-y-2 leading-relaxed flex-1">
                <p className="font-bold text-sm">Échec du traitement IA</p>
                <p className="font-mono text-red-800 bg-white/50 p-2 rounded border border-red-100">
                  {version.aiErrorMessage || version.validationErrorMessage || localError || "Une erreur inattendue est survenue."}
                </p>
                <button
                  onClick={version.validationStatus === 'error' ? handleRunLeanValidationAudit : handleRunAIEnrichment}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 px-4 rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-sm text-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Réessayer l'Analyse
                </button>
              </div>
            </div>
          )}

          {/* 4. Complete VC Strategic Reports */}
          {version.aiAnalysisStatus === 'completed' && version.analysisResult && !enrichLoading && !validationLoading && (
            <div className="space-y-8 animate-in fade-in duration-300">
              
              <div className="grid md:grid-cols-3 gap-6">
                <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider block mb-2">
                      Synthèse d'Opportunité (IA)
                    </span>
                    <p className="text-base text-slate-700 leading-relaxed font-normal">
                      {version.analysisResult.pivot_analysis || "Résumé synthétique non disponible."}
                    </p>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col items-center justify-center text-center">
                  <span className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider block mb-4">
                    Score de Viabilité Global
                  </span>
                  <div className="relative flex items-center justify-center">
                    <svg className="w-32 h-32 transform -rotate-90">
                      <circle cx="64" cy="64" r="52" className="text-slate-100" strokeWidth="8" stroke="currentColor" fill="transparent" />
                      <circle
                        cx="64"
                        cy="64"
                        r="52"
                        className="text-indigo-600 transition-all duration-1000 ease-out"
                        strokeWidth="8"
                        strokeDasharray={2 * Math.PI * 52}
                        strokeDashoffset={2 * Math.PI * 52 * (1 - (version.analysisResult.overall_score_100 || 50) / 100)}
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="transparent"
                      />
                    </svg>
                    <div className="absolute text-center">
                      <span className="text-3xl font-black text-slate-900 font-mono">
                        {version.analysisResult.overall_score_100 ?? 50}
                      </span>
                      <span className="text-xs text-slate-400 font-bold block -mt-1">/ 100</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-4">
                    Méthodologie de scoring VC.
                  </p>
                </div>
              </div>

              {/* Indicators */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
                <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
                  <Gauge className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-extrabold text-lg text-slate-900">Indices Stratégiques Évalués</h3>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Object.entries(version.analysisResult.indicators || {}).map(([key, value]: [string, any]) => {
                    const score = value.score_10 ?? 5;
                    const comment = value.comment || "";
                    const meta = metricDescriptions[key] || { title: key, desc: "" };

                    let barColor = "bg-red-500";
                    let textColor = "text-red-700";
                    let bgTint = "bg-red-50";
                    if (score >= 7) {
                      barColor = "bg-emerald-600";
                      textColor = "text-emerald-700";
                      bgTint = "bg-emerald-50";
                    } else if (score >= 5) {
                      barColor = "bg-amber-500";
                      textColor = "text-amber-700";
                      bgTint = "bg-amber-50";
                    }

                    return (
                      <div key={key} className="p-4 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/40 transition-all flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-bold text-xs text-slate-900 flex items-center gap-1">
                              {meta.title}
                              <button onClick={() => setActiveTooltip(key)} className="text-slate-300 hover:text-slate-500">
                                <HelpCircle className="w-3.5 h-3.5" />
                              </button>
                            </span>
                            <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${bgTint} ${textColor}`}>
                              {score} / 10
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-3">
                            <div className={`h-full ${barColor}`} style={{ width: `${score * 10}%` }}></div>
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed font-normal">
                            {comment}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 5. EXPERT LEAN STARTUP VALIDATION AUDIT REPORT */}
          {version.validationStatus === 'completed' && version.validationResult && !enrichLoading && !validationLoading && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                <Compass className="w-5.5 h-5.5 text-purple-600 animate-pulse" />
                <h3 className="text-lg font-black text-slate-900 tracking-tight">
                  Audit Expert : Validation & Test d'Idées Business
                </h3>
              </div>

              {/* Pivot recommendation banner */}
              <div className={`p-6 rounded-2xl border flex flex-col sm:flex-row items-start gap-4 ${
                version.validationResult.pivot_recommendation?.pivot_suggested
                  ? "bg-amber-50 border-amber-200 text-amber-900"
                  : "bg-emerald-50 border-emerald-200 text-emerald-900"
              }`}>
                <div className={`p-2.5 rounded-xl shrink-0 ${
                  version.validationResult.pivot_recommendation?.pivot_suggested ? "bg-amber-100" : "bg-emerald-100"
                }`}>
                  <RotateCw className={`w-6 h-6 ${
                    version.validationResult.pivot_recommendation?.pivot_suggested ? "text-amber-700 animate-spin-slow" : "text-emerald-700"
                  }`} />
                </div>
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                      version.validationResult.pivot_recommendation?.pivot_suggested ? "bg-amber-200 text-amber-900" : "bg-emerald-200 text-emerald-950"
                    }`}>
                      {version.validationResult.pivot_recommendation?.pivot_suggested ? "Pivot Stratégique Recommandé" : "Validation Continue Conseillée"}
                    </span>
                  </div>
                  <p className="text-sm font-semibold leading-relaxed">
                    {version.validationResult.pivot_recommendation?.reason}
                  </p>

                  {version.validationResult.pivot_recommendation?.suggested_directions?.length > 0 && (
                    <div className="pt-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5 font-mono">
                        Pistes d'Itérations Suggérées :
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {version.validationResult.pivot_recommendation.suggested_directions.map((dir: string, idx: number) => (
                          <span key={idx} className="bg-white/80 border border-slate-200/60 text-slate-800 text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                            <ArrowRight className="w-3.5 h-3.5 text-indigo-600" />
                            {dir}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Grid list of element validation analyses */}
              <div className="grid md:grid-cols-2 gap-4">
                {version.validationResult.canvas_analysis?.map((item: any, idx: number) => {
                  const assessColor = item.ai_risk_assessment === 'Coherent' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                      item.ai_risk_assessment === 'Surevalue' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-blue-50 text-blue-700 border-blue-100';
                  const critColor = item.criticity === 'Haute' ? 'bg-rose-600 text-white' :
                                    item.criticity === 'Moyenne' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-700';

                  return (
                    <div key={item.element_id || idx} className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between gap-4 hover:shadow-md transition-all">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-50 pb-2">
                          <span className="text-[10px] font-mono font-black uppercase text-indigo-600 tracking-wider">
                            {categoryLabels[item.category] || item.category}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${critColor}`}>
                            Criticité : {item.criticity}
                          </span>
                        </div>

                        <p className="text-xs font-semibold text-slate-800 bg-slate-50 p-2.5 rounded border border-slate-100">
                          "{item.content}"
                        </p>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono">Confiance Utilisateur:</span>
                            <div className="flex items-center">
                              {[1,2,3,4,5].map(star => (
                                <Star key={star} className={`w-3 h-3 ${star <= item.user_confidence ? "text-amber-500 fill-amber-400" : "text-slate-200"}`} />
                              ))}
                            </div>
                          </div>
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${assessColor}`}>
                            {item.ai_risk_assessment === 'Coherent' ? 'Réalisme : Cohérent' :
                             item.ai_risk_assessment === 'Surevalue' ? 'Réalisme : Surévalué !' : 'Réalisme : Sous-estimé'}
                          </span>
                        </div>

                        <p className="text-xs text-slate-500 italic font-normal leading-relaxed">
                          <strong>Analyse de risque :</strong> {item.ai_comment}
                        </p>
                      </div>

                      {/* Highlighted Suggested Experiment box */}
                      <div className="bg-slate-900 text-slate-100 p-3.5 rounded-lg border border-slate-950 space-y-1">
                        <div className="flex items-center gap-1.5 text-[9px] font-bold font-mono text-purple-400 uppercase tracking-widest">
                          <Activity className="w-3.5 h-3.5" />
                          Expérience concrète suggérée :
                        </div>
                        <p className="text-xs font-medium leading-relaxed text-white">
                          {item.suggested_action}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 6. The Gorgeous Interactive Canvas Grid (Supports inline edits, star ratings, and mapped audits) */}
          <InteractiveCanvas 
            userId={userId}
            projectId={projectId}
            version={version}
            onSaveSuccess={() => {
              if (onEnrichSuccess) onEnrichSuccess();
            }}
          />

          {/* 7. Risks & Critical Hypotheses */}
          {version.aiAnalysisStatus === 'completed' && version.analysisResult && !enrichLoading && !validationLoading && (
            <div className="grid md:grid-cols-2 gap-6 animate-in fade-in">
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
                <span className="text-xs font-bold text-red-600 font-mono uppercase tracking-wider flex items-center gap-1.5 mb-4">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  Red Flags de Vigilance VC (Risques Majeurs)
                </span>
                <ul className="space-y-2.5">
                  {(version.analysisResult.red_flags || []).map((flag: string, index: number) => (
                    <li key={index} className="text-xs text-slate-600 leading-relaxed flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 mt-1.5"></span>
                      <span>{flag}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
                <span className="text-xs font-bold text-indigo-600 font-mono uppercase tracking-wider flex items-center gap-1.5 mb-4">
                  <Target className="w-4 h-4 text-indigo-500" />
                  Hypothèses critiques à valider sur le terrain
                </span>
                <ul className="space-y-2.5">
                  {(version.analysisResult.critical_hypotheses_to_test || []).map((hyp: string, index: number) => (
                    <li key={index} className="text-xs text-slate-600 leading-relaxed flex items-start gap-2">
                      <span className="text-indigo-600 font-bold shrink-0">{index + 1}.</span>
                      <span>{hyp}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* 8. Raw notes description reference */}
          <div className="bg-slate-100/60 p-5 rounded-2xl border border-slate-200/40 mb-6">
            <span className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider block mb-2">
              Descriptif de l'Idée business enregistrée
            </span>
            <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-wrap font-normal">
              {version.userInput}
            </p>
          </div>

          {/* 9. Investor Screening Tab Module */}
          <div className="mt-8">
            <InvestorDealMemo
              projectId={projectId}
              version={version}
              onSuccess={onEnrichSuccess}
            />
          </div>
        </>
      )}

      {activeTab === 'market' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          
          {/* Header Action card for Market analysis */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Compass className="w-5 h-5 text-purple-600" />
                Benchmark Concurrentiel & Étude de Marché IA
              </h3>
              <p className="text-xs text-slate-500 max-w-xl leading-relaxed">
                Déclenchez une recherche stratégique approfondie sur les acteurs dominants de votre secteur, les modèles de revenus adoptés, les forces en présence, et les angles morts d'infiltration.
              </p>
            </div>
            <button
              onClick={handleRunMarketAnalysis}
              disabled={marketLoading || enrichLoading || validationLoading || version.marketAnalysis?.status === 'pending'}
              className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold py-2.5 px-5 rounded-xl shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
            >
              <Sparkles className="w-4.5 h-4.5" />
              {marketLoading || version.marketAnalysis?.status === 'pending' ? "Analyse du marché..." : version.marketAnalysis ? "Relancer le Benchmark IA" : "Lancer le Benchmark IA"}
            </button>
          </div>

          {/* Loader */}
          {(version.marketAnalysis?.status === 'pending' || marketLoading) && (
            <div className="flex flex-col justify-center items-center py-20 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-8 animate-in fade-in">
              <div className="relative flex items-center justify-center">
                <div className="w-16 h-16 rounded-full border-4 border-purple-100 border-t-purple-600 animate-spin"></div>
                <Sparkles className="w-6 h-6 text-purple-600 absolute animate-pulse" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mt-6 mb-2">Benchmark IA en cours...</h3>
              <p className="text-sm text-slate-500 text-center max-w-md">
                L'IA analyse les tendances macro-économiques, passe en revue les leaders de l'industrie, et cartographie les opportunités de positionnement unique.
              </p>
            </div>
          )}

          {/* Error display */}
          {version.marketAnalysis?.status === 'error' && !marketLoading && (
            <div className="bg-red-50 border border-red-200 text-red-950 p-5 rounded-2xl flex items-start gap-3 animate-in fade-in">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
              <div className="text-xs space-y-2 leading-relaxed flex-1">
                <p className="font-bold text-sm">Échec du benchmark de marché</p>
                <p className="font-mono text-red-800 bg-white/50 p-2 rounded border border-red-100">
                  {version.marketAnalysis?.errorMessage || localError || "Une erreur inattendue est survenue."}
                </p>
                <button
                  onClick={handleRunMarketAnalysis}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 px-4 rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-sm text-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Réessayer le Benchmark
                </button>
              </div>
            </div>
          )}

          {/* Results display */}
          {version.marketAnalysis?.status === 'completed' && version.marketAnalysis && !marketLoading && (
            <div className="space-y-8 animate-in fade-in duration-300">
              
              {/* 1. Market Dynamics & Volume */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                <span className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider block">
                  Volume & Dynamique du Marché
                </span>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase font-mono">Tendance Globale</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        version.marketAnalysis.marketDynamics?.trend === 'Growing' ? 'bg-emerald-100 text-emerald-800' :
                        version.marketAnalysis.marketDynamics?.trend === 'Emerging' ? 'bg-blue-100 text-blue-800' :
                        version.marketAnalysis.marketDynamics?.trend === 'Stable' ? 'bg-slate-100 text-slate-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {version.marketAnalysis.marketDynamics?.trend === 'Growing' ? 'Croissance (Growing)' :
                         version.marketAnalysis.marketDynamics?.trend === 'Emerging' ? 'Émergent (Emerging)' :
                         version.marketAnalysis.marketDynamics?.trend === 'Stable' ? 'Stable' : 'Déclinant (Declining)'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-mono">
                      Mis à jour le : {version.marketAnalysis.updatedAt ? new Date(version.marketAnalysis.updatedAt).toLocaleString() : 'Récemment'}
                    </p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase font-mono">Commentaire analytique</span>
                    <p className="text-xs text-slate-700 leading-relaxed">
                      {version.marketAnalysis.marketDynamics?.comment}
                    </p>
                  </div>
                </div>
              </div>

              {/* 2. Cartographie des Leaders Table */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                <span className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider block">
                  Cartographie des Leaders & Acteurs Clés
                </span>
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                        <th className="p-4">Nom de l'acteur</th>
                        <th className="p-4">Modèle de revenus</th>
                        <th className="p-4">Envergure estimée</th>
                        <th className="p-4 text-emerald-800 bg-emerald-50/20">Forces</th>
                        <th className="p-4 text-red-800 bg-red-50/20">Faiblesses</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(version.marketAnalysis.leaders || []).map((lead, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-4 font-bold text-slate-900 border-r border-slate-50">
                            <div className="flex flex-col gap-1">
                              <span>{lead.name}</span>
                              {lead.website && (
                                <a 
                                  href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-[10px] text-indigo-600 hover:text-indigo-800 hover:underline font-mono font-normal truncate max-w-[150px] block"
                                  title={lead.website}
                                >
                                  {lead.website.replace(/^https?:\/\/(www\.)?/, '')}
                                </a>
                              )}
                            </div>
                          </td>
                          <td className="p-4 text-slate-600 font-medium border-r border-slate-50">{lead.monetizationModel}</td>
                          <td className="p-4 text-slate-500 font-mono text-[11px] border-r border-slate-50">{lead.estimatedScale}</td>
                          <td className="p-4 text-slate-700 bg-emerald-50/10 border-r border-slate-50 align-top">
                            <ul className="list-disc pl-4 space-y-1 text-[11px]">
                              {(lead.strengths || []).map((str, sIdx) => <li key={sIdx}>{str}</li>)}
                            </ul>
                          </td>
                          <td className="p-4 text-slate-700 bg-red-50/10 align-top">
                            <ul className="list-disc pl-4 space-y-1 text-[11px]">
                              {(lead.weaknesses || []).map((wk, wIdx) => <li key={wIdx}>{wk}</li>)}
                            </ul>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 3. Monetization trends & Strategic Gaps */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                  <span className="text-xs font-bold text-indigo-600 font-mono uppercase tracking-wider block">
                    Tendances Dominantes de Monétisation
                  </span>
                  <div className="space-y-3">
                    {(version.marketAnalysis.monetizationTrends || []).map((trend, idx) => (
                      <div key={idx} className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/30 flex gap-3 items-center hover:border-indigo-100 transition-colors">
                        <div className="bg-indigo-100 text-indigo-700 font-bold rounded-lg w-5 h-5 flex items-center justify-center shrink-0 text-xs">
                          $
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed font-semibold">
                          {trend}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. Strategic Gaps (Opportunities) */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                  <span className="text-xs font-bold text-purple-600 font-mono uppercase tracking-wider block">
                    Opportunités d'Infiltration (Strategic Gaps)
                  </span>
                  <div className="space-y-3">
                    {(version.marketAnalysis.strategicGaps || []).map((gap, idx) => (
                      <div key={idx} className="p-3.5 rounded-xl border border-purple-100/40 bg-purple-50/10 flex gap-3 items-start">
                        <div className="bg-purple-100 text-purple-700 font-bold font-mono text-xs rounded-lg w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </div>
                        <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                          {gap}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 5. Google Search Sources Consulted */}
              {version.marketAnalysis.sources && version.marketAnalysis.sources.length > 0 && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    <span className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider block">
                      Sources Web Consultées en Temps Réel (Grounding Google Search)
                    </span>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3.5">
                    {version.marketAnalysis.sources.map((src, idx) => (
                      <a
                        key={idx}
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-3 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-200 transition-all flex items-start gap-2.5 group cursor-pointer"
                        title={src.title}
                      >
                        <Compass className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5 transition-transform group-hover:rotate-12" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-800 group-hover:text-indigo-600 truncate">
                            {src.title}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono truncate">
                            {src.url.replace(/^https?:\/\/(www\.)?/, '')}
                          </p>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* Placeholder if no results yet */}
          {(!version.marketAnalysis || version.marketAnalysis.status === 'none') && !marketLoading && (
            <div className="flex flex-col justify-center items-center py-20 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-8 text-center space-y-4">
              <div className="p-4 bg-purple-50 text-purple-600 rounded-full">
                <Compass className="w-10 h-10 animate-bounce" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900">Aucun Benchmark de Marché enregistré</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  L'IA stratégique effectuera des recherches sur vos concurrents et déterminera des pistes uniques pour vous différencier.
                </p>
              </div>
              <button
                onClick={handleRunMarketAnalysis}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-xl shadow-md text-xs cursor-pointer transition-colors"
              >
                Lancer le premier Benchmark IA
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'solopreneur' && (
        <SolopreneurViabilityTab
          projectId={projectId}
          version={version}
          onSuccess={onEnrichSuccess}
        />
      )}

      {activeTab === 'mvp' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          <div className="bg-gradient-to-r from-amber-600 to-amber-700 text-white p-6 rounded-2xl shadow-md flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1.5">
              <span className="bg-white/20 text-white text-[9px] font-bold px-2 py-0.5 rounded uppercase font-mono tracking-wider">
                Étape Finale : Go-To-Market
              </span>
              <h3 className="text-lg font-black tracking-tight flex items-center gap-2">
                <Activity className="w-5 h-5 text-amber-300" />
                Plan d'Exécution MVP & Plan de Lancement Solopreneur
              </h3>
              <p className="text-xs text-amber-50 text-normal max-w-xl leading-relaxed">
                Voici la feuille de route optimisée pour coder et déployer votre produit sans friction technique et sans gaspiller vos ressources financières.
              </p>
            </div>
            <div className="bg-white/10 px-4 py-3 rounded-xl border border-white/15 text-center shrink-0">
              <span className="text-[10px] text-amber-200 font-bold block uppercase font-mono">Délai estimé</span>
              <span className="text-lg font-black font-mono">
                {version.solopreneurAnalysis?.solopreneur_viability?.time_to_mvp_weeks || "2-3 semaines"}
              </span>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-6">
              <div>
                <h4 className="font-extrabold text-sm text-slate-900 mb-1">Checklist de Développement NoCode / Code</h4>
                <p className="text-xs text-slate-400">Suivez l'avancée de vos travaux techniques pour sortir votre version 1.0.</p>
              </div>

              <div className="space-y-3.5">
                {[
                  {
                    title: "Structure de la Base de Données",
                    desc: "Déployer les schémas NoSQL (Firestore) ou PostgreSQL légers."
                  },
                  {
                    title: "Landing Page & Formulaire d'Attente",
                    desc: "Publier une page d'attente (Tally, Carrd) pour capter les emails d'intérêt avant de finir de coder."
                  },
                  {
                    title: "Parcours d'authentification",
                    desc: "Firebase Authentication pour la connexion simplifiée (Google / Email)."
                  },
                  {
                    title: "Page de checkout & Tarification",
                    desc: "Mettre en place une page de paiement Stripe Checkout ou Lemon Squeezy simplifiée."
                  },
                  {
                    title: "Fonctionnalité Cœur (Core Value)",
                    desc: "Livrer uniquement l'élément résolvant le problème n°1 identifié sur le Lean Canvas."
                  }
                ].map((item, idx) => (
                  <label key={idx} className="flex gap-3.5 items-start p-3.5 bg-slate-50/40 hover:bg-slate-50/80 border border-slate-100 rounded-xl transition-all cursor-pointer">
                    <input type="checkbox" className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 border-slate-200" />
                    <div>
                      <span className="text-xs font-bold text-slate-800 block leading-tight">{item.title}</span>
                      <span className="text-[11px] text-slate-400 font-medium leading-relaxed block mt-0.5">{item.desc}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-6 flex flex-col justify-between">
              <div className="space-y-4">
                <span className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider block">
                  Outils & Stack Conseillés
                </span>
                
                <div className="space-y-3.5">
                  <div className="flex gap-3 items-start">
                    <span className="p-1 bg-indigo-50 text-indigo-600 rounded text-xs font-mono font-bold">FE</span>
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">Vite + React + Tailwind</span>
                      <span className="text-[10px] text-slate-400">Le combo le plus performant et le plus rapide à déployer.</span>
                    </div>
                  </div>
                  <div className="flex gap-3 items-start">
                    <span className="p-1 bg-purple-50 text-purple-600 rounded text-xs font-mono font-bold">DB</span>
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">Firebase NoSQL</span>
                      <span className="text-[10px] text-slate-400">Zéro coût fixe de serveur au démarrage, parfait pour le bootstrapping.</span>
                    </div>
                  </div>
                  <div className="flex gap-3 items-start">
                    <span className="p-1 bg-emerald-50 text-emerald-600 rounded text-xs font-mono font-bold">$$</span>
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">Stripe Checkout / NoCode Form</span>
                      <span className="text-[10px] text-slate-400">Paiement ultra-sécurisé sans devoir gérer la conformité PCI.</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 text-slate-100 p-4 rounded-xl border border-slate-950 space-y-2 mt-4">
                <span className="text-[9px] font-bold text-purple-400 uppercase tracking-widest block font-mono">Conseil Ultime Solopreneur :</span>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Ne cherchez pas à automatiser le support dès le premier jour. Assurez-le vous-même à la main pour apprendre directement de vos premiers utilisateurs payants.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tooltip Help Description Modal Popover */}
      {activeTooltip && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
              <h4 className="font-bold text-slate-950 text-sm">
                {metricDescriptions[activeTooltip]?.title}
              </h4>
              <button onClick={() => setActiveTooltip(null)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-50 p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {metricDescriptions[activeTooltip]?.desc}
            </p>
            <div className="flex justify-end mt-4 pt-3 border-t border-slate-100">
              <button onClick={() => setActiveTooltip(null)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-1.5 px-4 rounded-lg shadow-sm transition-colors">
                Compris
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
