import jwt from "jsonwebtoken";
import db, { publicUser } from "./db.js";

export const JWT_SECRET = process.env.JWT_SECRET || "sih26103-dev-secret-change-me";

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
}

export function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Sign in required." });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub);
    if (!user) return res.status(401).json({ error: "Account not found." });
    req.user = publicUser(user);
    next();
  } catch {
    return res.status(401).json({ error: "Session expired. Please sign in again." });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission for this action." });
    }
    next();
  };
}
