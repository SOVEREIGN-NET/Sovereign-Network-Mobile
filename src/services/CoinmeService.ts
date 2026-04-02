/**
 * CoinmeService
 * Coinme Crypto-as-a-Service on-ramp integration.
 * Handles authentication and widget URL generation.
 *
 * Credentials are configured via environment — set COINME_API_KEY and
 * COINME_API_SECRET before using. The widget URL returned by the API
 * is loaded in a WebView by BuyCryptoScreen.
 */

// Staging (dev) and production base URLs
const COINME_WIDGET_BASE_DEV = 'https://dev-widget.coinme.com';
const COINME_WIDGET_BASE_PROD = 'https://widget.coinme.com';
const COINME_API_BASE_DEV = 'https://dev-api.coinme.com';
const COINME_API_BASE_PROD = 'https://api.coinme.com';

export interface CoinmeConfig {
  apiKey: string;
  apiSecret: string;
  environment: 'development' | 'production';
}

export interface CoinmeWidgetSession {
  widgetUrl: string;
  sessionId: string;
}

export interface CoinmeAuthToken {
  token: string;
  expiresAt: number;
}

class CoinmeService {
  private config: CoinmeConfig | null = null;
  private authToken: CoinmeAuthToken | null = null;

  /**
   * Configure the service with API credentials.
   * Call this once at app startup or before first use.
   */
  configure(config: CoinmeConfig) {
    this.config = config;
    this.authToken = null;
    console.log('[CoinmeService] Configured for', config.environment);
  }

  get isConfigured(): boolean {
    return this.config !== null;
  }

  private get apiBase(): string {
    return this.config?.environment === 'production'
      ? COINME_API_BASE_PROD
      : COINME_API_BASE_DEV;
  }

  private get widgetBase(): string {
    return this.config?.environment === 'production'
      ? COINME_WIDGET_BASE_PROD
      : COINME_WIDGET_BASE_DEV;
  }

  /**
   * Authenticate with Coinme API and get a bearer token.
   */
  private async authenticate(): Promise<string> {
    if (!this.config) {
      throw new Error('CoinmeService not configured — call configure() first');
    }

    // Return cached token if still valid (with 60s buffer)
    if (this.authToken && Date.now() < this.authToken.expiresAt - 60_000) {
      return this.authToken.token;
    }

    const response = await fetch(`${this.apiBase}/services/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: this.config.apiKey,
        api_secret: this.config.apiSecret,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Coinme auth failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as {
      token: string;
      expires_at?: number;
    };
    this.authToken = {
      token: data.token,
      // Default 1h expiry if not provided
      expiresAt: data.expires_at
        ? data.expires_at * 1000
        : Date.now() + 3600_000,
    };

    console.log('[CoinmeService] Authenticated successfully');
    return this.authToken.token;
  }

  /**
   * Create a widget session for a user to buy crypto.
   * Returns a URL to load in a WebView.
   */
  async createWidgetSession(params: {
    walletAddress?: string;
    cryptocurrency?: string;
    fiatCurrency?: string;
    fiatAmount?: number;
  }): Promise<CoinmeWidgetSession> {
    const token = await this.authenticate();

    const queryParams = new URLSearchParams();
    if (params.walletAddress) {
      queryParams.set('wallet_address', params.walletAddress);
    }
    if (params.cryptocurrency) {
      queryParams.set('cryptocurrency', params.cryptocurrency);
    }
    if (params.fiatCurrency) {
      queryParams.set('fiat_currency', params.fiatCurrency);
    }
    if (params.fiatAmount) {
      queryParams.set('fiat_amount', String(params.fiatAmount));
    }
    queryParams.set('token', token);

    const widgetUrl = `${this.widgetBase}?${queryParams.toString()}`;

    console.log('[CoinmeService] Widget session created');
    return {
      widgetUrl,
      sessionId: token,
    };
  }

  /**
   * Build a direct widget URL without API auth.
   * Use this as a fallback or for testing when API credentials
   * are not yet configured.
   */
  buildDirectWidgetUrl(params?: {
    cryptocurrency?: string;
    walletAddress?: string;
  }): string {
    const queryParams = new URLSearchParams();
    if (params?.cryptocurrency) {
      queryParams.set('cryptocurrency', params.cryptocurrency);
    }
    if (params?.walletAddress) {
      queryParams.set('wallet_address', params.walletAddress);
    }
    const qs = queryParams.toString();
    return `${this.widgetBase}${qs ? `?${qs}` : ''}`;
  }
}

const coinmeService = new CoinmeService();
export default coinmeService;
