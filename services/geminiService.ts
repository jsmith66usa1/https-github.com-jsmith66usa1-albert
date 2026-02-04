
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
  if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) return true;
  if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) return true;
  return false;
}

/**
 * Probes the server specifically for the /text/ directory and Era files.
 * Provides full absolute path logging for all checks.
 */
export async function probeStaticDirectories() {
  const start = performance.now();
  const origin = window.location.origin;
  const textDirUrl = new URL('/text/', origin).href;

  addLog({
    type: 'SYSTEM',
    label: 'VERIFYING DIR',
    duration: 0,
    status: 'SUCCESS',
    message: `Checking reachability of: ${textDirUrl}`,
    source: 'geminiService.ts:92'
  });

  // 1. Verify directory itself exists/is reachable
  try {
    const dirResponse = await fetch(textDirUrl, { method: 'HEAD' });
    if (dirResponse.ok || dirResponse.status === 403) {
      addLog({
        type: 'SYSTEM',
        label: 'DIR STATUS',
        duration: performance.now() - start,
        status: 'SUCCESS',
        message: `[REACHABLE] ${textDirUrl} (Status: ${dirResponse.status})`,
        source: 'geminiService.ts:104'
      });
    } else {
      addLog({
        type: 'SYSTEM',
        label: 'DIR STATUS',
        duration: performance.now() - start,
        status: 'ERROR',
        message: `[UNREACHABLE] ${textDirUrl} not found (Status: ${dirResponse.status})`,
        source: 'geminiService.ts:112'
      });
    }
  } catch (e) {
    addLog({
      type: 'ERROR',
      label: 'DIR ERROR',
      duration: 0,
      status: 'ERROR',
      message: `Failed to connect to ${textDirUrl}. Network/CORS block.`,
      source: 'geminiService.ts:121'
    });
  }

  // 2. Scan for individual Era text files using absolute paths
  addLog({
    type: 'SYSTEM',
    label: 'FILE SCAN',
    duration: 0,
    status: 'SUCCESS',
    message: `Verifying static text cache manifest...`,
    source: 'geminiService.ts:131'
  });

  for (const chapter of CHAPTERS) {
    const eraIdNoSpaces = chapter.id.replace(/\s+/g, '');
    const filename = `einstein-discussion-${eraIdNoSpaces}.txt`;
    const fullFileUrl = new URL(`/text/${filename}`, origin).href;

    try {
      const res = await fetch(fullFileUrl, { method: 'HEAD' });
      if (res.ok) {
        addLog({
          type: 'SYSTEM',
          label: 'VERIFIED',
          duration: 0,
          status: 'CACHE_HIT',
          message: `[FOUND] ${fullFileUrl}`,
          source: 'geminiService.ts:147'
        });
      } else {
        addLog({
          type: 'SYSTEM',
          label: 'MISSING',
          duration: 0,
          status: 'ERROR',
          message: `[NOT FOUND] ${fullFileUrl} (Status: ${res.status})`,
          source: 'geminiService.ts:155'
        });
      }
    } catch (e) {
      // Catch network-level errors for this specific file
    }
  }
}

async function getFromStaticServer(type: 'text' | 'images', eraKey: string): Promise<string | null> {
  const start = performance.now();
  const dirName = type === 'text' ? 'text' : 'images';
  const prefix = type === 'text' ? 'einstein-discussion-' : 'einstein-diagram-';
  const extension = type === 'text' ? 'txt' : 'jpg';
  
  // Naming logic: match button/id name without spaces
  const eraNoSpace = eraKey.replace(/\s+/g, '');
  const chapter = CHAPTERS.find(c => c.id === eraKey);
  const titleNoSpace = chapter ? chapter.title.replace(/\s+/g, '') : null;

  const filenames = new Set<string>();
  filenames.add(`${prefix}${eraNoSpace}.${extension}`);
  filenames.add(`${prefix}${eraNoSpace.toLowerCase()}.${extension}`);
  if (titleNoSpace) {
    filenames.add(`${prefix}${titleNoSpace}.${extension}`);
    filenames.add(`${prefix}${titleNoSpace.toLowerCase()}.${extension}`);
  }

  const trialPaths: string[] = [];
  const dirs = [dirName, dirName.charAt(0).toUpperCase() + dirName.slice(1)];
  
  filenames.forEach(name => {
    dirs.forEach(d => {
      trialPaths.push(`${d}/${name}`);
      trialPaths.push(`/${d}/${name}`);
      trialPaths.push(`./${d}/${name}`);
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
        if (contentType.includes('text/html')) continue;
        const text = await response.text();
        const trimmed = text.trim();
        // Ensure valid content (not HTML error page)
        if (trimmed.length > 10 && !trimmed.startsWith('<!') && !trimmed.toLowerCase().startsWith('<html')) {
          addLog({ 
            type: 'CACHE_DB', 
            label: 'SERVER HIT', 
            duration: performance.now() - start, 
            status: 'CACHE_HIT', 
            message: `SUCCESS: Loaded ${absoluteUrl}`, 
            source: 'geminiService.ts:221' 
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
            message: `SUCCESS: Loaded ${absoluteUrl}`, 
            source: 'geminiService.ts:232' 
          });
          return URL.createObjectURL(blob);
        }
      }
    } catch (e) {}
  }

  // Detailed error log including every URL that failed
  addLog({
    type: 'SYSTEM',
    label: 'SERVER MISS',
    duration: performance.now() - start,
    status: 'ERROR',
    message: `Resource not found for ${eraKey} in /${dirName}. Tried: ${triedUrls.join(', ')}`,
    source: 'geminiService.ts:247'
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

  if (activeEraKey) {
    const staticResult = await getFromStaticServer('text', activeEraKey);
    if (staticResult) return staticResult;
  }

  const cacheKey = await generateCacheKey(prompt + JSON.stringify(history));
  const cached = await getFromCache('text', cacheKey);
  if (cached) {
    addLog({
      type: 'CACHE_DB',
      label: 'LOCAL HIT',
      duration: performance.now() - start,
      status: 'CACHE_HIT',
      message: 'Retrieved from laboratory records.',
      source: 'geminiService.ts:304'
    });
    return cached;
  }

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
      source: 'geminiService.ts:331'
    });
    return text;
  } catch (error: any) {
    addLog({
      type: 'ERROR',
      label: 'GEMINI ERROR',
      duration: performance.now() - start,
      status: 'ERROR',
      message: error.message || "Failed to communicate with ze stars.",
      source: 'geminiService.ts:341'
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
          source: 'geminiService.ts:375'
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
      source: 'geminiService.ts:386'
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
        source: 'geminiService.ts:419'
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
      source: 'geminiService.ts:430'
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
