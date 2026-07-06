// Cliente HTTP mínimo. Em dev o Vite faz proxy de /api → localhost:3001.

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = `Erro ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* corpo não-JSON */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body: unknown) => request<T>('POST', url, body),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  del: <T = void>(url: string) => request<T>('DELETE', url),
  // Upload multipart (ex.: wizard de importação de despesas do Domínio).
  postForm: async <T>(url: string, formData: FormData): Promise<T> => {
    const res = await fetch(url, { method: 'POST', body: formData }); // sem Content-Type manual: o browser define o boundary
    if (!res.ok) {
      let message = `Erro ${res.status}`;
      try {
        const data = await res.json();
        if (data?.error) message = data.error;
      } catch {
        /* corpo não-JSON */
      }
      throw new ApiError(res.status, message);
    }
    return (await res.json()) as T;
  },
};
