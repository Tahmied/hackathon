import mongoose, { Schema } from 'mongoose';

export interface RolePermissionDoc {
  _id: mongoose.Types.ObjectId;
  roleId: mongoose.Types.ObjectId;
  permissionId: mongoose.Types.ObjectId;
  grantedBy?: mongoose.Types.ObjectId;
  grantedAt: Date;
}

const RolePermissionSchema = new Schema<RolePermissionDoc>(
  {
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true, index: true },
    permissionId: {
      type: Schema.Types.ObjectId,
      ref: 'Permission',
      required: true,
      index: true,
    },
    grantedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    grantedAt: { type: Date, default: Date.now },
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  {},
);

RolePermissionSchema.index({ roleId: 1, permissionId: 1 }, { unique: true });

export const RolePermission = mongoose.model<RolePermissionDoc>(
  'RolePermission',
  RolePermissionSchema,
);
