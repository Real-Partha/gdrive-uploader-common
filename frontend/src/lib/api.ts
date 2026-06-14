const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export interface UploadSessionRequest {
  filename: string;
  mimeType: string;
  size: number;
  photoDate: string;
  name: string;
}

export interface UploadSessionResponse {
  sessionUrl: string;
  fileName: string;
  folderPath: string;
}

export interface CompleteUploadRequest {
  name: string;
  fileName: string;
  photoDate: string;
  sizeBytes: number;
  driveFileId: string;
}

export interface SummaryEntry {
  name: string;
  count: number;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed with ${res.status}`);
  }

  return res.json();
}

export function createUploadSession(payload: UploadSessionRequest) {
  return postJson<UploadSessionResponse>('/api/upload-session', payload);
}

export function completeUpload(payload: CompleteUploadRequest) {
  return postJson<{ ok: true }>('/api/upload-complete', payload);
}

export async function getStats(): Promise<SummaryEntry[]> {
  const res = await fetch(`${API_BASE}/api/stats`);
  if (!res.ok) throw new Error('Failed to load stats');
  const data = await res.json();
  return data.summary ?? [];
}
