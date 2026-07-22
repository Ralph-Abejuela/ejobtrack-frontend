import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { PostHogProvider } from "posthog-js/react";
import { posthog } from "posthog-js";
import "./index.css";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

// ── PostHog analytics ────────────────────────────────────────────────────────
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
if (POSTHOG_KEY) {
	posthog.init(POSTHOG_KEY, {
		api_host: "https://ph.ejobtrack.ralphabejuela.com",
		capture_pageview: "history_change", // SPA route tracking
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
			<PostHogProvider client={posthog}>
				<RouterProvider router={router} />
			</PostHogProvider>
		</StrictMode>,
	);
}
