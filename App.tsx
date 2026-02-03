
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Era, Message, LogEntry } from './types';
import { CHAPTERS } from './constants';
import { 
  generateEinsteinResponse, 
  generateChalkboardImage, 
  generateEinsteinSpeech,
  decode,
  decodeAudioData,
  getPerformanceLogs,
  clearPerformanceLogs
} from './services/geminiService';

interface ErrorBoundaryProps { children?: React.ReactNode; }
interface ErrorBoundaryState { hasError: boolean; }

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };
  props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(_error: any): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#000', color: '#fff', textAlign: 'center', padding: '2rem' }}>
          <h1 style={{ fontFamily: 'Playfair Display, serif' }}>Ach, ze universe has collapsed!</h1>
          <button onClick={() => window.location.reload()} style={{ marginTop: '1rem', background: '#6366f1', color: '#fff', padding: '1rem 2rem', borderRadius: '1rem', border: 'none', fontWeight: 900, cursor: 'pointer' }}>Re-initialize Laboratory</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const EinsteinApp: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentEra, setCurrentEra] = useState<Era>(Era.Introduction);
  const [isLoading, setIsLoading] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isSpeechLoading, setIsSpeechLoading] = useState(false);
  const [lastImage, setLastImage] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isFaqOpen, setIsFaqOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [currentlySpeakingId, setCurrentlySpeakingId] = useState<number | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSources = useRef<AudioBufferSourceNode[]>([]);
  const speechSessionId = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const faqItems = useMemo(() => [
    { label: "Modern Apps", prompt: "How does this apply to today?" },
    { label: "Great Rivals", prompt: "Who were your rivals?" },
    { label: "Visual Detail", prompt: "Draw a more detailed diagram." }
  ], []);

  useEffect(() => {
    const updateLogs = () => setLogs(() => getPerformanceLogs());
    window.addEventListener('performance_log_updated', updateLogs);
    updateLogs();
    return () => window.removeEventListener('performance_log_updated', updateLogs);
  }, []);

  useEffect(() => {
    if (messages.length > 0 && !isLoading && scrollContainerRef.current) {
      const lastMsg = scrollContainerRef.current.querySelector('.msg-container:last-child');
      if (lastMsg) {
        lastMsg.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    if ((window as any).MathJax?.typesetPromise) (window as any).MathJax.typesetPromise().catch(() => {});
  }, [messages, isLoading]);

  const stopAudio = useCallback(() => {
    speechSessionId.current++;
    activeSources.current.forEach(s => { try { s.stop(); } catch (e) {} });
    activeSources.current = [];
    setIsAudioPlaying(false);
    setIsSpeechLoading(false);
    setCurrentlySpeakingId(null);
  }, []);

  const downloadConversation = () => {
    if (messages.length === 0) return;
    const content = messages.map(m => `${m.role.toUpperCase()}: ${m.text.replace(/\[IMAGE:.*?\]/g, '')}`).join('\n\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `einstein-discussion-${currentEra}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadChalkboard = () => {
    if (!lastImage) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const jpegUrl = canvas.toDataURL('image/jpeg', 0.9);
        const a = document.createElement('a');
        a.href = jpegUrl;
        a.download = `einstein-diagram-${currentEra}.jpg`;
        a.click();
      }
    };
    img.src = lastImage;
  };

  const emailLogs = () => {
    if (logs.length === 0) return;
    const logText = logs.map(log => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      return `[${time}] ${log.label} | Status: ${log.status} | Duration: ${log.duration.toFixed(2)}ms\nMessage: ${log.message}\n${log.source ? `Source: ${log.source}` : ''}\n-------------------`;
    }).join('\n\n');

    const subject = encodeURIComponent(`Einstein's Universe - Laboratory Registry Logs (${new Date().toLocaleString()})`);
    const body = encodeURIComponent(`System Diagnostics and Performance Logs:\n\n${logText}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const playSpeech = async (text: string, msgId: number) => {
    if (isLoading || isImageLoading) return; 
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
        if (currentSession !== speechSessionId.current) break;

        setIsSpeechLoading(false);
        setIsAudioPlaying(true);
        
        await new Promise<void>((resolve) => {
          if (currentSession !== speechSessionId.current) return resolve();
          const source = audioContextRef.current!.createBufferSource();
          source.buffer = buffer;
          source.connect(audioContextRef.current!.destination);
          source.onended = () => {
            activeSources.current = activeSources.current.filter(s => s !== source);
            resolve();
          };
          source.start();
          activeSources.current.push(source);
          const checker = setInterval(() => {
            if (currentSession !== speechSessionId.current) {
              clearInterval(checker);
              try { source.stop(); } catch(e) {}
              resolve();
            }
          }, 50);
        });
      }
      if (currentSession === speechSessionId.current) stopAudio();
    } catch (e) {
      console.error("Narration fault:", e);
      if (currentSession === speechSessionId.current) stopAudio();
    }
  };

  const handleAction = async (promptText: string, eraToSet?: Era, isNewEra: boolean = false) => {
    if (isLoading || isImageLoading) return; 
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    setIsLoading(true);
    setIsFaqOpen(false);
    setIsDropdownOpen(false);
    stopAudio();

    if (isNewEra) { 
      setMessages([]); 
      setLastImage(null); 
    } else { 
      setMessages(prev => [...prev, { role: 'user', text: promptText, timestamp: Date.now() }]); 
    }

    const history = isNewEra ? [] : [...messages].map(m => ({
      role: m.role === 'einstein' ? 'model' : 'user',
      parts: [{ text: m.text }]
    }));

    // Start Era-specific parallel loading if switch occurs
    let parallelImagePromise: Promise<string | null> | null = null;
    if (eraToSet) {
      const chapter = CHAPTERS.find(c => c.id === eraToSet);
      const match = chapter?.prompt.match(/\[IMAGE: (.*?)\]/);
      if (match) {
        setIsImageLoading(true);
        parallelImagePromise = generateChalkboardImage(match[1], eraToSet);
      }
    }

    try {
      const textPromise = generateEinsteinResponse(promptText, history, isNewEra ? eraToSet : undefined);
      const responseText = await textPromise;
      if (signal.aborted) return;
      
      const safeResponse = responseText || "Ach, ze universe remains a mystery.";
      const imageMatch = safeResponse.match(/\[IMAGE: (.*?)\]/);
      
      setMessages(prev => [...prev, { role: 'einstein', text: safeResponse, timestamp: Date.now() }]);
      if (eraToSet) setCurrentEra(eraToSet);

      if (parallelImagePromise) {
        const imageUrl = await parallelImagePromise;
        if (!signal.aborted && imageUrl) setLastImage(imageUrl);
        setIsImageLoading(false);
      } else {
        // This is a follow-up query (typed, deeper math, or archive)
        setIsImageLoading(true);
        try {
          // Use AI's suggested tag if present, otherwise fall back to a contextual sketch based on user prompt.
          const description = imageMatch ? imageMatch[1] : `A chalkboard calculation und sketch about: ${promptText.substring(0, 60)}`;
          const imageUrl = await generateChalkboardImage(description);
          if (!signal.aborted && imageUrl) setLastImage(imageUrl);
        } catch (e) {} finally {
          if (!signal.aborted) setIsImageLoading(false);
        }
      }
    } catch (err) { 
      console.error(err); 
    } finally { 
      if (!signal.aborted) setIsLoading(false); 
    }
  };

  const startEra = (era: Era) => {
    const chapter = CHAPTERS.find(c => c.id === era);
    if (chapter) handleAction(chapter.prompt, era, true);
  };

  return (
    <div className="flex flex-col h-full bg-[#0c0c0e] text-white overflow-hidden">
      {!hasStarted && (
        <div className="welcome-screen">
          <div className="w-28 h-28 xs:w-36 xs:h-36 md:w-48 md:h-48 rounded-full overflow-hidden border-2 border-white/20 shadow-2xl mb-4 flex-shrink-0">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Albert_Einstein_Head.jpg/480px-Albert_Einstein_Head.jpg" alt="Einstein" className="w-full h-full object-cover" />
          </div>
          <h1 className="serif text-2xl md:text-5xl font-black mb-1 md:mb-2">Einstein's Universe</h1>
          <p className="serif text-sm md:text-lg opacity-60 italic mb-6 md:mb-8">Collective logic of ze stars.</p>
          <button className="font-black border-2 border-white px-8 py-3 md:px-10 md:py-4 rounded-full hover:bg-white hover:text-black transition-all uppercase text-xs md:text-base flex-shrink-0" onClick={() => { setHasStarted(true); startEra(Era.Introduction); }}>Enter Laboratory</button>
        </div>
      )}

      {isLogsOpen && (
        <div className="logs-overlay">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-black uppercase">Laboratory Registry</h2>
            <div className="flex gap-2">
              <button onClick={emailLogs} disabled={logs.length === 0} className="text-xs py-1 border-white/20 hover:border-white/60">Email</button>
              <button onClick={() => { clearPerformanceLogs(); setLogs([]); }} className="text-xs py-1">Flush</button>
              <button onClick={() => setIsLogsOpen(false)} className="bg-red-600 text-xs py-1">Close</button>
            </div>
          </div>
          <div className="logs-content no-scrollbar">
            {logs.length === 0 ? <p className="opacity-50 italic">Waiting for cosmic data...</p> : 
              logs.map((log) => (
                <div key={log.id} className="log-item">
                  <span className={`log-tag ${log.status === 'CACHE_HIT' ? 'tag-cache' : log.status === 'ERROR' ? 'tag-error' : 'tag-system'}`}>{log.label}</span>
                  <div className="flex-1">
                    <div className="flex justify-between font-bold text-indigo-400">
                      <span>{log.message}</span>
                      <span className="opacity-30 text-[10px]">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      {log.source && <span className="text-[9px] opacity-60 font-mono text-emerald-400">Source: {log.source}</span>}
                      {log.duration > 0 && <div className="text-[10px] opacity-40">Registry Latency: {log.duration.toFixed(0)}ms</div>}
                    </div>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}

      <header className="header">
        <div className="header-brand">
          <div className="w-7 h-7 rounded-lg bg-[#6366f1] flex items-center justify-center font-black text-[10px]">AE</div>
          <span className="serif font-black text-base">Einstein</span>
        </div>
        <div className="header-controls">
          <button onClick={() => setIsLogsOpen(true)} className="text-[10px] uppercase min-w-[60px]">Logs</button>
          <button 
            onClick={() => { const last = [...messages].reverse().find(m => m.role === 'einstein'); if(last) playSpeech(last.text, messages.indexOf(last)); }} 
            disabled={isLoading || messages.length === 0} 
            className={`min-w-[70px] text-[10px] uppercase font-black ${(isAudioPlaying || isSpeechLoading) ? 'bg-red-500' : 'bg-[#6366f1]'}`}
          >
            {isSpeechLoading ? 'Thinking...' : isAudioPlaying ? 'Stop' : 'Listen'}
          </button>
          
          <button onClick={downloadConversation} disabled={messages.length === 0} className="text-[10px] uppercase min-w-[70px] opacity-80 hover:opacity-100">Save Text</button>
          <button onClick={downloadChalkboard} disabled={!lastImage} className="text-[10px] uppercase min-w-[80px] opacity-80 hover:opacity-100">Save Image</button>

          <div className="relative">
            <button onClick={() => !isLoading && setIsDropdownOpen(!isDropdownOpen)} disabled={isLoading} className="text-[10px] bg-white/5 uppercase min-w-[120px] text-left">
              <span className="chapter-btn-label">{currentEra}</span> ▾
            </button>
            {isDropdownOpen && (
              <div className="absolute z-[110] top-full right-0 mt-2 bg-zinc-900 border border-white/10 rounded-xl w-60 overflow-hidden shadow-2xl">
                {CHAPTERS.map(ch => <div key={ch.id} onClick={() => startEra(ch.id)} className={`p-3 cursor-pointer text-xs font-bold ${currentEra === ch.id ? 'bg-[#6366f1]' : 'hover:bg-white/5'}`}>{ch.id}</div>)}
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
                <div className="flex flex-col gap-8">
                  {msg.text.replace(/\[IMAGE:.*?\]/g, '').split(/\n\s*\n/).filter(p => p.trim()).map((paragraph, pIdx) => (
                    <p key={pIdx} className="leading-relaxed">{paragraph.trim()}</p>
                  ))}
                </div>
                {msg.role === 'einstein' && (
                  <div onClick={() => !isLoading && playSpeech(msg.text, idx)} className={`text-[9px] mt-8 font-black uppercase tracking-widest cursor-pointer hover:opacity-100 flex items-center gap-1 ${currentlySpeakingId === idx ? 'text-red-400' : 'opacity-50'}`}>
                    {currentlySpeakingId === idx ? '● Narrating...' : '▶ Read Thoughts'}
                  </div>
                )}
              </div>
            ))}
            {isLoading && <div className="opacity-40 text-xs italic animate-pulse">Pondering ze universe...</div>}
          </div>
        </section>
        <section className="chalkboard-area">
          <div className="chalkboard-visual-container">
            {isImageLoading && <div className="loader-overlay"><div className="text-3xl mb-2 animate-bounce">✍️</div><div className="opacity-40 font-black text-[10px] uppercase">Sketching...</div></div>}
            {lastImage ? <img src={lastImage} className="chalkboard-filter" alt="Diagram" /> : !isImageLoading && <div className="opacity-10 text-5xl">📓</div>}
          </div>
        </section>
      </div>

      <footer className="footer">
        <div className="max-w-3xl mx-auto w-full">
          <div className="scroll-row no-scrollbar">
            <button onClick={() => handleAction(`Professor, show me the deeper mathematics und provide a specific sketch for vis concept.`)} disabled={isLoading} className="text-[10px] bg-white/5 rounded-full px-5 py-2">Deeper Math</button>
            <div className="relative">
              <button onClick={() => !isLoading && setIsFaqOpen(!isFaqOpen)} disabled={isLoading} className="text-[10px] bg-white/5 rounded-full px-5 py-2">Archive ▾</button>
              {isFaqOpen && (
                <div className="absolute z-[120] bottom-full left-0 mb-3 bg-zinc-900 border border-white/10 rounded-xl w-60 p-1 shadow-2xl">
                  {faqItems.map((item, i) => <div key={i} onClick={() => handleAction(item.prompt)} className="p-3 cursor-pointer rounded-lg text-xs font-bold hover:bg-[#6366f1]">{item.label}</div>)}
                </div>
              )}
            </div>
            <button onClick={() => { const idx = CHAPTERS.findIndex(c => c.id === currentEra); if (idx < CHAPTERS.length - 1) startEra(CHAPTERS[idx+1].id); }} disabled={currentEra === Era.Unified || isLoading} className="text-[10px] bg-white/5 rounded-full px-5 py-2">Next Era</button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if(userInput.trim() && !isLoading) { const t = userInput; setUserInput(''); handleAction(t); }}} className="input-row mt-3">
            <input type="text" value={userInput} onChange={(e) => setUserInput(e.target.value)} disabled={isLoading} placeholder="Ask ze Professor..." />
            <button type="submit" disabled={isLoading || !userInput.trim()} className="bg-[#6366f1] px-6 py-3 rounded-xl text-[10px] font-black uppercase">Send</button>
          </form>
        </div>
      </footer>
    </div>
  );
};

export default function App() { return <ErrorBoundary><EinsteinApp /></ErrorBoundary>; }
