import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "5mb" }));

// Initialize Gemini Client
const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

/**
 * Robust multi-model fallback generator that walks down a queue of stable models
 * to bypass 503 capacity limit errors during high traffic spikes.
 */
async function generateContentWithRobustFallback(contents: string, systemInstruction: string, responseSchema: any) {
  const fallbackQueue = [
    "gemini-3.8-flash",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest"
  ];

  let lastError: any = null;

  for (const modelName of fallbackQueue) {
    try {
      console.log(`[Robust Gemini Fallback] Attempting execution with model: ${modelName}`);
      const config: any = {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      };

      // Only add thinking budget config on Gemini 3 series models to avoid parameters validation errors on older models
      if (modelName.startsWith("gemini-3.")) {
        config.thinkingConfig = {
          thinkingBudget: 0,
        };
      }

      const response = await ai.models.generateContent({
        model: modelName,
        contents: contents,
        config: config,
      });

      if (response && response.text) {
        console.log(`[Robust Gemini Fallback] SUCCESS using model: ${modelName}`);
        return response;
      }
    } catch (err: any) {
      console.warn(`[Robust Gemini Fallback] WARNING: Model ${modelName} failed or unavailable:`, err.message || err);
      lastError = err;
    }
  }

  // If all models in the queue fail, check if any failed due to quota limitations (429) and throw a highly-reassuring message
  if (lastError) {
    const errorStr = lastError.message || "";
    const errorJson = JSON.stringify(lastError);
    if (errorStr.includes("quota") || errorStr.includes("Quota") || errorStr.includes("RESOURCE_EXHAUSTED") || errorStr.includes("429") || errorJson.includes("RESOURCE_EXHAUSTED") || errorJson.includes("quota")) {
      throw new Error("Votre quota quotidien gratuit d'analyse stratégique par l'IA a été temporairement atteint. Les limites se réinitialisent automatiquement toutes les 24 heures. Vous pouvez également configurer votre propre clé API payante dans les secrets du projet pour des analyses illimitées.");
    }
  }
  throw lastError || new Error("Toutes les options d'analyse de secours avec l'IA sont surchargées. Veuillez réessayer dans quelques instants.");
}

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
  // Clean whitespace, remove repeating spaces, condense multi-line empty paragraphs
  const cleanInput = userInput
    .replace(/\s+/g, " ")
    .replace(/(\r\n|\n|\r)/gm, " ")
    .trim();

  const cleanPivot = pivotReason
    ? pivotReason.replace(/\s+/g, " ").replace(/(\r\n|\n|\r)/gm, " ").trim()
    : undefined;

  let cleanPrevAnalysisString: string | undefined = undefined;
  if (previousAnalysis) {
    // If we have previous analysis, we extract only critical structured fields 
    // to preserve token usage and lighten the context significantly.
    const microPrevious = {
      summary: previousAnalysis.project_summary,
      canvas: previousAnalysis.business_model_canvas,
      score: previousAnalysis.overall_score_100,
    };
    cleanPrevAnalysisString = JSON.stringify(microPrevious)
      .replace(/\s+/g, "") // remove all spacing
      .substring(0, 1500); // limit payload safety
  }

  return {
    compressedInput: cleanInput.substring(0, 8000), // safety truncate to 8k chars
    compressedPivotReason: cleanPivot ? cleanPivot.substring(0, 800) : undefined,
    compressedPreviousAnalysis: cleanPrevAnalysisString,
  };
}

