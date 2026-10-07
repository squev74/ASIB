import React, { useState, useEffect } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { 
  Briefcase, 
  Star, 
  Check, 
  Plus, 
  Trash2, 
  Compass, 
  Activity, 
  AlertTriangle, 
  Edit3,
  X,
  CheckCircle2,
  Lock
} from "lucide-react";
import { BMC, Version, CanvasItem } from "./types/project";
import { ensureCanvasItems } from "./ProjectEditor";

interface InteractiveCanvasProps {
  userId: string;
  projectId: string;
  version: Version;
  onSaveSuccess?: () => void;
  onSaveError?: (error: string) => void;
}

const emptyBMC = (): BMC => ({
  problems: [],
  customerSegments: [],
  valuePropositions: [],
  solution: [],
  channels: [],
  revenueStreams: [],
  costStructure: [],
  keyMetrics: [],
  unfairAdvantage: []
});

export default function InteractiveCanvas({
  userId,
  projectId,
  version,
  onSaveSuccess,
  onSaveError
}: InteractiveCanvasProps) {
  // Local active copy of the canvas for instant typing & editing
  const [localBmc, setLocalBmc] = useState<BMC>(emptyBMC());
  const [saving, setSaving] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  // UX State: Control whether the entire canvas is in Read-Only or Edit Mode
  const [isEditing, setIsEditing] = useState(false);

  // Initialize the local canvas from the version data
  useEffect(() => {
    if (version) {
      const canvas = version.businessModelCanvas || {};
      setLocalBmc({
        problems: ensureCanvasItems(canvas.problems),
        customerSegments: ensureCanvasItems(canvas.customerSegments),
        valuePropositions: ensureCanvasItems(canvas.valuePropositions),
        solution: ensureCanvasItems(canvas.solution),
        channels: ensureCanvasItems(canvas.channels),
        revenueStreams: ensureCanvasItems(canvas.revenueStreams),
        costStructure: ensureCanvasItems(canvas.costStructure),
        keyMetrics: ensureCanvasItems(canvas.keyMetrics),
        unfairAdvantage: ensureCanvasItems(canvas.unfairAdvantage)
      });
    }
  }, [version]);

  // Handle local text inputs
  const handleTextChange = (key: keyof BMC, index: number, text: string) => {
    setLocalBmc((prev: BMC) => {
      const list = [...prev[key]];
      list[index] = { ...list[index], text };
      return { ...prev, [key]: list };
    });
  };

  // Handle local confidence star ratings
  const handleConfidenceChange = (key: keyof BMC, index: number, score: number) => {
    setLocalBmc((prev: BMC) => {
      const list = [...prev[key]];
      list[index] = { ...list[index], confidence: score };
      return { ...prev, [key]: list };
    });
  };

  // Add new item to a specific canvas zone
  const handleAddItem = (key: keyof BMC) => {
    setLocalBmc((prev: BMC) => {
      const newItem: CanvasItem = {
        id: "item_" + Math.random().toString(36).substring(2, 11),
        text: "",
        confidence: 3 // Start with average confidence level
      };
      return { ...prev, [key]: [...prev[key], newItem] };
    });
  };

  // Remove item from a specific canvas zone
  const handleRemoveItem = (key: keyof BMC, index: number) => {
    setLocalBmc((prev: BMC) => {
      const list = [...prev[key]];
      list.splice(index, 1);
      return { ...prev, [key]: list };
    });
  };

  // Direct Firestore update save without invoking any LLM / AI calls
  const handleSaveChangesOnly = async () => {
    setSaving(true);
    setFeedbackMsg(null);

    const docRef = doc(db, "projects", projectId, "versions", version.id);

    try {
      // Direct silent save of modified businessModelCanvas to Firestore
      await updateDoc(docRef, {
        businessModelCanvas: localBmc
      });

      setFeedbackMsg({
        type: "success",
        text: "Hypothèses et scores de confiance enregistrés avec succès !"
      });

      // Automatically lock back to Read-Only mode for comfortable, static reading
      setIsEditing(false);

      if (onSaveSuccess) onSaveSuccess();
    } catch (err: any) {
      console.error("Local save failed:", err);
      const errMsg = err.message || "Erreur lors de la mise à jour sur Firestore.";
      setFeedbackMsg({
        type: "error",
        text: errMsg
      });
      if (onSaveError) onSaveError(errMsg);
    } finally {
      setSaving(false);
    }
  };

  // Cancel edits and restore canvas state from Firestore
  const handleCancelEdits = () => {
    setFeedbackMsg(null);
    setIsEditing(false);
    if (version) {
      const canvas = version.businessModelCanvas || {};
      setLocalBmc({
        problems: ensureCanvasItems(canvas.problems),
        customerSegments: ensureCanvasItems(canvas.customerSegments),
        valuePropositions: ensureCanvasItems(canvas.valuePropositions),
        solution: ensureCanvasItems(canvas.solution),
        channels: ensureCanvasItems(canvas.channels),
        revenueStreams: ensureCanvasItems(canvas.revenueStreams),
        costStructure: ensureCanvasItems(canvas.costStructure),
        keyMetrics: ensureCanvasItems(canvas.keyMetrics),
        unfairAdvantage: ensureCanvasItems(canvas.unfairAdvantage)
      });
    }
  };

  // Helper to map and find matching AI validation audit results for a specific item id
  const getAIResultForItem = (itemId: string) => {
    if (!version.validationResult?.canvas_analysis) return null;
    return version.validationResult.canvas_analysis.find((a: any) => a.element_id === itemId) || null;
  };

  // Helper to render the 1-5 star ratings (Supports both Read-Only & Edit mode states)
  const renderConfidenceStars = (key: keyof BMC, index: number, confidence: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => {
          if (!isEditing) {
            // Read-Only static presentation
            return (
              <Star
                key={star}
                className={`w-3.5 h-3.5 ${
                  star <= (confidence || 3)
                    ? "text-amber-500 fill-amber-400"
                    : "text-slate-200"
                }`}
              />
            );
          }
          // Interactive Edit Mode rating buttons
          return (
            <button
              key={star}
              type="button"
              onClick={() => handleConfidenceChange(key, index, star)}
              className="p-0.5 shrink-0 transition-transform hover:scale-125 cursor-pointer"
              title={`Confiance : ${star}/5`}
            >
              <Star
                className={`w-3.5 h-3.5 ${
                  star <= (confidence || 3)
                    ? "text-amber-500 fill-amber-400"
                    : "text-slate-200"
                }`}
              />
            </button>
          );
        })}
      </div>
    );
  };

  // Main UI Grid Box Renderer
  const renderCanvasBox = (key: keyof BMC, title: string, subtitle: string, bgColor: string = "bg-white") => {
    const items = localBmc[key] || [];

    return (
      <div className={`${bgColor} p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between min-h-[220px] transition-all hover:border-slate-300`}>
        <div>
          <div className="border-b border-slate-100 pb-2 mb-3">
            <span className="text-[10px] font-mono font-extrabold uppercase text-slate-400 tracking-wider block">
              {title}
            </span>
            <span className="text-[9px] text-slate-400 font-normal leading-tight">
              {subtitle}
            </span>
          </div>

          <div className="space-y-3 mb-3 max-h-[350px] overflow-y-auto pr-1">
            {items.map((item: any, idx: number) => {
              const aiAudit = getAIResultForItem(item.id);

              return (
                <div key={item.id || idx} className="bg-slate-50/50 p-2.5 rounded-lg border border-slate-100 flex flex-col gap-2 animate-in fade-in duration-100">
                  <div className="flex items-start justify-between gap-1.5">
                    {isEditing ? (
                      // Edit mode: Interactive Textarea
                      <textarea
                        rows={2}
                        value={item.text}
                        onChange={(e) => handleTextChange(key, idx, e.target.value)}
                        placeholder="Saisir l'hypothèse..."
                        className="flex-1 bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-800 outline-none focus:border-indigo-500 font-normal resize-y shadow-xs"
                      />
                    ) : (
                      // Read-only mode: Beautiful clear static text
                      <p className="text-xs font-semibold text-slate-800 leading-relaxed flex-1 py-1">
                        {item.text || <span className="text-slate-300 italic font-normal">Hypothèse vide</span>}
                      </p>
                    )}

                    {isEditing && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(key, idx)}
                        className="text-slate-300 hover:text-red-500 p-1 hover:bg-red-50 rounded shrink-0 transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Confidence levels row */}
                  <div className="flex items-center justify-between gap-2 border-t border-slate-100/50 pt-2">
                    <span className="text-[8px] text-slate-400 font-extrabold uppercase tracking-widest font-mono">
                      Confiance :
                    </span>
                    {renderConfidenceStars(key, idx, item.confidence || 3)}
                  </div>

                  {/* Matched AI Audit block */}
                  {aiAudit && (
                    <div className="mt-2 border-t border-dashed border-slate-200 pt-2 space-y-1.5 text-[11px] animate-in slide-in-from-top-1 duration-200">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase ${
                          aiAudit.ai_risk_assessment === 'Coherent' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                          aiAudit.ai_risk_assessment === 'Surevalue' ? 'bg-rose-50 text-red-700 border-rose-100' :
                          'bg-blue-50 text-blue-700 border-blue-100'
                        }`}>
                          {aiAudit.ai_risk_assessment === 'Coherent' ? 'Cohérent' :
                           aiAudit.ai_risk_assessment === 'Surevalue' ? 'Surévalué !' : 'Sous-estimé'}
                        </span>

                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${
                          aiAudit.criticity === 'Haute' ? 'bg-red-600 text-white' :
                          aiAudit.criticity === 'Moyenne' ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-700'
                        }`}>
                          Crit: {aiAudit.criticity}
                        </span>
                      </div>

                      <p className="text-[10px] text-slate-500 leading-normal italic">
                        "{aiAudit.ai_comment}"
                      </p>

                      <div className="bg-slate-900 text-slate-200 p-2 rounded border border-slate-950 text-[10px]">
                        <div className="flex items-center gap-1 text-[8px] text-purple-400 font-mono font-bold uppercase tracking-wider mb-0.5">
                          <Activity className="w-3 h-3" /> Action de test :
                        </div>
                        <p className="font-medium text-white leading-normal">
                          {aiAudit.suggested_action}
                        </p>
                      </div>
                    </div>
                  )}

                </div>
              );
            })}

            {items.length === 0 && (
              <p className="text-[11px] text-slate-400 italic text-center py-4 bg-slate-50/50 rounded-lg border border-dashed border-slate-100">
                Aucune hypothèse saisie.
              </p>
            )}
          </div>
        </div>

        {isEditing && (
          <button
            type="button"
            onClick={() => handleAddItem(key)}
            className="w-full py-1 text-center border border-dashed border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 rounded text-[10px] font-bold text-indigo-600 cursor-pointer transition-colors"
          >
            + Ajouter une hypothèse
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Dynamic Action header (Edit/Save switch) */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Compass className="w-5 h-5 text-indigo-600" />
            Hypothèses tactiques & Validation
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {isEditing 
              ? "Mode Édition Actif : Tapez vos hypothèses et déterminez vos scores de confiance." 
              : "Mode Lecture Confortable : Cliquez sur 'Éditer Canvas' à droite pour apporter des modifications."}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {!isEditing ? (
            // READ-ONLY View Action button
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold py-2.5 px-5 rounded-xl border border-indigo-200/60 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Edit3 className="w-4 h-4" />
              Éditer Canvas
            </button>
          ) : (
            // EDITING View Action buttons (Save and Cancel)
            <>
              <button
                type="button"
                onClick={handleCancelEdits}
                disabled={saving}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2.5 px-4 rounded-xl transition-all cursor-pointer disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSaveChangesOnly}
                disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 px-5 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {saving ? (
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white/20 border-t-white animate-spin"></div>
                ) : (
                  <Check className="w-4 h-4" />
                )}
                Enregistrer les hypothèses
              </button>
            </>
          )}
        </div>
      </div>

      {/* Floating feedback alert */}
      {feedbackMsg && (
        <div className={`p-4 rounded-xl border flex items-start gap-2.5 text-xs animate-in slide-in-from-top-2 ${
          feedbackMsg.type === 'success' 
            ? "bg-emerald-50 border-emerald-200 text-emerald-900" 
            : "bg-red-50 border-red-200 text-red-900"
        }`}>
          {feedbackMsg.type === 'success' ? (
            <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4.5 h-4.5 text-red-600 shrink-0" />
          )}
          <p className="font-semibold">{feedbackMsg.text}</p>
        </div>
      )}

      {/* The Classic 5-Column Lean Canvas Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3.5">
        
        {/* Column 1: Problems */}
        <div className="lg:col-span-1">
          {renderCanvasBox(
            "problems", 
            "1. Le Problème (Problems)", 
            "Les trois principaux points de douleur ou besoins non satisfaits de vos clients actuels.",
            "bg-white"
          )}
        </div>

        {/* Column 2: Solutions & Key Metrics */}
        <div className="lg:col-span-1 flex flex-col gap-3.5">
          {renderCanvasBox(
            "solution", 
            "4. La Solution (Solution)", 
            "Les caractéristiques minimales de votre produit ou service pour résoudre les problèmes identifiés.",
            "bg-white"
          )}
          {renderCanvasBox(
            "keyMetrics", 
            "8. Indicateurs Clés (Key Metrics)", 
            "Les chiffres essentiels (KPIs) pour mesurer le succès et l'avancement de votre produit.",
            "bg-white"
          )}
        </div>

        {/* Column 3: Unique Value Proposition */}
        <div className="lg:col-span-1">
          {renderCanvasBox(
            "valuePropositions", 
            "3. Proposition de Valeur (Value Proposition)", 
            "Le message clair et percutant qui explique pourquoi votre offre est unique et utile.",
            "bg-indigo-900/10 border-indigo-200 hover:border-indigo-300"
          )}
        </div>

        {/* Column 4: Unfair Advantage & Channels */}
        <div className="lg:col-span-1 flex flex-col gap-3.5">
          {renderCanvasBox(
            "unfairAdvantage", 
            "9. Avantage Injuste (Unfair Advantage)", 
            "Ce que vous possédez et qui ne peut pas être facilement copié ou acheté par la concurrence.",
            "bg-white"
          )}
          {renderCanvasBox(
            "channels", 
            "5. Les Canaux (Channels)", 
            "Les moyens de communication et de distribution pour atteindre vos clients.",
            "bg-white"
          )}
        </div>

        {/* Column 5: Customer Segments */}
        <div className="lg:col-span-1">
          {renderCanvasBox(
            "customerSegments", 
            "2. Les segments de clients (Customer Segments)", 
            "Le public cible et les utilisateurs visés par votre produit.",
            "bg-white"
          )}
        </div>

      </div>

      {/* Bottom Row: Cost Structure & Revenue Streams */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {renderCanvasBox(
          "costStructure", 
          "7. La Structure des Coûts (Cost Structure)", 
          "L'ensemble des dépenses engendrées pour faire fonctionner le projet (marketing, développement, etc.).",
          "bg-white"
        )}
        {renderCanvasBox(
          "revenueStreams", 
          "6. Les Sources de Revenus (Revenue Streams)", 
          "Le modèle économique et la façon dont le projet va gagner de l'argent.",
          "bg-white"
        )}
      </div>

    </div>
  );
}
