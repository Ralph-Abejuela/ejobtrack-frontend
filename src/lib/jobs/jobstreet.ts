import { JobPlatform, JobStatus, type JobPlatformParser } from "./types";

/**
 * Parser for JobStreet application emails (noreply@e.jobstreet.com).
 *
 * Email types detected:
 *   - Application submitted (confirmation)
 *   - Application viewed (employer viewed resume)
 *   - Application rejected / unsuccessful
 *   - Interview invitation
 *
 * Patterns used (subject, snippet, body):
 *   - Subject: "Your application was successfully submitted"
 *   - Subject: "{Company} has viewed your application for {Role}"
 *   - Subject: "Application update for {Role} at {Company}"
 *   - Snippet/Body: "your application for {Role} was successfully submitted to {Company}"
 *   - Snippet/Body: "your application for {Role} advertised by {Company}"
 *   - Snippet/Body: "your application for {Role} is unlikely to progress"
 *   - Snippet/Body: "it appears your application for {Role}"
 *   - Snippet/Body: "{Company} has viewed your application for {Role}"
 *   - Snippet/Body: "{Company} viewed your application for {Role}"
 *   - Snippet/Body: "interest in the {Role} (position|job) at {Company}"
 *   - Snippet/Body: "position as {Role} at {Company}"
 */
