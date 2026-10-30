// Minimal Azure Resource Manager HTTP client: auth header, api-version,
// error normalization, nextLink paging and long-running operation polling.

export const ARM_ENDPOINT = "https://management.azure.com";
export const SUPPORT_API_VERSION = "2024-04-01";

export type TokenProvider = () => Promise<string>;

export interface ArmClientOptions {
  getToken: TokenProvider;
  fetch?: typeof fetch;
  endpoint?: string;
  /** Delay between LRO polls when the service sends no Retry-After. */
  pollIntervalMs?: number;
  /** Give up polling after this long. */
  pollTimeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface RequestOptions {
  apiVersion?: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

export class ArmError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ArmError";
  }
}

export class ArmClient {
  private readonly fetchImpl: typeof fetch;
  private readonly endpoint: string;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: ArmClientOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.endpoint = options.endpoint ?? ARM_ENDPOINT;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** Builds the absolute URL for an ARM path, adding api-version and query parameters. */
  url(path: string, opts: RequestOptions = {}): string {
    const url = new URL(path, this.endpoint);
    url.searchParams.set("api-version", opts.apiVersion ?? SUPPORT_API_VERSION);
    for (const [key, value] of Object.entries(opts.query ?? {})) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const res = await this.send(method, this.url(path, opts), opts.body);
    if (res.status === 202 || (res.status === 201 && hasPollingHeader(res))) {
      return this.pollLongRunning<T>(res, path, opts);
    }
    return readJson<T>(res);
  }

  get<T>(path: string, opts?: RequestOptions) {
    return this.request<T>("GET", path, opts);
  }

  /** Fetches a page by absolute nextLink. Only ARM URLs are accepted. */
  async getNextPage<T>(nextLink: string): Promise<T> {
    if (!isArmUrl(nextLink, this.endpoint)) {
      throw new ArmError(400, "InvalidNextLink", "nextLink must point at the Azure Resource Manager endpoint.");
    }
    return readJson<T>(await this.send("GET", nextLink));
  }

  private async send(method: string, url: string, body?: unknown): Promise<Response> {
    const token = await this.options.getToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await this.fetchImpl(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) throw await toArmError(res);
    return res;
  }

  /**
   * Follows Azure-AsyncOperation (preferred) or Location until the operation
   * finishes, then GETs the resource itself.
   */
  private async pollLongRunning<T>(initial: Response, path: string, opts: RequestOptions): Promise<T> {
    const asyncUrl = initial.headers.get("Azure-AsyncOperation");
    const locationUrl = initial.headers.get("Location");
    const deadline = Date.now() + (this.options.pollTimeoutMs ?? 120_000);
    let retryAfter = retryAfterMs(initial) ?? this.options.pollIntervalMs ?? 2_000;

    if (asyncUrl) {
      for (;;) {
        await this.sleep(retryAfter);
        const res = await this.send("GET", asyncUrl);
        const op = (await readJson<{ status?: string; error?: { code?: string; message?: string } }>(res)) ?? {};
        const status = (op.status ?? "").toLowerCase();
        if (status === "succeeded") break;
        if (status === "failed" || status === "canceled" || status === "cancelled") {
          throw new ArmError(500, op.error?.code ?? "OperationFailed", op.error?.message ?? `Operation ${status}.`);
        }
        if (Date.now() > deadline) throw new ArmError(504, "OperationTimeout", "Timed out waiting for the operation.");
        retryAfter = retryAfterMs(res) ?? this.options.pollIntervalMs ?? 2_000;
      }
    } else if (locationUrl) {
      for (;;) {
        await this.sleep(retryAfter);
        const res = await this.send("GET", locationUrl);
        if (res.status !== 202) break;
        if (Date.now() > deadline) throw new ArmError(504, "OperationTimeout", "Timed out waiting for the operation.");
        retryAfter = retryAfterMs(res) ?? this.options.pollIntervalMs ?? 2_000;
      }
    }

    return this.get<T>(path, { apiVersion: opts.apiVersion });
  }
}

function hasPollingHeader(res: Response) {
  return res.headers.has("Azure-AsyncOperation") || res.headers.has("Location");
}

function retryAfterMs(res: Response): number | undefined {
  const value = res.headers.get("Retry-After");
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds * 1000 : undefined;
}

function isArmUrl(url: string, endpoint: string) {
  try {
    return new URL(url).origin === new URL(endpoint).origin;
  } catch {
    return false;
  }
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function toArmError(res: Response): Promise<ArmError> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as { error?: { code?: string; message?: string; details?: unknown } };
    if (parsed.error) {
      return new ArmError(
        res.status,
        parsed.error.code ?? `Http${res.status}`,
        parsed.error.message ?? res.statusText,
        parsed.error.details,
      );
    }
  } catch {
    // Not JSON; fall through.
  }
  return new ArmError(res.status, `Http${res.status}`, text || res.statusText);
}
