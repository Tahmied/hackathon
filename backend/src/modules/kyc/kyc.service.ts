import { ApiError } from '../../shared/utils/ApiError.js';
import { KycSubmission } from './kyc.model.js';
import { User } from '../auth/user.model.js';
import { invalidateUserAuthorization } from '../../shared/utils/permissionHelpers.js';
import { logAudit } from '../audit/audit.model.js';
import { notifyUser } from '../notifications/notifications.service.js';
import { processKycDocument } from '../../shared/utils/receiptPipeline.js';

export async function submitKyc(
  userId: string,
  input: {
    docType: 'NID' | 'PASSPORT' | 'DRIVING_LICENSE';
    fullNameOnDoc?: string;
    docNumber?: string;
    frontUrl: string;
    backUrl?: string;
  },
) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  if (user.kycStatus === 'PENDING') {
    throw ApiError.badRequest('A KYC submission is already under review');
  }
  if (user.kycStatus === 'VERIFIED') {
    throw ApiError.badRequest('Your account is already verified');
  }

  const submission = await KycSubmission.create({
    userId,
    docType: input.docType,
    fullNameOnDoc: input.fullNameOnDoc,
    docNumber: input.docNumber,
    frontUrl: input.frontUrl,
    backUrl: input.backUrl,
    status: 'PENDING',
  });

  user.kycStatus = 'PENDING';
  user.kycRejectionReason = undefined;
  await user.save();
  await invalidateUserAuthorization(userId);

  await logAudit({
    actorId: userId,
    actorRole: user.role,
    action: 'kyc.submitted',
    targetType: 'kyc',
    targetId: submission._id,
    metadata: { userId, docType: input.docType },
  });

  processKycDocument(submission._id.toString()).catch(() => undefined);

  return submission;
}

export async function getMyKyc(userId: string) {
  const [submissions, user] = await Promise.all([
    KycSubmission.find({ userId }).sort({ createdAt: -1 }).limit(5).lean(),
    User.findById(userId).select('kycStatus kycRejectionReason name'),
  ]);
  return { status: user?.kycStatus ?? 'UNVERIFIED', rejectionReason: user?.kycRejectionReason, submissions };
}

export async function listKycQueue(status?: string) {
  const filter: Record<string, unknown> = status ? { status } : {};
  return KycSubmission.find(filter)
    .sort({ createdAt: 1 })
    .limit(100)
    .populate('userId', 'name email kycStatus')
    .lean();
}

export async function getKycDetail(kycId: string) {
  const kyc = await KycSubmission.findById(kycId).populate('userId', 'name email kycStatus phone').lean();
  if (!kyc) throw ApiError.notFound('KYC submission not found');
  return kyc;
}

export async function reviewKyc(
  kycId: string,
  input: { approve: boolean; comment: string },
  actor: { id: string; role: string; ip?: string; userAgent?: string },
) {
  if (!input.comment || input.comment.trim().length < 3) {
    throw ApiError.badRequest('A review comment is mandatory');
  }
  const kyc = await KycSubmission.findOneAndUpdate(
    { _id: kycId, status: 'PENDING' },
    {
      $set: {
        status: input.approve ? 'VERIFIED' : 'REJECTED',
        reviewedBy: actor.id,
        reviewedAt: new Date(),
        reviewComment: input.comment,
      },
    },
    { new: true },
  );
  if (!kyc) throw ApiError.conflict('KYC submission is not pending');

  const user = await User.findById(kyc.userId);
  if (user) {
    user.kycStatus = input.approve ? 'VERIFIED' : 'REJECTED';
    user.kycRejectionReason = input.approve ? undefined : input.comment;
    await user.save();
    await invalidateUserAuthorization(user._id.toString());

    await notifyUser({
      userId: user._id.toString(),
      type: input.approve ? 'KYC_VERIFIED' : 'KYC_REJECTED',
      title: input.approve ? 'Identity verified 🎉' : 'KYC rejected',
      body: input.comment,
      data: { kycId },
    });
  }

  await logAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: input.approve ? 'kyc.approved' : 'kyc.rejected',
    targetType: 'kyc',
    targetId: kycId,
    metadata: { userId: String(kyc.userId), comment: input.comment },
    ip: actor.ip,
    userAgent: actor.userAgent,
  });

  return kyc;
}
