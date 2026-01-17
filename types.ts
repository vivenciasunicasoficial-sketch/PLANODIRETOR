
export interface Scene {
  id: string;
  title: string;
  description: string;
  prompt: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  videoUri?: string;
  blobUrl?: string;
  rawResponse?: any; // To store the video reference for extension
}

export interface ScriptAnalysis {
  scenes: Scene[];
}

export enum GenerationStep {
  IDLE = 'IDLE',
  ANALYZING_SCRIPT = 'ANALYZING_SCRIPT',
  GENERATING_VIDEOS = 'GENERATING_VIDEOS',
  COMPLETED = 'COMPLETED'
}
