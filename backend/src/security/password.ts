import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);
const PASSWORD_PREFIX = 'scrypt';

export function isHashedPassword(password: string): boolean {
    return password.startsWith(`${PASSWORD_PREFIX}$`);
}

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derived = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${PASSWORD_PREFIX}$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, storedPassword: string): Promise<boolean> {
    if (!isHashedPassword(storedPassword)) return password === storedPassword;

    const parts = storedPassword.split('$');
    if (parts.length !== 3) return false;

    const [, salt, keyHex] = parts;
    const storedKey = Buffer.from(keyHex, 'hex');
    const derived = (await scryptAsync(password, salt, storedKey.length)) as Buffer;
    return timingSafeEqual(storedKey, derived);
}
