export const dynamic = "force-dynamic";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#080808] flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="font-bebas text-8xl text-[#00ff87] tracking-widest">404</h1>
        <p className="text-white/40 font-syne mt-2">Page not found</p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block bg-[#00ff87] text-black font-bebas text-xl
                     tracking-widest px-6 py-3 rounded-xl hover:bg-[#00ff87]/90 transition"
        >
          BACK TO DASHBOARD
        </Link>
      </div>
    </div>
  );
}
