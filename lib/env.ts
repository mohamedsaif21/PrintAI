/**
 * Environment variable validation and configuration
 * This module runs at startup to ensure all required env vars are present
 */

function validateEnv() {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "GEMINI_API_KEY",
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:");
    missing.forEach((key) => console.error(`   - ${key}`));
    console.error("\n📋 Please set these in your .env.local file");
    console.error("   See .env.example for reference\n");

    // Only throw in production; allow development to continue
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Missing environment variables: ${missing.join(", ")}`);
    }
  } else {
    console.log("✅ All required environment variables are configured");
  }
}

// Run validation
if (typeof window === "undefined") {
  // Server-side only
  validateEnv();
}

export { validateEnv };
