import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { GoogleGenAI, Type } from "@google/genai";

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = getFirestore();

// Initialize official @google/genai SDK using the server-side environment variable
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

/**
 * Custom compression and minification helper function.
 * Compresses and lightens data payload before sending to Gemini
 * to minimize token footprint and cost.
 */
function compressBusinessData(userInput: string, pivotReason?: string, previousAnalysis?: any): {
  compressedInput: string;
  compressedPivotReason?: string;
  compressedPreviousAnalysis?: string;
} {
  const cleanInput = userInput
    .replace(/\s+/g, " ")
    .replace(/(\r\n|\n|\r)/gm, " ")
    .trim();

  const cleanPivot = pivotReason
    ? pivotReason.replace(/\s+/g, " ").replace(/(\r\n|\n|\r)/gm, " ").trim()
    : undefined;

  let cleanPrevAnalysisString: string | undefined = undefined;
  if (previousAnalysis) {
    const microPrevious = {
      summary: previousAnalysis.project_summary || previousAnalysis.pivot_analysis,
      canvas: previousAnalysis.business_model_canvas,
      score: previousAnalysis.overall_score_100,
    };
    cleanPrevAnalysisString = JSON.stringify(microPrevious)
      .replace(/\s+/g, "")
      .substring(0, 1500);
  }

  return {
    compressedInput: cleanInput.substring(0, 8000),
    compressedPivotReason: cleanPivot ? cleanPivot.substring(0, 800) : undefined,
    compressedPreviousAnalysis: cleanPrevAnalysisString,
  };
}

// Interfaces corresponding strictly to response requirements (Lean Canvas Model)
interface BMC {
  problems: string[];
  customer_segments: string[];
  value_propositions: string[];
  solution: string[];
  channels: string[];
  revenue_streams: string[];
  cost_structure: string[];
  key_metrics: string[];
  unfair_advantage: string[];
}

interface ScoreComment {
  score_10: number;
  comment: string;
}

interface Indicators {
  pain_desirability: ScoreComment;
  timing_why_now: ScoreComment;
  market_size_potential: ScoreComment;
  defensibility_moat: ScoreComment;
  execution_simplicity: ScoreComment;
  economic_viability: ScoreComment;
}

interface AnalysisResult {
  project_summary: string;
  business_model_canvas: BMC;
  indicators: Indicators;
  overall_score_100: number;
  red_flags: string[];
  critical_hypotheses_to_test: string[];
  pivot_analysis: string;
}

// Strict Lean Canvas Schema for Gemini API response format
const leanCanvasSchema = {
  type: Type.OBJECT,
  properties: {
    project_summary: {
      type: Type.STRING,
      description: "Un résumé synthétique et percutant de l'idée d'entreprise (2-3 phrases)."
    },
    business_model_canvas: {
      type: Type.OBJECT,
      description: "Le Business Model Canvas complet au format Lean Canvas (9 Zones)",
      properties: {
        problems: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Les trois principaux points de douleur ou besoins non satisfaits de vos clients actuels." },
        customer_segments: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Le public cible et les utilisateurs visés par votre produit." },
        value_propositions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Le message clair et percutant qui explique pourquoi votre offre est unique et utile." },
        solution: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Les caractéristiques minimales de votre produit ou service pour résoudre les problèmes identifiés." },
        channels: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Les moyens de communication et de distribution pour atteindre vos clients." },
        revenue_streams: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Le modèle économique et la façon dont le projet va gagner de l'argent." },
        cost_structure: { type: Type.ARRAY, items: { type: Type.STRING }, description: "L'ensemble des dépenses engendrées pour faire fonctionner le projet (marketing, développement, etc.)." },
        key_metrics: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Les chiffres essentiels (KPIs) pour mesurer le succès et l'avancement de votre produit." },
        unfair_advantage: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Ce que vous possédez et qui ne peut pas être facilement copié ou acheté par la concurrence." }
      },
      required: [
        "problems", "customer_segments", "value_propositions", "solution",
        "channels", "revenue_streams", "cost_structure", "key_metrics", "unfair_advantage"
      ]
    },
    indicators: {
      type: Type.OBJECT,
      description: "Indicateurs de notation stratégique de 1 à 10",
      properties: {
        pain_desirability: {
          type: Type.OBJECT,
          properties: { score_10: { type: Type.INTEGER }, comment: { type: Type.STRING } },
          required: ["score_10", "comment"]
        },
        timing_why_now: {
          type: Type.OBJECT,
          properties: { score_10: { type: Type.INTEGER }, comment: { type: Type.STRING } },
          required: ["score_10", "comment"]
        },
        market_size_potential: {
          type: Type.OBJECT,
          properties: { score_10: { type: Type.INTEGER }, comment: { type: Type.STRING } },
          required: ["score_10", "comment"]
        },
        defensibility_moat: {
          type: Type.OBJECT,
          properties: { score_10: { type: Type.INTEGER }, comment: { type: Type.STRING } },
          required: ["score_10", "comment"]
        },
        execution_simplicity: {
          type: Type.OBJECT,
          properties: { score_10: { type: Type.INTEGER }, comment: { type: Type.STRING } },
          required: ["score_10", "comment"]
        },
        economic_viability: {
          type: Type.OBJECT,
          properties: { score_10: { type: Type.INTEGER }, comment: { type: Type.STRING } },
          required: ["score_10", "comment"]
        }
      },
      required: [
        "pain_desirability", "timing_why_now", "market_size_potential",
        "defensibility_moat", "execution_simplicity", "economic_viability"
      ]
    },
    overall_score_100: {
      type: Type.INTEGER,
      description: "Un score global de viabilité de 0 à 100."
    },
    red_flags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Risques majeurs ou obstacles critiques identifiés."
    },
    critical_hypotheses_to_test: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "3 à 5 hypothèses critiques à valider sur le terrain en priorité."
    },
    pivot_analysis: {
      type: Type.STRING,
      description: "Analyse approfondie de la direction stratégique, de l'évolution de l'idée originale, et des conseils pour de futures itérations."
    }
  },
  required: [
    "project_summary", "business_model_canvas", "indicators",
    "overall_score_100", "red_flags", "critical_hypotheses_to_test",
    "pivot_analysis"
  ]
};

