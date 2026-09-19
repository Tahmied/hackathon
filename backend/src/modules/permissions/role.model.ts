import mongoose, { Schema } from 'mongoose';
import { RoleValues, type RoleName } from '../../constants/roles.js';

export interface RoleDoc {
  _id: mongoose.Types.ObjectId;
  name: RoleName;
  label: string;
  description?: string;
  isSystem: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const RoleSchema = new Schema<RoleDoc>(
  {
    name: { type: String, enum: RoleValues, required: true, unique: true },
    label: { type: String, required: true },
    description: { type: String },
    isSystem: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Role = mongoose.model<RoleDoc>('Role', RoleSchema);
