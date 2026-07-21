import { JobPlatform, JobStatus, type JobPlatformParser } from "./types";

/**
 * Parser for LinkedIn job application emails (jobs-noreply@linkedin.com).
 *
 * Email types detected (X-LinkedIn-Template headers provide hints):
 *   - email_application_confirmation_with_nba_01  →  APPLIED
 *   - email_jobs_application_rejected_01          →  REJECTED
 *   - email_jobs_application_viewed_*             →  VIEWED
 *   - email_jobs_resume_downloaded_*              →  VIEWED
 *
 * Subject patterns:
 *   - "{Name}, your application was sent to {Company}"
 *   - "Your application was sent to {Company}"
 *   - "Your application to {Role} at {Company}"
 *   - "Your application was viewed by {Company}"
 *   - "Your resume was downloaded by {Company}"
 *   - "Application status update from {Company}"
 *
 * Snippet/Body patterns for job title + company:
 *   - "Your application was sent to {Company}" — title after in body
 *   - "Your application to {Role} at {Company}"
 *   - "interest in the {Role} position at {Company}"
 *   - "position as {Role} at {Company}"
 *   - "Your application to {Role} at {Company}"
 *   - "Thank you for your interest in the {Role} position at {Company}"
 *   - "applied for the {Role} position at {Company}"
 *
 * Rejection body patterns:
 *   - "Thank you for your interest in the {Role} position at {Company}... Unfortunately, we will not be moving forward..."
 *   - "we will not be moving forward with your application"
 *   - "will not be moving forward"
 */