/**
 * Helper to map snake_case response fields to camelCase root-level businessModelCanvas object fields
 */
function mapGeminiResponseToCamelCaseBMC(canvasJson: any) {
  // Support items mapped to unique IDs and default confidence score of 3
  const ensureItems = (arr: any[]) => {
    return (arr || []).map((txt, idx) => ({
      id: `item_${idx}_` + Math.random().toString(36).substring(2, 7),
      text: typeof txt === "string" ? txt : (txt.text || ""),
      confidence: typeof txt === "object" && typeof txt.confidence === "number" ? txt.confidence : 3
    }));
  };

  return {
    problems: ensureItems(canvasJson.problems),
    customerSegments: ensureItems(canvasJson.customer_segments),
    valuePropositions: ensureItems(canvasJson.value_propositions),
    solution: ensureItems(canvasJson.solution),
    channels: ensureItems(canvasJson.channels),
    revenueStreams: ensureItems(canvasJson.revenue_streams),
    costStructure: ensureItems(canvasJson.cost_structure),
    keyMetrics: ensureItems(canvasJson.key_metrics),
    unfairAdvantage: ensureItems(canvasJson.unfair_advantage)
  };
}

/**
 * Cloud Function v2: analyzeProject
 * Receives: { projectId, userInput, pivotReason? }
 * Executes cost-optimized Gemini Flash analysis under the Lean Canvas model.
 */
