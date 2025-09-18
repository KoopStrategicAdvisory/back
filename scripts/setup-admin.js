#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const User = require('../src/models/User');
const PreapprovedEmail = require('../src/models/PreapprovedEmail');
const { normalizeRoles } = require('../src/utils/roles');

async function main() {
  const emailArg = process.argv[2] || 'koopstrategicadvisory@gmail.com';
  const email = String(emailArg).toLowerCase().trim();

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/auth_mvp';
  await mongoose.connect(uri, { autoIndex: true });

  try {
    const existing = await User.findOne({ email });
    if (existing) {
      const roles = normalizeRoles(existing.roles);
      if (!roles.includes('admin')) {
        existing.roles = normalizeRoles('admin', { defaultRole: 'admin' });
        await existing.save();
        console.log(`[OK] Usuario ${email} actualizado con rol admin.`);
      } else {
        console.log(`[SKIP] Usuario ${email} ya tiene rol admin.`);
      }
    } else {
      const doc = await PreapprovedEmail.findOneAndUpdate(
        { email },
        {
          email,
          roles: normalizeRoles('admin', { defaultRole: 'admin' }),
          used: false,
          invitedBy: 'setup-admin-script',
          notes: 'Grant admin access',
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      console.log(`[OK] Preaprobacion creada/actualizada para ${doc.email} con roles: ${doc.roles.join(', ')}`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('[ERROR] setup-admin:', err);
  process.exit(1);
});
