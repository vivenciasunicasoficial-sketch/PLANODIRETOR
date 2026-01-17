
import React, { useState, useEffect, useRef } from 'react';
import { Scene, GenerationStep } from './types';
import { GeminiService } from './services/geminiService';
import { 
  Play, 
  Plus, 
  Video, 
  Sparkles, 
  Loader2, 
  AlertCircle,
  FileText,
  Clock,
  Image as ImageIcon,
  X,
  Download,
  Film,
  Zap,
  Settings2,
  Monitor,
  Smartphone,
  Clapperboard,
  Trash2,
  ChevronRight,
  LogIn,
  RotateCcw,
  RefreshCw
} from 'lucide-react';

const App: React.FC = () => {
  const [script, setScript] = useState('');
  const [timeDisplay, setTimeDisplay] = useState('00:16'); 
  const [generationMode, setGenerationMode] = useState<'fast' | 'quality'>('quality');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [step, setStep] = useState<GenerationStep>(GenerationStep.IDLE);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  
  const timelineEndRef = useRef<HTMLDivElement>(null);

  // Load state from localStorage on mount
  useEffect(() => {
    const savedScript = localStorage.getItem('veoflow_script');
    const savedTime = localStorage.getItem('veoflow_time');
    if (savedScript) setScript(savedScript);
    if (savedTime) setTimeDisplay(savedTime);
    
    checkAuth();
  }, []);

  // Save script/time to localStorage when they change
  useEffect(() => {
    localStorage.setItem('veoflow_script', script);
    localStorage.setItem('veoflow_time', timeDisplay);
  }, [script, timeDisplay]);

  useEffect(() => {
    if (scenes.length > 0) {
      timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scenes, currentSceneIndex]);

  const checkAuth = async () => {
    try {
      const selected = await (window as any).aistudio.hasSelectedApiKey();
      setHasApiKey(selected);
    } catch (e) {
      console.error("Auth check failed", e);
    } finally {
      setCheckingAuth(false);
    }
  };

  const handleConnectGoogle = async () => {
    try {
      await (window as any).aistudio.openSelectKey();
      setHasApiKey(true);
    } catch (e) {
      console.error("Connection error", e);
    }
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw === '') {
      setTimeDisplay('00:00');
      return;
    }
    const val = raw.slice(-4);
    let formatted = '';
    if (val.length <= 2) {
      formatted = `00:${val.padStart(2, '0')}`;
    } else {
      formatted = `${val.slice(0, val.length - 2).padStart(2, '0')}:${val.slice(-2)}`;
    }
    setTimeDisplay(formatted);
  };

  const getTotalSeconds = () => {
    const parts = timeDisplay.split(':');
    const m = parseInt(parts[0]) || 0;
    const s = parseInt(parts[1]) || 0;
    return (m * 60) + s;
  };

  const calculateTargetScenes = () => {
    const total = getTotalSeconds();
    return Math.max(1, Math.ceil(total / 8)); 
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setReferenceImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const resetProject = () => {
    if (window.confirm("Isso irá limpar todo o progresso atual. Tem certeza?")) {
      setScenes([]);
      setError(null);
      setStep(GenerationStep.IDLE);
      setCurrentSceneIndex(-1);
    }
  };

  const retryScene = async (index: number) => {
    if (step !== GenerationStep.IDLE && step !== GenerationStep.COMPLETED) return;
    
    setError(null);
    const updatedScenes = [...scenes];
    updatedScenes[index].status = 'generating';
    setScenes(updatedScenes);
    setStep(GenerationStep.GENERATING_VIDEOS);
    setCurrentSceneIndex(index);

    try {
      const prevScene = index > 0 ? updatedScenes[index - 1] : undefined;
      const isSequenced = updatedScenes.length > 1;
      
      const result = await GeminiService.generateSceneVideo(
        updatedScenes[index], 
        prevScene,
        generationMode,
        aspectRatio,
        index === 0 ? (referenceImage || undefined) : undefined,
        isSequenced 
      );
      
      updatedScenes[index].status = 'completed';
      updatedScenes[index].videoUri = result.videoUri;
      updatedScenes[index].blobUrl = result.blobUrl;
      updatedScenes[index].rawResponse = result.rawResponse;
      setScenes([...updatedScenes]);
      setStep(GenerationStep.IDLE); // Allow user to continue manually or via button
    } catch (err: any) {
      updatedScenes[index].status = 'failed';
      setScenes([...updatedScenes]);
      handleError(err);
    } finally {
      setCurrentSceneIndex(-1);
    }
  };

  const handleError = (err: any) => {
    if (err.message === "AUTH_ERROR") {
      setError("Erro de Faturamento: Sua conta Google não possui créditos Veo ativos ou o projeto selecionado não tem faturamento habilitado.");
      setHasApiKey(false);
    } else if (err.message === "LIMITE_COTAS" || err.message?.includes("429")) {
      setError("Limite de Uso Excedido: Muitas requisições em pouco tempo. Clique em 'Retomar' para continuar de onde parou.");
    } else {
      setError(`Erro: ${err.message || 'Falha na produção do vídeo.'}`);
    }
    setStep(GenerationStep.IDLE);
  };

  const startOrResumeAutomation = async () => {
    if (!script.trim()) return;
    setError(null);
    
    let currentScenes = [...scenes];
    
    try {
      // Step 1: Analyze if no scenes exist
      if (currentScenes.length === 0) {
        setStep(GenerationStep.ANALYZING_SCRIPT);
        const targetCount = calculateTargetScenes();
        currentScenes = await GeminiService.analyzeScript(script, targetCount);
        setScenes(currentScenes);
      }

      // Step 2: Generate pending or failed videos
      setStep(GenerationStep.GENERATING_VIDEOS);
      const isSequenced = currentScenes.length > 1;
      
      for (let i = 0; i < currentScenes.length; i++) {
        // Skip already completed scenes
        if (currentScenes[i].status === 'completed' && currentScenes[i].blobUrl) {
          continue;
        }

        setCurrentSceneIndex(i);
        currentScenes[i].status = 'generating';
        setScenes([...currentScenes]);

        try {
          const prevScene = i > 0 ? currentScenes[i - 1] : undefined;
          
          // Note: If prevScene failed, we might have issues extending.
          // In a real scenario, we'd ensure the chain is solid.
          const result = await GeminiService.generateSceneVideo(
            currentScenes[i], 
            prevScene,
            generationMode,
            aspectRatio,
            i === 0 ? (referenceImage || undefined) : undefined,
            isSequenced 
          );
          
          currentScenes[i].status = 'completed';
          currentScenes[i].videoUri = result.videoUri;
          currentScenes[i].blobUrl = result.blobUrl;
          currentScenes[i].rawResponse = result.rawResponse;
          setScenes([...currentScenes]);
        } catch (sceneErr: any) {
          currentScenes[i].status = 'failed';
          setScenes([...currentScenes]);
          throw sceneErr; // Break loop to allow user to retry or resume
        }
      }
      
      setStep(GenerationStep.COMPLETED);
      setCurrentSceneIndex(-1);
    } catch (err: any) {
      handleError(err);
    }
  };

  const hasProgress = scenes.length > 0;
  const hasFailedScenes = scenes.some(s => s.status === 'failed');
  const isInterrupted = scenes.some(s => s.status === 'completed') && scenes.some(s => s.status !== 'completed');

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!hasApiKey) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-[#0c0c0e] border border-zinc-800 rounded-[3rem] p-12 space-y-10 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 bg-[length:200%_100%] animate-[gradient_3s_linear_infinite]" />
          
          <div className="w-24 h-24 bg-white/5 rounded-[2.5rem] flex items-center justify-center mx-auto ring-1 ring-white/10 group-hover:scale-110 transition-transform duration-500">
            <Zap className="w-12 h-12 text-blue-500 fill-blue-500/20" />
          </div>
          
          <div className="space-y-3">
            <h2 className="text-4xl font-black tracking-tighter">VeoFlow Studio</h2>
            <p className="text-zinc-500 text-sm leading-relaxed px-4">
              Conecte sua conta para gerar vídeos cinematográficos com o motor **Veo 3.1**.
            </p>
          </div>

          <button 
            onClick={handleConnectGoogle}
            className="w-full py-5 bg-white text-black hover:bg-zinc-200 rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-3 shadow-xl shadow-white/5 group"
          >
            <LogIn className="w-5 h-5" />
            Autenticar no Google Cloud
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>

          <div className="pt-4 border-t border-zinc-800/50">
            <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
              Gere conteúdo usando seus próprios créditos
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col md:flex-row overflow-hidden font-sans">
      <aside className="w-full md:w-80 bg-[#0c0c0e] border-r border-zinc-800/40 flex flex-col p-6 space-y-8 overflow-y-auto z-20">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-500/30 ring-1 ring-white/10">
            <Zap className="w-7 h-7 text-white fill-white/20" />
          </div>
          <div>
            <h1 className="font-black text-2xl tracking-tighter leading-none">VEOFLOW</h1>
            <p className="text-[10px] uppercase tracking-widest text-blue-500 font-bold mt-1">Directorial Engine</p>
          </div>
        </div>

        <div className="space-y-6">
          <section className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2">
                <Clock className="w-3 h-3" /> Tempo de Narração
              </label>
              {hasProgress && (
                <button 
                  onClick={resetProject}
                  className="text-[9px] font-black uppercase text-red-500 hover:text-red-400 flex items-center gap-1 transition-colors"
                >
                  <RotateCcw className="w-2.5 h-2.5" /> Limpar Projeto
                </button>
              )}
            </div>
            <input 
              type="text" 
              value={timeDisplay}
              onChange={handleTimeChange}
              placeholder="00:16"
              className="w-full bg-zinc-900/50 border border-zinc-800/50 rounded-2xl px-4 py-5 text-blue-400 font-mono font-bold focus:border-blue-500/50 outline-none text-center text-4xl shadow-inner transition-all"
              disabled={hasProgress}
            />
            <div className="flex justify-between items-center px-2">
               <span className="text-[10px] text-zinc-600 font-bold uppercase">{getTotalSeconds()}s total</span>
               <span className="text-[10px] text-zinc-600 font-bold uppercase">{calculateTargetScenes()} cenas (8s cada)</span>
            </div>
          </section>

          <section className="space-y-3">
            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2">
              <Settings2 className="w-3 h-3" /> Render Engine & Formato
            </label>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 p-1.5 bg-zinc-900/50 rounded-2xl border border-zinc-800/50">
                <button 
                  onClick={() => setGenerationMode('fast')}
                  disabled={hasProgress}
                  className={`py-2 rounded-xl text-[9px] font-black uppercase transition-all ${generationMode === 'fast' ? 'bg-blue-600 text-white shadow-lg' : 'text-zinc-500 hover:bg-white/5'}`}
                >
                  Ultra (Fast)
                </button>
                <button 
                  onClick={() => setGenerationMode('quality')}
                  disabled={hasProgress}
                  className={`py-2 rounded-xl text-[9px] font-black uppercase transition-all ${generationMode === 'quality' ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-500 hover:bg-white/5'}`}
                >
                  Cinematic
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 p-1.5 bg-zinc-900/50 rounded-2xl border border-zinc-800/50">
                <button 
                  onClick={() => setAspectRatio('16:9')}
                  disabled={hasProgress}
                  className={`py-2 flex items-center justify-center gap-2 rounded-xl text-[9px] font-black uppercase transition-all ${aspectRatio === '16:9' ? 'bg-zinc-800 text-white shadow-md' : 'text-zinc-500 hover:bg-white/5'}`}
                >
                  <Monitor className="w-3 h-3" /> 16:9
                </button>
                <button 
                  onClick={() => setAspectRatio('9:16')}
                  disabled={hasProgress}
                  className={`py-2 flex items-center justify-center gap-2 rounded-xl text-[9px] font-black uppercase transition-all ${aspectRatio === '9:16' ? 'bg-zinc-800 text-white shadow-md' : 'text-zinc-500 hover:bg-white/5'}`}
                >
                  <Smartphone className="w-3 h-3" /> 9:16
                </button>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2">
              <ImageIcon className="w-3 h-3" /> Estética de Referência
            </label>
            <div className="relative group">
              {referenceImage ? (
                <div className="relative aspect-video rounded-3xl overflow-hidden border-2 border-blue-500/40 bg-zinc-900 shadow-2xl">
                  <img src={referenceImage} alt="Reference" className="w-full h-full object-cover" />
                  {!hasProgress && (
                    <button 
                      onClick={() => setReferenceImage(null)}
                      className="absolute top-3 right-3 p-2 bg-black/80 rounded-full text-white hover:bg-red-500 transition-all shadow-xl"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ) : (
                <label className={`flex flex-col items-center justify-center aspect-video border-2 border-dashed border-zinc-800/80 rounded-[2rem] transition-all ${hasProgress ? 'opacity-30 cursor-not-allowed' : 'hover:border-blue-500/30 hover:bg-blue-500/5 cursor-pointer'}`}>
                  <div className="p-4 bg-zinc-900 rounded-3xl mb-3 ring-1 ring-white/5">
                    <Plus className="w-7 h-7 text-blue-500" />
                  </div>
                  <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest text-center px-4">Subir Frame de Estilo</span>
                  {!hasProgress && <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />}
                </label>
              )}
            </div>
          </section>

          <button
            onClick={startOrResumeAutomation}
            disabled={step !== GenerationStep.IDLE || !script}
            className={`w-full py-5 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-2xl ${
              isInterrupted || hasFailedScenes 
                ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-500/20' 
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:scale-[1.02] active:scale-95 shadow-blue-500/20'
            } disabled:opacity-30`}
          >
            {step === GenerationStep.IDLE ? (
              <>
                {isInterrupted || hasFailedScenes ? <RefreshCw className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                {isInterrupted || hasFailedScenes ? 'Retomar Produção' : 'Criar Vídeo Flow'}
              </>
            ) : (
              <Loader2 className="w-5 h-5 animate-spin" />
            )}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-zinc-950 p-6 md:p-12 relative">
        <div className="max-w-5xl mx-auto space-y-12">
          <header className="space-y-4 border-b border-zinc-900 pb-12">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <h2 className="text-5xl md:text-7xl font-black tracking-tighter">Produção Neural</h2>
              <div className="flex gap-2">
                <span className="bg-blue-500/10 text-blue-500 text-[10px] px-4 py-1.5 rounded-full font-black border border-blue-500/20 uppercase tracking-widest">Veo 3.1 Pipeline</span>
                <span className="bg-zinc-900 text-zinc-500 text-[10px] px-4 py-1.5 rounded-full font-black border border-zinc-800 uppercase tracking-widest">Auto Resumo</span>
              </div>
            </div>
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-6 rounded-3xl flex items-center gap-4 animate-shake">
                <AlertCircle className="w-6 h-6 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-bold leading-relaxed">{error}</p>
                  <p className="text-[10px] font-black uppercase text-red-400/60 mt-2">Clique em 'Retomar' para tentar novamente os itens pendentes.</p>
                </div>
              </div>
            )}
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-blue-500" />
                <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500">Roteiro da Narração</h3>
              </div>
              <div className="bg-[#121214] rounded-[2.5rem] border border-zinc-800/50 p-8 shadow-2xl ring-1 ring-white/5">
                <textarea
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  placeholder="Escreva ou cole seu roteiro..."
                  className="w-full h-[450px] bg-transparent border-none p-0 focus:ring-0 outline-none resize-none font-medium text-lg leading-relaxed placeholder:text-zinc-800 scrollbar-hide"
                  disabled={hasProgress && step !== GenerationStep.IDLE}
                />
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <Film className="w-5 h-5 text-indigo-500" />
                <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500">Timeline de Sequência</h3>
              </div>

              <div className="space-y-6 min-h-[500px]">
                {scenes.length === 0 ? (
                  <div className="h-[450px] border-2 border-dashed border-zinc-900 rounded-[3rem] flex flex-col items-center justify-center text-center p-12 opacity-30">
                    <Clapperboard className="w-16 h-16 text-zinc-800 mb-6" />
                    <p className="text-sm font-bold max-w-[200px] uppercase tracking-tighter">Os blocos de 8s serão orquestrados aqui.</p>
                  </div>
                ) : (
                  <div className="space-y-6 pb-24">
                    {scenes.map((scene, index) => (
                      <div 
                        key={scene.id}
                        className={`bg-[#121214] border-2 rounded-[2.5rem] overflow-hidden transition-all duration-500 shadow-2xl ring-1 ring-white/5 ${
                          currentSceneIndex === index ? 'border-blue-500/50 scale-[1.02]' : 'border-zinc-800/30'
                        } ${scene.status === 'failed' ? 'border-red-900/50' : ''}`}
                      >
                        <div className="p-6 space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className={`w-10 h-10 rounded-2xl flex items-center justify-center text-[10px] font-black ring-1 ring-white/5 shadow-inner transition-colors ${
                                scene.status === 'completed' ? 'bg-green-500/20 text-green-500' : 
                                scene.status === 'failed' ? 'bg-red-500/20 text-red-500' : 'bg-zinc-900 text-zinc-500'
                              }`}>
                                {index + 1}
                              </span>
                              <div className="flex flex-col">
                                <h4 className="font-black text-xs uppercase text-zinc-300 tracking-tight">{scene.title}</h4>
                                <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest">
                                  {index === 0 ? 'Anchor Scene' : 'Extension Flow'}
                                </span>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              {scene.status === 'failed' && step === GenerationStep.IDLE && (
                                <button 
                                  onClick={() => retryScene(index)}
                                  className="p-3 bg-red-500/10 rounded-2xl text-red-500 border border-red-500/20 hover:bg-red-500/20 transition-all flex items-center gap-2"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                  <span className="text-[10px] font-black uppercase">Tentar De Novo</span>
                                </button>
                              )}
                              {scene.blobUrl && (
                                <a href={scene.blobUrl} download={`cena-${index+1}.mp4`} className="p-3 bg-zinc-900 rounded-2xl text-blue-500 border border-zinc-800 hover:bg-zinc-800 transition-all">
                                  <Download className="w-5 h-5" />
                                </a>
                              )}
                            </div>
                          </div>

                          <div className={`aspect-video bg-zinc-950 rounded-[1.5rem] overflow-hidden flex items-center justify-center relative border border-white/5 shadow-inner`}>
                            {scene.blobUrl ? (
                              <video src={scene.blobUrl} controls className="w-full h-full object-cover" />
                            ) : (
                              <div className="text-center p-8 space-y-4">
                                {scene.status === 'generating' ? (
                                  <div className="flex flex-col items-center gap-4">
                                    <div className="w-12 h-12 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin shadow-[0_0_15px_rgba(59,130,246,0.5)]" />
                                    <p className="text-[10px] font-black uppercase text-blue-500 tracking-widest animate-pulse">
                                        Processando Frame {index + 1}...
                                    </p>
                                  </div>
                                ) : scene.status === 'failed' ? (
                                  <div className="flex flex-col items-center gap-2 opacity-50">
                                    <AlertCircle className="w-10 h-10 text-red-500" />
                                    <p className="text-[9px] font-black uppercase text-red-500">Erro na Geração</p>
                                  </div>
                                ) : <Video className="w-10 h-10 text-zinc-900" />}
                              </div>
                            )}
                          </div>
                          <p className="text-[10px] text-zinc-500 font-medium italic leading-relaxed px-2 line-clamp-2">"{scene.description}"</p>
                        </div>
                      </div>
                    ))}
                    <div ref={timelineEndRef} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {step === GenerationStep.GENERATING_VIDEOS && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 w-[90%] max-w-xl bg-zinc-900/90 backdrop-blur-3xl border border-white/10 p-10 rounded-[3rem] shadow-[0_40px_100px_rgba(0,0,0,0.8)] z-50 flex items-center gap-8 animate-in slide-in-from-bottom-20 duration-500">
          <div className="w-20 h-20 bg-blue-600 rounded-[2rem] flex items-center justify-center shadow-[0_0_40px_rgba(37,99,235,0.4)] ring-1 ring-white/20">
            <Loader2 className="w-10 h-10 text-white animate-spin" />
          </div>
          <div className="flex-1 space-y-4">
            <div className="flex justify-between items-end">
              <div>
                <p className="text-[10px] font-black uppercase text-blue-500 tracking-[0.3em]">Directing Pipeline</p>
                <p className="text-3xl font-black leading-none mt-1">Cena {currentSceneIndex + 1} / {scenes.length}</p>
              </div>
              <span className="text-sm font-black text-white/50">{Math.round(((currentSceneIndex + 1) / scenes.length) * 100)}%</span>
            </div>
            <div className="h-3 w-full bg-zinc-800 rounded-full overflow-hidden p-0.5 ring-1 ring-white/5 shadow-inner">
              <div 
                className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]" 
                style={{ width: `${((currentSceneIndex + 1) / scenes.length) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
