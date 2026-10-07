import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { GoogleGenAI, Type } from "@google/genai";

// Initialize Firebase Admin SDK
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

// Initialize Google GenAI SDK
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || ""
});

/**
 * Firebase Cloud Function analyzeSolopreneurViability
 * Receives projectId, versionId, and userInput to perform Solopreneur viability checks.
 */
export const analyzeSolopreneurViability = onRequest({ cors: true }, async (req, res) => {
  try {
    const { projectId, versionId, userInput, bmc } = req.body;

    if (!projectId || !versionId || !userInput) {
      res.status(400).send({ error: "Champs requis manquants : projectId, versionId, ou userInput." });
      return;
    }

    const systemInstruction = `Tu es un expert d'élite en lean startup, bootstrapping, NoCode et soloprenariat.
Ton rôle est d'analyser l'idée de business soumise et de déterminer si elle est réaliste pour un auto-entrepreneur travaillant seul avec un budget mensuel très serré au démarrage.

RÈGLES D'ANALYSE :
1. Estime la complexité technique globale (Faible, Moyenne, Élevée, Critique) et liste les verrous de code.
2. Identifie les coûts de fonctionnement minimum au démarrage et liste un tableau de répartition réaliste (Stripe, hébergement, etc.).
3. Calcule une note d'adéquation solopreneur globale de 0 à 10, estime le temps pour concevoir un MVP et liste les goulots d'étranglement majeurs qui risquent de surcharger une personne seule.
4. Écris des pistes de simplification claires et exploitables pour réduire la complexité et compresser les coûts.

Tu devez impérativement formater votre réponse au format JSON conforme au schéma strict demandé.`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        technical_complexity: {
          type: Type.OBJECT,
          properties: {
            level: { type: Type.STRING, description: "Niveau de complexité technique (Faible | Moyenne | Élevée | Critique)" },
            estimated_dev_hours: { type: Type.STRING, description: "Estimation d'heures de code (ex: 40-60 heures)" },
            key_technical_hurdles: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["level", "estimated_dev_hours", "key_technical_hurdles"]
        },
        bootstrapping_budget: {
          type: Type.OBJECT,
          properties: {
            monthly_fixed_costs_eur: { type: Type.STRING, description: "Total estimé des coûts fixes (ex: 15-30€/mois)" },
            cost_breakdown: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  item: { type: Type.STRING },
                  cost: { type: Type.STRING }
                },
                required: ["item", "cost"]
              }
            }
          },
          required: ["monthly_fixed_costs_eur", "cost_breakdown"]
        },
        solopreneur_viability: {
          type: Type.OBJECT,
          properties: {
            score_10: { type: Type.INTEGER, description: "Note d'adéquation globale de 0 à 10" },
            is_solopreneur_friendly: { type: Type.BOOLEAN },
            main_bottlenecks: { type: Type.ARRAY, items: { type: Type.STRING } },
            time_to_mvp_weeks: { type: Type.STRING, description: "Délai estimé pour concevoir un MVP (ex: 2-3 semaines)" }
          },
          required: ["score_10", "is_solopreneur_friendly", "main_bottlenecks", "time_to_mvp_weeks"]
        },
        actionable_recommendations: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Conseils pour simplifier le produit et réduire les coûts au démarrage"
        }
      },
      required: ["technical_complexity", "bootstrapping_budget", "solopreneur_viability", "actionable_recommendations"]
    };

    let prompt = `Voici l'idée d'entreprise pour laquelle tu devez réaliser une évaluation d'adéquation Solopreneur :
IDÉE BUSINESS : ${userInput}
`;

    if (bmc) {
      prompt += `\nVoici également le Lean Canvas pour donner du contexte :\n${JSON.stringify(bmc)}\n`;
    }

    // Call @google/genai with a robust multi-model fallback queue to avoid retirements or quotas
    const fallbackQueue = [
      "gemini-3.8-flash",
      "gemini-3.1-flash-lite",
      "gemini-flash-latest"
    ];

    let response;
    let lastError: any = null;

    for (const modelName of fallbackQueue) {
      try {
        console.log(`[Cloud Function Fallback] Attempting execution with model: ${modelName}`);
        const config: any = {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema
        };

        // Only add thinking budget config on Gemini 3.8 to avoid validation errors
        if (modelName === "gemini-3.8-flash") {
          config.thinkingConfig = {
            thinkingBudget: 0,
          };
        }

        response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config
        });

        if (response && response.text) {
          console.log(`[Cloud Function Fallback] SUCCESS using model: ${modelName}`);
          break;
        }
      } catch (err: any) {
        console.warn(`[Cloud Function Fallback] Model ${modelName} failed or unavailable:`, err.message || err);
        lastError = err;
      }
    }

    if (!response) {
      throw lastError || new Error("L'API Gemini n'a renvoyé aucun résultat après avoir essayé tous les modèles de repli.");
    }

    const rawText = response.text;
    if (!rawText) {
      throw new Error("L'API Gemini n'a renvoyé aucune réponse textuelle.");
    }

    const solopreneurData = JSON.parse(rawText.trim());

    // Update Project Version document in Firestore
    const docPath = `projects/${projectId}/versions/${versionId}`;
    await db.doc(docPath).update({
      solopreneurAnalysis: {
        status: "completed",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        technical_complexity: solopreneurData.technical_complexity || { level: "Moyenne", estimated_dev_hours: "", key_technical_hurdles: [] },
        bootstrapping_budget: solopreneurData.bootstrapping_budget || { monthly_fixed_costs_eur: "0€", cost_breakdown: [] },
        solopreneur_viability: solopreneurData.solopreneur_viability || { score_10: 5, is_solopreneur_friendly: true, main_bottlenecks: [], time_to_mvp_weeks: "" },
        actionable_recommendations: solopreneurData.actionable_recommendations || []
      }
    });

    res.status(200).send({
      success: true,
      message: "Évaluation de viabilité Solopreneur complétée avec succès."
    });

  } catch (error: any) {
    console.error("Erreur Cloud Function Solopreneur Viability:", error);
    res.status(500).send({
      error: error.message || "Erreur interne lors de l'évaluation Solopreneur."
    });
  }
});
