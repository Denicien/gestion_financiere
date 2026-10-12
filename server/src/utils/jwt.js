import jwt from 'jsonwebtoken';

export const signerToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });

export const verifierToken = (token) => jwt.verify(token, process.env.JWT_SECRET);
