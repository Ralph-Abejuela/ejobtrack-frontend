/* eslint-disable react-refresh/only-export-components */

import {
	createContext,
	useContext,
	useState,
	useCallback,
	type ReactNode,
	useEffect,
	useRef,
} from "react";
import { setOnUnauthorized } from "./gmail";
import { capture, identifyUser } from "./analytics";

// ── Types ──────────────────────────────────────────────────────────────────

export interface GoogleUser {
	sub: string;
	email: string;
	name: string;
	picture: string;
	given_name: string;
	family_name: string;
}

interface AuthState {
	/** Decoded ID token payload */
	user: GoogleUser | null;
	/** Raw ID token JWT */
	idToken: string | null;
	/** OAuth access token for Gmail API */
	accessToken: string | null;
	/** True while initialising GSI on mount */
	loading: boolean;
	/** True while requesting Gmail OAuth scope */
	requestingScope: boolean;
	/** True once google.accounts.id.initialize() has been called */
	gsiReady: boolean;
}

interface AuthContextValue extends AuthState {
	signOut: () => void;
	/** Request gmail.readonly access token (prompts consent if first time) */
	requestGmailScope: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ── JWT decode helper (no deps needed) ───────────────────────────────────

function decodeJwtPayload(token: string): GoogleUser | null {
	try {
		const base64 = token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/");
		const json = atob(base64);
		return JSON.parse(json) as GoogleUser;
	} catch {
		console.warn("[auth] Failed to decode JWT token");
		return null;
	}
}

// ── Provider ──────────────────────────────────────────────────────────────

const SESSION_KEY = "ejobtrack_google_session";

function restoreSession(): AuthState {
	try {
		const saved = sessionStorage.getItem(SESSION_KEY);
		if (saved) {
			const parsed = JSON.parse(saved) as {
				idToken: string;
				accessToken: string | null;
			};
			const user = decodeJwtPayload(parsed.idToken);
			if (user) {
				return {
					user,
					idToken: parsed.idToken,
					accessToken: parsed.accessToken,
					loading: false,
					requestingScope: false,
					gsiReady: false,
				};
			}
		}
	} catch {
		console.warn("[auth] Corrupt session, ignoring");
	}
	return {
		user: null,
		idToken: null,
		accessToken: null,
		loading: false,
		requestingScope: false,
		gsiReady: false,
	};
}

export function AuthProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<AuthState>(restoreSession);

	const gmailTokenClientRef = useRef<google.accounts.oauth2.TokenClient | null>(
		null,
	);

	// --- Persist to sessionStorage ---
	const persist = useCallback((idToken: string, accessToken: string | null) => {
		sessionStorage.setItem(
			SESSION_KEY,
			JSON.stringify({ idToken, accessToken }),
		);
	}, []);

	// --- GSI credential callback ---
	const handleCredentialResponse = useCallback(
		(response: google.accounts.id.CredentialResponse) => {
			const user = decodeJwtPayload(response.credential);
			if (!user) return;

			setState((prev) => ({
				...prev,
				user,
				idToken: response.credential,
				loading: false,
			}));
			persist(response.credential, null);
			identifyUser(user.email);
			capture("user_signed_in", { email: user.email });

			// Create token client for Gmail scope (lazy – user must click "read email" to trigger)
			gmailTokenClientRef.current = google.accounts.oauth2.initTokenClient({
				client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
				scope: "https://www.googleapis.com/auth/gmail.readonly",
				callback: (tokenResponse) => {
					if (tokenResponse && tokenResponse.access_token) {
						setState((prev) => ({
							...prev,
							accessToken: tokenResponse.access_token,
							requestingScope: false,
						}));
						persist(response.credential, tokenResponse.access_token);
					} else {
						setState((prev) => ({ ...prev, requestingScope: false }));
					}
				},
			});
		},
		[persist],
	);

