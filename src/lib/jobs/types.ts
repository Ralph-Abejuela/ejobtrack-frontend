// ── Job Application types ──────────────────────────────────────────────────

export enum JobStatus {
	APPLIED = "applied",
	VIEWED = "viewed",
	INTERVIEW = "interview",
	OFFER = "offer",
	REJECTED = "rejected",
	UNKNOWN = "unknown",
}

export enum JobPlatform {
	JOBSTREET = "jobstreet",
	LINKEDIN = "linkedin",
}

export interface JobStatusChange {
	status: JobStatus;
	date: string; // ISO date string
	emailId: string;
}

export interface JobApplication {
	/** Unique id: `${userEmail}:${platform}:${normalisedCompany}:${normalisedJobTitle}` */
	id: string;
	/** The Google account that owns this data */
	userEmail: string;
	platform: JobPlatform;
	jobTitle: string;
	company: string;
	status: JobStatus;
	/** Full email body (cached after first fetch) */
	body: string;
	snippet: string;
	/** Email subject */
	subject: string;
	/** Email from address */
	from: string;
	/** Job posting URL extracted from email body */
	url: string;
	/** ISO date string of latest email */
	date: string;
	/** Email message id (latest email) */
	emailId: string;
	/** When first detected (epoch ms) */
	createdAt: number;
	/** When last updated (epoch ms) */
	updatedAt: number;
	/** History of status changes */
	history: JobStatusChange[];
}

// ── Parser interface ──────────────────────────────────────────────────────

export interface JobPlatformParser {
	/** Unique platform key */
	platform: JobPlatform;
	/** Email addresses this parser handles */
	fromAddresses: string[];
	/**
	 * Parse a full email body + snippet into a JobApplication.
	 * Return null if this email isn't a job application update.
	 */
	parse(email: {
		from: string;
		subject: string;
		snippet: string;
		body: string;
		id: string;
		internalDate: string;
	}): Omit<
		JobApplication,
		"id" | "userEmail" | "createdAt" | "updatedAt" | "history"
	> | null;
}
