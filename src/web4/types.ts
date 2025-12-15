export type Web4ContentMode = 'static' | 'spa' | 'hybrid';

export interface ManifestFile {
  cid: string;
  size: number;
  content_type: string;
  integrity?: string | null;
}

export interface Web4Manifest {
  domain: string;
  version: number;
  previous_manifest?: string | null;
  build_hash: string;
  files: Record<string, ManifestFile>;
  created_at: number;
  created_by: string;
  message?: string | null;
  // Mobile-specific extensions (published by site owners)
  spa?: boolean;
  spa_fallback?: string;
  mode?: Web4ContentMode;
}

export interface Web4ResolveResult {
  manifestCid: string;
  manifest: Web4Manifest;
}
