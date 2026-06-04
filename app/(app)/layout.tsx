import { AppSidebar } from "@/components/shared/app-sidebar";
import { AppHeader } from "@/components/shared/app-header";
import { MobileNav } from "@/components/shared/mobile-nav";

// All pages inside (app) use client components with React context (useTheme,
// useRouter) so they must be rendered dynamically — never statically prerendered.
export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // TODO(auth): replace with the authenticated session user once NextAuth lands.
  const user = { name: "Demo CEO", email: "ceo@wholesaleos.app", image: null };

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <div className="lg:pl-64">
        <AppHeader user={user} />
        <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 lg:px-8 lg:pb-12">
          {children}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