export const linkedinParser: JobPlatformParser = {
	platform: JobPlatform.LINKEDIN,
	fromAddresses: [
		"jobs-noreply@linkedin.com",
		"hit-reply@linkedin.com",
		"inmail-hit-reply@linkedin.com",
	],

	parse(email) {
		const { subject, snippet, body } = email;

		console.log(subject);

		let jobTitle = "";
		let company = "";
		let status = JobStatus.APPLIED;

		const lowerSubject = subject.toLowerCase().replace(/\s+/g, " ");
		const lowerSnippet = snippet.toLowerCase().replace(/\s+/g, " ");
		const lowerBody = body.toLowerCase().replace(/\s+/g, " ");

		// ── Status detection from subject ──

		// Rejection: subject has "Your application to {Role} at {Company}" + rejection template
		// We need body to confirm rejection, but subject gives us title + company

		// ── Extract company from subject ──

		// "{Name}, your application was sent to {Company}" or "Your application was sent to {Company}"
		const sentSubjectMatch =
			lowerSubject.match(/your application was sent to (.+?)$/i) ??
			lowerSubject.match(/application was sent to (.+?)$/i);
		if (sentSubjectMatch) {
			company = sentSubjectMatch[1].trim().replace(/\.$/, "");
			status = JobStatus.APPLIED;
		}

		// "Your application to {Role} at {Company}" (common for rejection emails)
		const appToSubject = lowerSubject.match(
			/your application to (.+?)\s+at\s+(.+?)$/i,
		);
		if (appToSubject) {
			jobTitle = appToSubject[1].trim();
			company = appToSubject[2].trim().replace(/\.$/, "");
			// Status will be determined from body
		}

		// "Your application was viewed (by|at) {Company}"
		const viewedSubjectMatch =
			lowerSubject.match(/your application was viewed (?:by|at) (.+?)$/i) ??
			lowerSubject.match(
				/your application was viewed (?:by|at) (.+?)(?:\s|$)/i,
			);
		if (viewedSubjectMatch) {
			company = viewedSubjectMatch[1].trim().replace(/\.$/, "");
			status = JobStatus.VIEWED;
		}

		// "Your resume was downloaded (by|at) {Company}"
		const downloadedSubjectMatch = lowerSubject.match(
			/your resume was downloaded (?:by|at) (.+?)$/i,
		);
		if (downloadedSubjectMatch) {
			company = downloadedSubjectMatch[1].trim().replace(/\.$/, "");
			status = JobStatus.VIEWED;
		}

		// ── Extract from snippet ──

		if (!company) {
			const sentSnippet = lowerSnippet.match(
				/your application was sent to (.+?)(?:\s|$)/i,
			);
			if (sentSnippet) {
				company = sentSnippet[1].trim().replace(/\.$/, "");
			}
		}

		if (!company) {
			const appToSnippet = lowerSnippet.match(
				/your application to (.+?)\s+at\s+(.+?)(?:\s|$)/i,
			);
			if (appToSnippet) {
				if (!jobTitle) jobTitle = appToSnippet[1].trim();
				company = appToSnippet[2].trim().replace(/\.$/, "");
			}
		}

		// ── Extract job title from body ──

		if (!jobTitle) {
			// "Thank you for your interest in the {Role} position at {Company}"
			const interestMatch = lowerBody.match(
				/interest in the (.+?)\s+(?:position|job|role)\s+(?:at|with)\s+(.+?)(?:\.|\n|$)/i,
			);
			if (interestMatch) {
				jobTitle = interestMatch[1].trim();
				if (!company) company = interestMatch[2].trim();
			}
		}

		if (!jobTitle) {
			// "position as {Role} at {Company}"
			const posMatch = lowerBody.match(
				/position as (.+?)\s+(?:at|with)\s+(.+?)(?:\.|\n|$)/i,
			);
			if (posMatch) {
				jobTitle = posMatch[1].trim();
				if (!company) company = posMatch[2].trim();
			}
		}

		if (!jobTitle) {
			// "applied for the {Role} position at {Company}"
			const appliedMatch = lowerBody.match(
				/applied for (?:the\s+)?(.+?)\s+(?:position|role)\s+(?:at|with)\s+(.+?)(?:\.|\n|$)/i,
			);
			if (appliedMatch) {
				jobTitle = appliedMatch[1].trim();
				if (!company) company = appliedMatch[2].trim();
			}
		}

		if (!jobTitle) {
			// "Your application for {Role} was sent to {Company}" - less common
			const sentBodyMatch = lowerBody.match(
				/application for (.+?)\s+(?:was\s+)?sent to (.+?)(?:\.|\n|$)/i,
			);
			if (sentBodyMatch) {
				jobTitle = sentBodyMatch[1].trim();
				if (!company) company = sentBodyMatch[2].trim();
			}
		}

		if (!jobTitle) {
			// "applied to {Role} at {Company}"
			const appliedToMatch = lowerBody.match(
				/applied to (.+?)\s+(?:at|with)\s+(.+?)(?:\.|\n|$)/i,
			);
			if (appliedToMatch) {
				jobTitle = appliedToMatch[1].trim();
				if (!company) company = appliedToMatch[2].trim();
			}
		}

		// ── Fallback: job title on standalone line after heading ──
		// LinkedIn confirmation emails often have:
		//   "Your application was sent to {Company}\n\n{Job Title}\n{Company}"
		if (!jobTitle && company) {
			// Use raw body to preserve line breaks
			const rawBody = body
				.replace(/\s+/g, " ")
				.replace(/\ufffe|\u00a0|\u200b/g, "");
			const escapedCompany = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			// Match: "sent to {Company}" followed by content, then a line with the job title before the company repeats
			const afterSent = rawBody.match(
				new RegExp(
					`sent to ${escapedCompany}\\s+(?:.+?\\s+)?(.{1,100}?)\\s+${escapedCompany}`,
					"i",
				),
			);
			if (afterSent) {
				const candidate = afterSent[1].replace(/\s+/g, " ").trim();
				// Filter out location-like candidates (too short, looks like city)
				if (
					candidate &&
					candidate.length > 2 &&
					!/^(on-?site|remote|hybrid|philippines|makati|manila|quezon|tagui|pasig|mandaluyong|caloocan)$/i.test(
						candidate,
					)
				) {
					jobTitle = candidate;
				}
			}
		}

		// ── Status detection from body ──

		if (status === JobStatus.APPLIED) {
			// Rejection
			if (
				/(?:will not be moving forward|not moving forward|regret to inform|unfortunately|not selected|unsuccessful|will not move forward)/i.test(
					lowerBody + " " + lowerSnippet,
				) ||
				/decided to (?:move forward|proceed) with other candidates/i.test(
					lowerBody,
				)
			) {
				status = JobStatus.REJECTED;
			}

			// Interview
			if (
				/interview|schedule|phone screen|recruiter screen/i.test(
					lowerSubject + " " + lowerSnippet,
				) ||
				/interview|schedule a time|phone screen|would like to meet/i.test(
					lowerBody,
				)
			) {
				status = JobStatus.INTERVIEW;
			}
		}

		if (!company) return null;

		return {
			platform: JobPlatform.LINKEDIN,
			jobTitle: jobTitle || "Unknown Position",
			company,
			status,
			body: email.body,
			snippet: email.snippet,
			subject: email.subject,
			from: email.from,
			url: extractLinkedInUrl(email.body),
			date: new Date(Number(email.internalDate)).toISOString(),
			emailId: email.id,
		};
	},
};

/** Extract job posting URL from LinkedIn email body. */
function extractLinkedInUrl(body: string): string {
	const match = body.match(/linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/i);
	if (match) {
		return `https://www.linkedin.com/jobs/view/${match[1]}/`;
	}
	return "";
}
