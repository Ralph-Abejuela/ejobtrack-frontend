import { JobStatus, type JobPlatformParser } from "./types";

// ── Detection keywords ─────────────────────────────────────────────────────

const JOB_KEYWORDS = [
	// Application confirmation
	"your application",
	"thank you for applying",
	"thank you for your interest",
	"we received your application",
	"application has been received",
	"application confirmation",
	"application was sent",
	"successfully submitted",
	"we have received your cv",
	"we have received your resume",
	"resume received",
	"cv received",
	"regarding your application",
	"application to",
	"application for",
	"application update",
	"application status",

	// Recruitment / outreach
	"hiring manager",
	"recruitment",
	"recruiter",
	"talent acquisition",
	"job opportunity",
	"career opportunity",
	"position at",

	// Interview
	"interview invitation",
	"interview schedule",
	"interview with",
	"invite you to interview",
	"phone screen",
	"technical interview",

	// Rejection
	"unlikely to progress",
	"will not be moving forward",
	"position has been filled",
	"application was unsuccessful",
	"pursue other opportunities",
	"after careful consideration",

	// Offer
	"job offer",
	"offer letter",
	"employment offer",
	"conditional offer",
	"offer of employment",
	"we're excited to offer you",
	"we are pleased to offer",
] as const;

// ── Status confidence scoring ──────────────────────────────────────────────

