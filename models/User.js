const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// A staff account (reporter or editor). Only the bcrypt hash of the password is stored.
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['reporter', 'editor'], required: true },
}, { timestamps: true });

// Compares a typed password with the stored hash; resolves to true or false.
userSchema.methods.checkPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

// Hashes a plain password with bcrypt (cost 12) so it can be stored as passwordHash.
userSchema.statics.hashPassword = function (plain) {
  return bcrypt.hash(plain, 12);
};

module.exports = mongoose.model('User', userSchema);
