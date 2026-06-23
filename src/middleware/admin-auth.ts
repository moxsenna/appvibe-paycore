import { createMiddleware } from 'hono/factory';
import { Errors } from '../lib/errors.ts';
import type { PayCoreHonoEnv } from '../types/hono.ts';

function actorFromAccessJwt(jwt: string): string | null {
  const parts = jwt.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as {
      email?: string;
      sub?: string;
    };
    return payload.email ?? payload.sub ?? 'cloudflare-access';
  } catch {
    return 'cloudflare-access';
  }
}

export const adminAuthMiddleware = createMiddleware<PayCoreHonoEnv>(async (c, next) => {
  const accessJwt = c.req.header('Cf-Access-Jwt-Assertion');
  if (accessJwt) {
    c.set('adminActor', actorFromAccessJwt(accessJwt) ?? 'cloudflare-access');
    await next();
    return;
  }

  const env = c.get('env');
  const devToken = env.PAYCORE_ADMIN_DEV_TOKEN;
  if (devToken) {
    const bearer = c.req.header('Authorization');
    const headerToken = c.req.header('X-PayCore-Admin-Token');
    if (bearer === `Bearer ${devToken}` || headerToken === devToken) {
      c.set('adminActor', 'dev-admin');
      await next();
      return;
    }
  }

  if (env.ENVIRONMENT === 'production') {
    throw Errors.unauthorized('Admin access requires Cloudflare Access');
  }

  throw Errors.unauthorized('Admin authentication required');
});