// API Endpoint for Business Analysis with Cost Optimization
app.post("/api/analyze", async (req, res) => {
  try {
    const { userInput, pivotReason, previousAnalysis } = req.body;

    if (!userInput || typeof userInput !== "string") {
      return res.status(400).json({ error: "L'input de l'idée business est requis." });
    }

    // Apply cost-optimizing compression
    const originalSize = (userInput.length + (pivotReason?.length || 0) + (previousAnalysis ? JSON.stringify(previousAnalysis).length : 0));
    const { compressedInput, compressedPivotReason, compressedPreviousAnalysis } = compressBusinessData(
      userInput,
      pivotReason,
      previousAnalysis
    );
    const compressedSize = (compressedInput.length + (compressedPivotReason?.length || 0) + (compressedPreviousAnalysis?.length || 0));

    console.log(`[Cost Optimization] Input compressed: from ${originalSize} chars to ${compressedSize} chars.`);

    // Build focused system instructions and prompt
    const systemInstruction = `Tu es un analyste de capital-risque (VC) et consultant stratégique d'élite.
Analyse l'idée d'entreprise ou le projet soumis, et renvoie une évaluation extrêmement réaliste, directe, critique et constructive au format JSON.
Si l'utilisateur fournit une raison de pivot et une analyse précédente, concentre-toi sur l'impact de ce pivot (nouvelle proposition de valeur, segments modifiés, etc.) et explique clairement la différence dans la section 'pivot_analysis'.
Sois direct. Pas de jargon inutile, concentre-toi sur la faisabilité, les risques réels, et la viabilité économique.`;

    let prompt = `Voici les détails de l'idée d'entreprise à analyser :
IDÉE BUSINESS : ${compressedInput}
`;

    if (compressedPivotReason && compressedPreviousAnalysis) {
      prompt += `
ATTENTION : Il s'agit d'un PIVOT ou d'une nouvelle itération.
RAISON DU PIVOT : ${compressedPivotReason}
ANCIENNE ANALYSE (COMPACTÉE) : ${compressedPreviousAnalysis}
Analyse les changements requis pour réussir ce pivot, compare les modèles, et propose le nouveau Business Model Canvas mis à jour.`;
    }

    // Define the rigid response Schema mapping to requirements exactly
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        project_summary: {
          type: Type.STRING,
          description: "Un résumé synthétique et percutant de l'idée d'entreprise (2-3 phrases)."
        },
        business_model_canvas: {
          type: Type.OBJECT,
          description: "Le Lean Canvas complet",
          properties: {
            problems: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Problèmes majeurs identifiés" },
            customer_segments: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Segments de clientèle ciblés" },
            value_propositions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Propositions de valeur uniques" },
            solution: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Solutions envisagées" },
            channels: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Canaux d'acquisition et de distribution" },
            revenue_streams: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Flux de revenus identifiés" },
            cost_structure: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Principaux postes de coûts" },
            key_metrics: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Indicateurs clés à suivre" },
            unfair_advantage: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Avantage injuste ou barrière à l'entrée" }
          },
          required: [
            "problems", "customer_segments", "value_propositions", "solution",
            "channels", "revenue_streams", "cost_structure", "key_metrics",
            "unfair_advantage"
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

    // Execute Gemini call using the robust self-healing multi-model fallback handler
    const response = await generateContentWithRobustFallback(prompt, systemInstruction, responseSchema);

    const rawText = response.text;
    if (!rawText) {
      throw new Error("L'API Gemini n'a renvoyé aucune réponse.");
    }

    const resultJson = JSON.parse(rawText.trim());
    return res.json(resultJson);

  } catch (error: any) {
    console.error("Gemini analysis failed:", error);
    return res.status(500).json({
      error: "Erreur lors de l'analyse avec l'IA. " + (error.message || "Veuillez réessayer.")
    });
  }
});

// API Endpoint for Lean Startup and Validation of Business Ideas Analysis
app.post("/api/validate", async (req, res) => {
  try {
    const { bmc, userInput } = req.body;

    if (!bmc) {
      return res.status(400).json({ error: "Le Lean Canvas est requis pour l'audit." });
    }

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

    // Execute Gemini call using the robust self-healing multi-model fallback handler
    const response = await generateContentWithRobustFallback(canvasPromptText, systemInstruction, responseSchema);

    const rawText = response.text;
    if (!rawText) {
      throw new Error("L'API Gemini n'a renvoyé aucun résultat d'audit.");
    }

    const validationResult = JSON.parse(rawText.trim());
    return res.json(validationResult);

  } catch (error: any) {
    console.error("Lean validation analysis failed:", error);
    return res.status(500).json({
      error: "Erreur lors de la validation Lean. " + (error.message || "Veuillez réessayer.")
    });
  }
});

// API Endpoint for Market Analysis & Competitor Benchmark
app.post("/api/market-analysis", async (req, res) => {
  try {
    const { userInput, bmc } = req.body;

    if (!userInput || typeof userInput !== "string") {
      return res.status(400).json({ error: "L'input de l'idée business est requis." });
    }

    let prompt = `Voici l'idée d'entreprise pour laquelle tu dois réaliser une analyse de marché approfondie et un benchmark concurrentiel :
IDÉE BUSINESS : ${userInput}
`;

    if (bmc) {
      prompt += `\nVoici également le Lean Canvas associé pour donner plus de contexte :\n${JSON.stringify(bmc)}\n`;
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
              name: { type: Type.STRING, description: "Nom de l'entreprise ou du produit concurrent de référence" },
              website: { type: Type.STRING, description: "URL de référence ou du site web officiel de ce concurrent (ex: https://example.com). Si non connu, laisse vide." },
              monetizationModel: { type: Type.STRING, description: "Modèle de revenus et prix de départ (ex: SaaS à partir de 29$/mois, Freemium, etc.)" },
              estimatedScale: { type: Type.STRING, description: "Échelle d'impact estimée de cet acteur (ex: Leader mondial, Startup levée en Series A, PME locale, etc.)" },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Forces clés de cet acteur (2-3 points)" },
              weaknesses: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Faiblesses majeures ou limitations de cet acteur (2-3 points)" }
            },
            required: ["name", "website", "monetizationModel", "estimatedScale", "strengths", "weaknesses"]
          },
          description: "Cartographie des leaders et concurrents majeurs du marché."
        },
        monetizationTrends: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Synthèse des tendances de tarification ou de monétisation de ce secteur d'activité."
        },
        marketDynamics: {
          type: Type.OBJECT,
          properties: {
            trend: { 
              type: Type.STRING, 
              enum: ["Emerging", "Growing", "Stable", "Declining"],
              description: "Tendance d'évolution macro du marché" 
            },
            comment: { type: Type.STRING, description: "Synthèse explicative complète de la dynamique actuelle." }
          },
          required: ["trend", "comment"],
          description: "Volume et dynamique d'évolution du marché."
        },
        strategicGaps: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Opportunités, angles morts ou gaps stratégiques non couverts à exploiter."
        }
      },
      required: ["leaders", "monetizationTrends", "marketDynamics", "strategicGaps"]
    };

    let response;
    let sources: Array<{ title: string; url: string }> = [];
    let fallbackUsed = false;

    try {
      // Primary attempt: Execute Gemini call with real-time Google Search Grounding enabled
      response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: responseSchema,
          tools: [{ googleSearch: {} }]
        }
      });

      // Extract citation search sources from Gemini's Grounding Metadata
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
    } catch (searchError: any) {
      console.warn("[Quota Fallback] Google Search Grounding or Gemini-3.8 call was ratelimited/exhausted. Falling back to robust multi-model queue...", searchError.message || searchError);
      
      // Fallback: Use the robust multi-model fallback handler to generate the structured JSON report safely
      response = await generateContentWithRobustFallback(prompt, systemInstruction, responseSchema);
      fallbackUsed = true;
    }

    const rawText = response.text;
    if (!rawText) {
      throw new Error("L'API Gemini n'a renvoyé aucun résultat pour l'analyse de marché.");
    }

    const marketResult = JSON.parse(rawText.trim());
    return res.json({
      ...marketResult,
      sources: sources,
      fallbackUsed: fallbackUsed
    });

  } catch (error: any) {
    console.error("Market analysis failed:", error);
    return res.status(500).json({
      error: "Erreur lors de l'analyse de marché. " + (error.message || "Veuillez réessayer.")
    });
  }
});

