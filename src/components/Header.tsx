import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import { LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Header() {
	const { user, signOut } = useAuth();

	return (
		<header className="flex items-center justify-between border-b px-4 py-3">
			<div className="flex items-center gap-6">
				<Link to="/" className="text-lg font-bold tracking-tight">
					ejobtrack
				</Link>
				<nav className="flex items-center gap-4 text-sm font-medium">
					<Link
						to="/jobs"
						className="text-muted-foreground hover:text-foreground transition-colors [&.active]:text-foreground"
					>
						Jobs
					</Link>
				</nav>
			</div>

			<div className="flex items-center gap-3">
				{user ? (
					<>
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<User className="size-4" />
							<span className="hidden sm:inline">{user.email}</span>
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={signOut}
						>
							<LogOut data-icon="inline-start" />
							<span className="hidden sm:inline">Sign out</span>
						</Button>
					</>
				) : (
					<GoogleSignInButton />
				)}
			</div>
		</header>
	);
}
