// src/lib/auth.ts
// JWT authentication helpers using jose + HttpOnly cookies
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { cookies } from 'next/headers';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'app-muhasebe-secret-key-change-in-production'
);

const COOKIE_NAME = 'auth_token';
const TOKEN_EXPIRY = '24h';

export interface AuthPayload extends JWTPayload {
  userId: number;
  username: string;
  role: string;
}

/**
 * Create a JWT token and set it as an HttpOnly cookie
 */
export async function createSession(payload: {
  userId: number;
  username: string;
  role: string;
}) {
  const token = await new SignJWT({
    userId: payload.userId,
    username: payload.username,
    role: payload.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(JWT_SECRET);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours in seconds
  });

  return token;
}

/**
 * Verify JWT token from cookie and return payload
 */
export async function verifySession(): Promise<AuthPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;

    if (!token) return null;

    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as AuthPayload;
  } catch {
    return null;
  }
}

/**
 * Verify a raw JWT token string
 */
export async function verifyToken(token: string): Promise<AuthPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as AuthPayload;
  } catch {
    return null;
  }
}

/**
 * Clear the auth cookie (logout)
 */
export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
