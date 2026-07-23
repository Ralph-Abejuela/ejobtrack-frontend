import * as React from "react";
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

function Sheet({ ...props }: DrawerPrimitive.Root.Props) {
	return <DrawerPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: DrawerPrimitive.Trigger.Props) {
	return <DrawerPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetPortal({ ...props }: DrawerPrimitive.Portal.Props) {
	return <DrawerPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetClose({ ...props }: DrawerPrimitive.Close.Props) {
	return <DrawerPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetOverlay({ className, ...props }: DrawerPrimitive.Backdrop.Props) {
	return (
		<DrawerPrimitive.Backdrop
			data-slot="sheet-overlay"
			className={cn(
				"fixed inset-0 isolate z-50 bg-black/80 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
				className,
			)}
			{...props}
		/>
	);
}

function SheetContent({
	className,
	children,
	showCloseButton = true,
	side = "right",
	...props
}: DrawerPrimitive.Popup.Props & {
	showCloseButton?: boolean;
	side?: "left" | "right";
}) {
	return (
		<SheetPortal>
			<SheetOverlay />
			<DrawerPrimitive.Viewport className="fixed inset-0 z-50 isolate flex pointer-events-none">
				<DrawerPrimitive.Popup
					data-slot="sheet-content"
					className={cn(
						"pointer-events-auto flex h-full w-full max-w-xs flex-col bg-popover text-popover-foreground ring-1 ring-foreground/10 shadow-lg duration-100 outline-none data-open:animate-in data-closed:animate-out sm:max-w-sm",
						side === "right"
							? "ml-auto data-open:slide-in-from-right-full data-closed:slide-out-to-right-full"
							: "mr-auto data-open:slide-in-from-left-full data-closed:slide-out-to-left-full",
						className,
					)}
					{...props}
				>
					{children}
					{showCloseButton && (
						<DrawerPrimitive.Close
							data-slot="sheet-close"
							render={
								<Button
									variant="ghost"
									className="absolute top-2 right-2"
									size="icon-sm"
								/>
							}
						>
							<XIcon />
							<span className="sr-only">Close</span>
						</DrawerPrimitive.Close>
					)}
				</DrawerPrimitive.Popup>
			</DrawerPrimitive.Viewport>
		</SheetPortal>
	);
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="sheet-header"
			className={cn("flex flex-col gap-1 px-4 pt-4 pb-2", className)}
			{...props}
		/>
	);
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="sheet-footer"
			className={cn("mt-auto px-4 py-3", className)}
			{...props}
		/>
	);
}

function SheetTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
	return (
		<DrawerPrimitive.Title
			data-slot="sheet-title"
			className={cn("font-heading text-sm font-medium", className)}
			{...props}
		/>
	);
}

function SheetDescription({
	className,
	...props
}: DrawerPrimitive.Description.Props) {
	return (
		<DrawerPrimitive.Description
			data-slot="sheet-description"
			className={cn(
				"text-xs/relaxed text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
				className,
			)}
			{...props}
		/>
	);
}

export {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
};
