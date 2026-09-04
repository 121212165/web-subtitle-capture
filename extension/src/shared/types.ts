export interface PlatformConfig {
  id: string;
  hostPatterns: string[];
  selectors: string[];
}

export interface SubtitlePayload {
  sessionId: string;
  text: string;
  tabTitle: string;
  platform: string;
  timestamp: number;
}

export interface SessionPayload {
  sessionId: string;
  tabTitle: string;
  platform: string;
}

export interface CaptureStatus {
  running: boolean;
  sessionId: string | null;
  platform: string;
  url: string;
  title: string;
}

export interface SessionInfo {
  id: string;
  tabTitle: string;
  platform: string;
  lineCount: number;
  startedAt: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface HealthResponse {
  success: boolean;
  status: string;
  uptime: number;
  activeSessions: number;
}

export interface SessionsResponse {
  success: boolean;
  sessions: SessionInfo[];
}

export type ContentAction = "start" | "stop" | "status";

export type BackgroundAction = "getSessions" | "health" | "captureAll" | "stopAll";

export interface ContentMessage {
  action: ContentAction;
}

export interface BackgroundMessage {
  action: BackgroundAction;
}

export interface NormalizedSubtitle {
  text: string;
  startTime?: number;
  endTime?: number;
  source: 'dom' | 'api-fetch' | 'api-ws' | 'api-sse';
  platform: string;
}

export interface InterceptedPayload {
  text: string;
  url: string;
  method: 'fetch' | 'xhr' | 'ws' | 'es';
  contentType?: string;
  timestamp: number;
  raw?: unknown;
}

export interface InterceptorConfig {
  urlPatterns: Array<string | RegExp>;
  onSubtitle: (data: InterceptedPayload) => void;
  maxBuffer?: number;
}
