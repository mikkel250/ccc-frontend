import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "./prisma";
import {
  resolveBetterAuthTrustedOrigins,
  resolveBetterAuthUrl,
} from "./auth-config";
import { firstOperatorRegistration } from "./registration";

const origin = resolveBetterAuthUrl();

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: origin,
  trustedOrigins: resolveBetterAuthTrustedOrigins(origin),
  database: prismaAdapter(prisma, {
    provider: "postgresql",
    transaction: true,
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  rateLimit: {
    customRules: {
      "/sign-in/email": { window: 10, max: 100 },
      "/sign-up/email": { window: 10, max: 100 },
    },
  },
  advanced: {
    ipAddress: {
      ipAddressHeaders: [],
    },
  },
  plugins: [firstOperatorRegistration(), nextCookies()],
});
