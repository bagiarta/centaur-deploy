import sql from 'mssql';
import { poolPromise } from '../config/db.js';
import jwt from 'jsonwebtoken';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ 
        success: false, 
        error: 'No authorization header provided' 
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: 'No token provided' 
      });
    }
    
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cctv-monitoring-secret');
    
    // Get user from database
    const pool = await poolPromise;
    const userResult = await pool.request()
      .input('userId', sql.NVarChar, decoded.userId)
      .query('SELECT * FROM Users WHERE id = @userId AND is_active = 1');
    
    if (userResult.recordset.length === 0) {
      return res.status(401).json({ 
        success: false, 
        error: 'User not found or inactive' 
      });
    }
    
    req.user = userResult.recordset[0];
    req.token = token;
    
    // Check if user has required permission
    if (req.user.permissions && !hasPermission(req.user.permissions, req.method, req.path)) {
      return res.status(403).json({ 
        success: false, 
        error: 'Insufficient permissions' 
      });
    }
    
    next();
  } catch (err) {
    console.error('[Auth Middleware] Error:', err.message);
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid or expired token' 
    });
  }
};

export const hasPermission = (permissions, method, path) => {
  // Simplified permission check
  // In production, implement proper permission system
  return true;
};

export const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user || !req.user.role_id) {
      return res.status(403).json({ 
        success: false, 
        error: 'Admin access required' 
      });
    }
    
    const pool = await poolPromise;
    const roleResult = await pool.request()
      .input('roleId', sql.NVarChar, req.user.role_id)
      .query('SELECT is_admin FROM Roles WHERE id = @roleId');
    
    if (roleResult.recordset.length === 0 || !roleResult.recordset[0].is_admin) {
      return res.status(403).json({ 
        success: false, 
        error: 'Admin access required' 
      });
    }
    
    next();
  } catch (err) {
    console.error('[Auth Middleware] requireAdmin error:', err.message);
    return res.status(500).json({ 
      success: false, 
      error: 'Authentication error' 
    });
  }
};

export const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET || 'cctv-monitoring-secret',
    { expiresIn: '7d' }
  );
};