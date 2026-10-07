import React, { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { 
  Sparkles, 
  ArrowRight, 
  Save, 
  HelpCircle, 
  Lightbulb, 
  RefreshCw,
  CheckCircle2,
  AlertTriangle
} from "lucide-react";
import { ProjectVersion } from "../types/project";

interface IdeationPhaseProps {
  projectId: string;
  version: ProjectVersion;
  onUpdatePhase: (newPhase: 'ideation' | 'benchmark' | 'canvas' | 'mvp') => Promise<void>;
  onSuccess?: () => void;
}

export default function IdeationPhase({ projectId, version, onUpdatePhase, onSuccess }: IdeationPhaseProps) {
  const [notes, setNotes] = useState(version.ideationNotes || version.userInput || "");
  const [questions, setQuestions] = useState<string[]>(version.ideationQuestions || []);
  const [isSaving, setIsSaving] = useState(false);
  const [isClarifying, setIsClarifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Manual save of ideation notes to Firestore
  const handleSaveNotes = async () => {
    setIsSaving(true);
    setErrorMsg(null);
    setSaveSuccess(false);

    const docRef = doc(db, "projects", projectId, "versions", version.id);
    try {
      await updateDoc(docRef, {
        ideationNotes: notes,
        userInput: notes // Synchronize with the version's central userInput text
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error("Failed to save ideation notes:", err);
      setErrorMsg("Impossible de sauvegarder vos notes. Veuillez réessayer.");
    } finally {
      setIsSaving(false);
    }
  };

  // Call backend AI to clarify rough notes
  const handleClarifyWithAI = async () => {
    if (!notes.trim()) {
      setErrorMsg("Veuillez d'abord saisir quelques lignes ou notes brutes.");
      return;
    }

    setIsClarifying(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/ideation-clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userInput: notes })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "La clarification de l'idée a échoué.");
      }

      const data = await res.json();
      const aiQuestions = data.questions || [];

      // Save questions in Firestore
      const docRef = doc(db, "projects", projectId, "versions", version.id);
      await updateDoc(docRef, {
        ideationNotes: notes,
        userInput: notes,
        ideationQuestions: aiQuestions
      });

      setQuestions(aiQuestions);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error("AI Clarification failed:", err);
      setErrorMsg(err.message || "Erreur de communication avec l'IA. Veuillez réessayer.");
    } finally {
      setIsClarifying(false);
    }
  };

  // Move to next step (benchmark & viability checks)
  const handleNextStep = async () => {
    // Automatically save notes first
    await handleSaveNotes();
    await onUpdatePhase("benchmark");
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Intro Header */}
      <div className="bg-gradient-to-r from-indigo-900 to-indigo-950 text-white p-6 rounded-2xl shadow-sm border border-indigo-950/40">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="p-1.5 bg-indigo-500/20 text-indigo-300 rounded-lg">
            <Lightbulb className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold font-mono text-indigo-300 uppercase tracking-widest">
            Étape 1 : Phase d'Idéation & Clarification
          </span>
        </div>
        <h3 className="text-xl font-black tracking-tight">Videz votre sac, structurez votre vision</h3>
        <p className="text-xs text-indigo-200 mt-1 max-w-2xl leading-relaxed">
          Saisissez vos idées en vrac, vos doutes, ou vos notes informelles. L'IA d'élite analysera vos notes pour vous poser 3 questions d'approfondissement sur mesure afin d'orienter vos recherches de marché.
        </p>
      </div>

      <div className="grid md:grid-cols-5 gap-6">
        
        {/* Left column: input form */}
        <div className="md:col-span-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 font-mono uppercase tracking-wider block">
              Vrac d'idées & Notes brutes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Je veux lancer une application mobile pour aider les clubs de Futsal locaux à planifier leurs tournois sans effort administratif. Beaucoup de clubs utilisent encore des fichiers Excel partagés et galèrent à coordonner..."
              className="w-full h-64 p-4 text-xs font-medium border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 focus:outline-hidden transition-all bg-slate-50/30 text-slate-800 resize-none"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveNotes}
                disabled={isSaving}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 px-4 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Enregistrer
              </button>

              <button
                type="button"
                onClick={handleClarifyWithAI}
                disabled={isClarifying || !notes.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isClarifying ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
                )}
                Clarifier mon idée avec l'IA
              </button>
            </div>

            {saveSuccess && (
              <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 animate-pulse font-mono">
                <CheckCircle2 className="w-3.5 h-3.5" /> Notes enregistrées !
              </span>
            )}
          </div>
        </div>

        {/* Right column: AI Questions output */}
        <div className="md:col-span-2 bg-slate-50 p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-1.5 border-b border-slate-200/60 pb-3">
              <HelpCircle className="w-4 h-4 text-indigo-500" />
              <h4 className="text-xs font-black text-slate-900 font-mono uppercase tracking-wider">
                Questions d'approfondissement (IA)
              </h4>
            </div>

            {isClarifying ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
                <span className="text-xs text-slate-500 font-semibold font-mono animate-pulse">
                  Génération des questions stratégiques...
                </span>
              </div>
            ) : questions.length > 0 ? (
              <div className="space-y-3">
                {questions.map((q, idx) => (
                  <div key={idx} className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs flex gap-3">
                    <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                      {q}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
                <div className="p-3 bg-white border border-slate-200 rounded-full text-slate-400">
                  <Lightbulb className="w-6 h-6" />
                </div>
                <p className="text-xs text-slate-400 font-medium max-w-xs leading-relaxed">
                  Cliquez sur « Clarifier mon idée avec l'IA » pour générer 3 questions clés afin de lever les zones de flou de votre concept.
                </p>
              </div>
            )}
          </div>

          {/* Error warning indicator */}
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-100 text-rose-700 p-3.5 rounded-xl text-xs font-semibold flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Stepper redirect forward action */}
          <button
            type="button"
            onClick={handleNextStep}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-3 px-5 rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            Passer à l'analyse de marché
            <ArrowRight className="w-4 h-4" />
          </button>

        </div>

      </div>

    </div>
  );
}
