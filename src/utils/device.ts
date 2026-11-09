export const isAndroid = (): boolean => /Android/i.test(navigator.userAgent);
export const isIOS = (): boolean => /iPhone|iPad|iPod/i.test(navigator.userAgent);
export const isMobile = (): boolean =>
  (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile ??
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const isStandalone = (): boolean =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export interface WebGLInfo {
  supported: boolean;
  webgl2: boolean;
  renderer: string | null;
  vendor: string | null;
}

let cachedGL: WebGLInfo | null = null;

/** Creates a throwaway context to detect WebGL support and the real GPU string. */
export function detectWebGL(): WebGLInfo {
  if (cachedGL) return cachedGL;
  const info: WebGLInfo = { supported: false, webgl2: false, renderer: null, vendor: null };
  try {
    const canvas = document.createElement('canvas');
    const gl2 = canvas.getContext('webgl2');
    const gl = (gl2 ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (gl) {
      info.supported = true;
      info.webgl2 = !!gl2;
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      info.renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
      info.vendor = dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    /* unsupported */
  }
  cachedGL = info;
  return info;
}

export function isLocalOrigin(origin: string = window.location.origin): boolean {
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]' ||
      hostname.endsWith('.local') ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    );
  } catch {
    return true;
  }
}
