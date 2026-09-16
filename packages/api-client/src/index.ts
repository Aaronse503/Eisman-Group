import type {
  ActivityEntry,
  ApiError,
  ClientSummary,
  ContactSummary,
  DashboardMetric,
  DashboardResponse,
  DeviceInfo,
  DocumentSummary,
  MeetingSummary,
  NoteSummary,
  ParfaxUserSummary,
  PipelineEntry,
  SearchHit,
  SessionResponse,
  SyncRequest,
  SyncResponse,
  TaskSummary,
} from '@eisman/shared';

export { API_VERSION } from '@eisman/shared';

/**
 * Typed client for the Command Center API.
 *
 * Deliberately built on plain fetch with no dependencies: it runs unchanged in
 * a React Native app, in a Node test, and in a browser. The types come from
 * the same package the server imports, so an endpoint that changes shape
 * fails to compile on both sides rather than at runtime on someone's phone.
 */

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: ApiError['code'],
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  /** True when the session is gone and the person has to sign in again. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  /** True when the request never reached the server. */
  get isOffline(): boolean {
    return this.status === 0;
  }
}

export interface ApiClientOptions {
  /** Base URL of the web application, with no trailing slash. */
  baseUrl: string;
  /** Returns the stored session token, or null when signed out. */
  getToken: () => Promise<string | null> | string | null;
  /** Called when the server rejects the token, so the app can sign out. */
  onUnauthenticated?: () => void | Promise<void>;
  /** Milliseconds before a request is abandoned. */
  timeoutMs?: number;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  /** Multipart body, for uploading a document. */
  formData?: FormData;
  signal?: AbortSignal;
}

