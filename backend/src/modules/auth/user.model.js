import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const AgentSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        password: {
            type: String,
            required: true,
            select: false,
        },
        avatar: {
            type: String,
            default: null,
        },
        role: {
            type: String,
            enum: ["super_admin", "admin", "senior_agent", "agent"],
            default: "agent",
        },
        //departments and brands db are not created yet
        // departments: [
        //   {
        //     type: mongoose.Schema.Types.ObjectId,
        //     ref: "Department",
        //   },
        // ],
        // brands: [
        //   {
        //     type: mongoose.Schema.Types.ObjectId,
        //     ref: "Brand",
        //   },
        // ],
        departments: {
            type: [String],
            default: [],
        },
        brands: {
            type: [String],
            default: [],
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        presenceStatus: {
            type: String,
            enum: ["online", "away", "offline"],
            default: "offline",
        },
        lastSeen: {
            type: Date,
            default: null,
        },
        pushEnabled: {
            type: Boolean,
            default: false,
        },
        pushNotificationEnabled: {
            type: Object,
            default: null,
            select: false,
        },
        timezone: {
            type: String,
            default: "UTC",
        },
        passwordChangedAt: {
            type: Date,
            default: null,
            select: false,
        },
        failedLoginAttempts: {
            type: Number,
            default: 0,
            select: false,
        },
        lockedUntil: {
            type: Date,
            default: null,
            select: false,
        },
        aiPerformanceRating: {
            type: Number,
            default: 0,
        },
        aiRatingUpdatedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);


AgentSchema.index({ role: 1 });
AgentSchema.index({ brands: 1 });
AgentSchema.index({ departments: 1 });
AgentSchema.index({ isActive: 1 });


AgentSchema.pre("save", async function () {
    if (!this.isModified("password")) return;
    this.password = await bcrypt.hash(this.password, 12);
    if (!this.isNew) this.passwordChangedAt = new Date();
});


AgentSchema.methods.isPasswordCorrect = async function (plainPassword) {
    return await bcrypt.compare(plainPassword, this.password);
};

AgentSchema.methods.generateAccessToken = function () {
    return jwt.sign(
        {
            userId: this._id,
            role: this.role,
            email: this.email,
        },
        process.env.ACCESS_TOKEN_KEY,
        {
            expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
        }
    );
};

AgentSchema.methods.generateRefreshToken = function () {
    return jwt.sign(
        {
            userId: this._id,
        },
        process.env.REFRESH_TOKEN_KEY,
        {
            expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
        }
    );
};


AgentSchema.methods.isTokenIssuedBeforePasswordChange = function (jwtIssuedAt) {
    if (!this.passwordChangedAt) return false;
    return this.passwordChangedAt.getTime() / 1000 > jwtIssuedAt;
};

AgentSchema.methods.isLocked = function () {
    return this.lockedUntil && this.lockedUntil > new Date();
};

AgentSchema.statics.findByEmail = function (email) {
    return this.findOne({ email: email.toLowerCase().trim() }).select(
        "+password +pushNotificationEnabled +failedLoginAttempts +lockedUntil +passwordChangedAt"
    );
};

export const Agent = mongoose.model("Agent", AgentSchema);