import React, { useState, useEffect } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { 
  ShieldAlert, 
  Coins, 
  TrendingUp, 
  CheckCircle2, 
  RefreshCw, 
  Sparkles, 
  AlertTriangle,
  FileText,
  DollarSign,
  Activity,
  Layers,
  Clock,
  Zap,
  Gauge,
  Clipboard,
  Check
} from "lucide-react";
import { Version, InvestorScreening } from "../types/project";

interface InvestorDealMemoProps {
  projectId: string;
  version: Version;
  onSuccess?: () => void;
}

export default function InvestorDealMemo({ projectId, version, onSuccess }: InvestorDealMemoProps) {
  const [stage, setStage] = useState<InvestorScreening["stage"]>(
    version.investorScreening?.stage || "Idée"
  );
  const [screening, setScreening] = useState<InvestorScreening | null>(
    version.investorScreening || null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setStage(version.investorScreening?.stage || "Idée");
    setScreening(version.investorScreening || null);
    setErrorMsg(null);
    setCopied(false);
  }, [projectId, version.id]);

  const handleGenerateScreening = async () => {
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/investor-screening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userInput: version.userInput,
          stage: stage
        })
      });

      const responseText = await res.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        throw new Error("Les serveurs d'analyse par l'IA connaissent actuellement une très forte demande temporaire. Veuillez cliquer à nouveau pour réessayer.");
      }

      if (!res.ok) {
        throw new Error(data?.error || "La génération de la Fiche Investisseur a échoué.");
      }
      const newScreening: InvestorScreening = {
        stage,
        investorMetrics: data.investorMetrics,
        updatedAt: new Date().toISOString()
      };

      // Save inside Firestore on version document
      const docRef = doc(db, "projects", projectId, "versions", version.id);
      await updateDoc(docRef, {
        investorScreening: newScreening
      });

      setScreening(newScreening);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error("Screening generation failed:", err);
      setErrorMsg(err.message || "Impossible de joindre l'IA pour générer l'analyse.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopySummary = () => {
    if (!screening || !screening.investorMetrics) return;
    const m = screening.investorMetrics;

    const summaryText = `=== EXECUTIVE SUMMARY : FICHE DE SCREENING ===
Secteur d'activité : ${m.industrySector}
Stade de développement : ${screening.stage}
Besoins financiers cibles : ${m.inferredFundingNeeds?.fundingTarget}
Modèle de financement suggéré : ${m.inferredFundingNeeds?.recommendedModel}
Délai de mise sur le marché : ${m.timeToMarketMonths}
Risque principal : ${m.primaryRiskType}
Intensité de capital : ${m.capitalIntensity}
Barrière à l'entrée : ${m.defensibilityMoat?.level} (${m.defensibilityMoat?.keyFactor})

ÉVALUATION DE VIABILITÉ SOLO :
${m.soloFeasibilityAssessment}
============================================`;

    navigator.clipboard.writeText(summaryText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const m = screening?.investorMetrics;

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-6 animate-in fade-in duration-300">
      
      {/* Module Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-amber-50 text-amber-700 rounded-xl">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
              Fiche Investisseur & Screening Solo
              <span className="bg-amber-100 text-amber-800 text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase tracking-wider">
                Deal Memo
              </span>
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5 font-medium leading-relaxed max-w-xl">
              Renseignez votre stade d'avancement pour générer ou actualiser une fiche de synthèse épurée pour tiers ou pour votre plan de route.
            </p>
          </div>
        </div>
      </div>

      {/* Input Selection Dropdown Stage Form */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
        <div className="flex-1 space-y-1.5">
          <label className="text-[10px] font-black text-slate-400 font-mono uppercase tracking-wider block">
            Sélectionner votre Stade d'Avancement Réel
          </label>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as InvestorScreening["stage"])}
            className="w-full p-2.5 text-xs font-bold border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="Idée">Idée</option>
            <option value="Prototype / MVP">Prototype / MVP</option>
            <option value="Bêta">Bêta</option>
            <option value="Premiers Revenus">Premiers Revenus</option>
          </select>
        </div>

        <div className="shrink-0">
          <button
            type="button"
            onClick={handleGenerateScreening}
            disabled={isLoading}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2.5 px-5 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            )}
            {screening ? "Actualiser le Deal Memo" : "Générer le Deal Memo"}
          </button>
        </div>
      </div>

      {/* Error Feedback message */}
      {errorMsg && (
        <div className="bg-rose-50 border border-rose-100 text-rose-800 p-3.5 rounded-xl text-xs font-semibold flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Loading state indicator */}
      {isLoading ? (
        <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-amber-600 animate-spin" />
          <span className="text-xs text-slate-500 font-semibold font-mono animate-pulse">
            Dédouanement des indicateurs par l'IA...
          </span>
        </div>
      ) : m ? (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          {/* Card: Fiche de Screening */}
          <div className="bg-slate-50/50 p-5 rounded-xl border border-slate-100 space-y-4">
            <span className="text-[10px] font-black text-slate-400 font-mono uppercase tracking-wider block border-b border-slate-100 pb-2">
              📝 Fiche de Screening Synthétique
            </span>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
              
              {/* Sector badge */}
              <div className="bg-white p-3 rounded-lg border border-slate-200/60 space-y-1">
                <span className="text-[9px] font-bold text-slate-400 uppercase font-mono block">Secteur</span>
                <span className="text-xs font-extrabold text-slate-800 truncate block" title={m.industrySector}>
                  {m.industrySector}
                </span>
              </div>

              {/* Stage badge */}
              <div className="bg-white p-3 rounded-lg border border-slate-200/60 space-y-1">
                <span className="text-[9px] font-bold text-slate-400 uppercase font-mono block">Stade Déclaré</span>
                <span className="text-xs font-extrabold text-indigo-700 block">
                  {screening.stage}
                </span>
              </div>

              {/* Funding mode badge */}
              <div className="bg-white p-3 rounded-lg border border-slate-200/60 space-y-1">
                <span className="text-[9px] font-bold text-slate-400 uppercase font-mono block">Financement</span>
                <span className="text-xs font-extrabold text-amber-700 block truncate" title={m.inferredFundingNeeds?.recommendedModel}>
                  {m.inferredFundingNeeds?.recommendedModel}
                </span>
              </div>

              {/* Capital intensity badge */}
              <div className="bg-white p-3 rounded-lg border border-slate-200/60 space-y-1">
                <span className="text-[9px] font-bold text-slate-400 uppercase font-mono block">Intensité Capital</span>
                <span className={`text-xs font-extrabold block ${
                  m.capitalIntensity === "Très Faible" ? "text-emerald-600" :
                  m.capitalIntensity === "Faible" ? "text-emerald-700" : "text-amber-600"
                }`}>
                  {m.capitalIntensity}
                </span>
              </div>

              {/* TTM delay badge */}
              <div className="bg-white p-3 rounded-lg border border-slate-200/60 space-y-1">
                <span className="text-[9px] font-bold text-slate-400 uppercase font-mono block">Délai TTM</span>
                <span className="text-xs font-extrabold text-slate-800 block">
                  {m.timeToMarketMonths}
                </span>
              </div>

            </div>

            {/* Target and Defensibility summary */}
            <div className="grid sm:grid-cols-2 gap-4 bg-white p-3.5 rounded-lg border border-slate-200/60 text-xs">
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase font-mono block">Cible Financière estimée</span>
                <span className="font-extrabold text-slate-800 mt-0.5 block">{m.inferredFundingNeeds?.fundingTarget}</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase font-mono block">Barrière défensive (Moat)</span>
                <span className="font-extrabold text-slate-800 mt-0.5 block">
                  Niveau {m.defensibilityMoat?.level} — {m.defensibilityMoat?.keyFactor}
                </span>
              </div>
            </div>
          </div>

          {/* Section: Évaluation Viabilité Solo */}
          <div className="bg-slate-900 text-slate-100 p-5 rounded-xl border border-slate-950 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-300" />
                <span className="text-[10px] font-black text-amber-300 uppercase tracking-widest font-mono">
                  Évaluation Viabilité Solo
                </span>
              </div>
              <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[9px] font-mono font-bold px-2 py-0.5 rounded uppercase">
                Risque : {m.primaryRiskType}
              </span>
            </div>

            <p className="text-xs text-slate-200 leading-relaxed font-semibold">
              {m.soloFeasibilityAssessment}
            </p>
          </div>

          {/* Action Footer Buttons */}
          <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-4">
            <span className="text-[9px] text-slate-400 font-mono">
              Memo mis à jour le : {screening.updatedAt ? new Date(screening.updatedAt).toLocaleString() : 'Récemment'}
            </span>

            <button
              type="button"
              onClick={handleCopySummary}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-4 rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Copié dans le presse-papiers !
                </>
              ) : (
                <>
                  <Clipboard className="w-3.5 h-3.5" />
                  Copier l'Executive Summary
                </>
              )}
            </button>
          </div>

        </div>
      ) : (
        <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 border border-dashed border-slate-200 rounded-xl bg-slate-50/30">
          <div className="p-3 bg-white border border-slate-200 rounded-full text-slate-400 shadow-2xs">
            <Coins className="w-6 h-6" />
          </div>
          <div>
            <h5 className="text-xs font-bold text-slate-800">Aucun Deal Memo généré</h5>
            <p className="text-[11px] text-slate-400 mt-1 max-w-sm">
              Sélectionnez votre stade de développement dans le menu déroulant ci-dessus, puis cliquez sur « Générer le Deal Memo » pour lancer le screening.
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
