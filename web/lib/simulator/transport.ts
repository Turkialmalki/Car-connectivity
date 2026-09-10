/**
 * How the simulator talks to the backend.
 *
 * The interface exists so the transport can change without the simulation
 * changing. Today there is one implementation, over HTTPS. An MQTT adapter
 * would implement the same four calls against a broker — publish telemetry to a
 * state topic, subscribe to a command topic, publish results — and the engine,
 * the runner and the console would not know the difference.
 */
import type { CommandType } from '../vehicle/commands';
import type { ReportedVehicleState } from '../vehicle/state';

export type ClaimedCommand = {
  id: string;
  vehicleId: string;
  type: CommandType;
  payload: Record<string, unknown>;
  requestedAt: string;
  expiresAt: string;
  correlationId: string;
};

export type CommandResultReport = {
  status: 'succeeded' | 'failed' | 'rejected';
  failureCode?: string;
  failureReason?: string;
  observedAt?: string;
  reported?: ReportedVehicleState;
  detail?: Record<string, string | number | boolean>;
};

export type TelemetryAck = {
  accepted: boolean;
  revision: number;
  /** True when the server already held a newer report than the one sent. */
  stale?: boolean;
};

export interface SimulatorTransport {
  /** The vehicle this transport is bound to, from the session it authenticated with. */
  readonly vehicleId: string;
  sendTelemetry(observedAt: string, reported: ReportedVehicleState): Promise<TelemetryAck>;
  claimCommand(): Promise<ClaimedCommand | null>;
  reportResult(commandId: string, result: CommandResultReport): Promise<void>;
  close(): Promise<void>;
}

export class TransportError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'TransportError';
  }

  /** A session that is gone will not come back by retrying. */
  get isFatal(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

export type HttpTransportOptions = {
  baseUrl: string;
  token: string;
  vehicleId: string;
  fetchImpl?: typeof fetch;
};

export class HttpSimulatorTransport implements SimulatorTransport {
  readonly vehicleId: string;
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly doFetch: typeof fetch;

  constructor(options: HttpTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.token = options.token;
    this.vehicleId = options.vehicleId;
    this.doFetch = options.fetchImpl ?? fetch;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.doFetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.token}`,
        ...(init.headers ?? {}),
      },
    });

    const text = await response.text();
    const body: unknown = text ? JSON.parse(text) : {};

    if (!response.ok) {
      const error = (body as { error?: { code?: string; message?: string } }).error;
      throw new TransportError(
        error?.message ?? `Request failed with ${response.status}`,
        response.status,
        error?.code,
      );
    }

    return body as T;
  }

  async sendTelemetry(observedAt: string, reported: ReportedVehicleState): Promise<TelemetryAck> {
    try {
      const body = await this.request<{ accepted: boolean; revision: number }>(
        '/api/simulator/telemetry',
        { method: 'POST', body: JSON.stringify({ observedAt, reported }) },
      );
      return { accepted: body.accepted, revision: body.revision };
    } catch (error) {
      // A stale report is a normal race, not a failure to recover from: the
      // server already has something newer, and the next tick will be newer still.
      if (error instanceof TransportError && error.code === 'stale_report') {
        return { accepted: false, revision: 0, stale: true };
      }
      throw error;
    }
  }

  async claimCommand(): Promise<ClaimedCommand | null> {
    const body = await this.request<{ command: ClaimedCommand | null }>(
      '/api/simulator/commands/claim',
      { method: 'POST' },
    );
    return body.command;
  }

  async reportResult(commandId: string, result: CommandResultReport): Promise<void> {
    await this.request(`/api/simulator/commands/${commandId}/result`, {
      method: 'POST',
      body: JSON.stringify(result),
    });
  }

  async close(): Promise<void> {
    try {
      await this.request('/api/simulator/sessions', { method: 'DELETE' });
    } catch {
      // Closing is best-effort. The session expires on its own, and a failed
      // hang-up must not stop the page from unloading.
    }
  }
}

/** Opens a session with a user access token and returns a bound transport. */
export const openHttpTransport = async (options: {
  baseUrl: string;
  accessToken: string;
  vehicleId: string;
  ttlSeconds?: number;
  label?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ transport: HttpSimulatorTransport; expiresAt: string; sessionId: string }> => {
  const doFetch = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, '');

  const response = await doFetch(`${baseUrl}/api/simulator/sessions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${options.accessToken}`,
    },
    body: JSON.stringify({
      vehicleId: options.vehicleId,
      ttlSeconds: options.ttlSeconds ?? 1800,
      label: options.label,
    }),
  });

  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string } }).error;
    throw new TransportError(
      error?.message ?? 'Could not open a simulator session.',
      response.status,
      error?.code,
    );
  }

  const session = (body as { session: { id: string; token: string; expiresAt: string } }).session;

  return {
    transport: new HttpSimulatorTransport({
      baseUrl,
      token: session.token,
      vehicleId: options.vehicleId,
      fetchImpl: options.fetchImpl,
    }),
    expiresAt: session.expiresAt,
    sessionId: session.id,
  };
};
