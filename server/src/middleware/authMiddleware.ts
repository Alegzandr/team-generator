import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { TOKEN_COOKIE_NAME } from '../config/authCookies';
import { TokenPayload } from '../auth/discordAuth';
import { getUserById, touchUserActivity } from '../services/userService';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET!;

export interface AuthenticatedUser {
    id: string;
    username: string;
    avatar: string | null;
    xp_total?: number;
    networkId: string;
    badgesVisibleInSearch?: boolean;
}

declare global {
    namespace Express {
        interface Request {
            authUser?: AuthenticatedUser;
        }
    }
}

const extractBearerToken = (header?: string) => {
    if (!header) {
        return undefined;
    }
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
        return undefined;
    }
    return token;
};

const getTokenFromRequest = (req: Request) => {
    return (
        extractBearerToken(req.headers.authorization) ||
        (req.cookies ? req.cookies[TOKEN_COOKIE_NAME] : undefined)
    );
};

export const requireAuth: RequestHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const rawToken = getTokenFromRequest(req);

    if (!rawToken) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }

    try {
        const payload = jwt.verify(rawToken, JWT_SECRET) as TokenPayload;
        const storedUser = await getUserById(payload.id);
        if (!storedUser) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }
        if (storedUser.token_version !== payload.tokenVersion) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }
        req.authUser = {
            id: storedUser.id,
            username: storedUser.username,
            avatar: storedUser.avatar,
            xp_total: storedUser.xp_total,
            networkId: storedUser.network_id,
            badgesVisibleInSearch: Boolean(storedUser.badges_visible_in_search),
        };
        await touchUserActivity(storedUser.id);
        next();
    } catch (error) {
        res.status(401).json({ message: 'Unauthorized' });
    }
};
