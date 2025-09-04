#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const User = require('../src/models/User');
const PreapprovedEmail = require('../src/models/PreapprovedEmail');

async function main() {
  const emailArg = process.argv[2] || 'koopstrategicadvisory@gmail.com';
  const email = String(emailArg).toLowerCase().trim();

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/auth_mvp';
  await mongoose.connect(uri, { autoIndex: true });

  try {
    const existing = await User.findOne({ email });
    if (existing) {
      const roles = Array.isArray(existing.roles) ? existing.roles : [];
      if (!roles.includes('ADMIN')) {
        roles.push('ADMIN');
        existing.roles = roles;
        await existing.save();
        console.log(`[OK] Usuario ${email} actualizado con rol ADMIN.`);
      } else {
        console.log(`[SKIP] Usuario ${email} ya tiene rol ADMIN.`);
      }
    } else {
      const doc = await PreapprovedEmail.findOneAndUpdate(
        { email },
        { email, roles: ['ADMIN'], used: false, invitedBy: 'setup-admin-script', notes: 'Grant ADMIN access' },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      console.log(`[OK] Preaprobación creada/actualizada para ${doc.email} con roles: ${doc.roles.join(', ')}`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('[ERROR] setup-admin:', err);
  process.exit(1);
});
