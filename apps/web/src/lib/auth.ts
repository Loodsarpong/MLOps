import { api } from './api';

export async function signIn(email: string, password: string) {
  const r = await api<{ id_token: string; refresh_token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem('jwt', r.id_token);
  localStorage.setItem('refresh', r.refresh_token);
  // middleware gate reads this cookie; 12 h matches the dev JWT expiry
  document.cookie = `ns_auth=1; path=/; max-age=${60 * 60 * 12}; SameSite=Lax`;
}

export function signOut() {
  localStorage.removeItem('jwt');
  localStorage.removeItem('refresh');
  document.cookie = 'ns_auth=; path=/; max-age=0';
}
