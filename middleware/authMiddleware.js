import jwt from 'jsonwebtoken';

export const authenticateToken = (req, res, next) => {
  const token = req.headers['x-auth-token'];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, 'your_jwt_secret', (err, user) => {
    if (err) {
      return res.sendStatus(403);
    }
    req.user = user;
    next();
  });
};
