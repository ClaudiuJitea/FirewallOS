"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isHashedPassword = isHashedPassword;
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
const crypto_1 = require("crypto");
const util_1 = require("util");
const scryptAsync = (0, util_1.promisify)(crypto_1.scrypt);
const PASSWORD_PREFIX = 'scrypt';
function isHashedPassword(password) {
    return password.startsWith(`${PASSWORD_PREFIX}$`);
}
async function hashPassword(password) {
    const salt = (0, crypto_1.randomBytes)(16).toString('hex');
    const derived = (await scryptAsync(password, salt, 64));
    return `${PASSWORD_PREFIX}$${salt}$${derived.toString('hex')}`;
}
async function verifyPassword(password, storedPassword) {
    if (!isHashedPassword(storedPassword))
        return password === storedPassword;
    const parts = storedPassword.split('$');
    if (parts.length !== 3)
        return false;
    const [, salt, keyHex] = parts;
    const storedKey = Buffer.from(keyHex, 'hex');
    const derived = (await scryptAsync(password, salt, storedKey.length));
    return (0, crypto_1.timingSafeEqual)(storedKey, derived);
}
