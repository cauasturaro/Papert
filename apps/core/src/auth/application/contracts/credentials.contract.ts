import { z } from 'zod';
import { AuthError } from '../../domain/auth.js';
import type { Credentials } from '../../domain/credentials.js';

const CredentialsSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).email(),
  password: z
    .string()
    .min(1)
    .refine((p) => Buffer.byteLength(p) <= 128, {
      message: 'Password must not exceed 128 bytes.',
    }),
});

export function parseCredentials(body: unknown): Credentials {
  const result = CredentialsSchema.safeParse(body);
  if (!result.success) {
    throw new AuthError(
      'invalid',
      'Enter a valid email and password (maximum 128 bytes).',
    );
  }

  return result.data;
}
