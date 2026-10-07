import React, { useState, useEffect } from "react";
import { 
  doc, 
  setDoc, 
  updateDoc, 
  serverTimestamp 
} from "firebase/firestore";
import { db } from "./firebase";
import { 
  Briefcase, 
  X, 
  Check, 
  RotateCw, 
  Lightbulb,
  Plus,
  ArrowRight,
  Star
} from "lucide-react";

import { 
  CanvasItem, 
  BMC, 
  PreQualificationTest, 
  Version,
  ProjectVersion
} from "./types/project";

export type {
  CanvasItem,
  BMC,
  PreQualificationTest,
  Version,
  ProjectVersion
};

interface ProjectEditorProps {
  userId: string;
  projectId?: string | null;       // Null/undefined means we are creating a brand new project
  version?: Version | null;         // Existing version context (null/undefined means creating first version)
  isPivotCreation?: boolean;        // True if creating a brand new sequential pivot version
  onSaveSuccess: (projectId: string, versionId: string) => void;
  onCancel: () => void;
}

// Support robust backward compatibility conversion on the fly
export const ensureCanvasItems = (items: any[] | undefined): CanvasItem[] => {
  if (!items) return [];
  return items.map((item, idx) => {
    if (typeof item === "string") {
      return {
        id: `item_${idx}_` + Math.random().toString(36).substring(2, 7),
        text: item,
        confidence: 3
      };
    }
    return {
      id: item?.id || `item_${idx}_` + Math.random().toString(36).substring(2, 7),
      text: item?.text || "",
      confidence: typeof item?.confidence === "number" ? item.confidence : 3
    };
  });
};

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

