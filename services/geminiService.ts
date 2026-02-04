
import { GoogleGenAI, Modality } from "@google/genai";
import { LogEntry, Era } from "../types";
import { CHAPTERS } from "../constants";

let performanceLogs: LogEntry[] = [];
const DB_NAME = 'EinsteinLaboratoryDB';
const STORE_NAME = 'CosmicCache';
const DB_VERSION = 1;
let dbInstance: IDBDatabase | null = null;

export const getPerformanceLogs = () => [...performanceLogs];
export const clearPerformanceLogs = () => { performanceLogs = []; };

const addLog = (entry: Omit<LogEntry, 'id' | 'timestamp'>) => {
  const timestamp = Date.now();
  const newLog: LogEntry = {
    ...entry,
    id: `${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp
  };
  performanceLogs = [newLog, ...performanceLogs].slice(0, 100);
  window.dispatchEvent(new CustomEvent('performance_log_updated', { detail: newLog }));
};

const openDB = (): Promise<IDBDatabase> => {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => {
        dbInstance = request.result;
        resolve(dbInstance);
      };
      request.onerror = () => reject(request.error);
    } catch (e) {
      reject(e);
    }
  });
};

const getAI = () => {
  if (!process.env.API_KEY) throw new Error("Missing Laboratory Key (Gemini API Key).");
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

async function generateCacheKey(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
}

async function isValidImage(blob: Blob): Promise<boolean> {
  if (blob.size < 10) return false;
  const buffer = await blob.slice(0, 4).arrayBuffer();
  const header = new Uint8Array(buffer);
  // JPEG: FF D8 FF
  if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) return true;
  // PNG: 89 50 4E 47
  if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) return true;
  return false;
}

async function getFromStaticServer(type: 'text' | 'images', eraKey: string): Promise<string | null> {
  const start = performance.now();
  
  // Requirement: text directory MUST be named 'text'
  const primaryDir = type === 'text' ? 'text' : 'images';
  const prefix = type === 'text' ? 'einstein-discussion-' : 'einstein-diagram-';
  const extension = type === 'text' ? 'txt' : 'jpg';
  
  // Normalize key variants
  const eraNoSpace = eraKey.replace(/\s+/g, '');
  const chapter = CHAPTERS.find(c => c.id === eraKey);
  const titleNoSpace = chapter ? chapter.title.replace(/\s+/g, '') : null;

  // Build list of possible filenames
  const filenames = new Set<string>();
  // 1. Era name variants (as requested)
  filenames.add(`${prefix}${eraNoSpace}.${extension}`);
  filenames.add(`${prefix}${eraNoSpace.toLowerCase()}.${extension}`);
  // 2. Title variants (fallback)
  if (titleNoSpace) {
    filenames.add(`${prefix}${titleNoSpace}.${extension}`);
    filenames.add(`${prefix}${titleNoSpace.toLowerCase()}.${extension}`);
  }

  // Build exhaustive trial paths
  const trialPaths: string[] = [];
  const dirs = [primaryDir, primaryDir.charAt(0).toUpperCase() + primaryDir.slice(1)]; // 'text' and 'Text'
  
  filenames.forEach(name => {
    dirs.forEach(d => {
      trialPaths.push(`${d}/${name}`);    // Relative
      trialPaths.push(`/${d}/${name}`);   // Absolute
      trialPaths.push(`./${d}/${name}`);  // Explicit Relative
    });
  });

  const triedUrls: string[] = [];
  const base = window.location.href;

  for (const path of trialPaths) {
    let absoluteUrl = "";
    try {
      absoluteUrl = new URL(path, base).href;
      if (triedUrls.includes(absoluteUrl)) continue;
      triedUrls.push(absoluteUrl);

      const response = await fetch(absoluteUrl, { method: 'GET', cache: 'no-cache' });
      if (!response.ok) continue;

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      
      if (type === 'text') {
        // Robust check to skip HTML 404 pages
        if (contentType.includes('text/html')) continue;
        
        const text = await response.text();
        const trimmed = text.trim();
        
        // Ensure content is actually text archive and not an error page or empty file
        if (trimmed.length > 10 && !trimmed.startsWith('<!') && !trimmed.toLowerCase().startsWith('<html')) {
          addLog({ 
            type: 'CACHE_DB', 
            label: 'SERVER HIT', 
            duration: performance.now() - start, 
            status: 'CACHE_HIT', 
            message: `SUCCESS: Found static archive at ${absoluteUrl}`, 
            source: 'geminiService.ts:114' 
          });
          return text;
        }
      } else {
        const blob = await response.blob();
        if (await isValidImage(blob)) {
          addLog({ 
            type: 'CACHE_DB', 
            label: 'SERVER HIT', 
            duration: performance.now() - start, 
            status: 'CACHE_HIT', 
            message: `SUCCESS: Found static diagram at ${absoluteUrl}`, 
            source: 'geminiService.ts:125' 
          });
          return URL.createObjectURL(blob);
        }
      }
    } catch (e) {
      // Continue to next trial
    }
  }

  // Log detailed failure trail for diagnostics
  addLog({
    type: 'SYSTEM',
    label: 'SERVER MISS',
    duration: performance.now() - start,
    status: 'ERROR',
    message: `Resource not found for ${eraKey} in /${primaryDir}. Check server directory structure. Tried: ${triedUrls.slice(0, 3).join(' , ')}`,
    source: 'geminiService.ts:143'
  });
  
  return null;
}

async function getFromCache(category: string, key: string): Promise<any> {
  const storageKey = `discovery_v12_${category}_${key}`;
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(storageKey);
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

async function saveToCache(category: string, key: string, data: string): Promise<void> {
  if (!data || data.length < 5) return;
  const storageKey = `discovery_v12_${category}_${key}`;
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put(data, storageKey);
  } catch (e) {}
}

export async function generateEinsteinResponse(prompt: string, history: any[], eraKey?: string): Promise<string> {
  const start = performance.now();
  
  let activeEraKey = eraKey;
  if (!activeEraKey) {
    const matchedChapter = CHAPTERS.find(c => c.prompt === prompt);
    if (matchedChapter) activeEraKey = matchedChapter.id;
  }

  // 1. Static Archive Check
  if (activeEraKey) {
    const staticResult = await getFromStaticServer('text', activeEraKey);
    if (staticResult) return staticResult;
  }

  // 2. Local Cache Check
  const cacheKey = await generateCacheKey(prompt + JSON.stringify(history));
  const cached = await getFromCache('text', cacheKey);
  if (cached) {
    addLog({
      type: 'CACHE_DB',
      label: 'LOCAL HIT',
      duration: performance.now() - start,
      status: 'CACHE_HIT',
      message: 'Retrieved from laboratory records.',
      source: 'geminiService.ts:203'
    });
    return cached;
  }

  // 3. Live AI Consultation
  try {
    const ai = getAI();
    const chat = ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        systemInstruction: "You are Professor Albert Einstein. Address the user as 'My dear friend'. Introduce the experience if it is the start. Explain pivotal eras of math. Keep it whimsical, humble, and academic. Use metaphors. Always use LaTeX for mathematical equations. IMPORTANT: You speak with a distinct German accent. Whenever the user asks for more detail, deeper math, or a follow-up question, you MUST provide a [IMAGE: description] tag at the very end of your response to illustrate the mathematical concept on your chalkboard.",
      },
      history: history
    });

    const response = await chat.sendMessage({ message: prompt });
    const text = response.text || "Ach, ze universe remains a mystery.";
    await saveToCache('text', cacheKey, text);
    
    addLog({
      type: 'AI_TEXT',
      label: 'GEMINI TEXT',
      duration: performance.now() - start,
      status: 'SUCCESS',
      message: 'Consulted ze relative wisdom of ze stars.',
      source: 'geminiService.ts:230'
    });
    return text;
  } catch (error: any) {
    addLog({
      type: 'ERROR',
      label: 'GEMINI ERROR',
      duration: performance.now() - start,
      status: 'ERROR',
      message: error.message || "Failed to communicate with ze stars.",
      source: 'geminiService.ts:240'
    });
    throw error;
  }
}

export async function generateChalkboardImage(description: string, eraKey?: string): Promise<string | null> {
  const start = performance.now();
  
  if (eraKey) {
    const staticImg = await getFromStaticServer('images', eraKey);
    if (staticImg) return staticImg;
  }

  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: `A chalkboard sketch with white chalk on a dark dusty blackboard. Illustrate: ${description}` }]
      },
      config: {
        imageConfig: { aspectRatio: "16:9" }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        const url = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        addLog({
          type: 'AI_IMAGE',
          label: 'GEMINI IMAGE',
          duration: performance.now() - start,
          status: 'SUCCESS',
          message: 'Drawn upon ze chalkboard of time.',
          source: 'geminiService.ts:277'
        });
        return url;
      }
    }
  } catch (error: any) {
    addLog({
      type: 'ERROR',
      label: 'IMAGE ERROR',
      duration: performance.now() - start,
      status: 'ERROR',
      message: error.message || "Failed to draw diagram.",
      source: 'geminiService.ts:288'
    });
  }
  return null;
}

export async function generateEinsteinSpeech(text: string): Promise<string | null> {
  const start = performance.now();
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64) {
      addLog({
        type: 'AI_AUDIO',
        label: 'GEMINI AUDIO',
        duration: performance.now() - start,
        status: 'SUCCESS',
        message: 'Ze voice of logic synthesized.',
        source: 'geminiService.ts:321'
      });
      return base64;
    }
  } catch (error: any) {
    addLog({
      type: 'ERROR',
      label: 'AUDIO ERROR',
      duration: performance.now() - start,
      status: 'ERROR',
      message: error.message || "Failed to synthesize voice.",
      source: 'geminiService.ts:332'
    });
  }
  return null;
}

export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}
