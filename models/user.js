const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 50
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['admin', 'operator', 'viewer'],
    default: 'viewer'
  },
  permissions: [{
    type: String,
    enum: ['read_devices', 'write_devices', 'send_commands', 'manage_users', 'view_logs']
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  refreshTokens: [{
    token: String,
    createdAt: { type: Date, default: Date.now, expires: '7d' }
  }]
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Generate JWT tokens
userSchema.methods.generateTokens = function() {
  const payload = {
    userId: this._id,
    username: this.username,
    email: this.email,
    role: this.role,
    permissions: this.permissions
  };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET || 'your-secret-key', {
    expiresIn: '15m'
  });

  const refreshToken = jwt.sign(
    { userId: this._id },
    process.env.JWT_REFRESH_SECRET || 'your-refresh-secret',
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
};

// Set default permissions based on role
userSchema.pre('save', function(next) {
  if (this.isModified('role')) {
    switch (this.role) {
      case 'admin':
        this.permissions = ['read_devices', 'write_devices', 'send_commands', 'manage_users', 'view_logs'];
        break;
      case 'operator':
        this.permissions = ['read_devices', 'write_devices', 'send_commands', 'view_logs'];
        break;
      case 'viewer':
        this.permissions = ['read_devices'];
        break;
    }
  }
  next();
});

userSchema.index({ username: 1 });
userSchema.index({ email: 1 });

// Prevent accidental deletion of admin users
// Block query-based deletions (findOneAndDelete, deleteOne, deleteMany, findOneAndRemove)
async function _preventAdminDeletionQuery(next) {
  try {
    // this.getFilter() works on query middleware; fall back to _conditions for older mongoose
    const filter = (typeof this.getFilter === 'function') ? this.getFilter() : this._conditions;
    // Find any matching users and check for admin role
    const matches = await mongoose.model('User').find(filter).select('role email username').lean();
    if (matches.some(u => u && u.role === 'admin')) {
      const err = new Error('Deletion blocked: admin user cannot be deleted');
      err.status = 403;
      return next(err);
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

userSchema.pre('findOneAndDelete', _preventAdminDeletionQuery);
userSchema.pre('findOneAndRemove', _preventAdminDeletionQuery);
userSchema.pre('deleteOne', { document: false, query: true }, _preventAdminDeletionQuery);
userSchema.pre('deleteMany', { document: false, query: true }, _preventAdminDeletionQuery);

// Prevent document.remove() from deleting an admin document
userSchema.pre('remove', function(next) {
  if (this.role === 'admin') {
    const err = new Error('Deletion blocked: admin user cannot be deleted');
    err.status = 403;
    return next(err);
  }
  next();
});

module.exports = mongoose.model('User', userSchema);