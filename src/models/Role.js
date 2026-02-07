const mongoose = require('mongoose');

const RoleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 40,
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 80,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 400,
    },
    active: {
      type: Boolean,
      default: true,
    },
    priority: {
      type: Number,
      default: 100,
      min: 0,
      max: 999,
    },
    system: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    collection: 'roles',
  }
);

RoleSchema.statics.ensureDefaults = async function ensureDefaults(defaults = []) {
  if (!Array.isArray(defaults) || defaults.length === 0) {
    return;
  }
  const operations = defaults.map((role, index) => {
    const normalizedName = String(role?.name || '').trim().toLowerCase();
    if (!normalizedName) return null;
    return {
      updateOne: {
        filter: { name: normalizedName },
        update: {
          $setOnInsert: {
            active: role?.active !== false,
            priority: typeof role?.priority === 'number' ? role.priority : index,
            system: role?.system !== false,
          },
          $set: {
            displayName: role?.displayName || role?.name,
            description: role?.description,
          },
        },
        upsert: true,
      },
    };
  }).filter(Boolean);

  if (operations.length > 0) {
    await this.bulkWrite(operations, { ordered: false });
  }
};

module.exports = mongoose.model('Role', RoleSchema);