export const jobstreetParser: JobPlatformParser = {
	platform: JobPlatform.JOBSTREET,
	fromAddresses: ["noreply@e.jobstreet.com"],

	parse(email) {
		const { subject, snippet, body } = email;

		let jobTitle = "";
		let company = "";
		let status = JobStatus.APPLIED;

		const lowerSubject = subject.toLowerCase().replace(/\s+/g, " ");
		const lowerSnippet = snippet.toLowerCase().replace(/\s+/g, " ");
		const lowerBody = body.toLowerCase().replace(/\s+/g, " ");

		// ── Status detection: check subject first ──

		// Viewed subject: "{Company} has viewed your application for {Role}"
		const viewedSubjectMatch = lowerSubject.match(
			/(.+?)\s+has viewed your application\s+(?:for\s+(.+?))?$/i,
		);
		if (viewedSubjectMatch) {
			company = viewedSubjectMatch[1].trim();
			jobTitle = (viewedSubjectMatch[2] ?? "").trim();
			status = JobStatus.VIEWED;
		}

		// Application update (could be rejection or interview) — check body later
		const updateSubjectMatch = lowerSubject.match(
			/application update (?:for\s+(.+?)\s+(?:at|with)\s+(.+?))?$/i,
		);
		if (updateSubjectMatch) {
			if (updateSubjectMatch[1]) jobTitle = updateSubjectMatch[1].trim();
			if (updateSubjectMatch[2]) company = updateSubjectMatch[2].trim();
			// Status determined from body
		}

		// ── Extract from snippet patterns ──

		if (!jobTitle || !company) {
			// "your application for {Role} was successfully submitted to {Company}"
			const appSnippet = lowerSnippet.match(
				/your application for (.+?) was successfully submitted to (.+?)(?:\s|$)/i,
			);
			if (appSnippet) {
				if (!jobTitle) jobTitle = appSnippet[1].trim();
				if (!company) company = appSnippet[2].trim();
			}

			// "it appears your application for {Role} advertised by {Company}"
			// "it appears your application for {Role} at {Company}"
			if (!jobTitle) {
				const appearsSnippet = lowerSnippet.match(
					/your (?:application for (.+?) (?:advertised by|at) (.+?))(?:\s|$)/i,
				);
				if (appearsSnippet) {
					if (!jobTitle) jobTitle = appearsSnippet[1].trim();
					if (!company) company = appearsSnippet[2].trim();
				}
			}

			// "{Company} has viewed your application for {Role}"
			if (!jobTitle) {
				const viewedSnippet = lowerSnippet.match(
					/(.+?)\s+has viewed your application for (.+?)(?:\s|$)/i,
				);
				if (viewedSnippet) {
					if (!company) company = viewedSnippet[1].trim();
					if (!jobTitle) jobTitle = viewedSnippet[2].trim();
				}
			}

			// "{Company} viewed your application for {Role}"
			if (!jobTitle) {
				const viewedSnippet2 = lowerSnippet.match(
					/(.+?)\s+viewed your application for (.+?)(?:\s|$)/i,
				);
				if (viewedSnippet2) {
					if (!company) company = viewedSnippet2[1].trim();
					if (!jobTitle) jobTitle = viewedSnippet2[2].trim();
				}
			}
		}

		// ── Extract from body patterns ──

		if (!jobTitle) {
			// "your application for {Role} was successfully submitted to {Company}"
			const appBodyMatch = lowerBody.match(
				/your application for (.+?) was successfully submitted to (.+?)(?:\.|\n|$)/i,
			);
			if (appBodyMatch) {
				jobTitle = appBodyMatch[1].trim();
				if (!company) company = appBodyMatch[2].trim();
			}
		}

		if (!jobTitle) {
			// "interest in the {Role} position at {Company}"
			const interestMatch = lowerBody.match(
				/interest in the (.+?)\s+(?:position|job|role)\s+(?:at|with)\s+(.+?)(?:\.|\n|$)/i,
			);
			if (interestMatch) {
				jobTitle = interestMatch[1].trim();
				if (!company) company = interestMatch[2].trim();
			}
		}

		if (!jobTitle) {
			// "for the {Role} job at {Company}"
			const forJobMatch = lowerBody.match(
				/for the (.+?)\s+(?:position|job|role)\s+(?:at|with)\s+(.+?)(?:\.|\n|$)/i,
			);
			if (forJobMatch) {
				jobTitle = forJobMatch[1].trim();
				if (!company) company = forJobMatch[2].trim();
			}
		}

		// "position as {Role} at {Company}"
		if (!jobTitle) {
			const posMatch = lowerBody.match(
				/position as (.+?)\s+(?:at|with)\s+(.+?)(?:\.|\n|$)/i,
			);
			if (posMatch) {
				jobTitle = posMatch[1].trim();
				if (!company) company = posMatch[2].trim();
			}
		}

		// "your application for {Role}" without company
		if (!jobTitle) {
			const appMatch = lowerBody.match(
				/your application for (.+?)(?:\.|\n|was|has|advertised)/i,
			);
			if (appMatch) {
				jobTitle = appMatch[1]
					.trim()
					.replace(/\s+at\s+.+$/i, "")
					.trim();
			}
		}

		if (!company) {
			// Try to extract company from "at {Company}" patterns in body
			const atMatch = lowerBody.match(
				/(?:at|advertised by|with)\s+([A-Z][A-Za-z0-9\s.'&,-]+?)(?:\.|\n|,|\s+has|\s+for|$)/,
			);
			if (atMatch) {
				company = atMatch[1].trim();
			}
		}

		// ── Status detection from body content ──

		if (status === JobStatus.APPLIED || !status) {
			// Rejection / Unsuccessful
			if (
				/unlikely to (?:progress|further|move forward)/i.test(
					lowerSubject + " " + lowerSnippet + " " + lowerBody,
				) ||
				/(?:looks|appears)\s+unlikely/i.test(
					lowerSubject + " " + lowerSnippet + " " + lowerBody,
				) ||
				/unsuccessful|unfortunately|not moving forward|not selected|regret to inform/i.test(
					lowerSubject + " " + lowerSnippet + " " + lowerBody,
				)
			) {
				status = JobStatus.REJECTED;
			}

			// Interview
			if (
				/interview|scheduled for interview|invited to interview|phone screen/i.test(
					lowerSubject + " " + lowerSnippet + " " + lowerBody,
				)
			) {
				status = JobStatus.INTERVIEW;
			}

			// Viewed (if not already detected)
			if (
				status === JobStatus.APPLIED &&
				(/has viewed your application|viewed your application for/i.test(
					lowerSubject + " " + lowerSnippet,
				) ||
					/your application was viewed/i.test(
						lowerSubject + " " + lowerSnippet,
					))
			) {
				status = JobStatus.VIEWED;
			}
		}

		if (!jobTitle) return null;

		return {
			platform: JobPlatform.JOBSTREET,
			jobTitle,
			company: company || "Unknown Company",
			status,
			body: email.body,
			snippet: email.snippet,
			subject: email.subject,
			from: email.from,
			url: extractJobstreetUrl(email.body),
			date: new Date(Number(email.internalDate)).toISOString(),
			emailId: email.id,
		};
	},
};

/** Extract job posting URL from JobStreet email body. */
function extractJobstreetUrl(body: string): string {
	const match = body.match(
		/(?:https?:\/\/)(?:[a-z]+\.)?jobstreet\.com\/[^\s]+/i,
	);
	if (match) return match[0];
	return "";
}
