const Subscriber = require('../models/Subscriber');

exports.subscribe = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ status: 'error', message: 'Email is required.' });
    }

    const normalized = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalized)) {
      return res.status(400).json({ status: 'error', message: 'Please enter a valid email address.' });
    }

    const existing = await Subscriber.findOne({ email: normalized });
    if (existing) {
      if (existing.active) {
        return res.status(409).json({ status: 'error', message: 'This email is already subscribed.' });
      }
      // Re-activate if previously unsubscribed
      existing.active = true;
      await existing.save();
      return res.status(200).json({ status: 'success', message: 'Welcome back! You have been re-subscribed.' });
    }

    await Subscriber.create({ email: normalized });
    return res.status(201).json({ status: 'success', message: "You're subscribed! We'll keep you updated." });
  } catch (err) {
    console.error('[Newsletter] Subscribe error:', err.message);
    return res.status(500).json({ status: 'error', message: 'Something went wrong. Please try again.' });
  }
};