export const analyzeProject = onCall({ cors: true }, async (request: CallableRequest<any>) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "L'utilisateur doit être authentifié.");
  }
  const userId = request.auth.uid;
  const { projectId, userInput, pivotReason } = request.data;

  if (!projectId || typeof projectId !== "string") {
    throw new HttpsError("invalid-argument", "Le paramètre 'projectId' est requis.");
  }
  if (!userInput || typeof userInput !== "string") {
    throw new HttpsError("invalid-argument", "Le paramètre 'userInput' est requis.");
  }

  try {
    const projectRef = db.collection("projects").doc(projectId);
    const projectDoc = await projectRef.get();

    if (!projectDoc.exists) {
      throw new HttpsError("not-found", "Le projet spécifié n'existe pas.");
    }

    const projectData = projectDoc.data();
    if (!projectData || projectData.ownerId !== userId) {
      throw new HttpsError("permission-denied", "Vous n'avez pas l'autorisation d'accéder à ce projet.");
    }

    let previousAnalysis: any = undefined;
    let nextVersionNumber = 1;

    if (pivotReason && typeof pivotReason === "string" && projectData.currentVersionId) {
      const prevVersionRef = projectRef.collection("versions").doc(projectData.currentVersionId);
      const prevVersionDoc = await prevVersionRef.get();

      if (prevVersionDoc.exists) {
        const prevVersionData = prevVersionDoc.data();
        if (prevVersionData) {
          previousAnalysis = prevVersionData.analysisResult;
          nextVersionNumber = (prevVersionData.versionNumber || 1) + 1;
        }
      }
    }

    const { compressedInput, compressedPivotReason, compressedPreviousAnalysis } = compressBusinessData(
      userInput,
      pivotReason,
      previousAnalysis
    );

    const systemInstruction = `Tu es un analyste de capital-risque (VC) et consultant stratégique d'élite.
Analyse l'idée d'entreprise sous le modèle Lean Canvas (9 zones strictes : problems, customer_segments, value_propositions, solution, channels, revenue_streams, cost_structure, key_metrics, unfair_advantage).
Renseigne chaque zone de manière hyper-pertinente pour guider l'entrepreneur. Renvoie le tout sous format JSON d'évaluation VC.`;

    let prompt = `Voici les détails de l'idée d'entreprise à analyser :
IDÉE BUSINESS : ${compressedInput}
`;

    if (compressedPivotReason && compressedPreviousAnalysis) {
      prompt += `
ATTENTION : Il s'agit d'un PIVOT ou d'une nouvelle itération.
RAISON DU PIVOT : ${compressedPivotReason}
ANCIENNE ANALYSE (COMPACTÉE) : ${compressedPreviousAnalysis}`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: leanCanvasSchema,
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
    });

    const rawText = response.text;
    if (!rawText) {
      throw new HttpsError("internal", "L'API Gemini n'a renvoyé aucune réponse.");
    }

    const resultJson = JSON.parse(rawText.trim());

    const versionId = `v_${nextVersionNumber}_` + Math.random().toString(36).substring(2, 11);
    const versionRef = projectRef.collection("versions").doc(versionId);

    // Prepare CamelCase BMC fields
    const mappedBMC = mapGeminiResponseToCamelCaseBMC(resultJson.business_model_canvas || {});

    // Map strategic VC indicators safely
    const mappedAnalysisResult = {
      indicators: {
        pain_desirability: {
          score_10: resultJson.indicators?.pain_desirability?.score_10 ?? 5,
          comment: resultJson.indicators?.pain_desirability?.comment ?? ""
        },
        timing_why_now: {
          score_10: resultJson.indicators?.timing_why_now?.score_10 ?? 5,
          comment: resultJson.indicators?.timing_why_now?.comment ?? ""
        },
        market_size_potential: {
          score_10: resultJson.indicators?.market_size_potential?.score_10 ?? 5,
          comment: resultJson.indicators?.market_size_potential?.comment ?? ""
        },
        defensibility_moat: {
          score_10: resultJson.indicators?.defensibility_moat?.score_10 ?? 5,
          comment: resultJson.indicators?.defensibility_moat?.comment ?? ""
        },
        execution_simplicity: {
          score_10: resultJson.indicators?.execution_simplicity?.score_10 ?? 5,
          comment: resultJson.indicators?.execution_simplicity?.comment ?? ""
        },
        economic_viability: {
          score_10: resultJson.indicators?.economic_viability?.score_10 ?? 5,
          comment: resultJson.indicators?.economic_viability?.comment ?? ""
        }
      },
      overall_score_100: resultJson.overall_score_100 ?? 50,
      red_flags: resultJson.red_flags || [],
      critical_hypotheses_to_test: resultJson.critical_hypotheses_to_test || [],
      pivot_analysis: resultJson.pivot_analysis || resultJson.project_summary || ""
    };

    const newVersionPayload: any = {
      id: versionId,
      versionNumber: nextVersionNumber,
      createdAt: FieldValue.serverTimestamp(),
      userInput: userInput,
      businessModelCanvas: mappedBMC,
      analysisResult: mappedAnalysisResult,
      aiAnalysisStatus: 'completed',
      ownerId: userId
    };

    if (pivotReason) {
      newVersionPayload.pivotReason = pivotReason.trim();
    }

    await versionRef.set(newVersionPayload);

    await projectRef.update({
      currentVersionId: versionId,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      versionId: versionId,
      versionNumber: nextVersionNumber,
      analysisResult: mappedAnalysisResult,
    };

  } catch (error: any) {
    console.error("Cloud function error:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", error.message || "Une erreur inattendue est survenue lors de l'analyse.");
  }
});

