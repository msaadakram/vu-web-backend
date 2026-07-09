/**
 * Seed an admin user.
 * Usage: node scripts/seed-admin.js
 *
 * Sets ADMIN_EMAIL and ADMIN_PASSWORD from .env, or uses defaults below.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../src/models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/virtualu';

const ADMIN_NAME = process.env.ADMIN_NAME || 'Admin';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@virtualu.edu.pk';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123456';

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const existing = await User.findOne({ email: ADMIN_EMAIL });
  if (existing) {
    await User.findByIdAndUpdate(existing._id, { role: 'admin' });
    console.log(`Admin role set for existing user: ${ADMIN_EMAIL}`);
  } else {
    await User.create({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: 'admin',
    });
    console.log(`Admin user created: ${ADMIN_EMAIL}`);
  }

  console.log('\n--- Admin Credentials ---');
  console.log(`Email:    ${ADMIN_EMAIL}`);
  console.log(`Password: ${ADMIN_PASSWORD}`);
  console.log('-------------------------\n');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