/**
 * Route: POST /api/ideation-clarify
 * Analyzes rough notes and returns exactly 3 deepening questions to structure the user's business concept.
 */
app.post("/api/ideation-clarify", async (req: any, res: any) => {
  try {
    const { userInput } = req.body;

    if (!userInput) {
      return res.status(400).json({ error: "Les notes brutes ou l'idée de départ sont requises." });
    }

    const systemInstruction = `Tu es un conseiller en création d'entreprise d'élite.
Analyse les notes brutes et le vrac d'idées de l'utilisateur. Formule précisément trois (3) questions d'approfondissement stratégiques, stimulantes et bienveillantes pour l'aider à structurer sa pensée, à lever le flou et à définir sa proposition de valeur.
Réponds obligatoirement en français et sous forme de liste JSON conforme au schéma strict demandé.`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        questions: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Les 3 questions d'approfondissement"
        }
      },
      required: ["questions"]
    };

    let response;
    try {
      response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: `Voici mes notes brutes et mon vrac d'idées :\n"${userInput}"`,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema
        }
      });
    } catch (err: any) {
      console.warn("[Ideation Fallback] gemini-3.8-flash failed, calling multi-model fallback queue...", err.message || err);
      response = await generateContentWithRobustFallback(`Voici mes notes brutes et mon vrac d'idées :\n"${userInput}"`, systemInstruction, responseSchema);
    }

    const rawText = response.text;
    if (!rawText) {
      throw new Error("L'API Gemini n'a renvoyé aucun résultat pour l'idéation.");
    }

    const result = JSON.parse(rawText.trim());
    return res.json(result);

  } catch (error: any) {
    console.error("Ideation clarification failed:", error);
    return res.status(500).json({
      error: "Erreur lors de la clarification de l'idée. " + (error.message || "Veuillez réessayer.")
    });
  }
});