export default function ProjectEditor({
  userId,
  projectId,
  version,
  isPivotCreation = false,
  onSaveSuccess,
  onCancel
}: ProjectEditorProps) {
  const [projectTitle, setProjectTitle] = useState("");
  const [userInput, setUserInput] = useState("");
  const [pivotReason, setPivotReason] = useState("");
  const [bmc, setBmc] = useState<BMC>(emptyBMC());
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isPivotCreation && version) {
      setUserInput(version.userInput);
      setBmc(emptyBMC());
      setPivotReason("");
    } else if (version) {
      setUserInput(version.userInput);
      setPivotReason(version.pivotReason || "");
      const canvas = version.businessModelCanvas || {};
      setBmc({
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
    } else {
      setProjectTitle("");
      setUserInput("");
      setPivotReason("");
      setBmc(emptyBMC());
    }
  }, [projectId, version, isPivotCreation]);

  const handleItemTextChange = (section: keyof BMC, index: number, value: string) => {
    setBmc(prev => {
      const list = [...prev[section]];
      list[index] = { ...list[index], text: value };
      return { ...prev, [section]: list };
    });
  };

  const handleItemConfidenceChange = (section: keyof BMC, index: number, rating: number) => {
    setBmc(prev => {
      const list = [...prev[section]];
      list[index] = { ...list[index], confidence: rating };
      return { ...prev, [section]: list };
    });
  };

  const addItem = (section: keyof BMC) => {
    setBmc(prev => {
      const newItem: CanvasItem = {
        id: "item_" + Math.random().toString(36).substring(2, 11),
        text: "",
        confidence: 3 // Default confidence level
      };
      const list = [...prev[section], newItem];
      return { ...prev, [section]: list };
    });
  };

  const removeItem = (section: keyof BMC, index: number) => {
    setBmc(prev => {
      const list = [...prev[section]];
      list.splice(index, 1);
      return { ...prev, [section]: list };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!userInput.trim()) {
      setError("Veuillez renseigner le descriptif de votre idée business.");
      return;
    }
    if (isPivotCreation && !pivotReason.trim()) {
      setError("Le motif de pivot stratégique est obligatoire pour créer une nouvelle version.");
      return;
    }
    if (!projectId && !projectTitle.trim()) {
      setError("Le titre du projet est requis pour une création.");
      return;
    }

    setLoading(true);

    try {
      if (!projectId) {
        const newProjId = "proj_" + Math.random().toString(36).substring(2, 11);
        const newVerId = "v_1_" + Math.random().toString(36).substring(2, 11);

        const projectDoc = {
          id: newProjId,
          title: projectTitle.trim(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          currentVersionId: newVerId,
          ownerId: userId,
          status: 'active' as const
        };
        await setDoc(doc(db, "projects", newProjId), projectDoc);

        const firstVersionDoc: Version = {
          id: newVerId,
          versionNumber: 1,
          createdAt: serverTimestamp(),
          userInput: userInput.trim(),
          businessModelCanvas: bmc,
          aiAnalysisStatus: 'none',
          validationStatus: 'none',
          ownerId: userId
        };
        await setDoc(doc(db, "projects", newProjId, "versions", newVerId), firstVersionDoc);

        onSaveSuccess(newProjId, newVerId);

      } else if (isPivotCreation && version) {
        const nextNumber = version.versionNumber + 1;
        const pivotVerId = `v_${nextNumber}_` + Math.random().toString(36).substring(2, 11);

        const newVersionDoc: Version = {
          id: pivotVerId,
          versionNumber: nextNumber,
          createdAt: serverTimestamp(),
          pivotReason: pivotReason.trim(),
          userInput: userInput.trim(),
          businessModelCanvas: bmc,
          aiAnalysisStatus: 'none',
          validationStatus: 'none',
          ownerId: userId
        };
        await setDoc(doc(db, "projects", projectId, "versions", pivotVerId), newVersionDoc);

        await updateDoc(doc(db, "projects", projectId), {
          currentVersionId: pivotVerId,
          updatedAt: serverTimestamp()
        });

        onSaveSuccess(projectId, pivotVerId);

      } else if (version) {
        await updateDoc(doc(db, "projects", projectId, "versions", version.id), {
          userInput: userInput.trim(),
          businessModelCanvas: bmc
        });

        await updateDoc(doc(db, "projects", projectId), {
          updatedAt: serverTimestamp()
        });

        onSaveSuccess(projectId, version.id);
      }
    } catch (err: any) {
      console.error("Firestore Save error:", err);
      setError(err.message || "Une erreur est survenue lors de la sauvegarde dans Firestore.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-7xl mx-auto w-full animate-in fade-in duration-200">
      
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-indigo-600 animate-pulse" />
            {isPivotCreation ? "Créer un Pivot (Lean Canvas)" : projectId ? `Modifier Version #${version?.versionNumber}` : "Nouveau Projet (Lean Canvas)"}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Approche Local-First : Modifiez manuellement vos cases et définissez votre **niveau de confiance / preuve** sur chaque hypothèse.
          </p>
        </div>
        
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold py-2 px-4 rounded-xl transition-all cursor-pointer disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold py-2 px-5 rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin"></div>
            ) : (
              <Check className="w-4 h-4" />
            )}
            {isPivotCreation ? "Enregistrer le Pivot" : "Enregistrer les modifications"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start gap-3 text-sm">
          <X className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        
        {/* Left Column */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <span className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider block border-b border-slate-100 pb-2">
              Champs obligatoires
            </span>

            {!projectId && (
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">Titre du Projet</label>
                <input
                  type="text"
                  required
                  placeholder="Ex : VeloCargo Pro"
                  value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg p-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-all outline-none"
                />
              </div>
            )}

            {isPivotCreation && (
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 text-amber-700 flex items-center gap-1">
                  <RotateCw className="w-3.5 h-3.5" /> Raison du Pivot
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Ex : Se concentrer sur les professionnels au lieu des particuliers..."
                  value={pivotReason}
                  onChange={(e) => setPivotReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg p-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-all outline-none"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">Description Globale de l'Idée</label>
              <textarea
                required
                rows={10}
                placeholder="Décrivez votre idée, le problème résolu, l'audience cible..."
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg p-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-all outline-none font-normal"
              />
            </div>
          </div>

          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/40 text-xs text-slate-500 space-y-2">
            <Lightbulb className="w-5 h-5 text-indigo-600" />
            <p className="font-semibold text-slate-800">Évaluation Lean Startup :</p>
            <p className="leading-relaxed">
              Pour chaque hypothèse ajoutée sur le canevas à droite, indiquez votre niveau de confiance / preuve (1 = pure hypothèse, 5 = fait scientifique avéré). L'IA d'audit calculera la criticité des risques !
            </p>
          </div>
        </div>

        {/* Right Column: Lean Canvas with manual confidence score editors */}
        <div className="md:col-span-2 space-y-6">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <Briefcase className="w-4 h-4 text-indigo-600 animate-pulse" />
            Saisie et confiance par hypothèse (Lean Canvas)
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {Object.entries({
              problems: "1. Le problème (Problems)",
              customerSegments: "2. Les segments de clients (Customer Segments)",
              valuePropositions: "3. La proposition de valeur (Value Proposition)",
              solution: "4. La solution (Solution)",
              channels: "5. Les canaux (Channels)",
              revenueStreams: "6. Les sources de revenus (Revenue Streams)",
              costStructure: "7. La structure des coûts (Cost Structure)",
              keyMetrics: "8. Les indicateurs clés (Key Metrics)",
              unfairAdvantage: "9. L'avantage injuste (Unfair Advantage)"
            }).map(([sectionKey, label]) => {
              const sKey = sectionKey as keyof BMC;
              const items = bmc[sKey] || [];
              return (
                <div key={sectionKey} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider block mb-3 border-b border-slate-100 pb-1.5">
                      {label}
                    </span>
                    <div className="space-y-3 mb-3 max-h-[220px] overflow-y-auto pr-1">
                      {items.map((item, idx) => (
                        <div key={item.id || idx} className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/60 flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-1">
                            <textarea
                              rows={2}
                              value={item.text}
                              onChange={(e) => handleItemTextChange(sKey, idx, e.target.value)}
                              placeholder={`Définir cette hypothèse...`}
                              className="flex-1 bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-800 outline-none focus:border-indigo-500 font-normal resize-y"
                            />
                            <button
                              type="button"
                              onClick={() => removeItem(sKey, idx)}
                              className="text-slate-400 hover:text-red-500 p-1 hover:bg-red-50 rounded shrink-0"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          
                          {/* Rating score Selector */}
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider font-mono">
                              Confiance (Niveau de preuve) :
                            </span>
                            <div className="flex items-center gap-0.5">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  type="button"
                                  onClick={() => handleItemConfidenceChange(sKey, idx, star)}
                                  className="p-0.5 shrink-0 hover:scale-115 transition-transform cursor-pointer"
                                  title={`${star}/5 : ${
                                    star === 1 ? 'Intuition Pure' :
                                    star === 2 ? 'Intuition Forte' :
                                    star === 3 ? 'Quelques Interviews' :
                                    star === 4 ? 'Smoke Tests Positifs' : 'Ventes Réelles / Données Dures'
                                  }`}
                                >
                                  <Star
                                    className={`w-3.5 h-3.5 ${
                                      star <= (item.confidence || 3)
                                        ? "text-amber-500 fill-amber-400"
                                        : "text-slate-200"
                                    }`}
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                      {items.length === 0 && (
                        <p className="text-[11px] text-slate-400 italic">Aucune hypothèse saisie pour le moment.</p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => addItem(sKey)}
                    className="w-full py-1 text-center border border-dashed border-slate-200 rounded text-[11px] font-semibold text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/50 cursor-pointer transition-colors"
                  >
                    + Ajouter une hypothèse
                  </button>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </form>
  );
}
