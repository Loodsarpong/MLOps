import { api } from './api';

export interface SignInResult {
  must_change_password: boolean;
  user: { id: string; email: string; tenantId: string; roles: string[]; fullName: string };
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  const r = await api<{
    id_token: string;
    refresh_token: string;
    must_change_password: boolean;
    user: SignInResult['user'];
  }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem('jwt', r.id_token);
  localStorage.setItem('refresh', r.refresh_token);
  localStorage.setItem('me', JSON.stringify(r.user));
  document.cookie = `ns_auth=1; path=/; max-age=${60 * 60 * 12}; SameSite=Lax`;
  return { must_change_password: r.must_change_password, user: r.user };
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api<{ ok: true }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

export interface MeResponse {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  mustChangePassword: boolean;
  roles: string[];
}

export async function getMe(): Promise<MeResponse> {
  return api<MeResponse>('/auth/me');
}

export function getCachedMe(): SignInResult['user'] | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem('me');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function signOut() {
  localStorage.removeItem('jwt');
  localStorage.removeItem('refresh');
  localStorage.removeItem('me');
  document.cookie = 'ns_auth=; path=/; max-age=0';
}
