import React, { useState, useEffect } from "react";
import { User, onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider } from "firebase/auth";
import { 
  collection, 
  doc, 
  deleteDoc,
  getDocs, 
  query, 
  where, 
  orderBy, 
  updateDoc
} from "firebase/firestore";
import { 
  auth, 
  db, 
  handleFirestoreError, 
  OperationType 
} from "./firebase";
import { 
  TrendingUp, 
  Plus, 
  RotateCw, 
  AlertTriangle, 
  LogOut, 
  Briefcase, 
  ArrowRight, 
  Trash2,
  Edit3,
  X,
  Compass,
  FileText,
  ChevronUp,
  ChevronDown
} from "lucide-react";
import { Project, ProjectStatus, Version } from "./types/project";
import ProjectEditor, { BMC } from "./ProjectEditor";
import VersionDetails from "./VersionDetails";
import Stepper from "./components/Stepper";
import IdeationPhase from "./components/IdeationPhase";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // App workspace states
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  // Creation/Analysis state
  const [isFetchingVersions, setIsFetchingVersions] = useState(false);
  const [projectToDeleteId, setProjectToDeleteId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Status Filter State
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'sleeping' | 'abandoned'>('all');

  // Visual flow controls
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [isEditingCanvas, setIsEditingCanvas] = useState(false);
  const [isPivotMode, setIsPivotMode] = useState(false);

  // Track user login state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (currentUser) {
        loadProjects(currentUser.uid);
      } else {
        setProjects([]);
        setSelectedProjectId(null);
        setVersions([]);
        setSelectedVersionId(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch projects from Firestore
  const loadProjects = async (userId: string) => {
    const path = "projects";
    try {
      const q = query(
        collection(db, path),
        where("ownerId", "==", userId),
        orderBy("updatedAt", "desc")
      );
      const querySnapshot = await getDocs(q);
      const loaded: Project[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        loaded.push({
          ...(data as Project),
          status: data.status || 'active'
        });
      });

      // Sort locally: order (asc) if present, then fallback to updatedAt (desc)
      // New projects (without an explicit order field) are automatically sorted to the top
      const sorted = loaded.sort((a, b) => {
        const hasOrderA = typeof a.order === "number";
        const hasOrderB = typeof b.order === "number";

        if (hasOrderA && hasOrderB) {
          return (a.order as number) - (b.order as number);
        }

        if (!hasOrderA && !hasOrderB) {
          const timeA = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : (a.updatedAt ? new Date(a.updatedAt).getTime() : 0);
          const timeB = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : (b.updatedAt ? new Date(b.updatedAt).getTime() : 0);
          return timeB - timeA;
        }

        // The one without order is brand new or newly created, put it at the top
        return !hasOrderA ? -1 : 1;
      });

      setProjects(sorted);

      // Auto-select first project if nothing is selected
      if (sorted.length > 0 && !selectedProjectId) {
        selectProject(sorted[0].id);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  };

  // Manually reorder projects and save in Firestore
  const moveProject = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= projects.length) return;

    // Create copy and swap elements
    const reordered = [...projects];
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    // Assign sequential order indices
    const updated = reordered.map((p, idx) => ({
      ...p,
      order: idx
    }));

    // Optimistically update state
    setProjects(updated);

    try {
      // Write updated orders to Firestore
      const updatePromises = updated.map((p) => 
        updateDoc(doc(db, "projects", p.id), { order: p.order })
      );
      await Promise.all(updatePromises);
    } catch (err) {
      console.error("Failed to persist manual project ordering:", err);
      setErrorMsg("Une erreur est survenue lors de l'enregistrement de l'ordre des projets.");
    }
  };

  // Helper to update a project status directly in Firestore and reflect locally instantly
  const updateProjectStatus = async (projectId: string, newStatus: ProjectStatus) => {
    try {
      const docRef = doc(db, "projects", projectId);
      await updateDoc(docRef, { status: newStatus });
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, status: newStatus } : p))
      );
    } catch (err) {
      console.error("Failed to update project status:", err);
      setErrorMsg("Une erreur est survenue lors du changement de statut.");
    }
  };

  // Helper to update a project pipeline phase directly in Firestore and reflect locally instantly
  const updateProjectPhase = async (projectId: string, newPhase: 'ideation' | 'benchmark' | 'canvas' | 'mvp') => {
    try {
      const docRef = doc(db, "projects", projectId);
      await updateDoc(docRef, { currentPhase: newPhase });
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, currentPhase: newPhase } : p))
      );
    } catch (err) {
      console.error("Failed to update project phase:", err);
      setErrorMsg("Une erreur est survenue lors du changement d'étape.");
    }
  };

  // Select project and load its versions
  const selectProject = async (projectId: string) => {
    setSelectedProjectId(projectId);
    setIsFetchingVersions(true);
    setIsEditingCanvas(false);
    setIsPivotMode(false);
    setIsCreatingNew(false);

    const path = `projects/${projectId}/versions`;
    try {
      const q = query(
        collection(db, path),
        orderBy("versionNumber", "desc")
      );
      const querySnapshot = await getDocs(q);
      const loadedVersions: Version[] = [];
      querySnapshot.forEach((docSnap) => {
        loadedVersions.push(docSnap.data() as Version);
      });
      setVersions(loadedVersions);

      if (loadedVersions.length > 0) {
        setSelectedVersionId(loadedVersions[0].id);
      } else {
        setSelectedVersionId(null);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    } finally {
      setIsFetchingVersions(false);
    }
  };

  // Google Login popup
  const handleLogin = async () => {
    setErrorMsg(null);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Auth error:", err);
      setErrorMsg("Échec de l'authentification avec Google. Veuillez réessayer.");
    }
  };

  // Logout
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  // Trigger custom confirmation modal for project deletion
  const triggerDeleteProject = (projectId: string) => {
    setProjectToDeleteId(projectId);
  };

  // Perform actual database deletion
  const confirmDeleteProject = async () => {
    if (!user || !projectToDeleteId) return;
    
    const projectId = projectToDeleteId;
    const path = `projects/${projectId}`;
    try {
      await deleteDoc(doc(db, "projects", projectId));
      
      // Update local state
      setProjects(prev => prev.filter(p => p.id !== projectId));
      if (selectedProjectId === projectId) {
        setSelectedProjectId(null);
        setVersions([]);
        setSelectedVersionId(null);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    } finally {
      setProjectToDeleteId(null);
    }
  };

  // Callback on successful Local-First project/version creation
  const handleEditorSaveSuccess = async (projId: string, verId: string) => {
    setIsCreatingNew(false);
    setIsEditingCanvas(false);
    setIsPivotMode(false);
    await loadProjects(user!.uid);
    await selectProject(projId);
    setSelectedVersionId(verId);
  };

  // Get active selected version data
  const activeVersion = versions.find(v => v.id === selectedVersionId);
  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const currentPhase = selectedProject?.currentPhase || 'ideation';

  // Get prior version for pivot comparison if index allows
  const getPriorVersionAnalysis = () => {
    if (!selectedVersionId || versions.length === 0) return null;
    const idx = versions.findIndex(v => v.id === selectedVersionId);
    if (idx !== -1 && idx + 1 < versions.length) {
      return versions[idx + 1].analysisResult || null;
    }
    return null;
  };

  // Formatter for readable firestore timestamps
  const formatTimestamp = (ts: any) => {
    if (!ts) return "";
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans selection:bg-indigo-100 selection:text-indigo-900">
      
      {/* Loading Splash screen */}
      {authLoading && (
        <div className="fixed inset-0 bg-slate-900 text-white flex flex-col justify-center items-center z-50">
          <div className="relative flex items-center justify-center mb-6">
            <div className="w-12 h-12 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
            <TrendingUp className="w-5 h-5 text-indigo-500 absolute" />
          </div>
          <span className="text-sm font-semibold tracking-wider text-indigo-200 animate-pulse font-mono">
            Vérification de la session...
          </span>
        </div>
      )}

      {/* Landing page when not signed in */}
      {!authLoading && !user && (
        <div className="flex-1 flex flex-col">
          {/* Landing Header */}
          <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-sm shadow-indigo-200">
                <TrendingUp className="w-4 h-4" />
              </div>
              <span className="font-extrabold text-lg text-slate-900 tracking-tight">
                PivotAnalyzer
              </span>
            </div>
            <button 
              onClick={handleLogin}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm py-2 px-4 rounded-xl shadow-sm shadow-indigo-100 transition-colors flex items-center gap-2 cursor-pointer"
            >
              Démarrer gratuitement
              <ArrowRight className="w-4 h-4" />
            </button>
          </header>

          {/* Landing Body Content */}
          <main className="flex-1 max-w-6xl mx-auto px-6 py-12 md:py-20 flex flex-col md:flex-row items-center justify-between gap-12">
            
            {/* Value Proposition Statement */}
            <div className="flex-1 space-y-6 text-center md:text-left">
              <span className="text-xs font-bold font-mono tracking-widest text-indigo-600 uppercase bg-indigo-50 px-3 py-1.5 rounded-full inline-block">
                SaaS Lean Canvas & Évaluation VC par l'IA
              </span>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-none font-display">
                Analysez et Pivotez vos Idées en <span className="text-indigo-600">Lean Canvas</span>.
              </h1>
              <p className="text-base text-slate-600 leading-relaxed font-normal max-w-xl">
                Rédigez manuellement, organisez vos notes et structurez votre Lean Canvas (9 zones strictes) en mode local-first instantané. Déclenchez l'IA d'élite Gemini 3.8 Flash pour valider la viabilité et structurer les pivots stratégiques.
              </p>

              {/* Core Features list on landing */}
              <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto md:mx-0 pt-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs shrink-0">L</div>
                  <div>
                    <h4 className="font-bold text-xs text-slate-900">Saisie Libre First</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">Saisissez et modifiez vos cases Lean Canvas sans IA.</p>
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs shrink-0">I</div>
                  <div>
                    <h4 className="font-bold text-xs text-slate-900">Enrichissement IA</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">Note VC, Red Flags et hypothèses en un clic.</p>
                  </div>
                </div>
              </div>

              {/* Explicit login action */}
              <div className="pt-6 flex justify-center md:justify-start">
                <button
                  onClick={handleLogin}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm py-3 px-6 rounded-xl shadow transition-all cursor-pointer inline-flex items-center gap-3 hover:-translate-y-0.5"
                >
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M12.54 11H20v3.8h-7.46V11z" />
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" />
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Se connecter avec Google
                </button>
              </div>
            </div>

            {/* Illustration Mockup */}
            <div className="flex-1 max-w-md w-full bg-white p-6 rounded-3xl border border-slate-200/80 shadow-2xl relative rotate-1">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-rose-400"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-400"></div>
                  <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
                </div>
                <span className="text-[10px] font-mono text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded">Lean Canvas 9 Zones</span>
              </div>
              <div className="space-y-4">
                <div className="h-6 w-1/3 bg-slate-100 rounded-lg"></div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="h-16 bg-slate-50 border border-dashed rounded p-1 flex flex-col justify-between">
                    <span className="text-[8px] text-slate-400 uppercase font-mono">1. Problème</span>
                    <div className="h-1.5 bg-slate-200 rounded w-4/5"></div>
                  </div>
                  <div className="h-16 bg-slate-50 border border-dashed rounded p-1 flex flex-col justify-between">
                    <span className="text-[8px] text-slate-400 uppercase font-mono">4. Solution</span>
                    <div className="h-1.5 bg-slate-200 rounded w-2/3"></div>
                  </div>
                  <div className="h-16 bg-slate-50 border border-dashed rounded p-1 flex flex-col justify-between">
                    <span className="text-[8px] text-slate-400 uppercase font-mono">2. Segments</span>
                    <div className="h-1.5 bg-slate-200 rounded w-3/4"></div>
                  </div>
                </div>
              </div>
            </div>

          </main>
        </div>
      )}

      {/* Main Full-Stack Application Layout when signed in */}
      {!authLoading && user && (
        <div className="flex-1 flex flex-col md:flex-row h-screen overflow-hidden">
          
          {/* Sidebar Area: Multi-Projects Navigation & Versions List */}
          <aside className="w-full md:w-80 bg-white border-b md:border-b-0 md:border-r border-slate-200 flex flex-col h-1/3 md:h-full shrink-0">
            
            {/* Header / Brand in Sidebar */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-sm shadow-indigo-100">
                  <TrendingUp className="w-3.5 h-3.5" />
                </div>
                <span className="font-extrabold text-sm text-slate-900 tracking-tight">
                  PivotAnalyzer
                </span>
              </div>
              
              <button
                onClick={() => {
                  setSelectedProjectId(null);
                  setVersions([]);
                  setSelectedVersionId(null);
                  setIsCreatingNew(true);
                  setIsEditingCanvas(false);
                  setIsPivotMode(false);
                }}
                className="text-indigo-600 hover:text-indigo-800 p-1 rounded-lg hover:bg-indigo-50 cursor-pointer"
                title="Nouveau Projet"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {/* List of projects */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <div className="flex items-center justify-between px-2 mb-2">
                <span className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider">
                  Vos projets ({projects.length})
                </span>
              </div>

              {/* Quick Status Filter Pills */}
              <div className="grid grid-cols-4 gap-1 px-1 mb-3">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`py-1 px-1 rounded-lg text-[9px] font-black uppercase transition-all cursor-pointer text-center ${
                    statusFilter === 'all'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200/60 hover:text-slate-700'
                  }`}
                >
                  Tous
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('active')}
                  className={`py-1 px-1 rounded-lg text-[9px] font-black uppercase transition-all cursor-pointer text-center ${
                    statusFilter === 'active'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200/60 hover:text-slate-700'
                  }`}
                >
                  Actif
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('sleeping')}
                  className={`py-1 px-1 rounded-lg text-[9px] font-black uppercase transition-all cursor-pointer text-center ${
                    statusFilter === 'sleeping'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200/60 hover:text-slate-700'
                  }`}
                >
                  Veille
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('abandoned')}
                  className={`py-1 px-1 rounded-lg text-[9px] font-black uppercase transition-all cursor-pointer text-center ${
                    statusFilter === 'abandoned'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200/60 hover:text-slate-700'
                  }`}
                >
                  Off
                </button>
              </div>

              {(() => {
                const filteredProjects = projects.filter((p) => {
                  if (statusFilter === 'all') return true;
                  return (p.status || 'active') === statusFilter;
                });

                if (filteredProjects.length === 0) {
                  return (
                    <div className="p-4 text-center">
                      <p className="text-xs text-slate-400 italic">
                        Aucun projet {
                          statusFilter === 'active' ? 'actif' :
                          statusFilter === 'sleeping' ? 'en veille' :
                          statusFilter === 'abandoned' ? 'abandonné' : ''
                        }
                      </p>
                    </div>
                  );
                }

                return filteredProjects.map((proj, index) => {
                  const isSelected = proj.id === selectedProjectId;
                  const projStatus = proj.status || 'active';
                  
                  // Read live scores from active state for currently selected project to ensure real-time rendering
                  const preQualScore = isSelected && activeVersion?.preQualification?.preQualScore !== undefined
                    ? activeVersion.preQualification.preQualScore 
                    : proj.latestPreQualScore;
                    
                  const overallScore = isSelected && activeVersion?.analysisResult?.overall_score_100 !== undefined
                    ? activeVersion.analysisResult.overall_score_100
                    : proj.latestOverallScore;

                  const soloScore = isSelected && activeVersion?.solopreneurAnalysis?.solopreneur_viability?.score_10 !== undefined
                    ? activeVersion.solopreneurAnalysis.solopreneur_viability.score_10
                    : proj.latestSolopreneurScore;
                  
                  return (
                    <div
                      key={proj.id}
                      className={`group w-full rounded-lg transition-all flex items-center justify-between p-2 ${
                        isSelected 
                          ? "bg-slate-100 border border-slate-200 text-slate-900" 
                          : "text-slate-600 hover:bg-slate-50/80 hover:text-slate-900"
                      }`}
                    >
                      <button
                        onClick={() => selectProject(proj.id)}
                        className="flex-1 text-left flex flex-col gap-0.5 min-w-0 cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2 w-full">
                          <div className="flex items-center gap-2 min-w-0">
                            <span 
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                projStatus === 'active' ? 'bg-emerald-500' :
                                projStatus === 'sleeping' ? 'bg-amber-400' : 'bg-rose-500'
                              }`}
                              title={`Statut: ${
                                projStatus === 'active' ? 'Actif' :
                                projStatus === 'sleeping' ? 'En sommeil' : 'Abandonné'
                              }`}
                            />
                            <span className="font-semibold text-sm truncate max-w-[100px] block">
                              {proj.title}
                            </span>
                          </div>
                           {(preQualScore !== undefined || overallScore !== undefined || soloScore !== undefined) && (
                            <div className="flex items-center gap-1 shrink-0 ml-auto">
                              {preQualScore !== undefined && (
                                <span className="inline-flex items-center text-[8px] font-bold font-mono px-1 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100/40" title="Score d'opportunité (Crash Test)">
                                  Op:{preQualScore}
                                </span>
                              )}
                              {overallScore !== undefined && (
                                <span className="inline-flex items-center text-[8px] font-bold font-mono px-1 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-100/40" title="Score de viabilité VC">
                                  Via:{overallScore}
                                </span>
                              )}
                              {soloScore !== undefined && (
                                <span className="inline-flex items-center text-[8px] font-bold font-mono px-1 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100/40" title="Compatibilité Solopreneur /10">
                                  Solo:{soloScore}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="pl-4 flex flex-col gap-1">
                          <span className="text-[9px] text-slate-400 font-mono">
                            Mise à jour : {formatTimestamp(proj.updatedAt)}
                          </span>
                        </div>
                      </button>

                      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity ml-1">
                        {index > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveProject(index, 'up');
                            }}
                            title="Monter le projet"
                            className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-all cursor-pointer"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {index < filteredProjects.length - 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveProject(index, 'down');
                            }}
                            title="Descendre le projet"
                            className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-all cursor-pointer"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerDeleteProject(proj.id);
                          }}
                          title="Supprimer ce projet"
                          className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* History of selected Project's Versions */}
            {selectedProjectId && versions.length > 0 && (
              <div className="border-t border-slate-100 p-3 bg-slate-50/50">
                <span className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider block mb-3">
                  Historique des versions
                </span>
                <div className="space-y-2 max-h-[160px] overflow-y-auto">
                  {versions.map((ver) => {
                    const isSelected = ver.id === selectedVersionId;
                    return (
                      <button
                        key={ver.id}
                        onClick={() => {
                          setSelectedVersionId(ver.id);
                          setIsEditingCanvas(false);
                          setIsPivotMode(false);
                          setIsCreatingNew(false);
                        }}
                        className={`w-full text-left p-2 rounded border transition-all text-xs flex flex-col gap-1 ${
                          isSelected 
                            ? "bg-indigo-50 border-indigo-200 text-indigo-900" 
                            : "bg-white border-slate-200 hover:bg-slate-50 text-slate-600"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold">
                            Version #{ver.versionNumber}
                          </span>
                          <span className="text-[9px] text-slate-400">
                            {formatTimestamp(ver.createdAt)}
                          </span>
                        </div>
                        {ver.pivotReason && (
                          <p className="text-[10px] italic text-slate-500 truncate max-w-[220px]">
                            Pivot : "{ver.pivotReason}"
                          </p>
                        )}
                        <span className={`text-[9px] px-1.5 py-0.5 rounded self-start ${
                          ver.aiAnalysisStatus === 'completed' ? 'bg-indigo-100 text-indigo-700 font-medium' :
                          ver.aiAnalysisStatus === 'pending' ? 'bg-blue-100 text-blue-700 animate-pulse' :
                          ver.aiAnalysisStatus === 'error' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {ver.aiAnalysisStatus === 'completed' ? 'Analysé' :
                           ver.aiAnalysisStatus === 'pending' ? 'Analyse...' :
                           ver.aiAnalysisStatus === 'error' ? 'Erreur' : 'Non analysé'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sidebar bottom Profile details & Logout action */}
            <div className="border-t border-slate-100 p-4 flex items-center justify-between gap-3 bg-slate-50/50">
              <div className="flex items-center gap-2 min-w-0">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="Avatar" className="w-8 h-8 rounded-full border border-slate-200" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-xs">
                    {user.email?.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">
                    {user.displayName || user.email?.split("@")[0]}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
                </div>
              </div>
              <button 
                onClick={handleLogout}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-100 shrink-0 cursor-pointer"
                title="Se déconnecter"
              >
                <LogOut className="w-4.5 h-4.5" />
              </button>
            </div>

          </aside>

          {/* Right Area: Main Interactive Workspace */}
          <main className="flex-1 bg-slate-50 p-6 flex flex-col overflow-y-auto h-2/3 md:h-full">
            
            {selectedProjectId && !isCreatingNew && !isEditingCanvas && !isPivotMode && !isFetchingVersions && (
              <div className="mb-6">
                <Stepper
                  currentPhase={currentPhase}
                  onChangePhase={(phase) => updateProjectPhase(selectedProjectId, phase)}
                />
              </div>
            )}
            
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-6 flex items-start gap-3 animate-in fade-in">
                <AlertTriangle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
                <div className="text-sm flex-1">
                  <p className="font-semibold">Une erreur est survenue</p>
                  <p className="mt-1">{errorMsg}</p>
                </div>
                <button 
                  onClick={() => setErrorMsg(null)}
                  className="text-red-400 hover:text-red-600 p-1 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* A. Create a brand new project (No IA) */}
            {isCreatingNew && (
              <ProjectEditor 
                userId={user.uid}
                onSaveSuccess={handleEditorSaveSuccess}
                onCancel={() => {
                  setIsCreatingNew(false);
                  if (projects.length > 0 && selectedProjectId) {
                    selectProject(selectedProjectId);
                  }
                }}
              />
            )}

            {/* B. Edit existing Canvas manually (No IA) */}
            {isEditingCanvas && activeVersion && (
              <ProjectEditor 
                userId={user.uid}
                projectId={selectedProjectId}
                version={activeVersion}
                onSaveSuccess={handleEditorSaveSuccess}
                onCancel={() => setIsEditingCanvas(false)}
              />
            )}

            {/* C. Create sequential Pivot version (No IA) */}
            {isPivotMode && activeVersion && (
              <ProjectEditor 
                userId={user.uid}
                projectId={selectedProjectId}
                version={activeVersion}
                isPivotCreation={true}
                onSaveSuccess={handleEditorSaveSuccess}
                onCancel={() => setIsPivotMode(false)}
              />
            )}

            {/* D. Show Selected Version Details Dashboard */}
            {!isCreatingNew && !isEditingCanvas && !isPivotMode && activeVersion && (
              currentPhase === 'ideation' ? (
                <IdeationPhase
                  projectId={selectedProjectId!}
                  version={activeVersion}
                  onUpdatePhase={(phase) => updateProjectPhase(selectedProjectId!, phase)}
                  onSuccess={() => selectProject(selectedProjectId!)}
                />
              ) : (
                <VersionDetails 
                  userId={user.uid}
                  projectId={selectedProjectId!}
                  version={activeVersion}
                  priorVersionAnalysis={getPriorVersionAnalysis()}
                  onEnrichStart={() => {}}
                  onEnrichSuccess={() => selectProject(selectedProjectId!)}
                  onStartEdit={() => setIsEditingCanvas(true)}
                  onStartPivot={() => setIsPivotMode(true)}
                  projectStatus={projects.find((p) => p.id === selectedProjectId)?.status || 'active'}
                  onStatusChange={(newStatus) => updateProjectStatus(selectedProjectId!, newStatus)}
                  currentPhase={currentPhase}
                />
              )
            )}

            {/* E. Fetching versions loader */}
            {isFetchingVersions && !isCreatingNew && !isEditingCanvas && !isPivotMode && (
              <div className="flex-1 flex flex-col justify-center items-center py-16 animate-in fade-in duration-150">
                <div className="w-10 h-10 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin mb-4"></div>
                <p className="text-xs text-slate-400 font-mono">Synchronisation des données avec Firestore...</p>
              </div>
            )}

          </main>
        </div>
      )}

      {/* Custom Project Deletion Confirmation Modal */}
      {projectToDeleteId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3 mb-4 text-red-600">
              <AlertTriangle className="w-5 h-5 shrink-0 animate-pulse" />
              <h3 className="font-bold text-slate-900 text-base">Supprimer le projet</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Êtes-vous sûr de vouloir supprimer définitivement ce projet ainsi que l'ensemble de ses versions ? <strong className="text-red-600">Cette action est irréversible.</strong>
            </p>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
              <button
                onClick={() => setProjectToDeleteId(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold py-2 px-4 rounded-lg transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={confirmDeleteProject}
                className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold py-2 px-4 rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Confirmer la suppression
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer conforming to universal design constraints */}
      <footer className="bg-white border-t border-slate-200/80 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 mt-auto">
        <span className="text-xs text-slate-400 font-mono">
          &copy; {new Date().getFullYear()} PivotAnalyzer Inc. Tous droits réservés.
        </span>
        <div className="flex items-center gap-4 text-xs font-medium text-slate-400">
          <span>Modèle : gemini-3.8-flash</span>
          <span>·</span>
          <span>Format : Lean Canvas (9 Zones)</span>
          <span>·</span>
          <span>Base : Firestore NoSQL</span>
        </div>
      </footer>

    </div>
  );
}
