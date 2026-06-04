// Server component — dynamic so middleware can handle auth redirect cleanly.
export const dynamic = "force-dynamic";

import { LoginForm } from "./_login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return <LoginForm />;
}
