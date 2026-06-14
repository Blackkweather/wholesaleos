import "server-only";
import { z } from "zod";

/**
 * Centralized, validated server environment. Integration keys are optional so
 * the app boots and runs locally with graceful fallbacks; only DATABASE_URL is
 * truly needed for persistence. Never import this from a client component.
 */
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  DATABASE_URL: z.string().optional(),
  DIRECT_URL: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),

  // AI Gateway (Vercel AI Gateway or OpenRouter) — unified multi-model transport.
  // primary: Gemini 2.5 Flash · fallback: Llama 3.3 70B (Groq) · emergency: GPT-4o-mini
  AI_GATEWAY_URL: z.string().optional(),    // gateway base or full /chat/completions URL
  AI_GATEWAY_KEY: z.string().optional(),    // gateway bearer token
  OPENROUTER_API_KEY: z.string().optional(),// used if AI_GATEWAY_KEY is unset
  AI_PRIMARY_MODEL: z.string().optional(),
  AI_FALLBACK_MODEL: z.string().optional(),
  AI_EMERGENCY_MODEL: z.string().optional(),
  RENTCAST_API_KEY: z.string().optional(),
  ESTATED_API_KEY: z.string().optional(),
  REGRID_API_KEY: z.string().optional(),
  APIFY_API_KEY: z.string().optional(),
  APIFY_TPS_ACTOR: z.string().optional(), // override TruePeopleSearch actor id
  APIFY_WP_ACTOR: z.string().optional(),  // override Whitepages actor id

  NEXTAUTH_SECRET: z.string().optional(),
  NEXTAUTH_URL: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  ENCRYPTION_KEY: z.string().optional(),

  // Inngest — event bus + durable workers (serverless, no local process)
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),

  // Reliability — daily spend caps (cents) + admin killswitch bearer secret
  CAP_AI_CENTS: z.string().optional(),
  CAP_SMS_CENTS: z.string().optional(),
  CAP_MAIL_CENTS: z.string().optional(),
  CAP_DATA_CENTS: z.string().optional(),
  CAP_EMAIL_CENTS: z.string().optional(),
  KILLSWITCH_SECRET: z.string().optional(),

  VAPI_API_KEY: z.string().optional(),
  VAPI_PHONE_NUMBER_ID: z.string().optional(),
  VAPI_TWILIO_PHONE_NUMBER_ID: z.string().optional(),

  LOB_API_KEY: z.string().optional(),
  LOB_FROM_NAME: z.string().optional(),
  LOB_FROM_LINE1: z.string().optional(),
  LOB_FROM_CITY: z.string().optional(),
  LOB_FROM_STATE: z.string().optional(),
  LOB_FROM_ZIP: z.string().optional(),

  OWNER_EMAIL: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().optional(),
  PUBLIC_WEBHOOK_URL: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  APP_PASSWORD: z.string().optional(),
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Should be impossible (all optional) but surface clearly if it ever happens.
    console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
    return schema.parse({});
  }
  return parsed.data;
}

export const env = load();

/** Which integrations are actually configured right now. */
export const features = {
  anthropic: Boolean(env.ANTHROPIC_API_KEY),
  gemini: Boolean(env.GEMINI_API_KEY),
  groq: Boolean(env.GROQ_API_KEY),
  ai: Boolean(env.AI_GATEWAY_KEY || env.OPENROUTER_API_KEY || env.GROQ_API_KEY),
  inngest: Boolean(env.INNGEST_EVENT_KEY),
  tavily: Boolean(env.TAVILY_API_KEY),
  rentcast: Boolean(env.RENTCAST_API_KEY),
  propertyApi: Boolean(env.ESTATED_API_KEY || env.REGRID_API_KEY),
  apify: Boolean(env.APIFY_API_KEY),
  google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  resend: Boolean(env.RESEND_API_KEY),
  redis: Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN),
  vapi: Boolean(env.VAPI_API_KEY && env.VAPI_PHONE_NUMBER_ID),
  lob: Boolean(env.LOB_API_KEY && env.LOB_FROM_LINE1),
} as const;

export type Features = typeof features;
