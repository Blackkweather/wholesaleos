/** All user-facing copy lives here (no hardcoded strings in components). */

export const COPY = {
  brand: {
    name: "WholesaleOS",
    tagline: "Your real estate wholesale business, on autopilot.",
  },

  nav: {
    dashboard: "Dashboard",
    deals: "Pipeline",
    find: "Find Deals",
    sms: "SMS Hub",
    buyers: "Buyers",
    calculator: "Calculator",
    settings: "Settings",
  },

  empty: {
    deals: {
      title: "No deals yet",
      body: "Run a scan or add a deal to start building your pipeline.",
    },
    buyers: {
      title: "No buyers yet",
      body: "Add cash buyers or import a CSV to match deals instantly.",
    },
    sms: {
      title: "No conversations yet",
      body: "Generate outreach from a deal to start texting sellers.",
    },
    scanResults: {
      title: "Nothing found — yet",
      body: "Try a broader price range or a nearby city.",
    },
    activity: {
      title: "No activity yet",
      body: "Every text, call, and stage change will show up here automatically.",
    },
  },

  errors: {
    generic: "Something went wrong. Please try again.",
    rateLimited: "You're going a little fast — give it a second.",
    unauthorized: "Please sign in to continue.",
    notConfigured: "This integration isn't set up yet.",
    aiUnavailable:
      "AI is not configured. Add ANTHROPIC_API_KEY to enable live generation.",
  },

  toasts: {
    smsCopied: "Message copied to clipboard",
    dealSaved: "Deal saved to your pipeline",
    dealMoved: "Deal moved",
    scriptGenerated: "Script generated",
    sequenceStarted: "Auto-sequence started",
    buyerAdded: "Buyer added",
    blastSent: "Deal sent to your buyers",
    copied: "Copied",
  },
} as const;

export type Copy = typeof COPY;
