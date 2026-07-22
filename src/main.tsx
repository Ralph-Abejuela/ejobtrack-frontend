import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { PostHogProvider } from "posthog-js/react";
import { posthog } from "posthog-js";
import "./index.css";
import { ErrorBoundary } from "./components/ErrorBoundary";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

// ── PostHog analytics ────────────────────────────────────────────────────────
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
if (POSTHOG_KEY) {
	posthog.init(POSTHOG_KEY, {
		api_host: "https://ph-proxy.abejuela-ralph-balatucan.workers.dev",
		capture_pageview: "history_change", // SPA route tracking
		advanced_disable_decide: true, // kill toolbar + feature flags (not needed)
		advanced_disable_toolbar_metrics: true,
		loaded: (ph) => {
			if (import.meta.env.DEV) ph.opt_out_capturing(); // no dev noise
		},
	});
}

// Create a new router instance
const router = createRouter({ routeTree, basepath: "/" });

// Register the router instance for type safety
declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

// Render the app
const rootElement = document.getElementById("root")!;
if (!rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement);
	root.render(
		<StrictMode>
			<ErrorBoundary>
				<PostHogProvider client={posthog}>
					<RouterProvider router={router} />
				</PostHogProvider>
			</ErrorBoundary>
		</StrictMode>,
	);
}