/**
 * Cloud Function v2: enrichVersionWithAI
 * Receives: { projectId, versionId }
 * Executes cost-optimized Gemini Flash analysis under the Lean Canvas model.
 */
export const enrichVersionWithAI = onCall({ cors: true }, async (request: CallableRequest<any>) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "L'utilisateur doit être authentifié.");
  }
  const userId = request.auth.uid;
  const { projectId, versionId } = request.data;

  if (!projectId || typeof projectId !== "string") {
    throw new HttpsError("invalid-argument", "Le paramètre 'projectId' est requis.");
  }
  if (!versionId || typeof versionId !== "string") {
    throw new HttpsError("invalid-argument", "Le paramètre 'versionId' est requis.");
  }

  const versionRef = db.collection("projects").doc(projectId).collection("versions").doc(versionId);

  try {
    const versionDoc = await versionRef.get();
    if (!versionDoc.exists) {
      throw new HttpsError("not-found", "La version spécifiée n'existe pas.");
    }

    const versionData = versionDoc.data();
    if (!versionData || versionData.ownerId !== userId) {
      throw new HttpsError("permission-denied", "Vous n'êtes pas propriétaire de cette version.");
    }

    await versionRef.update({
      aiAnalysisStatus: "pending",
      aiErrorMessage: null
    });

    const userInput = versionData.userInput;
    const pivotReason = versionData.pivotReason;

    let previousAnalysis: any = undefined;
    const currentNumber = versionData.versionNumber || 1;
    if (currentNumber > 1) {
      const priorQuery = await db.collection("projects").doc(projectId).collection("versions")
        .where("versionNumber", "==", currentNumber - 1)
        .limit(1)
        .get();
      if (!priorQuery.empty) {
        const priorDoc = priorQuery.docs[0].data();
        if (priorDoc && priorDoc.analysisResult) {
          previousAnalysis = priorDoc.analysisResult;
        }
      }
    }

    const { compressedInput, compressedPivotReason, compressedPreviousAnalysis } = compressBusinessData(
      userInput,
      pivotReason,
      previousAnalysis
    );

    const systemInstruction = `Tu es un analyste de capital-risque (VC) et consultant stratégique d'élite.
Analyse l'idée d'entreprise sous le modèle Lean Canvas (9 zones strictes : problems, customer_segments, value_propositions, solution, channels, revenue_streams, cost_structure, key_metrics, unfair_advantage).
Renseigne chaque zone de manière hyper-pertinente pour guider l'entrepreneur. Renvoie le tout sous format JSON d'évaluation VC.`;

    let prompt = `Voici les détails de l'idée d'entreprise à analyser :
IDÉE BUSINESS : ${compressedInput}
`;

    if (compressedPivotReason && compressedPreviousAnalysis) {
      prompt += `
ATTENTION : Il s'agit d'un PIVOT ou d'une nouvelle itération.
RAISON DU PIVOT : ${compressedPivotReason}
ANCIENNE ANALYSE (COMPACTÉE) : ${compressedPreviousAnalysis}`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: leanCanvasSchema,
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
    });

    const rawText = response.text;
    if (!rawText) {
      throw new Error("L'API Gemini n'a renvoyé aucune réponse.");
    }

    const geminiResult = JSON.parse(rawText.trim());

    const mappedBMC = mapGeminiResponseToCamelCaseBMC(geminiResult.business_model_canvas || {});

    const mappedAnalysis = {
      indicators: {
        pain_desirability: {
          score_10: geminiResult.indicators?.pain_desirability?.score_10 ?? 5,
          comment: geminiResult.indicators?.pain_desirability?.comment ?? ""
        },
        timing_why_now: {
          score_10: geminiResult.indicators?.timing_why_now?.score_10 ?? 5,
          comment: geminiResult.indicators?.timing_why_now?.comment ?? ""
        },
        market_size_potential: {
          score_10: geminiResult.indicators?.market_size_potential?.score_10 ?? 5,
          comment: geminiResult.indicators?.market_size_potential?.comment ?? ""
        },
        defensibility_moat: {
          score_10: geminiResult.indicators?.defensibility_moat?.score_10 ?? 5,
          comment: geminiResult.indicators?.defensibility_moat?.comment ?? ""
        },
        execution_simplicity: {
          score_10: geminiResult.indicators?.execution_simplicity?.score_10 ?? 5,
          comment: geminiResult.indicators?.execution_simplicity?.comment ?? ""
        },
        economic_viability: {
          score_10: geminiResult.indicators?.economic_viability?.score_10 ?? 5,
          comment: geminiResult.indicators?.economic_viability?.comment ?? ""
        }
      },
      overall_score_100: geminiResult.overall_score_100 ?? 50,
      red_flags: geminiResult.red_flags || [],
      critical_hypotheses_to_test: geminiResult.critical_hypotheses_to_test || [],
      pivot_analysis: geminiResult.pivot_analysis || geminiResult.project_summary || ""
    };

    await versionRef.update({
      businessModelCanvas: mappedBMC,
      analysisResult: mappedAnalysis,
      aiAnalysisStatus: "completed"
    });

    return {
      success: true,
      analysisResult: mappedAnalysis
    };

  } catch (error: any) {
    console.error("Enrichment failed:", error);
    try {
      await versionRef.update({
        aiAnalysisStatus: "error",
        aiErrorMessage: error.message || "Erreur de traitement IA."
      });
    } catch (dbErr) {
      console.error("Failed to save error status to db:", dbErr);
    }
    throw new HttpsError("internal", error.message || "L'enrichissement par l'IA a échoué.");
  }
});

