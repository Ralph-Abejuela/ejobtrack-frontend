import type { JobPlatformParser, JobApplication } from "./types";
import { jobstreetParser } from "./jobstreet";
import { linkedinParser } from "./linkedin";
import { indeedParser } from "./indeed";
import { genericParser, extractEmail } from "./generic";

/**
 * Emails whose full From header matches these strings are skipped entirely.
 * Format: "Sender Name <sender@email.com>" — the same as Gmail's From header.
 * Add new non-job senders here as they appear.
 */
const IGNORE_SENDERS = [
	"LinkedIn <jobs-listings@linkedin.com>",
	"Jobstreet Reminders <noreply@e.jobstreet.com>",
	".*<linkedin@em.linkedin.com>",
	"LinkedIn <updates-noreply@linkedin.com>",
	"Jobstreet Onboarding <noreply@e.jobstreet.com>",
	"LiNa Recommendations <noreply@e.jobstreet.com>",
	"LinkedIn <billing-noreply@linkedin.com>",
	"SEEK Pass Support <support@seekpass.co>",
	"LinkedIn <career-interests-noreply@linkedin.com>",
	"LinkedIn <messages-noreply@linkedin.com>",
	"DigitalOcean <team@info.digitalocean.com>",
	"LinkedIn <editors-noreply@linkedin.com>",
	".*<invitations@linkedin.com>"
];

/** Registry of all platform-specific parsers. Add new parsers here. */
const platformParsers: JobPlatformParser[] = [
	jobstreetParser,
	linkedinParser,
	indeedParser,
];

/** Map from email from-address to the matching parser. */
const fromMap = new Map<string, JobPlatformParser>();
for (const p of platformParsers) {
	for (const addr of p.fromAddresses) {
		fromMap.set(addr.toLowerCase(), p);
	}
}

/** Find a platform-specific parser by email address. */
function findPlatformParser(emailAddr: string): JobPlatformParser | undefined {
	return fromMap.get(emailAddr.toLowerCase());
}

/**
 * Run platform-specific parsers first, then fall back to generic parser.
 * Returns the first match or null.
 */
export function parseEmail(email: {
	from: string;
	subject: string;
	snippet: string;
	body: string;
	bodyHtml?: string;
	id: string;
	internalDate: string;
}):
	| Omit<
			JobApplication,
			"id" | "userEmail" | "createdAt" | "updatedAt" | "history"
	  >[]
	| null {
	// Skip known non-job senders (full From header match)
	if (
		IGNORE_SENDERS.some(
			(s) => email.from.trim().toLowerCase().match(s.toLowerCase()))
	) {
		return null;
	}

	const emailAddr = extractEmail(email.from);
	if (!emailAddr) return null;

	// 1. Try platform-specific parsers
	const platformParser = findPlatformParser(emailAddr);
	if (platformParser) {
		// Check ignore patterns before parsing
		const ignoreText = `${email.subject} ${email.snippet}`;
		if (platformParser.ignorePatterns?.some((p) => p.test(ignoreText))) {
			return null;
		}
		const result = platformParser.parse(email);
		if (result && result.length > 0) return result;
	}

	// 2. Fall back to generic parser
	const result = genericParser.parse(email);
	if (result && result.length > 0) return result;
	return null;
}

export { platformParsers as parsers };
