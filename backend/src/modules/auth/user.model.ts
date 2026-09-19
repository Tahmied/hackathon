import mongoose, { Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { KycStatuses, type KycStatus } from '../../constants/index.js';
import { RoleValues, RoleRank, type RoleName } from '../../constants/roles.js';

export interface UserDoc extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  phone?: string;
  passwordHash?: string;
  role: RoleName;
  roleRank: number;
  permissionsGranted: string[];
  permissionsDenied: string[];
  kycStatus: KycStatus;
  kycRejectionReason?: string;
  googleId?: string;
  avatarUrl?: string;
  emailVerified: boolean;
  isActive: boolean;
  lastLoginAt?: Date;
  passwordChangedAt?: Date;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;

  comparePassword(plain: string): Promise<boolean>;
  generateAccessToken(): string;
  generateRefreshToken(): string;
  isLocked(): boolean;
}

const UserSchema = new Schema<UserDoc>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, select: false },
    role: { type: String, enum: RoleValues, default: 'user', index: true },
    roleRank: { type: Number, default: RoleRank.user },
    permissionsGranted: { type: [String], default: [] },
    permissionsDenied: { type: [String], default: [] },
    kycStatus: {
      type: String,
      enum: Object.values(KycStatuses),
      default: KycStatuses.UNVERIFIED,
    },
    kycRejectionReason: { type: String },
    googleId: { type: String, index: true, default: undefined },
    avatarUrl: { type: String },
    emailVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    passwordChangedAt: { type: Date, select: false },
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, select: false },
  },
  { timestamps: true },
);

/** Sets passwordChangedAt when a new hash is persisted (hashing is explicit in services). */
UserSchema.pre('save', function () {
  if (this.isModified('passwordHash') && !this.isNew) {
    this.passwordChangedAt = new Date();
  }
});

UserSchema.methods.comparePassword = async function (plain: string) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(plain, this.passwordHash);
};

UserSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    { userId: this._id.toString(), role: this.role, email: this.email },
    env.ACCESS_TOKEN_KEY,
    { expiresIn: env.ACCESS_TOKEN_EXPIRY } as jwt.SignOptions,
  );
};

UserSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    { userId: this._id.toString(), type: 'refresh' },
    env.REFRESH_TOKEN_KEY,
    { expiresIn: env.REFRESH_TOKEN_EXPIRY } as jwt.SignOptions,
  );
};

UserSchema.methods.isLocked = function () {
  return Boolean(this.lockedUntil && this.lockedUntil > new Date());
};

export function hashPassword(plain: string) {
  return bcrypt.hash(plain, 12);
}

interface UserStatics extends mongoose.Model<UserDoc> {
  findByEmailWithSecrets(email: string): Promise<UserDoc | null>;
}

UserSchema.statics.findByEmailWithSecrets = function (email: string) {
  return this.findOne({ email: email.toLowerCase() }).select(
    '+passwordHash +failedLoginAttempts +lockedUntil +passwordChangedAt',
  );
};

export const User = mongoose.model<UserDoc, UserStatics>('User', UserSchema);