	// --- Initialise GSI on mount ---
	useEffect(() => {
		// If already signed in from session, skip GSI init
		if (state.user) return;

		function initGSI() {
			if (typeof google === "undefined" || !google.accounts?.id) return;
			google.accounts.id.initialize({
				client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
				use_fedcm_for_button: true,
				callback: handleCredentialResponse,
			});
			setState((prev) => ({ ...prev, gsiReady: true }));
			google.accounts.id.prompt();
		}

		// Already loaded?
		if (typeof google !== "undefined" && google.accounts?.id) {
			initGSI();
			return;
		}

		// Wait for the async script to load
		const script = document.querySelector(
			'script[src="https://accounts.google.com/gsi/client"]',
		);
		if (script) {
			script.addEventListener("load", initGSI, { once: true });
			// Fallback: if script already loaded but boostrapped, re-check
			const fallback = setTimeout(initGSI, 2000);
			return () => {
				script.removeEventListener("load", initGSI);
				clearTimeout(fallback);
			};
		}
	}, [handleCredentialResponse, state.user]);

	// Guard: single in-flight refresh at a time
	const refreshingRef = useRef(false);
	const refreshResultRef = useRef<Promise<string | null> | null>(null);

	// --- Sign out ---
	const signOut = useCallback(() => {
		sessionStorage.removeItem(SESSION_KEY);
		setOnUnauthorized(null); // prevent retry loops
		gmailTokenClientRef.current = null;
		refreshingRef.current = false;
		refreshResultRef.current = null;

		setState({
			user: null,
			idToken: null,
			accessToken: null,
			loading: false,
			requestingScope: false,
			gsiReady: true,
		});
	}, []);

	// Wire 401 → try silent token refresh, fall back to signOut
	const refreshAccessToken = useCallback(async (): Promise<string | null> => {
		// Dedup concurrent calls — if a refresh is already in flight, wait for it
		if (refreshingRef.current && refreshResultRef.current) {
			return refreshResultRef.current;
		}

		const promise = new Promise<string | null>((resolve) => {
			refreshingRef.current = true;

			// Timeout guard — if TokenClient callback never fires, don't hang forever
			// Silent iframe auth either resolves in <100ms or never fires (privacy blockers)
			const timeout = setTimeout(() => {
				console.warn("[auth] Token refresh timed out — signing out");
				refreshingRef.current = false;
				refreshResultRef.current = null;
				signOut();
				resolve(null);
			}, 5_000);

			const refreshClient = google.accounts.oauth2.initTokenClient({
				client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
				scope: "https://www.googleapis.com/auth/gmail.readonly",
				prompt: "", // silent — no popup if user already granted
				callback: (tokenResponse) => {
					clearTimeout(timeout);
					refreshingRef.current = false;
					refreshResultRef.current = null;

					if (tokenResponse?.access_token) {
						setState((prev) => ({
							...prev,
							accessToken: tokenResponse.access_token,
						}));
						// Use latest idToken from ref, not stale closure
						setState((prev) => {
							if (prev.idToken)
								persist(prev.idToken, tokenResponse.access_token!);
							return prev;
						});
						resolve(tokenResponse.access_token);
					} else {
						console.warn("[auth] Silent token refresh failed — signing out");
						signOut();
						resolve(null);
					}
				},
			});
			refreshClient.requestAccessToken();
		});

		refreshResultRef.current = promise;
		return promise;
	}, [signOut, persist]);

	useEffect(() => {
		setOnUnauthorized(refreshAccessToken);
	}, [refreshAccessToken]);

	// --- Request Gmail scope (user gesture) ---
	const requestGmailScope = useCallback(async (): Promise<string | null> => {
		// If we already have a token, return it
		if (state.accessToken) return state.accessToken;

		setState((prev) => ({ ...prev, requestingScope: true }));

		return new Promise((resolve) => {
			// Need to create fresh client each time or re-use with overridable config
			const client = google.accounts.oauth2.initTokenClient({
				client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
				scope: "https://www.googleapis.com/auth/gmail.readonly",
				callback: (tokenResponse) => {
					if (tokenResponse && tokenResponse.access_token) {
						setState((prev) => ({
							...prev,
							accessToken: tokenResponse.access_token,
							requestingScope: false,
						}));
						if (state.idToken) {
							persist(state.idToken, tokenResponse.access_token);
						}
						if (state.user) {
							capture("gmail_authorized", {
								email: state.user.email,
							});
						}
						resolve(tokenResponse.access_token);
					} else {
						setState((prev) => ({ ...prev, requestingScope: false }));
						resolve(null);
					}
				},
			});
			client.requestAccessToken();
		});
	}, [state.accessToken, state.idToken, persist]);

	return (
		<AuthContext.Provider value={{ ...state, signOut, requestGmailScope }}>
			{children}
		</AuthContext.Provider>
	);
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
	return ctx;
}