/**
 * Route: POST /api/investor-screening
 * Generates an Investor Sheet & Solo Screening report tailored to a low-budget solopreneur project.
 */
app.post("/api/investor-screening", async (req: any, res: any) => {
  try {
    const { userInput, stage } = req.body;

    if (!userInput) {
      return res.status(400).json({ error: "Le userInput (description du projet) est requis." });
    }
    if (!stage) {
      return res.status(400).json({ error: "Le stage d'avancement est requis." });
    }

    const systemInstruction = `Tu es un conseiller financier et VC expert, spécialisé dans le bootstrapping, les micro-financements et les projets de solopreneurs / auto-entrepreneurs à faibles moyens.
Analyse la description du projet et son stade d'avancement : "${stage}". En déduire les options financières les plus plausibles, adaptées et réalistes.
Les montants et recommandations doivent refléter une situation d'auto-entrepreneur à faibles moyens (pas de levées de fonds de millions, mais plutôt subventions, préventes, micro-prêts ou autofinancement).
Réponds obligatoirement en français et sous forme de JSON conforme au schéma strict demandé.`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        investorMetrics: {
          type: Type.OBJECT,
          properties: {
            industrySector: { 
              type: Type.STRING, 
              description: "Secteur d'activité précis (ex: SaaS B2B Micro-outils, FinTech, E-commerce de niche)" 
            },
            inferredFundingNeeds: {
              type: Type.OBJECT,
              properties: {
                fundingTarget: { 
                  type: Type.STRING, 
                  description: "Besoin de financement estimé et plausible (ex: 0 - 5 000 € (Auto-financé) ou 15k-30k € en Prêt d'honneur / Love Money)" 
                },
                recommendedModel: { 
                  type: Type.STRING, 
                  enum: [
                    "Bootstrapping / Auto-financement", 
                    "Subventions / Prêt d'honneur", 
                    "Business Angels (Pre-Seed)"
                  ],
                  description: "Modèle de financement conseillé" 
                }
              },
              required: ["fundingTarget", "recommendedModel"]
            },
            timeToMarketMonths: { 
              type: Type.STRING, 
              description: "Délai de mise sur le marché estimé (ex: 1 à 3 mois)" 
            },
            primaryRiskType: { 
              type: Type.STRING, 
              enum: [
                "Acquisition / Marché", 
                "Technologique", 
                "Exécution Solo", 
                "Réglementaire"
              ],
              description: "Type de risque principal identifié" 
            },
            capitalIntensity: { 
              type: Type.STRING, 
              enum: [
                "Très Faible", 
                "Faible", 
                "Modérée"
              ],
              description: "Intensité capitalistique requise" 
            },
            defensibilityMoat: {
              type: Type.OBJECT,
              properties: {
                level: { 
                  type: Type.STRING, 
                  enum: [
                    "Faible", 
                    "Moyen", 
                    "Fort"
                  ],
                  description: "Niveau de barrière à l'entrée" 
                },
                keyFactor: { 
                  type: Type.STRING, 
                  description: "Facteur clé de différenciation (ex: Vitesse d'exécution, Marque personnelle, Effet de réseau de niche)" 
                }
              },
              required: ["level", "keyFactor"]
            },
            soloFeasibilityAssessment: { 
              type: Type.STRING, 
              description: "Analyse synthétique en exactement 2 phrases expliquant si le couple 'Fonds faibles / Effort Solo' est viable pour ce secteur" 
            }
          },
          required: [
            "industrySector", 
            "inferredFundingNeeds", 
            "timeToMarketMonths", 
            "primaryRiskType", 
            "capitalIntensity", 
            "defensibilityMoat", 
            "soloFeasibilityAssessment"
          ]
        }
      },
      required: ["investorMetrics"]
    };

    const prompt = `DESCRIPTION DU PROJET : ${userInput}\nSTADE D'AVANCEMENT : ${stage}`;

    let response = await generateContentWithRobustFallback(prompt, systemInstruction, responseSchema);

    const rawText = response.text;
    if (!rawText) {
      throw new Error("L'API Gemini n'a renvoyé aucun résultat pour la Fiche Investisseur.");
    }

    const result = JSON.parse(rawText.trim());
    return res.json(result);

  } catch (error: any) {
    console.error("Investor screening failed:", error);
    return res.status(500).json({
      error: "Erreur lors de la génération de la Fiche Investisseur. " + (error.message || "Veuillez réessayer.")
    });
  }
});

