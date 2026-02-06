export function maskIdentifier(value?: string | null): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '<empty>';
  const core = trimmed.replace(/^did:[^:]*:/, '');
  if (core.length <= 8) return core;
  return `${core.slice(0, 4)}…${core.slice(-4)}`;
}
