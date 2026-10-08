import React, { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { 
  Compass, 
  Sparkles, 
  AlertTriangle, 
  RefreshCw, 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Layers, 
  CheckCircle2, 
  XCircle, 
  ExternalLink 
} from "lucide-react";
import { ProjectVersion, MarketAnalysis } from "../types/project";

interface MarketAnalysisTabProps {
  projectId: string;
  version: ProjectVersion;
  onSuccess?: () => void;
}

export default function MarketAnalysisTab({ projectId, version, onSuccess }: MarketAnalysisTabProps) {
  const [marketLoading, setMarketLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleRunMarketAnalysis = async () => {
    if (marketLoading || version.marketAnalysis?.status === "pending") return;
    setMarketLoading(true);
    setLocalError(null);

    const docRef = doc(db, "projects", projectId, "versions", version.id);

    try {
      // 1. Set status to pending in NoSQL Firestore
      await updateDoc(docRef, {
        "marketAnalysis.status": "pending",
        "marketAnalysis.errorMessage": null
      });

      // 2. Call backend market-analysis endpoint
      const res = await fetch("/api/market-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userInput: version.userInput,
          bmc: version.businessModelCanvas || null
        })
      });

      const responseText = await res.text();
      let marketData;
      try {
        marketData = JSON.parse(responseText);
      } catch (parseErr) {
        throw new Error("Les serveurs d'analyse par l'IA connaissent actuellement une très forte demande temporaire. Veuillez cliquer à nouveau pour réessayer.");
      }

      if (!res.ok) {
        throw new Error(marketData?.error || "Une erreur s'est produite lors du benchmark de marché.");
      }

      // 3. Persist structured grounding-reinforced analysis output to Firestore
      await updateDoc(docRef, {
        marketAnalysis: {
          status: "completed",
          updatedAt: new Date().toISOString(),
          leaders: marketData.leaders || [],
          monetizationTrends: marketData.monetizationTrends || [],
          marketDynamics: marketData.marketDynamics || { trend: "Stable", comment: "" },
          strategicGaps: marketData.strategicGaps || [],
          sources: marketData.sources || []
        }
      });

      if (onSuccess) onSuccess();

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
            strategicGaps: [],
            sources: []
          }
        });
      } catch (dbErr) {
        console.error("Failed to save market error status:", dbErr);
      }
    } finally {
      setMarketLoading(false);
    }
  };

  const analysis: MarketAnalysis | undefined = version.marketAnalysis;
  const status = analysis?.status || "none";

  // Helpers for market trend styling
  const getTrendBadgeStyle = (trend: string) => {
    switch (trend) {
      case "Emerging":
        return "bg-indigo-50 border-indigo-200 text-indigo-700";
      case "Growing":
        return "bg-emerald-50 border-emerald-200 text-emerald-700";
      case "Stable":
        return "bg-slate-50 border-slate-200 text-slate-700";
      case "Declining":
        return "bg-amber-50 border-amber-200 text-amber-700";
      default:
        return "bg-slate-50 border-slate-200 text-slate-700";
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Upper Action Header */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-6 rounded-2xl text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-300 font-mono text-[9px] font-bold uppercase tracking-wider">
              VC & Strategic Due Diligence
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          </div>
          <h3 className="text-lg font-black tracking-tight flex items-center gap-2">
            <Compass className="w-5 h-5 text-indigo-400" />
            Benchmark Concurrentiel & Étude de Marché
          </h3>
          <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
            Scannez le web pour identifier la concurrence réelle, comparer les forces et faiblesses, cartographier les modèles de tarification, et dévoiler les angles morts inexploités.
          </p>
        </div>
        <button
          onClick={handleRunMarketAnalysis}
          disabled={marketLoading || status === "pending"}
          className="bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white text-xs font-bold py-2.5 px-5 rounded-xl shadow-md transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
        >
          <Sparkles className="w-4 h-4" />
          {marketLoading || status === "pending" ? "Analyse en direct..." : analysis ? "Relancer l'Analyse Web" : "Lancer l'analyse du marché en direct"}
        </button>
      </div>

      {/* STATUS: PENDING (Loading Animation) */}
      {(status === "pending" || marketLoading) && (
        <div className="flex flex-col justify-center items-center py-24 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-8 animate-in fade-in">
          <div className="relative flex items-center justify-center">
            <div className="w-20 h-20 rounded-full border-4 border-indigo-50 border-t-indigo-600 animate-spin"></div>
            <Compass className="w-8 h-8 text-indigo-600 absolute animate-pulse" />
          </div>
          <h3 className="text-lg font-black text-slate-900 mt-6 mb-2">Analyse du marché en direct...</h3>
          <p className="text-xs text-slate-500 text-center max-w-sm leading-relaxed">
            L'IA de Due Diligence interroge le web via Google Search pour cartographier vos concurrents et extraire les structures tarifaires actuelles.
          </p>
        </div>
      )}

      {/* STATUS: ERROR */}
      {status === "error" && !marketLoading && (
        <div className="bg-rose-50 border border-rose-200 text-rose-950 p-6 rounded-2xl flex items-start gap-4 animate-in fade-in">
          <AlertTriangle className="w-6 h-6 text-rose-600 mt-0.5 shrink-0" />
          <div className="text-xs space-y-3 leading-relaxed flex-1">
            <h4 className="font-bold text-sm text-rose-900">Échec du Benchmark Concurrentiel</h4>
            <p className="font-mono text-rose-800 bg-white/60 p-3 rounded-lg border border-rose-100">
              {analysis?.errorMessage || localError || "Une erreur inattendue est survenue lors de la communication avec l'IA."}
            </p>
            <button
              onClick={handleRunMarketAnalysis}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold py-2 px-5 rounded-xl transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-sm text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Réessayer l'Analyse
            </button>
          </div>
        </div>
      )}

      {/* STATUS: COMPLETED */}
      {status === "completed" && analysis && !marketLoading && (
        <div className="space-y-8 animate-in fade-in duration-300">
          
          {/* 1. Market Dynamics Header Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <span className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider block">
              Volume & Dynamique Globale du Marché
            </span>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 space-y-2 flex flex-col justify-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase font-mono">Tendance Macro</span>
                <span className={`text-xs font-bold px-3 py-1 rounded-full border w-fit ${getTrendBadgeStyle(analysis.marketDynamics?.trend)}`}>
                  {analysis.marketDynamics?.trend}
                </span>
              </div>
              <div className="md:col-span-2 bg-slate-50/50 p-4 rounded-xl border border-slate-100 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase font-mono">Synthèse de la Dynamique</span>
                <p className="text-xs text-slate-700 leading-relaxed font-medium">
                  {analysis.marketDynamics?.comment}
                </p>
              </div>
            </div>
          </div>

          {/* 2. Grid comparative card of leaders */}
          <div className="space-y-4">
            <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider font-mono text-slate-400">
              Cartographie & Benchmark des Concurrents Leaders
            </h4>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
              {(analysis.leaders || []).map((lead, idx) => (
                <div key={idx} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm flex flex-col hover:border-indigo-200 hover:shadow-md transition-all overflow-hidden">
                  <div className="p-5 border-b border-slate-100 bg-slate-50/40 space-y-1.5 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h5 className="font-extrabold text-slate-900 text-sm">{lead.name}</h5>
                      <span className="text-[9px] font-mono font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100/30 shrink-0">
                        {lead.estimatedScale}
                      </span>
                    </div>
                    {lead.website && (
                      <a 
                        href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-indigo-600 hover:underline flex items-center gap-1 font-mono"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {lead.website.replace(/^https?:\/\/(www\.)?/, "")}
                      </a>
                    )}
                  </div>

                  <div className="p-5 space-y-4 bg-white">
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold uppercase text-slate-400 font-mono tracking-wider block">Monétisation & Tarifs</span>
                      <p className="text-xs text-slate-800 font-bold flex items-center gap-1">
                        <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                        {lead.monetizationModel}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                      <div className="space-y-2">
                        <span className="text-[9px] font-bold uppercase text-emerald-600 font-mono tracking-wider block flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Forces
                        </span>
                        <ul className="space-y-1 text-[10px] text-slate-600 leading-relaxed list-none pl-0">
                          {(lead.strengths || []).map((str, sIdx) => (
                            <li key={sIdx} className="relative pl-3 before:content-['•'] before:absolute before:left-0 before:text-emerald-500">
                              {str}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="space-y-2">
                        <span className="text-[9px] font-bold uppercase text-rose-600 font-mono tracking-wider block flex items-center gap-1">
                          <XCircle className="w-3 h-3 text-rose-500" /> Faiblesses
                        </span>
                        <ul className="space-y-1 text-[10px] text-slate-600 leading-relaxed list-none pl-0">
                          {(lead.weaknesses || []).map((wk, wIdx) => (
                            <li key={wIdx} className="relative pl-3 before:content-['•'] before:absolute before:left-0 before:text-rose-400">
                              {wk}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Grid for monetization trends & Gaps */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
              <span className="text-xs font-bold text-indigo-600 font-mono uppercase tracking-wider block">
                Tendances de Tarification & Modèles
              </span>
              <div className="space-y-3">
                {(analysis.monetizationTrends || []).map((trend, idx) => (
                  <div key={idx} className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/40 flex gap-3 items-center hover:border-indigo-100 transition-colors">
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

            {/* 4. Strategic Gaps / White spaces */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
              <span className="text-xs font-bold text-purple-600 font-mono uppercase tracking-wider block">
                Opportunités & Angles Morts (Strategic Gaps)
              </span>
              <div className="space-y-3">
                {(analysis.strategicGaps || []).map((gap, idx) => (
                  <div key={idx} className="p-3.5 rounded-xl border border-purple-100/40 bg-purple-50/10 flex gap-3 items-start animate-in slide-in-from-bottom-2 duration-150">
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

          {/* 5. Google Search Sources Verified */}
          {analysis.sources && analysis.sources.length > 0 && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                <span className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider block">
                  Sources Vérifiées en Temps Réel (Grounding Google Search)
                </span>
              </div>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                {analysis.sources.map((src, idx) => (
                  <a
                    key={idx}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-slate-50 hover:border-slate-200 transition-all flex items-start gap-2.5 group cursor-pointer"
                    title={src.title}
                  >
                    <Compass className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5 transition-transform group-hover:rotate-12" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-800 group-hover:text-indigo-600 truncate">
                        {src.title}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono truncate">
                        {src.url.replace(/^https?:\/\/(www\.)?/, "")}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* STATUS: NONE (Initial State) */}
      {status === "none" && !marketLoading && (
        <div className="flex flex-col justify-center items-center py-24 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-8 text-center space-y-4">
          <div className="p-4 bg-indigo-50 text-indigo-600 rounded-full">
            <Compass className="w-10 h-10 animate-bounce" />
          </div>
          <div>
            <h4 className="font-extrabold text-slate-900">Aucun Benchmark Concurrentiel disponible</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-sm leading-relaxed">
              Déclenchez une recherche stratégique en temps réel. L'IA de Due Diligence va identifier vos concurrents réels et extraire leurs propositions de valeur.
            </p>
          </div>
          <button
            onClick={handleRunMarketAnalysis}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-6 rounded-xl shadow-md text-xs cursor-pointer transition-colors"
          >
            Lancer l'analyse du marché en direct
          </button>
        </div>
      )}
    </div>
  );
}
