// Tells Convex how to validate Clerk-issued JWTs.
// CLERK_JWT_ISSUER_DOMAIN must be set in the Convex deployment environment
// (via `npx convex env set CLERK_JWT_ISSUER_DOMAIN ...` or the dashboard).
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
