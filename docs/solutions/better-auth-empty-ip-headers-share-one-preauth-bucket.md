---
module: lib/auth.ts
tags: [better-auth, rate-limit, pre-auth]
problem_type: gotcha
created: 2026-11-10
---

# Better Auth: empty IP headers share one pre-auth bucket

## Problem

Better Auth 1.7.3 keys HTTP rate limits on client IP. Default header list includes `x-forwarded-for`, so a caller can rotate the bucket by spoofing that header unless a trusted proxy is actually in front. There is no `keyGenerator` in this version.

`disableIpTracking: true` does not mean “ignore headers.” It turns HTTP rate limiting off.

Omitting `ipAddressHeaders` is also wrong: `getIP` uses `options.advanced?.ipAddress?.ipAddressHeaders || DEFAULT_IP_HEADERS`, so `undefined` falls back to the default list. An empty array is truthy and is the “clients connect directly” mode: one shared counter per path.

Built-in special rules still cap `/sign-in*` and `/sign-up*` at 3 per 10s. A shared per-path counter at that default would lock out the only operator.

## Solution

Set `advanced.ipAddress.ipAddressHeaders` to `[]`. Do not set `disableIpTracking`. Override the sign-in/sign-up special rule with `rateLimit.customRules` for `/sign-in/email` and `/sign-up/email` (`window: 10`, `max: 100`) so the shared counter stays coarse.

Authenticated tailor and job mutations must not use this IP path at all; key those on the Better Auth session user id in this BFF.

## See Also

- Plan: [User ID rate limit](../plans/2026-11-10-2327-feat-user-id-rate-limit-plan.md)
- Better Auth `getIP` in `@better-auth/core` (`ipAddressHeaders || DEFAULT_IP_HEADERS`)
