
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
  let key = process.env.API_KEY;
  if (!key || key === 'undefined' || key === 'null' || key.trim().length < 5) {
    throw new Error("Missing Laboratory Key. Please ensure the API_KEY environment variable is configured.");
  }
  const cleanKey = key.trim().replace(/^['"]|['"]$/g, '');
  return new GoogleGenAI({ apiKey: cleanKey });
};

/**
 * Checks for static historical content first before AI generation.
 */
export async function getStaticEraContent(era: Era): Promise<{ text: string | null, imageUrl: string | null }> {
  const key = era.replace(/\s+/g, '');
  let text: string | null = null;
  let imageUrl: string | null = null;

  try {
    const textResp = await fetch(`/text/einstein-discussion-${key}.txt`);
    if (textResp.ok) {
      const rawText = await textResp.text();
      // Remove "EINSTEIN: " prefix if present in the file for cleaner UI display
      text = rawText.replace(/^EINSTEIN:\s*/i, '').trim();
    }
  } catch (e) {
    console.debug(`Static text not found for ${era}`);
  }

  try {
    const imgResp = await fetch(`/images/einstein-visual-${key}.png`);
    if (imgResp.ok) {
      imageUrl = `/images/einstein-visual-${key}.png`;
    }
  } catch (e) {
    console.debug(`Static image not found for ${era}`);
  }

  return { text, imageUrl };
}

export async function generateEinsteinResponse(prompt: string, history: any[], eraKey?: string): Promise<string> {
  const start = performance.now();
  try {
    const ai = getAI();
    const chat = ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        systemInstruction: "You are Professor Albert Einstein. Address the user as 'My dear friend'. Introduce the experience if it is the start. Explain pivotal eras of math. Keep it whimsical, humble, and academic. Use metaphors. Always use LaTeX for mathematical equations. IMPORTANT: You speak with a distinct German accent. Whenever the user asks for more detail, deeper math, or a follow-up question, you MUST provide a [IMAGE: description] tag at the very end of your response.",
      },
      history: history
    });

    const response = await chat.sendMessage({ message: prompt });
    const text = response.text || "Ach, ze universe remains a mystery.";
    
    addLog({
      type: 'AI_TEXT',
      label: 'GEMINI TEXT',
      duration: performance.now() - start,
      status: 'SUCCESS',
      message: 'Consulted ze relative wisdom of ze stars.',
      source: 'geminiService.ts'
    });
    return text;
  } catch (error: any) {
    addLog({ type: 'ERROR', label: 'GEMINI ERROR', duration: performance.now() - start, status: 'ERROR', message: error.message, source: 'geminiService.ts' });
    throw error;
  }
}

export async function generateMathNews(): Promise<{text: string, sources: {title: string, uri: string}[]}> {
  const start = performance.now();
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: "Professor Einstein, what are the absolute latest breakthroughs in mathematics or theoretical physics from 2024 and 2025? Tell me about ze newest discoveries in ze language of ze stars!",
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: "You are Professor Einstein. Use Google Search to find recent (2024-2025) math news. Explain them with your signature German accent und whimsy. Mention specific breakthroughs or researchers."
      }
    });

    const text = response.text || "Ze news from ze future is still traveling at ze speed of light!";
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks
      .filter((c: any) => c.web)
      .map((c: any) => ({ title: c.web.title, uri: c.web.uri }));

    addLog({
      type: 'SYSTEM',
      label: 'SEARCH NEWS',
      duration: performance.now() - start,
      status: 'SUCCESS',
      message: `Found ${sources.length} sources for latest math news.`,
      source: 'geminiService.ts'
    });

    return { text, sources };
  } catch (error: any) {
    addLog({ type: 'ERROR', label: 'SEARCH ERROR', duration: performance.now() - start, status: 'ERROR', message: error.message, source: 'geminiService.ts' });
    throw error;
  }
}

export async function generateChalkboardImage(description: string, eraKey?: string): Promise<string | null> {
  const start = performance.now();
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: `A chalkboard sketch with white chalk on a dark dusty blackboard. Illustrate: ${description}` }] },
      config: { imageConfig: { aspectRatio: "16:9" } }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
  } catch (e) {}
  return null;
}

export async function generateEinsteinSpeech(text: string): Promise<string | null> {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Speak as Einstein: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } } },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (e) { return null; }
}

export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

export async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
  }
  return buffer;
}

export async function probeStaticDirectories() {}
