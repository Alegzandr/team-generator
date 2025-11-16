import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { upsertUser } from '../services/userService';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET!;

export interface AuthenticatedUser {
    id: string;
    username: string;
    avatar: string | null;
}

declare global {
    namespace Express {
        interface Request {
            authUser?: AuthenticatedUser;
        }
    }
}

const extractToken = (header?: string) => {
    if (!header) {
        return undefined;
    }
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
        return undefined;
    }
    return token;
};

export const requireAuth: RequestHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const rawToken = extractToken(req.headers.authorization);

    if (!rawToken) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }

    try {
        const payload = jwt.verify(rawToken, JWT_SECRET) as AuthenticatedUser;
        req.authUser = payload;
        await upsertUser({
            id: payload.id,
            username: payload.username,
            avatar: payload.avatar,
        });
        next();
    } catch (error) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }
};
