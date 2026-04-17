import { api } from './api';

export async function signIn(email: string, password: string) {
  const r = await api<{ id_token: string; refresh_token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem('jwt', r.id_token);
  localStorage.setItem('refresh', r.refresh_token);
}

export function signOut() {
  localStorage.removeItem('jwt');
  localStorage.removeItem('refresh');
}
