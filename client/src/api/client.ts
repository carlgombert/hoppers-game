import { type Tile } from '../types/level';

let API_BASE = (import.meta.env.VITE_API_URL || 'https://hoppers-game-production.up.railway.app').replace(/\/$/, '');
if (API_BASE && !API_BASE.startsWith('http')) {
  API_BASE = `https://${API_BASE}`;
}

// ── Token storage ────────────────────────────────────────────────────────────

export function getToken(): string | null {
  return localStorage.getItem('hoppers_token');
}

export function setToken(token: string): void {
  localStorage.setItem('hoppers_token', token);
}

export function clearToken(): void {
  localStorage.removeItem('hoppers_token');
}

export function getStoredUsername(): string | null {
  return localStorage.getItem('hoppers_username');
}

export function setStoredUsername(name: string): void {
  localStorage.setItem('hoppers_username', name);
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

async function handleResponse<T>(res: Response): Promise<T> {
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    console.error(`API Error (${res.status}) for ${res.url}. Body: ${text.slice(0, 100)}`);
    let msg = `HTTP ${res.status}`;
    try {
      const body = JSON.parse(text);
      msg = body.error ?? msg;
    } catch {
      // Not JSON
    }
    throw new ApiError(msg, res.status);
  }
  if (res.status === 204 || !text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    console.error(`JSON Parse Error for ${res.url}. Body: ${text.slice(0, 100)}`);
    throw err;
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  username: string;
  character_key?: string;
}

export async function register(
  username: string,
  password: string,
): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return handleResponse(res);
}

export async function login(
  username: string,
  password: string,
): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return handleResponse(res);
}

export async function apiLogout(): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// ── Levels ───────────────────────────────────────────────────────────────────

export interface ApiLevel {
  id: string;
  title: string;
  description: string | null;
  backdrop_id: string | null;
  tile_data: Tile[];
  published: boolean;
  created_at: string;
  updated_at: string;
}

export async function fetchMyLevels(): Promise<ApiLevel[]> {
  const res = await fetch(`${API_BASE}/levels/mine`, {
    headers: authHeaders(),
  });
  const data = await handleResponse<{ levels: ApiLevel[] }>(res);
  return data.levels;
}

export async function createLevel(
  title: string,
  description: string,
  tileData: Tile[],
  backdropId?: string,
): Promise<ApiLevel> {
  const res = await fetch(`${API_BASE}/levels`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ title, description, tile_data: tileData, backdrop_id: backdropId }),
  });
  return handleResponse(res);
}

export async function patchLevel(
  id: string,
  fields: Partial<{
    title: string;
    description: string;
    tile_data: Tile[];
    backdrop_id: string;
    published: boolean;
  }>,
): Promise<ApiLevel> {
  const res = await fetch(`${API_BASE}/levels/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(fields),
  });
  return handleResponse(res);
}

export async function deleteLevel(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/levels/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// ── Saves ────────────────────────────────────────────────────────────────────

export interface CheckpointState {
  x?: number;
  y?: number;
  checkpointTileKey?: string;
  completed?: boolean;
  elapsed_ms?: number;
}

export interface SaveState {
  id: string;
  user_id: string;
  level_id: string;
  checkpoint_state: CheckpointState;
  saved_at: string;
}

export async function fetchSave(levelId: string): Promise<SaveState | null> {
  const res = await fetch(`${API_BASE}/saves/${levelId}`, {
    headers: authHeaders(),
  });
  if (res.status === 404) return null;
  return handleResponse<SaveState>(res);
}

export async function postSave(
  levelId: string,
  checkpointState: CheckpointState,
): Promise<void> {
  const res = await fetch(`${API_BASE}/saves`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ level_id: levelId, checkpoint_state: checkpointState }),
  });
  return handleResponse(res);
}

// ── Levels (single) ──────────────────────────────────────────────────────────

export async function fetchLevel(id: string): Promise<ApiLevel> {
  const res = await fetch(`${API_BASE}/levels/${id}`, {
    headers: authHeaders(),
  });
  return handleResponse<ApiLevel>(res);
}

// ── Parties ──────────────────────────────────────────────────────────────────

export interface ApiParty {
  id: string;
  code: string;
  host_id: string;
  level_id: string;
  state: 'waiting' | 'active' | 'done';
  created_at: string;
}

export async function createParty(levelId: string): Promise<ApiParty> {
  const res = await fetch(`${API_BASE}/parties`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ level_id: levelId }),
  });
  return handleResponse<ApiParty>(res);
}

export async function joinParty(code: string): Promise<ApiParty> {
  const res = await fetch(`${API_BASE}/parties/join`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ code }),
  });
  return handleResponse<ApiParty>(res);
}

// ── Community browse ─────────────────────────────────────────────────────────

export interface PublishedLevel {
  id: string;
  title: string;
  description: string | null;
  thumbnail: string | null;
  backdrop_id: string | null;
  created_at: string;
  author: string;
}

export async function fetchPublishedLevels(page = 1): Promise<{
  levels: PublishedLevel[];
  total: number;
  page: number;
}> {
  const res = await fetch(`${API_BASE}/levels?page=${page}`);
  return handleResponse(res);
}

export async function forkLevel(id: string): Promise<ApiLevel> {
  const res = await fetch(`${API_BASE}/levels/${id}/fork`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse<ApiLevel>(res);
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  username: string;
  elapsed_ms: number;
}

export async function fetchLeaderboard(levelId: string): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${API_BASE}/levels/${levelId}/leaderboard`);
  return handleResponse<LeaderboardEntry[]>(res);
}
