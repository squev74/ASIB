export interface CanvasItem {
  id: string;
  text: string;
  confidence: number;
}

export interface BMC {
  problems: CanvasItem[];
  customerSegments: CanvasItem[];
  valuePropositions: CanvasItem[];
  solution: CanvasItem[];
  channels: CanvasItem[];
  revenueStreams: CanvasItem[];
  costStructure: CanvasItem[];
  keyMetrics: CanvasItem[];
  unfairAdvantage: CanvasItem[];
}

export interface PreQualificationTest {
  // 1. Intensité du problème (1: Vitamine -> 5: Analgésique critique)
  painIntensity: number; 
  
  // 2. Micro-TAM (Estimation rapide)
  targetAudienceCount: number; // ex: 5000
  estimatedAnnualPrice: number; // ex: 120 (10€/mois)
  // Calculé : estimatedMarketSize = targetAudienceCount * estimatedAnnualPrice

  // 3. Matrice d'usage
  usageFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  perceivedValue: 'low' | 'medium' | 'high';

  // 4. Vitesse de validation (Temps pour avoir 1er client payant)
  timeToFirstSale: 'days' | 'weeks' | 'months';

  // 5. Accessibilité cible
  goToMarketAccess: 'direct' | 'moderate' | 'hard'; // direct = accès immédiat (LinkedIn, réseau)

  // Score automatique /100 calculé par l'app
  preQualScore: number;
  recommendation: 'GO' | 'PIVOT_EARLY' | 'NO_GO';
}

export interface MarketAnalysis {
  status: 'none' | 'pending' | 'completed' | 'error';
  errorMessage?: string;
  updatedAt?: any;
  leaders: Array<{
    name: string;
    website?: string;
    monetizationModel: string;
    estimatedScale: string; // ex: "PME régionale" ou "Leader mondial SaaS"
    strengths: string[];
    weaknesses: string[];
  }>;
  monetizationTrends: string[];
  marketDynamics: {
    trend: 'Growing' | 'Stable' | 'Declining' | 'Emerging';
    comment: string;
  };
  strategicGaps: string[]; // Les opportunités à saisir
  sources?: Array<{ title: string; url: string }>;
}

export interface SolopreneurAnalysis {
  status: 'none' | 'pending' | 'completed' | 'error';
  errorMessage?: string;
  updatedAt?: any;
  technical_complexity: {
    level: 'Faible' | 'Moyenne' | 'Élevée' | 'Critique';
    estimated_dev_hours: string;
    key_technical_hurdles: string[];
  };
  bootstrapping_budget: {
    monthly_fixed_costs_eur: string;
    cost_breakdown: Array<{ item: string; cost: string }>;
  };
  solopreneur_viability: {
    score_10: number;
    is_solopreneur_friendly: boolean;
    main_bottlenecks: string[];
    time_to_mvp_weeks: string;
  };
  actionable_recommendations: string[];
}

export interface ProjectVersion {
  id: string;
  versionNumber: number;
  createdAt: any;
  userInput: string;
  
  // NOUVEAU : Étape de pré-qualification optionnelle/préalable
  preQualification?: PreQualificationTest;
  
  // Canvas & IA
  businessModelCanvas: BMC;
  aiAnalysisStatus: 'none' | 'pending' | 'completed' | 'error';
  analysisResult?: any;

  // Pivot, Audit & Validation properties
  pivotReason?: string;
  aiErrorMessage?: string;
  validationStatus?: 'none' | 'pending' | 'completed' | 'error';
  validationErrorMessage?: string;
  validationResult?: {
    canvas_analysis: Array<{
      element_id: string;
      category: string;
      content: string;
      user_confidence: number;
      ai_risk_assessment: 'Coherent' | 'Surevalue' | 'Sous-estime';
      criticity: 'Haute' | 'Moyenne' | 'Basse';
      ai_comment: string;
      suggested_action: string;
    }>;
    pivot_recommendation: {
      pivot_suggested: boolean;
      reason: string;
      suggested_directions: string[];
    };
  };
  marketAnalysis?: MarketAnalysis;
  solopreneurAnalysis?: SolopreneurAnalysis;
  investorScreening?: InvestorScreening;
  mvpPitch?: {
    mvpConversionPitch: {
      elevatorPitch30s: string;
      landingPageCopy: {
        heroTitle: string;
        heroSubtitle: string;
        keyBenefits: Array<{
          title: string;
          description: string;
        }>;
        primaryCTA: string;
      };
      coldOutreachTemplate: string;
      conversionObjections: Array<{
        objection: string;
        rebuttal: string;
      }>;
    };
    updatedAt?: string;
  };
  ideationNotes?: string;
  ideationQuestions?: string[];
  ownerId: string;
}

export interface InvestorScreening {
  stage: 'Idée' | 'Prototype / MVP' | 'Bêta' | 'Premiers Revenus';
  investorMetrics?: {
    industrySector: string;
    inferredFundingNeeds: {
      fundingTarget: string;
      recommendedModel: "Bootstrapping / Auto-financement" | "Subventions / Prêt d'honneur" | "Business Angels (Pre-Seed)";
    };
    timeToMarketMonths: string;
    primaryRiskType: "Acquisition / Marché" | "Technologique" | "Exécution Solo" | "Réglementaire";
    capitalIntensity: "Très Faible" | "Faible" | "Modérée";
    defensibilityMoat: {
      level: "Faible" | "Moyen" | "Fort";
      keyFactor: string;
    };
    soloFeasibilityAssessment: string;
  };
  updatedAt?: string;
}

// Type alias for seamless backward compatibility
export type Version = ProjectVersion;

export type ProjectStatus = 'active' | 'sleeping' | 'abandoned';

export type ProjectPhase = 'ideation' | 'benchmark' | 'canvas' | 'mvp';

export interface Project {
  id: string;
  title: string;
  createdAt: any;
  updatedAt: any;
  currentVersionId: string;
  ownerId: string;
  order?: number;
  status?: ProjectStatus;
  currentPhase?: ProjectPhase;
  latestPreQualScore?: number;
  latestOverallScore?: number;
  latestSolopreneurScore?: number;
}
