// Tells Convex how to validate Clerk-issued JWTs.
// Override per-deployment by setting CLERK_JWT_ISSUER_DOMAIN in the Convex env
// (`npx convex env set CLERK_JWT_ISSUER_DOMAIN ...` or the dashboard); the
// fallback below is this project's Clerk issuer so it works out of the box.
const ISSUER_DOMAIN =
  process.env.CLERK_JWT_ISSUER_DOMAIN ??
  "https://valid-minnow-88.clerk.accounts.dev";

export default {
  providers: [
    {
      domain: ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