/**
 * Route: POST /api/solopreneur
 * Analyzes solopreneur project feasibility, bootstrapping budget, technical hurdles and actionable simplification steps.
 */
app.post("/api/solopreneur", async (req: any, res: any) => {
  try {
    const { userInput, bmc } = req.body;

    if (!userInput) {
      return res.status(400).json({ error: "Le userInput (description du projet) est requis." });
    }

    let prompt = `Analyse la faisabilité de cette idée d'entreprise pour un solopreneur (auto-entrepreneur travaillant seul) avec un budget très limité (bootstrapping).
IDÉE DU PROJET : ${userInput}
`;

    if (bmc) {
      prompt += `\nVoici également le Lean Canvas associé pour enrichir ton contexte d'analyse :\n${JSON.stringify(bmc)}\n`;
    }

    const systemInstruction = `Tu es un expert d'élite en lean startup, bootstrapping et soloprenariat.
Évalue si l'idée soumise est réaliste pour un créateur solo, estime le budget mensuel de fonctionnement minimum au démarrage, calcule la complexité technique et liste des conseils pragmatiques pour simplifier le produit au maximum.
Réponds obligatoirement en français et au format JSON conforme au schéma strict demandé.`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        technical_complexity: {
          type: Type.OBJECT,
          properties: {
            level: { type: Type.STRING, description: "Niveau de complexité technique (Faible | Moyenne | Élevée | Critique)" },
            estimated_dev_hours: { type: Type.STRING, description: "Estimation du temps de développement requis (ex: 40-60 heures)" },
            key_technical_hurdles: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Principaux défis ou verrous techniques" }
          },
          required: ["level", "estimated_dev_hours", "key_technical_hurdles"]
        },
        bootstrapping_budget: {
          type: Type.OBJECT,
          properties: {
            monthly_fixed_costs_eur: { type: Type.STRING, description: "Estimation des coûts mensuels fixes indispensables au démarrage (ex: 15-30€/mois)" },
            cost_breakdown: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  item: { type: Type.STRING, description: "Description ou nom de l'outil/service nécessaire" },
                  cost: { type: Type.STRING, description: "Coût ou formule (ex: 10€/mois, Gratuit)" }
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
            score_10: { type: Type.INTEGER, description: "Score global d'adéquation solopreneur de 0 à 10" },
            is_solopreneur_friendly: { type: Type.BOOLEAN, description: "Est-ce adapté à un solopreneur autonome ?" },
            main_bottlenecks: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Principaux verrous ou risques (ex: Support client lourd, etc.)" },
            time_to_mvp_weeks: { type: Type.STRING, description: "Temps estimé pour sortir la première version MVP (ex: 2-3 semaines)" }
          },
          required: ["score_10", "is_solopreneur_friendly", "main_bottlenecks", "time_to_mvp_weeks"]
        },
        actionable_recommendations: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Conseils concrets d'optimisation, de simplification de périmètre et d'outillage NoCode/SaaS de démarrage."
        }
      },
      required: ["technical_complexity", "bootstrapping_budget", "solopreneur_viability", "actionable_recommendations"]
    };

    let response;
    try {
      // Primary attempt: Execute content generation using the modern gemini-3.8-flash
      response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: responseSchema
        }
      });
    } catch (solopreneurErr: any) {
      console.warn("[Solopreneur Fallback] gemini-3.8-flash model failed or ratelimited. Falling back to robust multi-model queue...", solopreneurErr.message || solopreneurErr);
      
      // Fallback: Use the robust multi-model fallback handler to generate the structured JSON report safely
      response = await generateContentWithRobustFallback(prompt, systemInstruction, responseSchema);
    }

    const rawText = response.text;
    if (!rawText) {
      throw new Error("L'API Gemini n'a renvoyé aucun résultat pour l'évaluation Solopreneur.");
    }

    const solopreneurResult = JSON.parse(rawText.trim());
    return res.json(solopreneurResult);

  } catch (error: any) {
    console.error("Solopreneur evaluation failed:", error);
    return res.status(500).json({
      error: "Erreur lors de l'évaluation Solopreneur. " + (error.message || "Veuillez réessayer.")
    });
  }
});

// Configure full-stack static files serving & Vite dev server bridge
const isProd = process.env.NODE_ENV === "production";
const PORT = process.env.PORT || 3000;

async function startServer() {
  if (!isProd) {
    // Development Mode with Vite Middleware integration
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom",
    });
    app.use(vite.middlewares);

    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(__dirname, "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    // Production Mode serving compiled React app
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }

  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

startServer();
