import React, { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { 
  Sparkles, 
  AlertTriangle, 
  RefreshCw, 
  DollarSign, 
  Clock, 
  ShieldAlert, 
  Zap, 
  CheckCircle, 
  XCircle, 
  Layers,
  HeartHandshake
} from "lucide-react";
import { ProjectVersion, SolopreneurAnalysis } from "../types/project";

interface SolopreneurViabilityTabProps {
  projectId: string;
  version: ProjectVersion;
  onSuccess?: () => void;
}

export default function SolopreneurViabilityTab({ projectId, version, onSuccess }: SolopreneurViabilityTabProps) {
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleRunSolopreneurAnalysis = async () => {
    if (loading || version.solopreneurAnalysis?.status === "pending") return;
    setLoading(true);
    setLocalError(null);

    const docRef = doc(db, "projects", projectId, "versions", version.id);

    try {
      // 1. Set status to pending in NoSQL Firestore
      await updateDoc(docRef, {
        "solopreneurAnalysis.status": "pending",
        "solopreneurAnalysis.errorMessage": null
      });

      // 2. Call backend solopreneur evaluation endpoint
      const res = await fetch("/api/solopreneur", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userInput: version.userInput,
          bmc: version.businessModelCanvas || null
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Une erreur s'est produite lors de l'évaluation Solopreneur.");
      }

      const solopreneurData = await res.json();

      // 3. Persist output results to Firestore
      await updateDoc(docRef, {
        solopreneurAnalysis: {
          status: "completed",
          updatedAt: new Date().toISOString(),
          technical_complexity: solopreneurData.technical_complexity || { level: "Moyenne", estimated_dev_hours: "", key_technical_hurdles: [] },
          bootstrapping_budget: solopreneurData.bootstrapping_budget || { monthly_fixed_costs_eur: "0€", cost_breakdown: [] },
          solopreneur_viability: solopreneurData.solopreneur_viability || { score_10: 5, is_solopreneur_friendly: true, main_bottlenecks: [], time_to_mvp_weeks: "" },
          actionable_recommendations: solopreneurData.actionable_recommendations || []
        }
      });

      // Update parent project with the latest solopreneur score
      const parentProjectRef = doc(db, "projects", projectId);
      await updateDoc(parentProjectRef, {
        latestSolopreneurScore: solopreneurData.solopreneur_viability?.score_10 || 5
      });

      if (onSuccess) onSuccess();

    } catch (err: any) {
      console.error("Solopreneur evaluation failed:", err);
      const errMsg = err.message || "L'évaluation Solopreneur IA a échoué.";
      setLocalError(errMsg);

      try {
        await updateDoc(docRef, {
          solopreneurAnalysis: {
            status: "error",
            errorMessage: errMsg,
            technical_complexity: { level: "Moyenne", estimated_dev_hours: "", key_technical_hurdles: [] },
            bootstrapping_budget: { monthly_fixed_costs_eur: "0€", cost_breakdown: [] },
            solopreneur_viability: { score_10: 5, is_solopreneur_friendly: false, main_bottlenecks: [], time_to_mvp_weeks: "" },
            actionable_recommendations: []
          }
        });
      } catch (dbErr) {
        console.error("Failed to save solopreneur error status:", dbErr);
      }
    } finally {
      setLoading(false);
    }
  };

  const analysis: SolopreneurAnalysis | undefined = version.solopreneurAnalysis;
  const status = analysis?.status || "none";

  // Helpers for Compatibility badge color styling
  const getCompatibilityBadge = (score: number) => {
    if (score >= 8) {
      return {
        label: "Excellente Compatibilité Solo",
        style: "bg-emerald-50 border-emerald-200 text-emerald-700"
      };
    }
    if (score >= 5) {
      return {
        label: "Compatibilité Solo Modérée",
        style: "bg-amber-50 border-amber-200 text-amber-700"
      };
    }
    return {
      label: "Compatibilité Solo Difficile / Risquée",
      style: "bg-rose-50 border-rose-200 text-rose-700 font-bold"
    };
  };

  const badge = analysis ? getCompatibilityBadge(analysis.solopreneur_viability?.score_10 || 5) : null;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Upper Strategic Action Header */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-6 rounded-2xl text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-300 font-mono text-[9px] font-bold uppercase tracking-wider">
              Solo Founder Viability Tab
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <h3 className="text-lg font-black tracking-tight flex items-center gap-2">
            <Zap className="w-5 h-5 text-indigo-400" />
            Évaluation de Viabilité Solopreneur
          </h3>
          <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
            Évaluez si votre idée est réaliste pour un auto-entrepreneur avec un budget limité, déterminez les coûts de démarrage réels et obtenez des pistes de simplification.
          </p>
        </div>
        <button
          onClick={handleRunSolopreneurAnalysis}
          disabled={loading || status === "pending"}
          className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold py-2.5 px-5 rounded-xl shadow-md transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
        >
          <Sparkles className="w-4 h-4 text-indigo-300" />
          {loading || status === "pending" ? "Évaluation en cours..." : analysis ? "Relancer l'Analyse" : "Évaluer la viabilité Solopreneur"}
        </button>
      </div>

      {/* STATUS: PENDING */}
      {(status === "pending" || loading) && (
        <div className="flex flex-col justify-center items-center py-24 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-8 animate-in fade-in">
          <div className="relative flex items-center justify-center">
            <div className="w-20 h-20 rounded-full border-4 border-indigo-50 border-t-indigo-600 animate-spin"></div>
            <Zap className="w-8 h-8 text-indigo-600 absolute animate-pulse" />
          </div>
          <h3 className="text-lg font-black text-slate-900 mt-6 mb-2">Calcul de l'indice Solo...</h3>
          <p className="text-xs text-slate-500 text-center max-w-sm leading-relaxed">
            Analyse critique du Lean Canvas, estimation des coûts de démarrage et calcul de la surcharge opérationnelle d'un solopreneur.
          </p>
        </div>
      )}

      {/* STATUS: ERROR */}
      {status === "error" && !loading && (
        <div className="bg-rose-50 border border-rose-200 text-rose-950 p-6 rounded-2xl flex items-start gap-4 animate-in fade-in">
          <AlertTriangle className="w-6 h-6 text-rose-600 mt-0.5 shrink-0" />
          <div className="text-xs space-y-3 leading-relaxed flex-1">
            <h4 className="font-bold text-sm text-rose-900">Échec de l'évaluation</h4>
            <p className="font-mono text-rose-800 bg-white/60 p-3 rounded-lg border border-rose-100">
              {analysis?.errorMessage || localError || "Une erreur s'est produite lors de la communication avec l'IA."}
            </p>
            <button
              onClick={handleRunSolopreneurAnalysis}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold py-2 px-5 rounded-xl transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-sm text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Réessayer l'Analyse
            </button>
          </div>
        </div>
      )}

      {/* STATUS: COMPLETED */}
      {status === "completed" && analysis && !loading && (
        <div className="space-y-8 animate-in fade-in duration-300">
          
          <div className="grid md:grid-cols-3 gap-6">
            
            {/* 1. Compatibilité Solo Badge with Note /10 */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col items-center justify-center text-center space-y-4">
              <span className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider block">
                Compatibilité Solo
              </span>
              
              <div className="relative flex items-center justify-center">
                <svg className="w-28 h-28 transform -rotate-90">
                  <circle cx="56" cy="56" r="46" className="text-slate-100" strokeWidth="8" stroke="currentColor" fill="transparent" />
                  <circle
                    cx="56"
                    cy="56"
                    r="46"
                    className="text-indigo-600 transition-all duration-1000 ease-out"
                    strokeWidth="8"
                    strokeDasharray={2 * Math.PI * 46}
                    strokeDashoffset={2 * Math.PI * 46 * (1 - (analysis.solopreneur_viability?.score_10 || 5) / 10)}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                  />
                </svg>
                <div className="absolute text-center">
                  <span className="text-2xl font-black text-slate-900 font-mono">
                    {analysis.solopreneur_viability?.score_10}
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold block -mt-1">/ 10</span>
                </div>
              </div>

              {badge && (
                <div className="space-y-1">
                  <span className={`text-xs font-extrabold px-3.5 py-1 rounded-full border block ${badge.style}`}>
                    {badge.label}
                  </span>
                  <p className="text-[10px] text-slate-400 font-medium pt-1.5">
                    MVP estimé sous : <strong>{analysis.solopreneur_viability?.time_to_mvp_weeks}</strong>
                  </p>
                </div>
              )}
            </div>

            {/* 2. Technical Complexity & Dev hours */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4 md:col-span-2">
              <span className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider block">
                Complexité Technique & Développement estimé
              </span>
              <div className="grid sm:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex justify-between items-center bg-slate-50/50 p-3.5 rounded-xl border border-slate-100">
                    <span className="text-xs font-bold text-slate-500">Complexité Générale</span>
                    <span className="text-xs font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded">
                      {analysis.technical_complexity?.level || "Moyenne"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-50/50 p-3.5 rounded-xl border border-slate-100">
                    <span className="text-xs font-bold text-slate-500">Heures de Code estimées</span>
                    <span className="text-xs font-extrabold text-slate-900 font-mono flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-indigo-500" />
                      {analysis.technical_complexity?.estimated_dev_hours}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-indigo-500 uppercase font-mono tracking-wider block">
                    Obstacles techniques principaux :
                  </span>
                  <ul className="space-y-1.5 pl-0 list-none">
                    {(analysis.technical_complexity?.key_technical_hurdles || []).map((hurdle, hIdx) => (
                      <li key={hIdx} className="text-xs text-slate-600 font-medium relative pl-3.5 before:content-['•'] before:absolute before:left-0 before:text-indigo-500">
                        {hurdle}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

          </div>

          <div className="grid md:grid-cols-2 gap-6">
            
            {/* 3. Estimations des coûts fixes mensuels sous forme de tableau */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-xs font-bold text-emerald-600 font-mono uppercase tracking-wider block">
                  Budget Mensuel de Fonctionnement (Coûts fixes)
                </span>
                <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100 font-mono">
                  {analysis.bootstrapping_budget?.monthly_fixed_costs_eur}
                </span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      <th className="p-3">Outil / Poste de dépense</th>
                      <th className="p-3 text-right">Coût estimé</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(analysis.bootstrapping_budget?.cost_breakdown || []).map((bItem, bIdx) => (
                      <tr key={bIdx} className="hover:bg-slate-50/40">
                        <td className="p-3 font-semibold text-slate-700">{bItem.item}</td>
                        <td className="p-3 text-right font-mono text-emerald-600 font-bold">{bItem.cost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 4. Liste des goulots d'étranglement qui risquent de surcharger l'auto-entrepreneur */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
              <span className="text-xs font-bold text-rose-500 font-mono uppercase tracking-wider block">
                Goulots d'étranglement (Risques de Surcharge Opérationnelle)
              </span>
              <div className="space-y-3">
                {(analysis.solopreneur_viability?.main_bottlenecks || []).map((bot, idx) => (
                  <div key={idx} className="p-3.5 rounded-xl border border-rose-100/40 bg-rose-50/10 flex gap-3 items-start">
                    <ShieldAlert className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                      {bot}
                    </p>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* 5. Encadré 'Pistes de Simplification' (actionable_recommendations) */}
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-950 text-white shadow-sm space-y-4">
            <span className="text-xs font-bold text-indigo-400 font-mono uppercase tracking-wider flex items-center gap-1.5 block">
              <Zap className="w-4 h-4 text-amber-400" />
              Pistes de Simplification (Simplifier le MVP et réduire les coûts au démarrage)
            </span>
            <div className="grid sm:grid-cols-2 gap-4">
              {(analysis.actionable_recommendations || []).map((rec, rIdx) => (
                <div key={rIdx} className="p-4 rounded-xl border border-white/10 bg-white/5 flex gap-3 items-start hover:bg-white/10 transition-colors">
                  <div className="bg-white/10 text-indigo-300 rounded-lg p-1.5 shrink-0">
                    <HeartHandshake className="w-4 h-4" />
                  </div>
                  <p className="text-xs text-slate-100 font-semibold leading-relaxed">
                    {rec}
                  </p>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* STATUS: NONE */}
      {status === "none" && !loading && (
        <div className="flex flex-col justify-center items-center py-24 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-8 text-center space-y-4">
          <div className="p-4 bg-indigo-50 text-indigo-600 rounded-full">
            <Zap className="w-10 h-10 animate-bounce" />
          </div>
          <div>
            <h4 className="font-extrabold text-slate-900">Aucune évaluation Solopreneur disponible</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-sm leading-relaxed">
              Déclenchez une analyse stratégique pour calculer si votre idée est réalisable par une personne seule et comment compresser vos coûts au démarrage.
            </p>
          </div>
          <button
            onClick={handleRunSolopreneurAnalysis}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-6 rounded-xl shadow-md text-xs cursor-pointer transition-colors"
          >
            Lancer l'Analyse Solopreneur
          </button>
        </div>
      )}

    </div>
  );
}