export class ApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  private url(path: string, query?: RequestOptions['query']): string {
    const url = new URL(`/api/v1${path}`, this.options.baseUrl);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const token = await this.options.getToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 20_000);
    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    let response: Response;
    try {
      response = await fetch(this.url(path, options.query), {
        method: options.method ?? 'GET',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options.formData ? {} : { 'Content-Type': 'application/json' }),
          Accept: 'application/json',
        },
        body: options.formData ?? (options.body ? JSON.stringify(options.body) : undefined),
        signal: controller.signal,
      });
    } catch (err) {
      // No response at all: no signal, aeroplane mode, or the server is
      // unreachable. Status 0 is what the app checks to decide to queue.
      throw new ApiClientError(
        0,
        err instanceof Error && err.name === 'AbortError'
          ? 'That took too long. Check your connection.'
          : 'No connection.',
      );
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 204) return undefined as T;

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const error = (payload ?? {}) as ApiError;
      if (response.status === 401) await this.options.onUnauthenticated?.();
      throw new ApiClientError(
        response.status,
        error.error ?? `Request failed (${response.status}).`,
        error.code,
        error.fields,
      );
    }

    return payload as T;
  }

  // ------------------------------------------------------------------ session

  signIn(email: string, password: string, device?: DeviceInfo) {
    return this.request<SessionResponse>('/auth/sign-in', {
      method: 'POST',
      body: { email, password, device },
    });
  }

  session() {
    return this.request<SessionResponse>('/auth/session');
  }

  signOut(installationId?: string) {
    return this.request<{ ok: true }>('/auth/sign-out', {
      method: 'POST',
      body: { installationId },
    });
  }

  changePassword(currentPassword: string, newPassword: string) {
    return this.request<{ ok: true }>('/auth/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword, confirmPassword: newPassword },
    });
  }

  registerPushToken(installationId: string, platform: 'ios' | 'android', expoPushToken: string | null) {
    return this.request<{ ok: true; pushEnabled: boolean }>('/devices/push-token', {
      method: 'POST',
      body: { installationId, platform, expoPushToken },
    });
  }

  // -------------------------------------------------------------------- reads

  dashboard(company?: string, range?: string) {
    return this.request<DashboardResponse>('/dashboard', { query: { company, range } });
  }

  search(q: string, company?: string, limit?: number) {
    return this.request<{ items: SearchHit[] }>('/search', { query: { q, company, limit } });
  }

  activity(company?: string, limit = 25) {
    return this.request<{ items: ActivityEntry[] }>('/activity', { query: { company, limit } });
  }

  clients(params: { company?: string; q?: string; status?: string; health?: string } = {}) {
    return this.request<{ items: ClientSummary[] }>('/clients', { query: params });
  }

  client(id: string) {
    return this.request<{
      client: Record<string, unknown> & { id: string; name: string; isDemo: boolean };
      contacts: { id: string; fullName: string; title: string | null; email: string | null; phone: string | null }[];
      notes: { id: string; title: string; body: string; authorName: string | null; createdAt: string; isDemo: boolean }[];
      tasks: { id: string; title: string; status: string; dueAt: string | null; isDemo: boolean }[];
    }>(`/clients/${id}`);
  }

  contact(id: string) {
    return this.request<{
      contact: Record<string, unknown> & { id: string; fullName: string; isDemo: boolean };
      clients: { id: string; name: string }[];
    }>(`/contacts/${id}`);
  }

  task(id: string) {
    return this.request<{
      task: Record<string, unknown> & { id: string; title: string; status: string; isDemo: boolean };
      subtasks: { id: string; title: string; status: string; dueAt: string | null; isDemo: boolean }[];
    }>(`/tasks/${id}`);
  }

  contacts(params: { company?: string; q?: string } = {}) {
    return this.request<{ items: ContactSummary[] }>('/contacts', { query: params });
  }

  tasks(params: { company?: string; view?: string; q?: string; client?: string } = {}) {
    return this.request<{ items: TaskSummary[] }>('/tasks', { query: params });
  }

  meetings(params: { company?: string; from?: string; to?: string } = {}) {
    return this.request<{ items: MeetingSummary[] }>('/meetings', { query: params });
  }

  notes(params: { company?: string; entityType?: string; entityId?: string; limit?: number } = {}) {
    return this.request<{ items: NoteSummary[] }>('/notes', { query: params });
  }

  pipeline(kind: 'investor' | 'partnership', company?: string) {
    return this.request<{ kind: string; items: PipelineEntry[] }>('/pipelines', {
      query: { kind, company },
    });
  }

  parfaxMetrics(range?: string) {
    return this.request<{
      range: { preset: string; label: string };
      metrics: DashboardMetric[];
      source: string;
      connection: { status: string; mode: string };
    }>('/parfax/metrics', { query: { range } });
  }

  parfaxUsers(params: { q?: string; plan?: string; status?: string; limit?: number } = {}) {
    return this.request<{ items: ParfaxUserSummary[] }>('/parfax/users', { query: params });
  }

  documents(params: { company?: string; limit?: number } = {}) {
    return this.request<{ items: DocumentSummary[] }>('/documents', { query: params });
  }

  // ------------------------------------------------------------------- writes

  createTask(input: Record<string, unknown>) {
    return this.request<{ id: string }>('/tasks', { method: 'POST', body: input });
  }

  completeTask(id: string) {
    return this.request<{ ok: true }>(`/tasks/${id}/complete`, { method: 'POST' });
  }

  createNote(input: Record<string, unknown>) {
    return this.request<{ id: string }>('/notes', { method: 'POST', body: input });
  }

  createContact(input: Record<string, unknown>) {
    return this.request<{ id: string }>('/contacts', { method: 'POST', body: input });
  }

  createPipelineEntry(kind: 'investor' | 'partnership', input: Record<string, unknown>) {
    return this.request<{ id: string }>('/pipelines', {
      method: 'POST',
      query: { kind },
      body: input,
    });
  }

  createMeeting(input: Record<string, unknown>) {
    return this.request<{ id: string }>('/meetings', { method: 'POST', body: input });
  }

  uploadDocument(formData: FormData) {
    return this.request<{ id: string; name: string }>('/documents', {
      method: 'POST',
      formData,
    });
  }

  sync(request: SyncRequest) {
    return this.request<SyncResponse>('/sync', { method: 'POST', body: request });
  }
}
