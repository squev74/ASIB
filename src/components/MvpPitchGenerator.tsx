import React, { useState, useEffect } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { 
  Sparkles, 
  RefreshCw, 
  AlertTriangle,
  Clipboard,
  Check,
  Megaphone,
  Layout,
  MessageSquare,
  HelpCircle,
  Play,
  Volume2,
  CheckCircle2,
  FileText,
  User,
  Zap,
  ArrowRight,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { Version } from "../types/project";

interface MvpPitchGeneratorProps {
  projectId: string;
  version: Version;
  onSuccess?: () => void;
}

type ActiveTab = "landing" | "outreach" | "elevator" | "objections";

export default function MvpPitchGenerator({ projectId, version, onSuccess }: MvpPitchGeneratorProps) {
  const [pitchData, setPitchData] = useState(
    version.mvpPitch?.mvpConversionPitch || null
  );
  const [activeSubTab, setActiveSubTab] = useState<ActiveTab>("landing");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expandedObjection, setExpandedObjection] = useState<number | null>(0);

  useEffect(() => {
    setPitchData(version.mvpPitch?.mvpConversionPitch || null);
    setErrorMsg(null);
    setCopied(false);
    setExpandedObjection(0);
  }, [projectId, version.id]);

  const handleGeneratePitch = async () => {
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/generate-mvp-pitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userInput: version.userInput
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
        throw new Error(data?.error || "La génération du pitch a échoué.");
      }
      const mvpConversionPitch = data.mvpConversionPitch;

      // Save inside Firestore on version document
      const docRef = doc(db, "projects", projectId, "versions", version.id);
      await updateDoc(docRef, {
        mvpPitch: {
          mvpConversionPitch,
          updatedAt: new Date().toISOString()
        }
      });

      setPitchData(mvpConversionPitch);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error("Pitch generation failed:", err);
      setErrorMsg(err.message || "Impossible de joindre l'IA pour générer les pitchs.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyText = (textToCopy: string) => {
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCopyLandingAll = () => {
    if (!pitchData) return;
    const l = pitchData.landingPageCopy;
    const benefitsText = l.keyBenefits?.map(b => `- ${b.title} : ${b.description}`).join("\n") || "";
    const allText = `=== LANDING PAGE COPY ===
Titre : ${l.heroTitle}
Sous-titre : ${l.heroSubtitle}

Bénéfices clés :
${benefitsText}

Bouton CTA : ${l.primaryCTA}`;
    handleCopyText(allText);
  };

  const handleCopyAllKit = () => {
    if (!pitchData) return;
    const l = pitchData.landingPageCopy;
    const benefitsText = l.keyBenefits?.map(b => `- ${b.title} : ${b.description}`).join("\n") || "";
    const objectionsText = pitchData.conversionObjections?.map(o => `- Objection : ${o.objection}\n  Réponse : ${o.rebuttal}`).join("\n\n") || "";

    const fullKitText = `=== KIT DE PITCH DE CONVERSION MVP : SYNTHÈSE ===

--- 1. LANDING PAGE COPY ---
Titre principal : ${l.heroTitle}
Sous-titre : ${l.heroSubtitle}
Bénéfices clés :
${benefitsText}
CTA : ${l.primaryCTA}

--- 2. MESSAGE COMMUNAUTAIRE & DM ---
${pitchData.coldOutreachTemplate}

--- 3. ELEVATOR PITCH 30s ---
${pitchData.elevatorPitch30s}

--- 4. RÉASSURANCE & OBJECTIONS ---
${objectionsText}

==============================================`;

    handleCopyText(fullKitText);
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-6 animate-in fade-in duration-300">
      
      {/* Module Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-xl">
            <Sparkles className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
              Générateur de Pitch de Conversion MVP
              <span className="bg-indigo-100 text-indigo-800 text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase tracking-wider">
                Pitch Kit
              </span>
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5 font-medium leading-relaxed max-w-xl">
              Déclenchez une conversion instantanée auprès de vos prospects (inscriptions bêtas, premiers appels) grâce à des éléments de pitch d'égal à égal ultra-authentiques et dénués de langue de bois.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {pitchData && (
            <button
              type="button"
              onClick={handleCopyAllKit}
              className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold py-2.5 px-4 rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Clipboard className="w-3.5 h-3.5" />}
              Copier tout le Pitch
            </button>
          )}

          <button
            type="button"
            onClick={handleGeneratePitch}
            disabled={isLoading}
            className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2.5 px-4 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            )}
            {pitchData ? "Régénérer le Kit" : "Générer le Kit"}
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

      {/* Screen Report Output display layout */}
      {isLoading ? (
        <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
          <span className="text-xs text-slate-500 font-semibold font-mono animate-pulse">
            Rdaction de vos éléments de pitch d'égal à égal...
          </span>
        </div>
      ) : pitchData ? (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          {/* Sub-tab navigation selectors */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-2.5">
            {[
              { id: "landing", label: "Copy Landing Page", icon: Layout },
              { id: "outreach", label: "Message Communautaire / DM", icon: MessageSquare },
              { id: "elevator", label: "Elevator Pitch 30s", icon: Megaphone },
              { id: "objections", label: "Réassurance & Objections", icon: HelpCircle }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSubTab(tab.id as ActiveTab)}
                className={`py-2 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeSubTab === tab.id
                    ? "bg-slate-100 text-slate-900 border-none"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-50 border-none"
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sub-tab content view switcher */}
          
          {/* 1. Landing Page Copy Tab */}
          {activeSubTab === "landing" && (
            <div className="space-y-4">
              
              {/* Simulated browser viewport */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden max-w-2xl mx-auto shadow-2xs">
                {/* Browser bar */}
                <div className="bg-white border-b border-slate-200 px-4 py-1.5 flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <div className="bg-slate-100 text-[9px] text-slate-400 font-mono rounded px-3 py-0.5 ml-2 truncate w-60">
                    https://votre-mvp-solopreneur.carrd.co
                  </div>
                </div>

                {/* Main Hero Copy section */}
                <div className="p-8 text-center space-y-6 bg-white">
                  <div className="max-w-lg mx-auto space-y-3.5">
                    <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-snug">
                      {pitchData.landingPageCopy?.heroTitle}
                    </h1>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed max-w-md mx-auto">
                      {pitchData.landingPageCopy?.heroSubtitle}
                    </p>
                  </div>

                  {/* Primary CTA button preview */}
                  <div>
                    <button type="button" className="bg-indigo-600 text-white text-xs font-bold py-2.5 px-6 rounded-lg shadow-xs flex items-center gap-1 mx-auto hover:bg-indigo-700 transition-colors cursor-default">
                      {pitchData.landingPageCopy?.primaryCTA} <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Key Benefits grid view */}
                <div className="p-6 bg-slate-50/50 border-t border-slate-100 grid md:grid-cols-3 gap-4">
                  {pitchData.landingPageCopy?.keyBenefits?.map((benefit, idx) => (
                    <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200/60 shadow-3xs space-y-1">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="text-[11px] font-extrabold text-slate-900 block leading-tight">
                          {benefit.title}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-normal font-medium">
                        {benefit.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick copy options for Landing Copy */}
              <div className="flex justify-end gap-2 max-w-2xl mx-auto">
                <button
                  type="button"
                  onClick={() => handleCopyText(pitchData.landingPageCopy?.heroTitle)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold py-1.5 px-3 rounded-lg flex items-center gap-1 cursor-pointer"
                >
                  <Clipboard className="w-3 h-3" /> Copier le Titre Hero
                </button>
                <button
                  type="button"
                  onClick={handleCopyLandingAll}
                  className="bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold py-1.5 px-4 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Clipboard className="w-3 h-3" />}
                  Copier toute la Landing Copy
                </button>
              </div>

            </div>
          )}

          {/* 2. Message Communautaire / DM Tab */}
          {activeSubTab === "outreach" && (
            <div className="space-y-4">
              
              {/* Simulated chat message window */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden max-w-xl mx-auto shadow-2xs">
                <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 text-[10px] font-mono text-slate-500 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold">
                    <User className="w-3.5 h-3.5 text-slate-600" />
                    Template Prêt à Envoyer (DM / Forum)
                  </div>
                  <span className="bg-indigo-100 text-indigo-700 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase font-mono">
                    LinkedIn / Twitter / Discord
                  </span>
                </div>

                <div className="p-5 bg-white">
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-normal italic bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                    {pitchData.coldOutreachTemplate}
                  </p>
                </div>
              </div>

              <div className="flex justify-end max-w-xl mx-auto">
                <button
                  type="button"
                  onClick={() => handleCopyText(pitchData.coldOutreachTemplate)}
                  className="bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold py-1.5 px-4 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Clipboard className="w-3.5 h-3.5" />}
                  Copier le Template de Message
                </button>
              </div>

            </div>
          )}

          {/* 3. Elevator Pitch 30s Tab */}
          {activeSubTab === "elevator" && (
            <div className="space-y-4">
              
              <div className="bg-slate-50 rounded-xl p-5 border border-slate-200/50 space-y-4 max-w-xl mx-auto shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-indigo-500 text-white rounded-full">
                      <Volume2 className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider">
                      Script Oral à réciter (30 secondes)
                    </span>
                  </div>
                  
                  {/* Simulated player marker */}
                  <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-full px-2 py-0.5 text-[9px] text-slate-500 font-mono font-bold shadow-3xs">
                    <Play className="w-2.5 h-2.5 text-indigo-600 fill-indigo-600" />
                    0:30
                  </div>
                </div>

                <p className="text-xs text-slate-800 leading-relaxed font-semibold italic bg-white p-4 rounded-xl border border-slate-100 whitespace-pre-wrap">
                  "{pitchData.elevatorPitch30s}"
                </p>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => handleCopyText(pitchData.elevatorPitch30s)}
                    className="bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold py-1.5 px-4 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Clipboard className="w-3 h-3" />}
                    Copier le Script
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* 4. Réassurance & Objections Tab (Collapsible cards!) */}
          {activeSubTab === "objections" && (
            <div className="space-y-4 max-w-xl mx-auto">
              <span className="text-[10px] font-black text-slate-400 font-mono uppercase tracking-wider block">
                💡 Leveurs de Doute & Cartes Dépliantes
              </span>

              <div className="space-y-2">
                {pitchData.conversionObjections?.map((obj, idx) => {
                  const isExpanded = expandedObjection === idx;
                  return (
                    <div 
                      key={idx} 
                      className="bg-white rounded-xl border border-slate-200 shadow-3xs overflow-hidden transition-all duration-200"
                    >
                      {/* Accordion header */}
                      <button
                        type="button"
                        onClick={() => setExpandedObjection(isExpanded ? null : idx)}
                        className="w-full text-left px-4 py-3 bg-slate-50/50 hover:bg-slate-50 flex items-center justify-between gap-3 font-semibold text-slate-900 border-none cursor-pointer"
                      >
                        <div className="flex items-start gap-2.5">
                          <HelpCircle className="w-4.5 h-4.5 text-rose-500 shrink-0 mt-0.5" />
                          <span className="text-xs leading-snug">{obj.objection}</span>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                      </button>

                      {/* Accordion body response */}
                      {isExpanded && (
                        <div className="p-4 border-t border-slate-100 bg-white flex gap-2.5 animate-in slide-in-from-top-2 duration-150">
                          <Zap className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <span className="text-[9px] font-black text-indigo-600 font-mono uppercase tracking-wider block">
                              Votre Réponse Sincère (Solopreneur)
                            </span>
                            <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                              {obj.rebuttal}
                            </p>
                          </div>
                        </div>
                      )}

                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const objText = pitchData.conversionObjections?.map(o => `Obstacle : ${o.objection}\nSolution : ${o.rebuttal}`).join("\n\n") || "";
                    handleCopyText(objText);
                  }}
                  className="bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold py-1.5 px-4 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Clipboard className="w-3 h-3" />}
                  Copier toutes les Réassurances
                </button>
              </div>

            </div>
          )}

          <div className="text-[10px] text-slate-400 font-mono text-right">
            Dernière actualisation du kit : {version.mvpPitch?.updatedAt ? new Date(version.mvpPitch.updatedAt).toLocaleString() : 'Récemment'}
          </div>

        </div>
      ) : (
        <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 border border-dashed border-slate-200 rounded-xl bg-slate-50/30">
          <div className="p-3 bg-white border border-slate-200 rounded-full text-slate-400 shadow-2xs">
            <Sparkles className="w-6 h-6 text-indigo-500" />
          </div>
          <div>
            <h5 className="text-xs font-bold text-slate-800">Aucun Kit de Pitch de Conversion généré</h5>
            <p className="text-[11px] text-slate-400 mt-1 max-w-sm">
              Cliquez sur le bouton « Générer le Kit » en haut à droite pour lancer la rédaction complète par l'IA.
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
