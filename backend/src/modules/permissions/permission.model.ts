import mongoose, { Schema } from 'mongoose';

export interface PermissionDoc {
  _id: mongoose.Types.ObjectId;
  name: string; // 'module:action'
  label: string;
  description?: string;
  module: string;
  action: string;
  createdAt: Date;
}

const PermissionSchema = new Schema<PermissionDoc>(
  {
    name: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    description: { type: String },
    module: { type: String, required: true, index: true },
    action: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const Permission = mongoose.model<PermissionDoc>('Permission', PermissionSchema);