const STATUS_PATTERNS: {
	pattern: RegExp;
	status: JobStatus;
	weight: number;
}[] = [
	// ── Applied ──
	{ pattern: /successfully submitted/i, status: JobStatus.APPLIED, weight: 1 },
	{ pattern: /application was sent/i, status: JobStatus.APPLIED, weight: 1 },
	{
		pattern: /we received your application/i,
		status: JobStatus.APPLIED,
		weight: 1,
	},
	{ pattern: /thank you for applying/i, status: JobStatus.APPLIED, weight: 1 },
	{
		pattern: /thank you for your interest/i,
		status: JobStatus.APPLIED,
		weight: 1,
	},
	{
		pattern: /application has been received/i,
		status: JobStatus.APPLIED,
		weight: 1,
	},
	{
		pattern: /application confirmation/i,
		status: JobStatus.APPLIED,
		weight: 1,
	},
	{ pattern: /resume received/i, status: JobStatus.APPLIED, weight: 1 },
	{ pattern: /cv received/i, status: JobStatus.APPLIED, weight: 1 },

	// ── Viewed ──
	{
		pattern: /has viewed your application/i,
		status: JobStatus.VIEWED,
		weight: 1,
	},
	{
		pattern: /reviewed your application/i,
		status: JobStatus.VIEWED,
		weight: 1,
	},
	{
		pattern: /application has been viewed/i,
		status: JobStatus.VIEWED,
		weight: 1,
	},
	{
		pattern: /interested in your profile/i,
		status: JobStatus.VIEWED,
		weight: 1,
	},

	// ── Interview ──
	{ pattern: /interview invitation/i, status: JobStatus.INTERVIEW, weight: 2 },
	{ pattern: /schedule an interview/i, status: JobStatus.INTERVIEW, weight: 2 },
	{
		pattern: /invite you to interview/i,
		status: JobStatus.INTERVIEW,
		weight: 2,
	},
	{ pattern: /interview you for/i, status: JobStatus.INTERVIEW, weight: 2 },
	{ pattern: /phone screen/i, status: JobStatus.INTERVIEW, weight: 2 },
	{ pattern: /technical interview/i, status: JobStatus.INTERVIEW, weight: 2 },

	// ── Offer ──
	{ pattern: /job offer/i, status: JobStatus.OFFER, weight: 2 },
	{ pattern: /offer letter/i, status: JobStatus.OFFER, weight: 2 },
	{ pattern: /employment offer/i, status: JobStatus.OFFER, weight: 2 },
	{ pattern: /conditional offer/i, status: JobStatus.OFFER, weight: 2 },
	{ pattern: /offer of employment/i, status: JobStatus.OFFER, weight: 2 },
	{
		pattern: /we(?:'re| are) (?:excited|pleased) to offer/i,
		status: JobStatus.OFFER,
		weight: 2,
	},

	// ── Rejected ──
	{ pattern: /unlikely to progress/i, status: JobStatus.REJECTED, weight: 2 },
	{
		pattern: /will not be moving forward/i,
		status: JobStatus.REJECTED,
		weight: 2,
	},
	{
		pattern: /position has been filled/i,
		status: JobStatus.REJECTED,
		weight: 2,
	},
	{
		pattern: /application was unsuccessful/i,
		status: JobStatus.REJECTED,
		weight: 2,
	},
	{
		pattern: /pursue other opportunities/i,
		status: JobStatus.REJECTED,
		weight: 2,
	},
	{
		pattern: /not proceeding with your application/i,
		status: JobStatus.REJECTED,
		weight: 2,
	},
	{
		pattern: /unfortunately.*(?:not|decline|rejected)/i,
		status: JobStatus.REJECTED,
		weight: 2,
	},
	{
		pattern: /after careful consideration.*(?:not|other)/i,
		status: JobStatus.REJECTED,
		weight: 2,
	},
];

// ── Company extraction ─────────────────────────────────────────────────────

/** Extract company name from sender's display name or domain. */
function extractCompanyName(
	emailDomain: string,
	fromDisplay: string,
	subject: string,
	body: string,
): string {
	// 1. Try "at {Company}" patterns in subject/body
	const atMatch =
		subject.match(/\bposition\s+at\s+(.+?)(?:\s+[–\-—]|\s*$)/i) ||
		subject.match(/\bat\s+(.+?)(?:\s*(?:–|\-|—)\s*|\s*$)/i) ||
		body.match(/\bposition\s+at\s+(.+?)(?:[\.,!\n]|$)/i);

	if (atMatch) {
		const name = atMatch[1].trim();
		// Remove trailing role/job words if present
		return name.replace(/\s+(?:role|job|opportunity|in|the)$/i, "").trim();
	}

	// 2. Try sender display name (before the email in From header)
	if (fromDisplay && fromDisplay.length > 2 && fromDisplay.length < 60) {
		// Filter out email-ish and generic names
		const lower = fromDisplay.toLowerCase();
		if (
			!lower.includes("@") &&
			!["linkedin", "jobstreet", "noreply", "no-reply", "notification"].some(
				(g) => lower.includes(g),
			)
		) {
			return fromDisplay.trim();
		}
	}

	// 3. Fallback to domain name without TLD
	return domainToCompany(emailDomain);
}

/** Convert an email domain (e.g. "greenhouse.io") to a company name. */
function domainToCompany(domain: string): string {
	const parts = domain.split(".");
	// Common known generic domains — return as-is
	const generic = [
		"gmail",
		"yahoo",
		"outlook",
		"hotmail",
		"icloud",
		"proton",
		"aol",
	];
	const name = parts[0];
	if (generic.includes(name)) return domain; // Can't extract from personal email domains
	return name.charAt(0).toUpperCase() + name.slice(1);
}

// ── Job title extraction ───────────────────────────────────────────────────

function extractJobTitle(subject: string, body: string): string | null {
	// 1. Try subject: "for {Title}", "to {Title}", "as {Title}"
	const titleMatch =
		subject.match(
			/\b(?:for|as|to)\s+(.+?)(?:\s+position|\s+role|\s+at|\s+(?:with|in)\s+|$)/i,
		) ||
		subject.match(
			/(your\s+)?application\s+(?:for|to)\s+(.+?)(?:\s+position|\s+role|\s+at|\s+(?:with|in)\s+|$)/i,
		);

	if (titleMatch) {
		const title = (titleMatch[2] || titleMatch[1]).trim();
		if (title.length > 3 && title.length < 120) return title;
	}

	// 2. Try body: "application for {Title}", "position as {Title}"
	const bodyTitleMatch =
		body.match(
			/(?:your\s+)?application\s+(?:for|to)\s+(.+?)(?:\s+position|\s+role|\s+at|\s*$)/i,
		) ||
		body.match(
			/(?:the\s+)?position\s+(?:as|of)\s+(.+?)(?:\s+(?:at|with)\s+|[.,!]|\s*$)/i,
		);

	if (bodyTitleMatch) {
		const title = bodyTitleMatch[1].trim();
		if (title.length > 3 && title.length < 120) return title;
	}

	return null;
}

// ── Email extraction ───────────────────────────────────────────────────────

/** Extract email address from a From header like "Name <email@domain.com>". */
export function extractEmail(from: string): string {
	const match = from.match(/<([^>]+)>/);
	return match ? match[1].trim().toLowerCase() : from.trim().toLowerCase();
}

/** Extract the display name from From header, if any. */
export function extractDisplayName(from: string): string {
	const match = from.match(/^([^<]+)</);
	return match ? match[1].trim() : "";
}

/** Get the email domain from an email address. */
export function extractDomain(email: string): string {
	const atIdx = email.lastIndexOf("@");
	if (atIdx === -1) return email;
	return email.slice(atIdx + 1).toLowerCase();
}

// ── Helper: check if email is a job application ────────────────────────────

function isJobEmail(subject: string, body: string): boolean {
	const text = `${subject} ${body}`.toLowerCase();
	return JOB_KEYWORDS.some((kw) => text.includes(kw));
}

// ── Helper: confidence-scored status ───────────────────────────────────────

function scoreStatus(subject: string, body: string): JobStatus {
	const text = `${subject} ${body}`;

	const total: Record<string, number> = {};
	for (const p of STATUS_PATTERNS) {
		if (p.pattern.test(text)) {
			total[p.status] = (total[p.status] || 0) + p.weight;
		}
	}

	let bestStatus = JobStatus.APPLIED;
	let bestScore = 0;

	for (const [status, score] of Object.entries(total)) {
		if (score > bestScore) {
			bestScore = score;
			bestStatus = status as JobStatus;
		}
	}

	return bestStatus;
}

// ── Generic parser ─────────────────────────────────────────────────────────

export const genericParser: JobPlatformParser = {
	platform: "generic",
	fromAddresses: [], // Matches all senders — invoked as fallback
	parse(email) {
		// Merge bodyClean (sanitized HTML) into body for richer text scanning
		const richBody = email.bodyClean
			? `${email.body} ${email.bodyClean}`
			: email.body;

		// Skip if not a job-related email
		if (!isJobEmail(email.subject, richBody)) return null;

		const rawEmail = extractEmail(email.from);
		const domain = extractDomain(rawEmail);
		const displayName = extractDisplayName(email.from);
		const company = extractCompanyName(
			domain,
			displayName,
			email.subject,
			richBody,
		);
		const status = scoreStatus(email.subject, richBody);
		const jobTitle =
			extractJobTitle(email.subject, richBody) || "Unknown Position";
		const url = extractAnyUrl(richBody);

		return [
			{
				platform: domain,
				jobTitle,
				company,
				status,
				body: email.body,
				snippet: email.snippet,
				subject: email.subject,
				from: email.from,
				url,
				date: new Date(Number(email.internalDate)).toISOString(),
				emailId: email.id,
			},
		];
	},
};

/** Extract any job-related URL from body (ATS links, greenhouse, etc.). */
function extractAnyUrl(body: string): string {
	const atsDomains = [
		"greenhouse.io",
		"ashbyhq.com",
		"smartrecruiters.com",
		"myworkdayjobs.com",
		"lever.co",
		"icims.com",
		"jobvite.com",
		"bamboohr.com",
		"applytojob.com",
		"workable.com",
	];

	// Try known ATS domains first
	for (const domain of atsDomains) {
		const regex = new RegExp(
			`https?:\\/\\/[^\\s]*${domain.replace(".", "\\.")}[^\\s]*`,
			"i",
		);
		const match = body.match(regex);
		if (match) return match[0];
	}

	// Generic: find a "View job" link
	const viewJobMatch = body.match(
		/view\s+(?:this\s+)?job:\s*(https?:\/\/[^\s]+)/i,
	);
	if (viewJobMatch) return viewJobMatch[1];

	return "";
}
