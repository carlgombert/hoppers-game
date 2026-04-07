"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const redis_1 = require("../redis/redis");
const JWT_SECRET = process.env.JWT_SECRET ?? 'hoppers_dev_secret';
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing token' });
        return;
    }
    const token = authHeader.slice(7);
    // Check blocklist
    const blocked = await redis_1.redis.get(`blocklist:${token}`);
    if (blocked) {
        res.status(401).json({ error: 'Token revoked' });
        return;
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.userId = payload.userId;
        next();
    }
    catch {
        res.status(401).json({ error: 'Invalid token' });
    }
}
