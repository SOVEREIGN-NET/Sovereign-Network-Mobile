/**
 * NetworkTopologyService — fetches the live validator + gateway topology.
 *
 * Endpoint: `GET /api/v1/network/directory` (public QUIC, no auth).
 * Response shape: see `src/types/networkTopology.ts`.
 *
 * This is a thin wrapper over `publicQuicRequest` that validates the
 * response has the expected top-level fields before returning it. Callers
 * get a typed `NetworkTopologyResponse` or `null` on any failure.
 */

import { publicQuicRequest } from './quic';
import type { NetworkTopologyResponse } from '../types/networkTopology';

const TOPOLOGY_PATH = '/api/v1/network/directory';

function isValid(data: unknown): data is NetworkTopologyResponse {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  const topo = d.topology as Record<string, unknown> | undefined;
  return (
    typeof d.network_id === 'string' &&
    typeof d.chain_height === 'number' &&
    typeof d.timestamp === 'number' &&
    !!topo &&
    Array.isArray(topo.validators) &&
    Array.isArray(topo.gateways)
  );
}

class NetworkTopologyService {
  async fetchTopology(): Promise<NetworkTopologyResponse | null> {
    try {
      const data = await publicQuicRequest<NetworkTopologyResponse>(
        TOPOLOGY_PATH,
      );
      if (!isValid(data)) {
        console.warn('[NetworkTopology] unexpected response shape');
        return null;
      }
      return data;
    } catch (err) {
      console.warn('[NetworkTopology] fetch failed:', err);
      return null;
    }
  }
}

const networkTopologyService = new NetworkTopologyService();
export default networkTopologyService;
export { NetworkTopologyService };
