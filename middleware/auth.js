const jwt = require('jsonwebtoken');
const User = require('../models/user');

// Authenticate JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production');
    
    // For development/testing - allow if we can decode the token
    if (process.env.NODE_ENV === 'development') {
      req.user = {
        ...decoded,
        permissions: ['read_devices', 'write_devices', 'send_commands', 'manage_users', 'view_logs'] // Grant all permissions for development
      };
      console.log('🔓 Development mode: Token verified, user permissions granted');
      return next();
    }
    
    // Check if user still exists and is active (production mode)
    const user = await User.findOne({ 
      _id: decoded.userId, 
      isActive: true 
    }).select('-password -refreshTokens');

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found or inactive'
      });
    }

    req.user = {
      ...decoded,
      permissions: user.permissions || []
    };
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired'
      });
    }
    
    console.error('🔐 Authentication error:', error);
    return res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
};

// Check if user has required permission
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user.permissions.includes(permission)) {
      return res.status(403).json({
        success: false,
        error: `Insufficient permissions. Required: ${permission}`
      });
    }
    next();
  };
};

// Check if user has required role
const requireRole = (roles) => {
  return (req, res, next) => {
    const userRole = req.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: `Insufficient role. Required: ${allowedRoles.join(' or ')}`
      });
    }
    next();
  };
};

// Optional authentication (for public endpoints that can benefit from user context)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      req.user = decoded;
    }
    
    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

module.exports = {
  authenticateToken,
  requirePermission,
  requireRole,
  optionalAuth
};