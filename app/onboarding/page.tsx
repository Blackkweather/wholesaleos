// Server component — force-dynamic so no static prerender attempt.
export const dynamic = "force-dynamic";

import { OnboardingWizard } from "./_onboarding-wizard";

export const metadata = { title: "Setup" };

export default function OnboardingPage() {
  return <OnboardingWizard />;
}
