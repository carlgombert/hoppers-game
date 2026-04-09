import { type Tile } from '../types/level';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

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

export function getStoredDisplayName(): string | null {
  return localStorage.getItem('hoppers_display_name');
}

export function setStoredDisplayName(name: string): void {
  localStorage.setItem('hoppers_display_name', name);
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body.error ?? msg;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(msg, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
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
  email: string;
  display_name: string;
  character_key?: string;
}

export async function register(
  email: string,
  password: string,
  displayName: string,
): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, display_name: displayName }),
  });
  return handleResponse(res);
}

export async function login(
  email: string,
  password: string,
): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
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
): Promise<ApiLevel> {
  const res = await fetch(`${API_BASE}/levels`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ title, description, tile_data: tileData }),
  });
  return handleResponse(res);
}

export async function patchLevel(
  id: string,
  fields: Partial<{
    title: string;
    description: string;
    tile_data: Tile[];
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
  display_name: string;
  elapsed_ms: number;
}

export async function fetchLeaderboard(levelId: string): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${API_BASE}/levels/${levelId}/leaderboard`);
  return handleResponse<LeaderboardEntry[]>(res);
}
