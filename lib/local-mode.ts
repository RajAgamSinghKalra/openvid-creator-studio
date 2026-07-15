const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export const LOCAL_ONLY_ENV = process.env.NEXT_PUBLIC_LOCAL_ONLY === "true";
export const LOCAL_ONLY_DEFAULT = LOCAL_ONLY_ENV || process.env.NODE_ENV === "development";

export function isLocalHostname(hostname: string): boolean {
    return LOCAL_HOSTNAMES.has(hostname.toLowerCase());
}

/**
 * Development is local-only by default. A production build can opt in with
 * NEXT_PUBLIC_LOCAL_ONLY=true, which is useful for `next start` on a machine
 * that should never depend on hosted services.
 */
export function isLocalOnlyBrowser(): boolean {
    if (LOCAL_ONLY_DEFAULT) return true;
    return typeof window !== "undefined" && isLocalHostname(window.location.hostname);
}
