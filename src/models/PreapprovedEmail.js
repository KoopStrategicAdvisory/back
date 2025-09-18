const { Schema, model } = require("mongoose");
const { normalizeRoles } = require("../utils/roles");

const preSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    roles: {
      type: [String],
      default: ["user"],
      set: (value) => normalizeRoles(value),
    },
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
