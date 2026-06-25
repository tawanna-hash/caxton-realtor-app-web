import { getApiBase } from '@/lib/api-base';
const API_URL = getApiBase();

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(response.status, error.error || 'Request failed', error.details);
  }

  return response.json();
}

export const api = {
  auth: {
    signup: (data: {
      firstName: string;
      lastName: string;
      email: string;
      market: 'austin' | 'san_antonio' | 'both';
      consentText: string;
    }) => request('/auth/signup', { method: 'POST', body: JSON.stringify(data) }),

    login: (email: string) =>
      request('/auth/login', { method: 'POST', body: JSON.stringify({ email }) }),

    verify: (token: string) =>
      request<{ success: boolean; isNewUser: boolean }>('/auth/verify', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),

    logout: () => request('/auth/logout', { method: 'POST' }),

    me: () => request<{ realtor: unknown }>('/auth/me'),
  },
};
