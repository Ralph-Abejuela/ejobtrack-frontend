import { createContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";

interface ThemeCtx {
	theme: Theme;
	toggle: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

export { Ctx };

function getInitial(): Theme {
	if (typeof window === "undefined") return "dark";
	const stored = localStorage.getItem("theme");
	if (stored === "light" || stored === "dark") return stored;
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [theme, setTheme] = useState<Theme>(getInitial);

	useEffect(() => {
		const root = document.documentElement;
		if (theme === "dark") {
			root.classList.add("dark");
		} else {
			root.classList.remove("dark");
		}
		localStorage.setItem("theme", theme);
	}, [theme]);

	const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

	return <Ctx.Provider value={{ theme, toggle }}>{children}</Ctx.Provider>;
}
