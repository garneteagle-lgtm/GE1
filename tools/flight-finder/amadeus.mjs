// Amadeus Self-Service API client: OAuth2 client-credentials, request
// throttling, retry-with-backoff, and typed errors.
//
// Docs: https://developers.amadeus.com/self-service
//   POST /v1/security/oauth2/token          -> access token
//   GET  /v2/shopping/flight-offers         -> priced flight offers
//   GET  /v1/reference-data/locations       -> city / airport lookup

export const HOSTS = {
  test: "https://test.api.amadeus.com",
  production: "https://api.amadeus.com",
};

export class AmadeusError extends Error {
  constructor(message, { status, code, detail, retryable = false } = {}) {
    super(message);
    this.name = "AmadeusError";
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.retryable = retryable;
  }
}

export class MissingCredentialsError extends Error {
  constructor() {
    super("Amadeus API credentials are not set");
    this.name = "MissingCredentialsError";
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class AmadeusClient {
  /**
   * @param {object} options
   * @param {string} options.clientId
   * @param {string} options.clientSecret
   * @param {"test"|"production"} [options.env]
   * @param {string} [options.baseUrl]      explicit host, overrides env (used by tests)
   * @param {import("./cache.mjs").Cache} [options.cache]
   * @param {(msg: string) => void} [options.log]
   */
  constructor({ clientId, clientSecret, env = "test", baseUrl, cache, log = () => {} }) {
    if (!clientId || !clientSecret) throw new MissingCredentialsError();
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.env = env;
    this.baseUrl = baseUrl || HOSTS[env] || HOSTS.test;
    this.cache = cache;
    this.log = log;
    // Test env is capped at 10 req/s (1 per 100ms); production is far higher
    // but there is no prize for pushing it.
    this.minIntervalMs = env === "production" ? 60 : 120;
    this.calls = 0;
    this._token = null;
    this._tokenExpiresAt = 0;
    this._queue = Promise.resolve();
    this._lastRequestAt = 0;
  }

  /** Serializes requests and keeps them spaced by `minIntervalMs`. */
  #schedule(task) {
    const run = this._queue.then(async () => {
      const wait = this.minIntervalMs - (Date.now() - this._lastRequestAt);
      if (wait > 0) await sleep(wait);
      this._lastRequestAt = Date.now();
      return task();
    });
    // Keep the chain alive even when a task rejects.
    this._queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async #token() {
    // Refresh a minute early so a long sweep never trips over expiry.
    if (this._token && Date.now() < this._tokenExpiresAt - 60_000) return this._token;

    const response = await this.#schedule(() =>
      fetch(`${this.baseUrl}/v1/security/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }).toString(),
      }),
    );

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = body.error_description || body.title || response.statusText;
      throw new AmadeusError(`Amadeus rejected the API credentials: ${detail}`, {
        status: response.status,
        code: body.code,
        detail,
      });
    }
    this._token = body.access_token;
    this._tokenExpiresAt = Date.now() + (body.expires_in ?? 1799) * 1000;
    return this._token;
  }

  /**
   * GET an Amadeus endpoint with caching, throttling and retry.
   * @param {string} path e.g. "/v2/shopping/flight-offers"
   * @param {Record<string, string|number|boolean|undefined>} params
   */
  async get(path, params = {}, { cacheable = true, retries = 3 } = {}) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") continue;
      query.set(key, String(value));
    }
    const url = `${this.baseUrl}${path}?${query.toString()}`;
    const cacheKey = `${this.env}:${path}?${query.toString()}`;

    if (cacheable && this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached !== undefined) {
        this.log(`cache hit  ${path} ${query.toString()}`);
        return cached;
      }
    }

    let attempt = 0;
    for (;;) {
      const token = await this.#token();
      let response;
      try {
        response = await this.#schedule(() => {
          this.calls += 1;
          this.log(`GET        ${path} ${query.toString()}`);
          return fetch(url, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.amadeus+json" },
          });
        });
      } catch (cause) {
        // Network-level failure (DNS, TLS, socket reset).
        if (attempt < retries) {
          await sleep(2 ** attempt * 1000);
          attempt += 1;
          continue;
        }
        throw new AmadeusError(`Could not reach ${this.baseUrl}: ${cause.message}`, {
          retryable: true,
        });
      }

      if (response.ok) {
        const body = await response.json();
        if (cacheable && this.cache) this.cache.set(cacheKey, body);
        return body;
      }

      const body = await response.json().catch(() => ({}));
      const first = Array.isArray(body.errors) ? body.errors[0] : undefined;

      // An expired token mid-sweep: drop it and retry once without counting it
      // as a real failure.
      if (response.status === 401 && attempt < retries) {
        this._token = null;
        attempt += 1;
        continue;
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < retries) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 2 ** attempt * 1000;
        this.log(`retry ${attempt + 1}/${retries} after ${delay}ms (HTTP ${response.status})`);
        await sleep(delay);
        attempt += 1;
        continue;
      }

      throw new AmadeusError(first?.title || `Amadeus request failed (HTTP ${response.status})`, {
        status: response.status,
        code: first?.code,
        detail: first?.detail,
        retryable,
      });
    }
  }

  /** Airport & City Search. */
  searchLocations(keyword, { subType = "CITY,AIRPORT", limit = 8 } = {}) {
    return this.get("/v1/reference-data/locations", {
      keyword,
      subType,
      "page[limit]": limit,
      view: "LIGHT",
    });
  }

  /** Flight Offers Search. */
  searchFlightOffers(params) {
    return this.get("/v2/shopping/flight-offers", params);
  }
}
