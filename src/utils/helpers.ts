import { createHash } from 'crypto';

export function sha256Hash(data: string): string {
    return createHash('sha256').update(data).digest('hex');
}