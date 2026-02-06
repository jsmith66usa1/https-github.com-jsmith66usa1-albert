
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Era, Message, LogEntry } from './types';
import { CHAPTERS } from './constants';
import { 
  generateEinsteinResponse, 
  generateChalkboardImage, 
  generateEinsteinSpeech,
  generateMathNews,
  decode,
  decodeAudioData,
  getPerformanceLogs,
  clearPerformanceLogs,
  getStaticEraContent
} from './services/geminiService';

const EinsteinApp: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentEra, setCurrentEra] = useState<Era>(Era.Introduction);
  const [isLoading, setIsLoading] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isSpeechLoading, setIsSpeechLoading] = useState(false);
  const [lastImage, setLastImage] = useState<string | null>(null);
  const [isEraDropdownOpen, setIsEraDropdownOpen] = useState(false);
  const [isArchiveDropdownOpen, setIsArchiveDropdownOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [currentlySpeakingId, setCurrentlySpeakingId] = useState<number | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSources = useRef<AudioBufferSourceNode[]>([]);
  const speechSessionId = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const isProcessing = isLoading || isImageLoading;

  const archiveTopics = useMemo(() => [
    { label: "Modern App", prompt: "Professor, how does vis specific concept apply to today's modern technology und society?" },
    { label: "Rival", prompt: "Who vere your greatest scientific rivals during vis period, und vat vere your disagreements?" },
    { label: "Visual Detail", prompt: "Ach, ze diagram is good, but show me more! Draw a much more detailed chalkboard diagram for vis era." }
  ], []);

  useEffect(() => {
    const updateLogs = () => setLogs(() => getPerformanceLogs());
    window.addEventListener('performance_log_updated', updateLogs);
    return () => window.removeEventListener('performance_log_updated', updateLogs);
  }, []);

  useEffect(() => {
    if (messages.length > 0 && !isLoading && scrollContainerRef.current) {
      const lastMsg = scrollContainerRef.current.querySelector('.msg-container:last-child');
      if (lastMsg) lastMsg.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if ((window as any).MathJax?.typesetPromise) (window as any).MathJax.typesetPromise();
  }, [messages, isLoading]);

  const stopAudio = useCallback(() => {
    speechSessionId.current++;
    activeSources.current.forEach(s => { try { s.stop(); } catch (e) {} });
    activeSources.current = [];
    setIsAudioPlaying(false);
    setIsSpeechLoading(false);
    setCurrentlySpeakingId(null);
  }, []);

  const playSpeech = async (text: string, msgId: number) => {
    if (currentlySpeakingId === msgId && (isAudioPlaying || isSpeechLoading)) {
      stopAudio();
      return;
    }
    stopAudio();
    const currentSession = speechSessionId.current;
    setCurrentlySpeakingId(msgId);
    const paragraphs = text.replace(/\[IMAGE:.*?\]/g, '').split(/\n\n+/).filter(p => p.trim().length > 0);
    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
      for (const p of paragraphs) {
        if (currentSession !== speechSessionId.current) break;
        setIsSpeechLoading(true);
        const base64 = await generateEinsteinSpeech(p);
        if (currentSession !== speechSessionId.current || !base64) break;
        const buffer = await decodeAudioData(decode(base64), audioContextRef.current, 24000, 1);
        setIsSpeechLoading(false);
        setIsAudioPlaying(true);
        await new Promise<void>((resolve) => {
          const source = audioContextRef.current!.createBufferSource();
          source.buffer = buffer;
          source.connect(audioContextRef.current!.destination);
          source.onended = () => resolve();
          source.start();
          activeSources.current.push(source);
        });
      }
      if (currentSession === speechSessionId.current) stopAudio();
    } catch (e) { stopAudio(); }
  };

  const handleAction = async (promptText: string, eraToSet?: Era, isNewEra: boolean = false) => {
    if (isProcessing && eraToSet !== Era.Foundations) return;
    
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    setIsLoading(true);
    setIsEraDropdownOpen(false);
    setIsArchiveDropdownOpen(false);
    stopAudio();

    // Check for static content first if this is a new era switch
    let responseText = "";
    let staticImageUrl: string | null = null;

    if (isNewEra && eraToSet) {
      const staticContent = await getStaticEraContent(eraToSet);
      if (staticContent.text) {
        responseText = staticContent.text;
        staticImageUrl = staticContent.imageUrl;
      }
    }

    if (isNewEra) { 
      setMessages([]); 
      setLastImage(null); 
    } else { 
      setMessages(prev => [...prev, { role: 'user', text: promptText, timestamp: Date.now() }]); 
    }

    try {
      if (!responseText) {
        const history = isNewEra ? [] : [...messages].map(m => ({ role: m.role === 'einstein' ? 'model' : 'user', parts: [{ text: m.text }] }));
        responseText = await generateEinsteinResponse(promptText, history, isNewEra ? eraToSet : undefined);
      }

      if (signal.aborted) return;
      
      setMessages(prev => [...prev, { role: 'einstein', text: responseText, timestamp: Date.now() }]);
      if (eraToSet) setCurrentEra(eraToSet);
      setIsLoading(false);
      setIsImageLoading(true);

      if (staticImageUrl) {
        setLastImage(staticImageUrl);
        setIsImageLoading(false);
      } else {
        const description = responseText.match(/\[IMAGE: (.*?)\]/)?.[1] || `Diagram for ${promptText}`;
        const imageUrl = await generateChalkboardImage(description, eraToSet);
        if (!signal.aborted && imageUrl) setLastImage(imageUrl);
        setIsImageLoading(false);
      }
    } catch (err) { 
      setIsLoading(false); 
      setIsImageLoading(false); 
    }
  };

  const handleMathNews = async () => {
    if (isProcessing) return;
    setIsLoading(true);
    setIsEraDropdownOpen(false);
    setIsArchiveDropdownOpen(false);
    stopAudio();
    setMessages(prev => [...prev, { role: 'user', text: "Professor, what is ze latest news in ze vorld of mathematics?", timestamp: Date.now() }]);
    try {
      const { text, sources } = await generateMathNews();
      let finalText = text;
      if (sources.length > 0) {
        finalText += "\n\n**Sources from ze World Brain:**\n" + sources.map(s => `* [${s.title}](${s.uri})`).join('\n');
      }
      setMessages(prev => [...prev, { role: 'einstein', text: finalText, timestamp: Date.now() }]);
    } catch (e) {} finally { setIsLoading(false); }
  };

  const startEra = (era: Era) => {
    const chapter = CHAPTERS.find(c => c.id === era);
    if (chapter) handleAction(chapter.prompt, era, true);
  };

  const saveText = () => {
    if (messages.length === 0) return;
    const transcript = messages.map(m => `[${m.role.toUpperCase()}] ${m.text}`).join('\n\n');
    const blob = new Blob([transcript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `einstein-transcript-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveImage = () => {
    if (!lastImage) return;
    const a = document.createElement('a');
    a.href = lastImage;
    a.download = `einstein-chalkboard-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="flex flex-col h-full bg-[#0c0c0e] text-white overflow-hidden relative">
      {!hasStarted && (
        <div className="welcome-screen">
          <div className="w-48 h-48 rounded-full overflow-hidden border-2 border-white/20 shadow-2xl mb-8">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Albert_Einstein_Head.jpg/480px-Albert_Einstein_Head.jpg" alt="Einstein" className="w-full h-full object-cover" />
          </div>
          <button className="btn-prominent font-black px-12 py-5 rounded-full uppercase tracking-widest text-lg mb-8" onClick={() => { setHasStarted(true); startEra(Era.Introduction); }}>Enter Laboratory</button>
          <h1 className="serif text-3xl md:text-5xl font-black">Einstein's Universe</h1>
        </div>
      )}

      {isLogsOpen && (
        <div className="logs-overlay">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-black uppercase">Laboratory Registry</h2>
            <div className="flex gap-2">
              <button onClick={() => { clearPerformanceLogs(); setLogs([]); }} className="text-xs py-1">Flush</button>
              <button onClick={() => setIsLogsOpen(false)} className="bg-red-600 text-xs py-1">Close</button>
            </div>
          </div>
          <div className="logs-content no-scrollbar">
            {logs.map((log) => (
              <div key={log.id} className="log-item">
                <span className={`log-tag ${log.status === 'ERROR' ? 'tag-error' : 'tag-system'}`}>{log.label}</span>
                <div className="flex-1">
                  <div className="font-bold text-indigo-400">{log.message}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <header className="header">
        <div className="header-brand">
          <div className="w-7 h-7 rounded-lg bg-[#6366f1] flex items-center justify-center font-black text-[10px]">AE</div>
          <span className="serif font-black text-base">Einstein</span>
        </div>
        <div className="header-controls">
          <button onClick={() => setIsLogsOpen(true)} disabled={isProcessing} className="text-[10px] uppercase min-w-[50px]">Logs</button>
          
          <button onClick={saveText} disabled={messages.length === 0} className="text-[10px] uppercase min-w-[70px]">Save Text</button>
          <button onClick={saveImage} disabled={!lastImage} className="text-[10px] uppercase min-w-[70px]">Save Img</button>

          <button 
            onClick={() => { const last = [...messages].reverse().find(m => m.role === 'einstein'); if(last) playSpeech(last.text, messages.indexOf(last)); }} 
            disabled={isProcessing || messages.length === 0} 
            className={`min-w-[60px] text-[10px] uppercase font-black ${(isAudioPlaying || isSpeechLoading) ? 'bg-red-500' : 'bg-[#6366f1]'}`}
          >
            {isSpeechLoading ? '...' : isAudioPlaying ? 'Stop' : 'Listen'}
          </button>
          
          <div className="relative">
            <button onClick={() => { setIsArchiveDropdownOpen(!isArchiveDropdownOpen); setIsEraDropdownOpen(false); }} className="text-[10px] bg-white/10 border-white/20 uppercase min-w-[80px] text-left">
              <span>Archive</span> ▾
            </button>
            {isArchiveDropdownOpen && (
              <div className="absolute z-[110] top-full right-0 mt-2 bg-zinc-950 border border-white/10 rounded-xl w-64 overflow-hidden shadow-2xl animate-fadeIn">
                {archiveTopics.map((topic, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => handleAction(topic.prompt)} 
                    className="p-4 cursor-pointer text-xs font-bold hover:bg-[#6366f1]/10 hover:text-[#818cf8] transition-colors border-b border-white/5 last:border-0"
                  >
                    {topic.label}
                  </div>
                ))}
                <div 
                  onClick={handleMathNews} 
                  className="p-4 cursor-pointer text-xs font-black bg-indigo-500/5 text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                >
                  Latest Math News
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button onClick={() => { setIsEraDropdownOpen(!isEraDropdownOpen); setIsArchiveDropdownOpen(false); }} className="text-[10px] bg-white/5 uppercase min-w-[70px] text-left">
              <span className="chapter-btn-label">Eras</span> ▾
            </button>
            {isEraDropdownOpen && (
              <div className="absolute z-[110] top-full right-0 mt-2 bg-zinc-900 border border-white/10 rounded-xl w-60 overflow-hidden shadow-2xl">
                {CHAPTERS.map(ch => {
                  const isBlocked = isProcessing && ch.id !== Era.Foundations;
                  return (
                    <div key={ch.id} onClick={() => !isBlocked && startEra(ch.id)} className={`p-3 cursor-pointer text-xs font-bold ${currentEra === ch.id ? 'bg-[#6366f1]' : 'hover:bg-white/5'} ${isBlocked ? 'opacity-30' : ''}`}>{ch.id}</div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="main-content">
        <section className="chat-sidebar">
          <div className="chat-scroll-container no-scrollbar" ref={scrollContainerRef}>
            {messages.map((msg, idx) => (
              <div key={idx} className={`msg-container ${msg.role === 'einstein' ? 'bg-einstein' : 'bg-user'}`}>
                <div className="flex flex-col gap-4">
                  {msg.text.split('\n').map((p, i) => <p key={i} className="mb-2">{p.replace(/\[IMAGE:.*?\]/g, '')}</p>)}
                </div>
                {msg.role === 'einstein' && (
                  <div className="flex items-center gap-4 mt-4">
                    <div onClick={() => playSpeech(msg.text, idx)} className="text-[9px] font-black uppercase opacity-50 cursor-pointer hover:opacity-100 transition-opacity">▶ Narrate</div>
                  </div>
                )}
              </div>
            ))}
            {isLoading && <div className="opacity-40 text-xs italic animate-pulse">Consulting ze stars...</div>}
          </div>
        </section>
        <section className="chalkboard-area">
          <div className="chalkboard-visual-container">
            {isImageLoading && <div className="loader-overlay"><div className="animate-bounce text-2xl">✍️</div></div>}
            {lastImage ? <img src={lastImage} className="chalkboard-filter" /> : <div className="opacity-10 text-5xl">📓</div>}
          </div>
        </section>
      </div>

      <footer className="footer">
        <div className="max-w-4xl mx-auto w-full">
          <div className="scroll-row no-scrollbar items-center justify-between gap-4">
            {/* NEXT ERA IS NOW FIRST */}
            <button 
              onClick={() => { 
                const idx = CHAPTERS.findIndex(c => c.id === currentEra); 
                if (idx < CHAPTERS.length - 1) startEra(CHAPTERS[idx+1].id); 
              }} 
              disabled={isProcessing || currentEra === Era.Unified} 
              className="text-[10px] bg-emerald-600/20 border-emerald-600/40 text-emerald-400 rounded-full px-6 py-2 font-black shadow-lg shadow-emerald-900/10"
            >
              Next Era →
            </button>

            <button onClick={() => handleAction(`Professor, show me the deeper mathematics.`)} disabled={isProcessing} className="text-[10px] bg-white/5 rounded-full px-6 py-2 border border-white/10">Deeper Math</button>
            
            <div className="hidden md:flex flex-col gap-1 items-stretch min-w-[140px]"></div>
          </div>
          
          <form onSubmit={(e) => { e.preventDefault(); if(userInput.trim()) { const t = userInput; setUserInput(''); handleAction(t); }}} className="input-row mt-4">
            <input type="text" value={userInput} onChange={(e) => setUserInput(e.target.value)} disabled={isProcessing} placeholder="Ask ze Professor a relative question..." />
            <button type="submit" disabled={isProcessing || !userInput.trim()} className="bg-[#6366f1] px-8 py-3 rounded-xl text-[10px] font-black hover:bg-[#4f46e5]">Send</button>
          </form>
        </div>
      </footer>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s cubic-bezier(0.19, 1, 0.22, 1);
        }
      `}</style>
    </div>
  );
};

export default function App() { return <EinsteinApp />; }
