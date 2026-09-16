const { Schema, model } = require("mongoose");

const preSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    roles: { type: [String], default: ["USER"] },
    expiresAt: { type: Date },
    used: { type: Boolean, default: false },
    invitedBy: { type: String },
    notes: { type: String },
  },
  { timestamps: true }
);

// TTL opcional si se define expiresAt
preSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, partialFilterExpression: { expiresAt: { $exists: true } } }
);

module.exports = model("PreapprovedEmail", preSchema);

