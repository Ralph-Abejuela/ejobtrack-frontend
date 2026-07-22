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
		// corrupt session, ignore
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

		// Wait for GSI lib to load
		let attempts = 0;
		const interval = setInterval(() => {
			if (typeof google !== "undefined" && google.accounts?.id) {
				clearInterval(interval);
				google.accounts.id.initialize({
					client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
					use_fedcm_for_button: true,
					callback: handleCredentialResponse,
				});
				setState((prev) => ({ ...prev, gsiReady: true }));
				// One Tap prompt for returning FedCM users
				google.accounts.id.prompt();
			}
			if (++attempts > 20) clearInterval(interval); // 2s timeout
		}, 100);

		return () => clearInterval(interval);
	}, [handleCredentialResponse, state.user]);

	// --- Sign out ---
	const signOut = useCallback(() => {
		sessionStorage.removeItem(SESSION_KEY);

		// Revoke access token if present
		if (state.accessToken) {
			try {
				google.accounts.oauth2.revoke(state.accessToken, () => {});
			} catch {
				/* ignore */
			}
		}

		// Revoke ID token
		if (state.idToken) {
			try {
				google.accounts.id.revoke(state.idToken, () => {});
			} catch {
				/* ignore */
			}
		}

		setState({
			user: null,
			idToken: null,
			accessToken: null,
			loading: false,
			requestingScope: false,
			gsiReady: true,
		});
		gmailTokenClientRef.current = null;
	}, [state.accessToken, state.idToken]);

	// Wire 401 → signOut
	useEffect(() => {
		setOnUnauthorized(signOut);
	}, [signOut]);

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
