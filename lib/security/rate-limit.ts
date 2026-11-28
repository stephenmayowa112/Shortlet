export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
  retryAfterSeconds: number;
}

/**
 * Sliding-window rate limiter supporting per-IP and per-contact/actor buckets (Task 5 #6).
 */
export class SlidingWindowRateLimiter {
  private buckets = new Map<string, number[]>();

  public check(
    bucketKey: string,
    maxRequests: number,
    windowMs: number,
    nowMs = Date.now()
  ): RateLimitResult {
    const cutoff = nowMs - windowMs;
    const recent = (this.buckets.get(bucketKey) ?? []).filter((ts) => ts > cutoff);

    if (recent.length >= maxRequests) {
      const oldest = recent[0] ?? nowMs;
      const resetAtMs = oldest + windowMs;
      this.buckets.set(bucketKey, recent);
      return {
        allowed: false,
        remaining: 0,
        resetAtMs,
        retryAfterSeconds: Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000)),
      };
    }

    recent.push(nowMs);
    this.buckets.set(bucketKey, recent);
    const resetAtMs = recent[0] + windowMs;
    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - recent.length),
      resetAtMs,
      retryAfterSeconds: 0,
    };
  }

  public reset(): void {
    this.buckets.clear();
  }
}

declare global {
  var __shortletRateLimiter: SlidingWindowRateLimiter | undefined;
}

export function getRateLimiter(): SlidingWindowRateLimiter {
  if (!globalThis.__shortletRateLimiter) {
    globalThis.__shortletRateLimiter = new SlidingWindowRateLimiter();
  }
  return globalThis.__shortletRateLimiter;
}

export function extractClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    return xff.split(",")[0].trim() || "unknown";
  }
  return headers.get("x-real-ip")?.trim() || "127.0.0.1";
}
