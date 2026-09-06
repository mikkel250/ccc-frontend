import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "./prisma";
import { registrationIsOpen } from "./registration";

const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: origin,
  trustedOrigins: [origin],
  database: prismaAdapter(prisma, {
    provider: "postgresql",
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
      const existingUserCount = await prisma.user.count();
      if (!registrationIsOpen(existingUserCount, process.env.ALLOW_REGISTRATION)) {
        throw new APIError("FORBIDDEN", {
          message: "Registration is closed.",
        });
      }
    }),
  },
  plugins: [nextCookies()],
});
