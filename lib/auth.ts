import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "./prisma";
import { keepFirstOperatorIfLocked, publicRegistrationAllowed } from "./registration";

const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: origin,
  trustedOrigins: [origin],
  database: prismaAdapter(prisma, {
    provider: "postgresql",
    transaction: true,
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") {
        return;
      }
      if (!(await publicRegistrationAllowed())) {
        throw new APIError("FORBIDDEN", {
          message: "Registration is closed.",
        });
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") {
        return;
      }
      await keepFirstOperatorIfLocked();
    }),
  },
  plugins: [nextCookies()],
});
