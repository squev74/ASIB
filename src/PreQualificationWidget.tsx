import React, { useState, useEffect } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { 
  ShieldAlert, 
  CheckCircle2, 
  HelpCircle, 
  Activity, 
  Award, 
  ChevronRight, 
  Edit3, 
  AlertTriangle, 
  Calculator,
  Compass,
  ArrowRight,
  TrendingUp,
  X,
  Plus
} from "lucide-react";
import { Version, PreQualificationTest } from "./ProjectEditor";

interface PreQualificationWidgetProps {
  userId: string;
  projectId: string;
  version: Version;
  onSaveSuccess?: () => void;
}

// User-defined pre-qualification crash test evaluation algorithm
export function evaluateCrashTest(
  data: Omit<PreQualificationTest, 'preQualScore' | 'recommendation'>
): { score: number; recommendation: 'GO' | 'PIVOT_EARLY' | 'NO_GO' } {
  let score = 0;

  // 1. Pain (Max 30 pts)
  score += data.painIntensity * 6;

  // 2. Market Size (Max 25 pts)
  const marketSize = data.targetAudienceCount * data.estimatedAnnualPrice;
  if (marketSize >= 500000) score += 25;
  else if (marketSize >= 100000) score += 18;
  else if (marketSize >= 30000) score += 10;
  else score += 2;

  // 3. Vitesse de test (Max 20 pts)
  if (data.timeToFirstSale === 'days') score += 20;
  else if (data.timeToFirstSale === 'weeks') score += 12;
  else score += 5;

  // 4. Accessibilité GTM (Max 25 pts)
  if (data.goToMarketAccess === 'direct') score += 25;
  else if (data.goToMarketAccess === 'moderate') score += 15;
  else score += 5;

  // Recommandation
  let recommendation: 'GO' | 'PIVOT_EARLY' | 'NO_GO' = 'GO';
  if (score < 45) recommendation = 'NO_GO';
  else if (score < 70) recommendation = 'PIVOT_EARLY';

  return { score, recommendation };
}

