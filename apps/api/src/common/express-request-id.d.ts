// Declaration-merging augmentation (same pattern as rbac/express-request.d.ts)
// so `req.requestId`, set by RequestIdMiddleware, is typed everywhere.
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export {};
