/**
 * Network topology API contract
 *
 * Response shape of `GET /api/v1/network/directory`. Populated from the
 * on-chain validator + gateway registries. Nodes poll this every 8-10 s
 * to keep their view of the network live.
 *
 * See the server-side contract — kept in sync here so the mobile app can
 * type-check the full directory response instead of relying on loose
 * `any`/`unknown` casts.
 */

export type ValidatorStatus =
  | 'active'
  | 'inactive'
  | 'jailed'
  | 'slashed'
  | string; // future-proof

export type GatewayStatus = 'active' | 'stale' | 'slashed' | string;

export type NodeRole = 'fullvalidator' | 'validator' | 'observer' | 'gateway' | string;

export type AdmissionSource =
  | 'offchain_genesis'
  | 'bootstrap_genesis'
  | 'onchain_governance'
  | string;

export interface TopologySelf {
  /** DID of the node we're connected to. */
  did: string;
  role: NodeRole;
  /** SHA-256 of TLS cert SPKI, hex (for cert pinning). */
  spki_pin: string;
}

export interface TopologyValidator {
  did: string;
  role: 'validator' | string;
  /** IPv4 resolved from hostname at startup. */
  ip: string;
  /** Canonical `host:port` for QUIC dialing. */
  endpoint: string;
  quic_port: number;
  mesh_port: number;
  stake: number;
  status: ValidatorStatus;
  blocks_validated: number;
  last_activity: number;
  commission_rate: number;
  admission: AdmissionSource;
}

export interface TopologyGateway {
  did: string;
  role: 'gateway' | string;
  ip: string;
  endpoint: string;
  quic_port: number;
  zdns_port: number;
  stake: number;
  status: GatewayStatus;
  commission_rate: number;
}

export interface NetworkTopology {
  total_validators: number;
  total_gateways: number;
  connected_peers: number;
  validators: TopologyValidator[];
  gateways: TopologyGateway[];
}

export interface NetworkTopologyResponse {
  network_id: string;
  chain_height: number;
  timestamp: number;
  this_node: TopologySelf;
  topology: NetworkTopology;
}