/**
 * Cloud Function v2: validateStartupCanvas
 * Receives: { projectId, versionId }
 * Performs an expert Lean Startup and Validation of Business Ideas analysis on the Canvas items.
 * Evaluates the realism of manual user confidence scores (1-5).
 * Suggests concrete experiments to test critical hypotheses.
 */
export const validateStartupCanvas = onCall({ cors: true }, async (request: CallableRequest<any>) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "L'utilisateur doit être authentifié.");
  }
  const userId = request.auth.uid;
  const { projectId, versionId } = request.data;

  if (!projectId || typeof projectId !== "string") {
    throw new HttpsError("invalid-argument", "Le paramètre 'projectId' est requis.");
  }
  if (!versionId || typeof versionId !== "string") {
    throw new HttpsError("invalid-argument", "Le paramètre 'versionId' est requis.");
  }

  const versionRef = db.collection("projects").doc(projectId).collection("versions").doc(versionId);

  try {
    const versionDoc = await versionRef.get();
    if (!versionDoc.exists) {
      throw new HttpsError("not-found", "La version spécifiée n'existe pas.");
    }

    const versionData = versionDoc.data();
    if (!versionData || versionData.ownerId !== userId) {
      throw new HttpsError("permission-denied", "Vous n'êtes pas propriétaire de cette version.");
    }

    await versionRef.update({
      validationStatus: "pending",
      validationErrorMessage: null
    });

    const bmc = versionData.businessModelCanvas || {};
    
    // Construct a readable presentation of all Lean Canvas items with user confidence scores for Gemini
    let canvasPromptText = "Voici les hypothèses du Lean Canvas avec l'évaluation manuelle de confiance de l'entrepreneur (1 = Intuition pure, 5 = Preuve irréfutable) :\n\n";

    const sectionsMapping = [
      { key: "problems", label: "Problèmes" },
      { key: "customerSegments", label: "Segments Clients" },
      { key: "valuePropositions", label: "Propositions de Valeur" },
      { key: "solution", label: "Solutions" },
      { key: "channels", label: "Canaux" },
      { key: "revenueStreams", label: "Sources de Revenu" },
      { key: "costStructure", label: "Structure de Coûts" },
      { key: "keyMetrics", label: "Indicateurs Clés" },
      { key: "unfairAdvantage", label: "Avantage Injuste" }
    ];

    sectionsMapping.forEach(sec => {
      const items = bmc[sec.key] || [];
      canvasPromptText += `=== ZONE : ${sec.label} ===\n`;
      if (items.length === 0) {
        canvasPromptText += "(Aucun élément renseigné)\n";
      } else {
        items.forEach((it: any, i: number) => {
          const txt = typeof it === "string" ? it : (it.text || "");
          const conf = typeof it === "string" ? 3 : (it.confidence ?? 3);
          const id = typeof it === "string" ? `it_${i}` : (it.id || `it_${i}`);
          canvasPromptText += `- ID: ${id} | Contenu: "${txt}" | Confiance Utilisateur: ${conf}/5\n`;
        });
      }
      canvasPromptText += "\n";
    });

    const systemInstruction = `Tu es un expert d'élite en validation de startups, Lean Startup (méthode de Eric Ries) et en tests d'idées de business (Testing Business Ideas d'Alex Osterwalder).
Ton rôle est d'analyser chaque hypothèse du Lean Canvas soumise, d'évaluer de manière critique si la confiance (user_confidence) est cohérente ou surévaluée par rapport à l'état de l'art du marché, de coter la criticité (Haute, Moyenne, Basse) pour la survie du business, et de proposer une expérience concrète de terrain à faible coût pour tester l'hypothèse.
Enfin, fournis une recommandation de Pivot globale si des hypothèses vitales ont un niveau de preuve trop faible.`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        canvas_analysis: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              element_id: { type: Type.STRING, description: "L'identifiant de l'élément (ID transmis dans l'entrée)." },
              category: { 
                type: Type.STRING, 
                enum: ["problem", "solution", "customer_segments", "value_props", "channels", "revenue", "costs", "partners"],
                description: "La catégorie la plus proche de l'élément." 
              },
              content: { type: Type.STRING, description: "Le texte de l'élément d'origine." },
              user_confidence: { type: Type.INTEGER, description: "Le score de confiance d'origine de 1 à 5." },
              ai_risk_assessment: { 
                type: Type.STRING, 
                enum: ["Coherent", "Surevalue", "Sous-estime"],
                description: "Ton évaluation du réalisme de l'évaluation utilisateur."
              },
              criticity: { 
                type: Type.STRING, 
                enum: ["Haute", "Moyenne", "Basse"],
                description: "Le niveau de criticité de cette hypothèse pour le projet."
              },
              ai_comment: { type: Type.STRING, description: "Explication courte et percutante du risque ou de la pertinence." },
              suggested_action: { type: Type.STRING, description: "Expérience pratique, rapide et peu coûteuse à mener pour valider cette hypothèse (smoke test, interviews, landing page, etc.)." }
            },
            required: ["element_id", "category", "content", "user_confidence", "ai_risk_assessment", "criticity", "ai_comment", "suggested_action"]
          }
        },
        pivot_recommendation: {
          type: Type.OBJECT,
          properties: {
            pivot_suggested: { type: Type.BOOLEAN, description: "True si plusieurs hypothèses à haute criticité ont un niveau de preuve utilisateur trop faible sans validation concrète." },
            reason: { type: Type.STRING, description: "Explication rationnelle de la recommandation de pivot ou de poursuite." },
            suggested_directions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Pistes concrètes d'évolution ou d'itérations stratégiques." }
          },
          required: ["pivot_suggested", "reason", "suggested_directions"]
        }
      },
      required: ["canvas_analysis", "pivot_recommendation"]
    };

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: canvasPromptText,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
    });

    const rawText = response.text;
    if (!rawText) {
      throw new Error("L'API Gemini n'a renvoyé aucun résultat d'audit.");
    }

    const validationResult = JSON.parse(rawText.trim());

    await versionRef.update({
      validationResult: validationResult,
      validationStatus: "completed"
    });

    return {
      success: true,
      validationResult: validationResult
    };

  } catch (error: any) {
    console.error("Validation function error:", error);
    try {
      await versionRef.update({
        validationStatus: "error",
        validationErrorMessage: error.message || "Erreur lors de la génération de l'audit Lean."
      });
    } catch (dbErr) {
      console.error("Failed to update error status on version:", dbErr);
    }
    throw new HttpsError("internal", error.message || "L'audit de validation Lean a échoué.");
  }
});

