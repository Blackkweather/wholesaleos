import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Single-user app: the root goes straight to the workspace.
export default function RootPage() {
  redirect("/dashboard");
}