export default function PreQualificationWidget({
  userId,
  projectId,
  version,
  onSaveSuccess
}: PreQualificationWidgetProps) {
  // Check if there is already a pre-qualification test saved
  const savedTest = version.preQualification;

  const [isEditing, setIsEditing] = useState(!savedTest);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Form Fields State
  const [painIntensity, setPainIntensity] = useState<number>(3);
  const [targetAudienceCount, setTargetAudienceCount] = useState<number>(1000);
  const [estimatedAnnualPrice, setEstimatedAnnualPrice] = useState<number>(100);
  const [usageFrequency, setUsageFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('weekly');
  const [perceivedValue, setPerceivedValue] = useState<'low' | 'medium' | 'high'>('medium');
  const [timeToFirstSale, setTimeToFirstSale] = useState<'days' | 'weeks' | 'months'>('weeks');
  const [goToMarketAccess, setGoToMarketAccess] = useState<'direct' | 'moderate' | 'hard'>('moderate');

  // Initialize fields on mount or version changes
  useEffect(() => {
    if (savedTest) {
      setPainIntensity(savedTest.painIntensity);
      setTargetAudienceCount(savedTest.targetAudienceCount);
      setEstimatedAnnualPrice(savedTest.estimatedAnnualPrice);
      setUsageFrequency(savedTest.usageFrequency);
      setPerceivedValue(savedTest.perceivedValue);
      setTimeToFirstSale(savedTest.timeToFirstSale);
      setGoToMarketAccess(savedTest.goToMarketAccess);
      setIsEditing(false);
    } else {
      setIsEditing(true);
    }
  }, [version, savedTest]);

  // Real-time calculated properties
  const marketSizeCalculated = targetAudienceCount * estimatedAnnualPrice;
  const currentCalc = evaluateCrashTest({
    painIntensity,
    targetAudienceCount,
    estimatedAnnualPrice,
    usageFrequency,
    perceivedValue,
    timeToFirstSale,
    goToMarketAccess
  });

  const handleSaveTest = async () => {
    setSaving(true);
    setFeedback(null);

    const completeTest: PreQualificationTest = {
      painIntensity,
      targetAudienceCount,
      estimatedAnnualPrice,
      usageFrequency,
      perceivedValue,
      timeToFirstSale,
      goToMarketAccess,
      preQualScore: currentCalc.score,
      recommendation: currentCalc.recommendation
    };

    try {
      const docRef = doc(db, "projects", projectId, "versions", version.id);
      await updateDoc(docRef, {
        preQualification: completeTest
      });

      // Update parent project document with the latest score for fast sidebar rendering
      const parentProjectRef = doc(db, "projects", projectId);
      await updateDoc(parentProjectRef, {
        latestPreQualScore: currentCalc.score
      });

      setFeedback({
        type: 'success',
        text: "Test de pré-qualification enregistré avec succès !"
      });
      setIsEditing(false);

      if (onSaveSuccess) onSaveSuccess();
    } catch (err: any) {
      console.error("Failed to save prequalification test:", err);
      setFeedback({
        type: 'error',
        text: err.message || "Erreur de connexion lors de l'enregistrement de l'évaluation."
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden animate-in fade-in duration-300">
      
      {/* Dynamic Widget Header */}
      <div className="bg-slate-50 border-b border-slate-100 p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="bg-indigo-100 p-2 rounded-xl text-indigo-700">
            <Calculator className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h4 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-1.5">
              Évaluation Préalable & Score d'Opportunité (Micro-TAM)
            </h4>
            <p className="text-[11px] text-slate-400">
              Évaluez la robustesse brute de votre idée avant de lancer l'analyse approfondie du Lean Canvas.
            </p>
          </div>
        </div>

        {!isEditing && savedTest && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="text-xs text-indigo-600 font-bold hover:bg-indigo-50 border border-indigo-200/50 px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" />
            Ré-évaluer
          </button>
        )}
      </div>

      {feedback && (
        <div className={`p-4 mx-5 mt-4 rounded-xl border text-xs flex items-center gap-2 ${
          feedback.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'
        }`}>
          {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-red-600" />}
          <span className="font-semibold">{feedback.text}</span>
        </div>
      )}

      {/* READ-ONLY SUMMARY DASHBOARD CARD VIEW */}
      {!isEditing && savedTest && (
        <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          
          {/* Radial score display */}
          <div className="md:col-span-3 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-slate-100 pb-5 md:pb-0 md:pr-6">
            <span className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-widest mb-3">
              Score d'opportunité
            </span>
            <div className="relative flex items-center justify-center">
              <svg className="w-24 h-24 transform -rotate-90">
                <circle cx="48" cy="48" r="38" className="text-slate-100" strokeWidth="6" stroke="currentColor" fill="transparent" />
                <circle
                  cx="48"
                  cy="48"
                  r="38"
                  className={`${
                    savedTest.preQualScore >= 70 ? 'text-emerald-500' :
                    savedTest.preQualScore >= 40 ? 'text-amber-500' : 'text-red-500'
                  } transition-all duration-1000`}
                  strokeWidth="6"
                  strokeDasharray={2 * Math.PI * 38}
                  strokeDashoffset={2 * Math.PI * 38 * (1 - savedTest.preQualScore / 100)}
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="transparent"
                />
              </svg>
              <div className="absolute text-center">
                <span className="text-2xl font-black text-slate-900 font-mono">
                  {savedTest.preQualScore}
                </span>
                <span className="text-[10px] text-slate-400 font-bold block -mt-1">/100</span>
              </div>
            </div>

            <span className={`mt-4 px-3 py-1 rounded-full text-[10px] font-black uppercase border tracking-wider ${
              savedTest.recommendation === 'GO' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
              savedTest.recommendation === 'PIVOT_EARLY' ? 'bg-amber-50 text-amber-700 border-amber-200' :
              'bg-rose-50 text-red-700 border-rose-200 animate-pulse'
            }`}>
              {savedTest.recommendation === 'GO' ? 'Signal Vert (GO)' :
               savedTest.recommendation === 'PIVOT_EARLY' ? 'Ajustements (PIVOT)' :
               'Alerte (NO GO)'}
            </span>
          </div>

          {/* Parameters evaluation summary */}
          <div className="md:col-span-9 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              
              <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Intensité de douleur</span>
                <span className="text-xs font-black text-slate-800 block mt-1">
                  {savedTest.painIntensity}/5 - {
                    savedTest.painIntensity === 5 ? 'Analgésique Critique' :
                    savedTest.painIntensity >= 3 ? 'Analgésique Modéré' : 'Vitamine Pure'
                  }
                </span>
              </div>

              <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Taille de Marché Estimée</span>
                <span className="text-xs font-black text-slate-800 block mt-1 text-indigo-600">
                  {(savedTest.targetAudienceCount * savedTest.estimatedAnnualPrice).toLocaleString('fr-FR')} € / an
                </span>
                <span className="text-[8px] text-slate-400 block">
                  ({savedTest.targetAudienceCount} p. x {savedTest.estimatedAnnualPrice}€)
                </span>
              </div>

              <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Fréquence d'usage</span>
                <span className="text-xs font-black text-slate-800 block mt-1 capitalize">
                  {savedTest.usageFrequency === 'daily' ? 'Quotidien' :
                   savedTest.usageFrequency === 'weekly' ? 'Hebdomadaire' :
                   savedTest.usageFrequency === 'monthly' ? 'Mensuel' : 'Annuel'}
                </span>
              </div>

              <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Valeur perçue client</span>
                <span className="text-xs font-black text-slate-800 block mt-1 capitalize">
                  {savedTest.perceivedValue === 'high' ? 'Élevée' :
                   savedTest.perceivedValue === 'medium' ? 'Moyenne' : 'Faible'}
                </span>
              </div>

              <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Vitesse de vente</span>
                <span className="text-xs font-black text-slate-800 block mt-1 capitalize">
                  {savedTest.timeToFirstSale === 'days' ? 'Quelques jours' :
                   savedTest.timeToFirstSale === 'weeks' ? 'Quelques semaines' : 'Plusieurs mois'}
                </span>
              </div>

              <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Accès au marché</span>
                <span className="text-xs font-black text-slate-800 block mt-1 capitalize">
                  {savedTest.goToMarketAccess === 'direct' ? 'Accès Immédiat' :
                   savedTest.goToMarketAccess === 'moderate' ? 'Modéré / Normal' : 'Complexe / Difficile'}
                </span>
              </div>

            </div>

            {/* Strategic Summary Advice */}
            <div className={`p-3.5 rounded-xl border text-[11px] leading-relaxed ${
              savedTest.recommendation === 'GO' ? 'bg-emerald-50/40 border-emerald-100 text-emerald-800' :
              savedTest.recommendation === 'PIVOT_EARLY' ? 'bg-amber-50/40 border-amber-100 text-amber-800' :
              'bg-red-50/40 border-red-100 text-red-800'
            }`}>
              <span className="font-extrabold uppercase tracking-wide block mb-1">Analyse Stratégique Préalable :</span>
              {savedTest.recommendation === 'GO' && (
                "Les indicateurs d'attraction, d'accessibilité et d'intensité de la douleur client sont au vert. L'opportunité d'affaire est jugée forte et propice à une validation immédiate. Remplissez maintenant votre Lean Canvas complet pour cartographier le plan d'affaires !"
              )}
              {savedTest.recommendation === 'PIVOT_EARLY' && (
                "L'idée présente des bases saines mais l'accessibilité client ou l'intensité du point de douleur nécessite des ajustements. Considérez un micro-pivot sur la cible ou le modèle de prix annuel pour gonfler la valeur perçue !"
              )}
              {savedTest.recommendation === 'NO_GO' && (
                "Alerte : Le score d'opportunité brut est très faible. Le problème visé semble être perçu comme accessoire (Vitamine) et l'accès à la cible est difficile ou trop coûteux. Repensez en profondeur la cible ou l'usage !"
              )}
            </div>
          </div>

        </div>
      )}

      {/* INTERACTIVE FORM EDITOR VIEW */}
      {isEditing && (
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-slate-100 pb-6">
            
            {/* Column 1 inputs */}
            <div className="space-y-4">
              
              {/* Pain intensity select */}
              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-1.5">
                  1. Intensité du Problème Client
                </label>
                <p className="text-[10px] text-slate-400 mb-2">
                  La solution que vous apportez est-elle perçue comme un simple confort ou une urgence absolue ?
                </p>
                <div className="grid grid-cols-5 gap-1.5">
                  {[1, 2, 3, 4, 5].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setPainIntensity(val)}
                      className={`py-2 rounded-lg border font-bold text-xs transition-all cursor-pointer ${
                        painIntensity === val
                          ? 'bg-indigo-600 border-indigo-700 text-white shadow-xs scale-102'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-[9px] text-slate-400 mt-1 px-1 font-semibold">
                  <span>Vitamine (Confort)</span>
                  <span>Analgésique Critique</span>
                </div>
              </div>

              {/* Target Audience Count input */}
              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-1">
                  2. Taille d'Audience Cible (Micro-TAM)
                </label>
                <p className="text-[10px] text-slate-400 mb-1.5">
                  Nombre estimé de clients que vous pouvez atteindre de manière réaliste à court terme.
                </p>
                <input
                  type="number"
                  value={targetAudienceCount}
                  onChange={(e) => setTargetAudienceCount(Math.max(0, parseInt(e.target.value) || 0))}
                  placeholder="ex: 5000"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500 font-medium shadow-xs"
                />
              </div>

              {/* Estimated annual price input */}
              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-1">
                  3. Prix Moyen Annuel Estimé (Par Client)
                </label>
                <p className="text-[10px] text-slate-400 mb-1.5">
                  Revenu récurrent annuel par client payant (ex: 120€ pour un abonnement à 10€/mois).
                </p>
                <input
                  type="number"
                  value={estimatedAnnualPrice}
                  onChange={(e) => setEstimatedAnnualPrice(Math.max(0, parseInt(e.target.value) || 0))}
                  placeholder="ex: 120"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500 font-medium shadow-xs"
                />
              </div>

              {/* Dynamic Micro-TAM calculator block */}
              <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 flex items-center justify-between">
                <div>
                  <span className="text-[9px] text-indigo-700 font-bold uppercase tracking-wider block">Volume Micro-TAM Estimé</span>
                  <p className="text-[10px] text-slate-400">Audience x Prix estimé par an</p>
                </div>
                <div className="text-right">
                  <span className="text-sm font-extrabold text-indigo-900 font-mono">
                    {marketSizeCalculated.toLocaleString('fr-FR')} € / an
                  </span>
                </div>
              </div>

            </div>

            {/* Column 2 inputs */}
            <div className="space-y-4">
              
              {/* Usage Frequency selector */}
              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-1.5">
                  4. Fréquence d'Usage Estimée
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((freq) => (
                    <button
                      key={freq}
                      type="button"
                      onClick={() => setUsageFrequency(freq)}
                      className={`py-1.5 rounded-lg border font-bold text-[10px] uppercase transition-all capitalize cursor-pointer ${
                        usageFrequency === freq
                          ? 'bg-indigo-600 border-indigo-700 text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {freq === 'daily' ? 'Journalier' :
                       freq === 'weekly' ? 'Hebdo' :
                       freq === 'monthly' ? 'Mensuel' : 'Annuel'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Perceived Value selector */}
              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-1.5">
                  5. Valeur Perçue par l'Utilisateur
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['low', 'medium', 'high'] as const).map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setPerceivedValue(val)}
                      className={`py-1.5 rounded-lg border font-bold text-[10px] uppercase transition-all capitalize cursor-pointer ${
                        perceivedValue === val
                          ? 'bg-indigo-600 border-indigo-700 text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {val === 'high' ? 'Élevée' :
                       val === 'medium' ? 'Moyenne' : 'Faible'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time to first sale */}
              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-1.5">
                  6. Vitesse de Validation (1er Client)
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['days', 'weeks', 'months'] as const).map((vel) => (
                    <button
                      key={vel}
                      type="button"
                      onClick={() => setTimeToFirstSale(vel)}
                      className={`py-1.5 rounded-lg border font-bold text-[10px] uppercase transition-all capitalize cursor-pointer ${
                        timeToFirstSale === vel
                          ? 'bg-indigo-600 border-indigo-700 text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {vel === 'days' ? 'Jours' :
                       vel === 'weeks' ? 'Semaines' : 'Mois'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Accessibility */}
              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-1.5">
                  7. Accessibilité d'acquisition (GTM)
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['direct', 'moderate', 'hard'] as const).map((acc) => (
                    <button
                      key={acc}
                      type="button"
                      onClick={() => setGoToMarketAccess(acc)}
                      className={`py-1.5 rounded-lg border font-bold text-[10px] uppercase transition-all capitalize cursor-pointer ${
                        goToMarketAccess === acc
                          ? 'bg-indigo-600 border-indigo-700 text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {acc === 'direct' ? 'Directe' :
                       acc === 'moderate' ? 'Modérée' : 'Complexe'}
                    </button>
                  ))}
                </div>
              </div>

            </div>

          </div>

          {/* Realtime dynamic score calculation summary inside edit screen */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">Estimation en Temps Réel :</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xl font-black text-slate-800 font-mono">
                  Score Brut : {currentCalc.score} / 100
                </span>
                <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                  currentCalc.recommendation === 'GO' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                  currentCalc.recommendation === 'PIVOT_EARLY' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                  'bg-rose-50 text-red-700 border-rose-100'
                }`}>
                  {currentCalc.recommendation === 'GO' ? 'GO (Solide)' :
                   currentCalc.recommendation === 'PIVOT_EARLY' ? 'Ajuster (PIVOT)' : 'Danger (NO_GO)'}
                </span>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              {savedTest && (
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="bg-white hover:bg-slate-100 text-slate-600 text-xs font-bold py-2 px-4 rounded-xl border border-slate-200 transition-all cursor-pointer"
                >
                  Annuler
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveTest}
                disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold py-2 px-5 rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {saving ? (
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white/20 border-t-white animate-spin"></div>
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Enregistrer la pré-qualification
              </button>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
