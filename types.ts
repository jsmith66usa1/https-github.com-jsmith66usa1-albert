
export enum Era {
  Introduction = 'Introduction',
  Foundations = 'Foundations',
  Geometry = 'The Geometry of Forms',
  Zero = 'The Origins of Zero',
  Algebra = 'The Birth of Algebra',
  Calculus = 'The Calculus Revolution',
  Analysis = 'The Age of Analysis',
  Quantum = 'The Quantum Leap',
  Unified = 'The Unified Theory'
}

export interface Message {
  role: 'user' | 'einstein';
  text: string;
  imagePrompt?: string;
  imageUrl?: string;
  timestamp: number;
}

export interface Chapter {
  id: Era;
  title: string;
  description: string;
  prompt: string;
}

export interface LogEntry {
  id: string;
  type: 'AI_TEXT' | 'AI_IMAGE' | 'AI_AUDIO' | 'CACHE_DB' | 'ERROR' | 'SYSTEM';
  label: string;
  duration: number;
  status: 'SUCCESS' | 'ERROR' | 'CACHE_HIT';
  message: string;
  timestamp: number;
  source?: string;
  metadata?: any;
}
