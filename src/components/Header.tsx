import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import { Sun, Moon, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/use-theme";

export default function Header() {
	const { user, signOut } = useAuth();
	const { theme, toggle } = useTheme();

	return (
		<header className="flex items-center justify-between border-b bg-card px-4 py-3">
			<div className="flex items-center gap-6">
				<Link to="/" className="text-lg font-bold tracking-tight">
					ejobtrack
				</Link>
				<Link
					to="/"
					className="text-sm text-muted-foreground hover:text-foreground"
				>
					Home
				</Link>
				<Link
					to="/jobs"
					className="text-sm text-muted-foreground hover:text-foreground"
				>
					Jobs
				</Link>
			</div>

			<div className="flex items-center gap-1 sm:gap-3">
				<Button
					variant="ghost"
					size="icon"
					onClick={toggle}
					aria-label="Toggle theme"
				>
					{theme === "dark" ? (
						<Sun className="size-4" />
					) : (
						<Moon className="size-4" />
					)}
				</Button>
				{user ? (
					<>
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<User className="size-4" />
							<span className="hidden sm:inline">{user.email}</span>
						</div>
						<Button variant="outline" size="sm" onClick={signOut}>
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
