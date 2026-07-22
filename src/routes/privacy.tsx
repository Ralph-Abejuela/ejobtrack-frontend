import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
	component: PrivacyPage,
});

function PrivacyPage() {
	return (
		<div className="mx-auto max-w-2xl space-y-6 py-8">
			<Link
				to="/"
				className="text-sm text-muted-foreground hover:text-foreground"
			>
				&larr; Back to ejobtrack
			</Link>

			<h1 className="text-2xl font-bold">Privacy Policy</h1>
			<p className="text-sm text-muted-foreground">Last updated: July 2026</p>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">Data Collection</h2>
				<p>
					ejobtrack is a browser-only application. No backend server stores or
					processes your data. All information retrieved from your Gmail account
					is stored exclusively in your browser's IndexedDB and never
					transmitted to any server.
				</p>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">Gmail Access</h2>
				<p>
					With your explicit consent, ejobtrack requests read-only access to
					your Gmail inbox to scan for job application emails. This access is
					used solely to:
				</p>
				<ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
					<li>Identify and parse job application confirmation emails</li>
					<li>
						Track status changes (application received, viewed, interview,
						offer, rejection)
					</li>
					<li>Display a dashboard of your job applications</li>
				</ul>
				<p>
					Full email bodies are fetched only when you expand an email in the
					timeline view. No email content is sent to any external service.
				</p>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">On-Device AI</h2>
				<p>
					Email classification uses a transformer ML model that runs entirely in
					your browser. No email data is sent to external AI services or APIs.
				</p>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">Analytics</h2>
				<p>
					ejobtrack uses PostHog for anonymous usage analytics (page views,
					feature usage). All identifying information (email addresses) is
					SHA-256 hashed before transmission. You can opt out by removing the
					VITE_POSTHOG_KEY environment variable.
				</p>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">Third-Party Services</h2>
				<p>The only external services ejobtrack communicates with are:</p>
				<ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
					<li>
						<strong>Google Gmail API</strong> -- for reading email metadata
						(read-only scope)
					</li>
					<li>
						<strong>Google Identity Services</strong> -- for authentication
					</li>
					<li>
						<strong>PostHog</strong> -- anonymized analytics (optional)
					</li>
				</ul>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">Data Deletion</h2>
				<p>
					Since all data is stored locally in your browser's IndexedDB, you can
					delete it at any time by clearing your browser data for this site. No
					data exists on any server to request deletion from.
				</p>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">Contact</h2>
				<p>
					For questions about this privacy policy, open an issue on the
					<a
						href="https://github.com/Ralph-Abejuela/ejobtrack"
						className="text-primary hover:underline"
					>
						{" "}
						GitHub repository
					</a>
					.
				</p>
			</section>
		</div>
	);
}
