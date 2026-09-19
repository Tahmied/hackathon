'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BadgeCheck, ShieldAlert, Upload, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, apiErrorMessage } from '@/lib/api';

interface KycData {
  status: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  rejectionReason?: string;
  submissions: {
    _id: string;
    docType: string;
    status: string;
    ocrConfidence?: number;
    ocrUnclear?: boolean;
    aiAnalysis?: { available: boolean; nameMatch?: boolean | null; summary?: string; reason?: string };
    reviewComment?: string;
    createdAt: string;
  }[];
}

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [docType, setDocType] = useState('NID');
  const [fullNameOnDoc, setFullNameOnDoc] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [frontUrl, setFrontUrl] = useState('');
  const [uploading, setUploading] = useState(false);

  const profile = useQuery({
    queryKey: ['users', 'me'],
    queryFn: async () => (await api.get('/users/me/profile')).data.data,
  });

  const kyc = useQuery({
    queryKey: ['kyc', 'me'],
    queryFn: async () => (await api.get('/kyc/me')).data.data as KycData,
  });

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.put('/users/me/profile', {
        name: name || undefined,
        phone: phone || undefined,
      });
      toast.success('Profile updated');
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  }

  async function uploadDoc(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/uploads', form, {
        headers: { 'content-type': 'multipart/form-data' },
      });
      setFrontUrl(res.data.data.url);
      const ocr = res.data.data.ocr;
      if (ocr?.available && ocr.unclear) {
        toast.warning(`OCR confidence low (${Math.round(ocr.confidence)}%) — use a clearer photo`);
      } else if (ocr?.available) {
        toast.success('Document uploaded and read');
      } else {
        toast.success('Document uploaded');
      }
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function submitKyc(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/kyc', {
        docType,
        fullNameOnDoc: fullNameOnDoc || undefined,
        docNumber: docNumber || undefined,
        frontUrl,
      });
      toast.success('KYC submitted for review');
      setFrontUrl('');
      if (fileRef.current) fileRef.current.value = '';
      void queryClient.invalidateQueries({ queryKey: ['kyc'] });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  const statusBadge = () => {
    const s = kyc.data?.status ?? 'UNVERIFIED';
    if (s === 'VERIFIED')
      return (
        <Badge className="gap-1 bg-profit/15 text-profit border border-profit/40">
          <BadgeCheck className="h-3.5 w-3.5" /> Verified
        </Badge>
      );
    if (s === 'PENDING')
      return <Badge variant="outline" className="border-warning/40 text-warning">Pending review</Badge>;
    if (s === 'REJECTED')
      return (
        <Badge variant="outline" className="border-loss/40 text-loss">
          <XCircle className="mr-1 h-3.5 w-3.5" /> Rejected
        </Badge>
      );
    return <Badge variant="secondary">Unverified</Badge>;
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
      <h1 className="text-2xl font-bold">Profile & verification</h1>
      <p className="mb-6 text-sm text-muted-foreground">Manage your account and identity verification</p>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Account</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveProfile} className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={profile.data?.user?.email ?? ''} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-name">Name</Label>
                <Input
                  id="p-name"
                  placeholder={profile.data?.user?.name}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-phone">Phone</Label>
                <Input
                  id="p-phone"
                  placeholder={profile.data?.user?.phone ?? '+8801XXXXXXXXX'}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={savingProfile}>
                {savingProfile ? 'Saving…' : 'Save changes'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* KYC */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Identity verification (KYC)</CardTitle>
              {statusBadge()}
            </div>
          </CardHeader>
          <CardContent>
            {kyc.data?.status === 'REJECTED' && kyc.data.rejectionReason && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-loss/40 bg-loss/10 p-3 text-sm text-loss">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <b>Rejected:</b> {kyc.data.rejectionReason}
                </div>
              </div>
            )}

            {kyc.data?.status === 'VERIFIED' ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                🎉 Your identity is verified. You have full access to the platform.
              </p>
            ) : kyc.data?.status === 'PENDING' ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Your document is under review. You&apos;ll be notified once reviewed.
              </p>
            ) : (
              <form onSubmit={submitKyc} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Document type</Label>
                    <Select value={docType} onValueChange={(v) => { if (v) setDocType(v); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NID">NID</SelectItem>
                        <SelectItem value="PASSPORT">Passport</SelectItem>
                        <SelectItem value="DRIVING_LICENSE">Driving license</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="k-docnum">Document number</Label>
                    <Input id="k-docnum" value={docNumber} onChange={(e) => setDocNumber(e.target.value)} placeholder="e.g. 1990123456789" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="k-name">Full name on document</Label>
                  <Input id="k-name" value={fullNameOnDoc} onChange={(e) => setFullNameOnDoc(e.target.value)} placeholder="Must match your profile name" />
                </div>
                <div className="space-y-2">
                  <Label>Document photo (front)</Label>
                  {frontUrl ? (
                    <div className="rounded-lg border border-profit/40 bg-profit/10 p-3 text-sm text-profit">Document uploaded ✓</div>
                  ) : (
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground hover:border-primary/50">
                      <Upload className="h-4 w-4" />
                      {uploading ? 'Processing (OCR running)…' : 'Upload NID / passport photo'}
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadDoc(file);
                        }}
                      />
                    </label>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={!frontUrl}>
                  Submit for verification
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  Verification is AI-assisted — the document is read automatically and the
                  name is compared with your profile. Make sure both match.
                </p>
              </form>
            )}

            {/* Previous submissions */}
            {(kyc.data?.submissions ?? []).length > 0 && (
              <div className="mt-5 space-y-2 border-t border-border pt-4">
                <p className="text-xs font-medium text-muted-foreground">Submission history</p>
                {kyc.data!.submissions.map((s) => (
                  <div key={s._id} className="flex items-center justify-between rounded-lg bg-background/40 px-3 py-2 text-xs">
                    <span>{s.docType}</span>
                    <div className="flex items-center gap-2">
                      {s.aiAnalysis?.available === false && (
                        <span className="text-[10px] text-muted-foreground">AI unavailable — manual review</span>
                      )}
                      {s.aiAnalysis?.nameMatch === false && (
                        <span className="text-[10px] text-loss">AI: name mismatch</span>
                      )}
                      <Badge variant={s.status === 'VERIFIED' ? 'default' : s.status === 'REJECTED' ? 'destructive' : 'secondary'}>
                        {s.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
