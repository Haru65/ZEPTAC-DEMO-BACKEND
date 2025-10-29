const User = require('../models/user');

const DEFAULT_ADMIN = {
  username: process.env.ADMIN_USERNAME || 'admin',
  email: process.env.ADMIN_EMAIL || 'admin@zeptac.com',
  password: process.env.ADMIN_PASSWORD || 'admin123',
  role: 'admin',
  permissions: ['read_devices', 'write_devices', 'send_commands', 'manage_users', 'view_logs']
};

async function ensureAdminExists() {
  try {
    const existing = await User.findOne({ email: DEFAULT_ADMIN.email });
    if (existing) return existing;

    const admin = new User({
      username: DEFAULT_ADMIN.username,
      email: DEFAULT_ADMIN.email,
      password: DEFAULT_ADMIN.password,
      role: DEFAULT_ADMIN.role,
      permissions: DEFAULT_ADMIN.permissions
    });

    await admin.save();
    console.log('✅ Default admin user created:', DEFAULT_ADMIN.email);
    return admin;
  } catch (err) {
    console.error('❌ ensureAdminExists error:', err);
    throw err;
  }
}

module.exports = { ensureAdminExists };
