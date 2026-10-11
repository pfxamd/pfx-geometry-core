export type GeometryErrorCode = 'INVALID_NUMBER' | 'INVALID_DIMENSION' | 'DEGENERATE_GEOMETRY' | 'INVALID_MATRIX' | 'INVALID_MESH' | 'INVALID_CAMERA';
export class GeometryError extends Error { readonly code: GeometryErrorCode; constructor(code: GeometryErrorCode, message: string) { super(message); this.name = 'GeometryError'; this.code = code; } }
export const EPSILON = 1e-12;
export function finite(value: number, name: string): number { if (!Number.isFinite(value)) throw new GeometryError('INVALID_NUMBER', `${name} must be finite`); return value; }
export function positive(value: number, name: string): number { finite(value, name); if (value <= 0) throw new GeometryError('INVALID_DIMENSION', `${name} must be greater than zero`); return value; }
