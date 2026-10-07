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
 * Firebase Cloud Function analyzeMarketWithSearch
 * Receives projectId, versionId, and userInput to perform deep market benchmark with Google Search Grounding.
 */
export const analyzeMarketWithSearch = onRequest({ cors: true }, async (req, res) => {
  try {
    const { projectId, versionId, userInput, bmc } = req.body;

    if (!projectId || !versionId || !userInput) {
      res.status(400).send({ error: "Champs requis manquants : projectId, versionId, ou userInput." });
      return;
    }

    const systemInstruction = `Tu es un expert en Due Diligence, analyse de marché VC et benchmark concurrentiel.
Ton rôle est d'analyser l'idée de business soumise en scannant et en analysant le Web pour identifier la concurrence réelle, les modèles de revenus pratiqués et les opportunités de marché.

RÈGLES D'ANALYSE :
1. Analyse des données récentes sur les acteurs réels du marché mondial, européen ou français selon le contexte de l'idée.
2. Analyse la structure des prix et des modèles économiques des leaders (SaaS, Freemium, Commission, Usage, licensing, etc.).
3. Identifie les "White Spaces" (angles morts ou besoins non satisfaits par les solutions actuelles).
Tu dois impérativement formater ta réponse au format JSON conforme au schéma strict demandé.`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        leaders: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              website: { type: Type.STRING },
              monetizationModel: { type: Type.STRING },
              estimatedScale: { type: Type.STRING },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["name", "website", "monetizationModel", "estimatedScale", "strengths", "weaknesses"]
          }
        },
        monetizationTrends: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        marketDynamics: {
          type: Type.OBJECT,
          properties: {
            trend: { type: Type.STRING, enum: ["Emerging", "Growing", "Stable", "Declining"] },
            comment: { type: Type.STRING }
          },
          required: ["trend", "comment"]
        },
        strategicGaps: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      },
      required: ["leaders", "monetizationTrends", "marketDynamics", "strategicGaps"]
    };

    let prompt = `Voici l'idée d'entreprise pour laquelle tu dois réaliser une analyse de marché approfondie et un benchmark concurrentiel :
IDÉE BUSINESS : ${userInput}
`;

    if (bmc) {
      prompt += `\nVoici également le Lean Canvas associé pour donner plus de contexte :\n${JSON.stringify(bmc)}\n`;
    }

    // Call @google/genai with gemini-3.8-flash and enable the googleSearch tool!
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema,
        tools: [{ googleSearch: {} }] // Real-time Google Search Grounding activation
      }
    });

    const rawText = response.text;
    if (!rawText) {
      throw new Error("L'API Gemini n'a renvoyé aucune réponse textuelle.");
    }

    // Extract grounding sources consultées
    const sources: Array<{ title: string; url: string }> = [];
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    if (groundingMetadata?.groundingChunks) {
      for (const chunk of groundingMetadata.groundingChunks) {
        if (chunk.web?.uri) {
          sources.push({
            title: chunk.web.title || "Source consultée",
            url: chunk.web.uri
          });
        }
      }
    }

    const marketData = JSON.parse(rawText.trim());

    // Update Project Version document in Firestore
    const docPath = `projects/${projectId}/versions/${versionId}`;
    await db.doc(docPath).update({
      marketAnalysis: {
        status: "completed",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        leaders: marketData.leaders || [],
        monetizationTrends: marketData.monetizationTrends || [],
        marketDynamics: marketData.marketDynamics || { trend: "Stable", comment: "" },
        strategicGaps: marketData.strategicGaps || [],
        sources: sources
      }
    });

    res.status(200).send({
      success: true,
      message: "Analyse de marché complétée avec succès et enregistrée."
    });

  } catch (error: any) {
    console.error("Erreur Cloud Function Market Analysis:", error);
    res.status(500).send({
      error: error.message || "Erreur interne du serveur lors du benchmark."
    });
  }
});
