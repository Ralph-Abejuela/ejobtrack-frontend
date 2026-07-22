/**
 * Analytics module — thin wrapper around PostHog.
 * All identifying information (email) is SHA-256 hashed before sending.
 * PostHog sees only anonymous hashes — unique user counts still work.
 */
import { posthog } from "posthog-js";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;

/** True when PostHog is configured and ready. */
export const analyticsEnabled = !!POSTHOG_KEY;

/**
 * SHA-256 hash a string to anonymize identifying data.
 * Async but fast — Web Crypto is built into all modern browsers.
 */
export async function hashId(value: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(value);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Identify user by hashed email. PostHog sees only the hash as distinct_id.
 * No name, no raw email — just an anonymous fingerprint for unique user counts.
 */
export async function identifyUser(email: string): Promise<void> {
	if (!analyticsEnabled) return;
	const hash = await hashId(email);
	posthog.identify(hash, {});
}

/**
 * Track a custom event with optional properties.
 * If `email` is in properties, hash it before sending.
 */
export async function capture(
	event: string,
	properties?: Record<string, string | number | boolean>,
): Promise<void> {
	if (!analyticsEnabled) return;
	const sanitized: Record<string, string | number | boolean> = {};

	if (properties) {
		for (const [key, value] of Object.entries(properties)) {
			// Hash any property named "email" or "user" to anonymize
			if ((key === "email" || key === "user") && typeof value === "string") {
				sanitized[key] = await hashId(value);
			} else {
				sanitized[key] = value;
			}
		}
	}

	posthog.capture(event, sanitized);
}
