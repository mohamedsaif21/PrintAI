/** Environment variable validation and feature configuration. */

function validateEnv() {
  const required = ["GEMINI_API_KEY"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error("Missing required environment variables:");
    missing.forEach((key) => console.error(`   - ${key}`));
    console.error("\nPlease set these in your .env.local file");
    console.error("   See .env.example for reference\n");

    if (process.env.NODE_ENV === "production") {
      throw new Error(`Missing environment variables: ${missing.join(", ")}`);
    }
  }

}

if (typeof window === "undefined") {
  validateEnv();
}

export { validateEnv };