/**
 * Cloud Function v2: challengeHypotheses
 * Receives: { bmc }
 * Calls Gemini 1.5 Flash directly to validate a submitted complete Lean Canvas with confidence scores.
 * Returns the gap analysis (canvas_analysis) and action plan (pivot_recommendation).
 */
export const challengeHypotheses = onCall({ cors: true }, async (request: CallableRequest<any>) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "L'utilisateur doit être authentifié.");
  }
  const { bmc } = request.data;

  if (!bmc) {
    throw new HttpsError("invalid-argument", "Le paramètre 'bmc' (Lean Canvas complet) est requis.");
  }

  try {
    let canvasPromptText = "Voici les hypothèses du Lean Canvas avec l'évaluation manuelle de confiance de l'entrepreneur (1 = Intuition pure, 5 = Preuve irréfutable) :\n\n";

    const sectionsMapping = [
      { key: "problems", label: "Problèmes" },
      { key: "customerSegments", label: "Segments Clients" },
      { key: "valuePropositions", label: "Propositions de Valeur" },
      { key: "solution", label: "Solutions" },
      { key: "channels", label: "Canaux" },
      { key: "revenueStreams", label: "Sources de Revenu" },
      { key: "costStructure", label: "Structure de Coûts" },
      { key: "keyMetrics", label: "Indicateurs Clés" },
      { key: "unfairAdvantage", label: "Avantage Injuste" }
    ];

    sectionsMapping.forEach(sec => {
      const items = bmc[sec.key] || [];
      canvasPromptText += `=== ZONE : ${sec.label} ===\n`;
      if (items.length === 0) {
        canvasPromptText += "(Aucun élément renseigné)\n";
      } else {
        items.forEach((it: any, i: number) => {
          const txt = typeof it === "string" ? it : (it.text || "");
          const conf = typeof it === "string" ? 3 : (it.confidence ?? 3);
          const id = typeof it === "string" ? `it_${i}` : (it.id || `it_${i}`);
          canvasPromptText += `- ID: ${id} | Contenu: "${txt}" | Confiance Utilisateur: ${conf}/5\n`;
        });
      }
      canvasPromptText += "\n";
    });

    const systemInstruction = `Tu es un expert d'élite en validation de startups, Lean Startup (méthode de Eric Ries) et en tests d'idées de business (Testing Business Ideas d'Alex Osterwalder).
Ton rôle est d'analyser chaque hypothèse du Lean Canvas soumise, d'évaluer de manière critique si la confiance (user_confidence) est cohérente ou surévaluée par rapport à l'état de l'art du marché, de coter la criticité (Haute, Moyenne, Basse) pour la survie du business, et de proposer une expérience concrète de terrain à faible coût pour tester l'hypothèse.
Enfin, fournis une recommandation de Pivot globale si des hypothèses vitales ont un niveau de preuve trop faible.`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        canvas_analysis: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              element_id: { type: Type.STRING, description: "L'identifiant de l'élément (ID transmis dans l'entrée)." },
              category: { 
                type: Type.STRING, 
                enum: ["problem", "solution", "customer_segments", "value_props", "channels", "revenue", "costs", "partners"],
                description: "La catégorie la plus proche de l'élément." 
              },
              content: { type: Type.STRING, description: "Le texte de l'élément d'origine." },
              user_confidence: { type: Type.INTEGER, description: "Le score de confiance d'origine de 1 à 5." },
              ai_risk_assessment: { 
                type: Type.STRING, 
                enum: ["Coherent", "Surevalue", "Sous-estime"],
                description: "Ton évaluation du réalisme de l'évaluation utilisateur."
              },
              criticity: { 
                type: Type.STRING, 
                enum: ["Haute", "Moyenne", "Basse"],
                description: "Le niveau de criticité de cette hypothèse pour le projet."
              },
              ai_comment: { type: Type.STRING, description: "Explication courte et percutante du risque ou de la pertinence." },
              suggested_action: { type: Type.STRING, description: "Expérience pratique, rapide et peu coûteuse à mener pour valider cette hypothèse (smoke test, interviews, landing page, etc.)." }
            },
            required: ["element_id", "category", "content", "user_confidence", "ai_risk_assessment", "criticity", "ai_comment", "suggested_action"]
          }
        },
        pivot_recommendation: {
          type: Type.OBJECT,
          properties: {
            pivot_suggested: { type: Type.BOOLEAN, description: "True si plusieurs hypothèses à haute criticité ont un niveau de preuve utilisateur trop faible sans validation concrète." },
            reason: { type: Type.STRING, description: "Explication rationnelle de la recommandation de pivot ou de poursuite." },
            suggested_directions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Pistes concrètes d'évolution ou d'itérations stratégiques." }
          },
          required: ["pivot_suggested", "reason", "suggested_directions"]
        }
      },
      required: ["canvas_analysis", "pivot_recommendation"]
    };

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: canvasPromptText,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    const rawText = response.text;
    if (!rawText) {
      throw new Error("L'API Gemini n'a renvoyé aucun résultat.");
    }

    const validationResult = JSON.parse(rawText.trim());

    return {
      success: true,
      validationResult: validationResult
    };

  } catch (error: any) {
    console.error("challengeHypotheses error:", error);
    throw new HttpsError("internal", error.message || "L'appel challengeHypotheses a échoué.");
  }
});
