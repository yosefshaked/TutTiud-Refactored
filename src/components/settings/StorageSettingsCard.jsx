import React, { useCallback, useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Lock, HardDrive, Cloud, Loader2, CheckCircle2 } from 'lucide-react';
import { saveStorageConfiguration } from '@/features/settings/api/storage.js';
import { useOrg } from '@/org/OrgContext.jsx';

const STORAGE_MODES = {
  BYOS: 'byos',
  MANAGED: 'managed',
};

const PROVIDERS = [
  { value: 's3', label: 'Amazon S3' },
  { value: 'r2', label: 'Cloudflare R2' },
  { value: 'azure', label: 'Azure Blob Storage' },
  { value: 'gcs', label: 'Google Cloud Storage' },
  { value: 'generic', label: 'S3-Compatible (Generic)' },
];

const REQUEST = {
  idle: 'idle',
  loading: 'loading',
  error: 'error',
};

export default function StorageSettingsCard({ session, orgId }) {
  const { orgSettings } = useOrg();
  const [saveState, setSaveState] = useState(REQUEST.idle);
  const [selectedMode, setSelectedMode] = useState('');
  const [provider, setProvider] = useState('s3');
  const [endpoint, setEndpoint] = useState('');
  const [region, setRegion] = useState('');
  const [bucket, setBucket] = useState('');
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');

  const canAct = Boolean(session && orgId);

  // Get storage_access_level permission
  const storageAccessLevel = orgSettings?.permissions?.storage_access_level;
  
  // Determine access states
  const isLocked = storageAccessLevel === false || !storageAccessLevel;
  const canUseBYOS = storageAccessLevel === 'byos_only' || storageAccessLevel === 'all';
  const canUseManaged = storageAccessLevel === 'managed_only' || storageAccessLevel === 'all';

  // Load existing storage profile
  useEffect(() => {
    const profile = orgSettings?.storageProfile;
    if (profile && profile.mode) {
      setSelectedMode(profile.mode);
      if (profile.mode === STORAGE_MODES.BYOS && profile.byos) {
        setProvider(profile.byos.provider || 's3');
        setEndpoint(profile.byos.endpoint || '');
        setRegion(profile.byos.region || '');
        setBucket(profile.byos.bucket || '');
        // Don't populate credentials for security (force re-entry)
      }
    }
  }, [orgSettings]);

  const handleSave = useCallback(async () => {
    if (!canAct) return;

    if (!selectedMode) {
      toast.error('יש לבחור מצב אחסון');
      return;
    }

    setSaveState(REQUEST.loading);

    try {
      let payload;

      if (selectedMode === STORAGE_MODES.MANAGED) {
        // For managed mode, we need to generate a namespace
        // Use a simple hash-like approach for better uniqueness
        const createNamespace = (id) => {
          // Take first 8 chars + last 4 chars for better distribution
          const prefix = id.substring(0, 8);
          const suffix = id.substring(id.length - 4);
          return `org-${prefix}-${suffix}`;
        };
        const namespace = createNamespace(orgId);
        payload = {
          mode: STORAGE_MODES.MANAGED,
          managed: {
            namespace,
            active: true,
          },
        };
      } else if (selectedMode === STORAGE_MODES.BYOS) {
        // Validate BYOS fields
        const trimmedEndpoint = endpoint.trim();
        
        if (!trimmedEndpoint) {
          toast.error('נדרשת כתובת Endpoint');
          setSaveState(REQUEST.idle);
          return;
        }
        
        // HTTPS validation for security
        if (!trimmedEndpoint.startsWith('https://')) {
          toast.error('Endpoint חייב להשתמש ב-HTTPS למניעת דליפת מפתחות');
          setSaveState(REQUEST.idle);
          return;
        }
        
        if (!bucket.trim()) {
          toast.error('נדרש שם Bucket');
          setSaveState(REQUEST.idle);
          return;
        }
        if (!accessKeyId.trim()) {
          toast.error('נדרש Access Key ID');
          setSaveState(REQUEST.idle);
          return;
        }
        if (!secretAccessKey.trim()) {
          toast.error('נדרש Secret Access Key');
          setSaveState(REQUEST.idle);
          return;
        }

        payload = {
          mode: STORAGE_MODES.BYOS,
          byos: {
            provider,
            endpoint: endpoint.trim(),
            bucket: bucket.trim(),
            access_key_id: accessKeyId.trim(),
            secret_access_key: secretAccessKey.trim(),
          },
        };

        if (region.trim()) {
          payload.byos.region = region.trim();
        }
      }

      await saveStorageConfiguration(orgId, payload, { session });

      toast.success('הגדרות האחסון נשמרו בהצלחה!');
      setSaveState(REQUEST.idle);

      // Clear sensitive fields after save
      setAccessKeyId('');
      setSecretAccessKey('');
    } catch (error) {
      console.error('Save storage configuration failed', error);
      toast.error(error?.message || 'שמירת הגדרות האחסון נכשלה');
      setSaveState(REQUEST.error);
    }
  }, [canAct, orgId, session, selectedMode, provider, endpoint, region, bucket, accessKeyId, secretAccessKey]);

  // Render locked state
  if (isLocked) {
    return (
      <div className="relative" dir="rtl">
        <div className="absolute inset-0 bg-slate-100/80 backdrop-blur-[2px] z-10 rounded-lg flex items-center justify-center">
          <div className="text-center p-6 bg-white rounded-lg shadow-lg max-w-sm">
            <Lock className="h-12 w-12 text-slate-400 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">תכונה זו אינה זמינה</h3>
            <p className="text-sm text-slate-600">
              תכונת הגדרות אחסון זמינה בחבילות מתקדמות. צור קשר עם התמיכה לקבלת מידע נוסף.
            </p>
          </div>
        </div>
        <Card className="opacity-50 pointer-events-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              הגדרות אחסון
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">טעינה...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDrive className="h-5 w-5" />
          הגדרות אחסון
        </CardTitle>
        <p className="text-sm text-slate-600 mt-2">
          בחר את מצב האחסון המועדף עבור קבצי הארגון
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Mode Selection */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">מצב אחסון</Label>
          <div className="grid gap-3">
            {/* Managed Storage Option */}
            <button
              type="button"
              onClick={() => canUseManaged && setSelectedMode(STORAGE_MODES.MANAGED)}
              disabled={!canUseManaged}
              className={`p-4 border-2 rounded-lg text-right transition-all ${
                selectedMode === STORAGE_MODES.MANAGED
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : canUseManaged
                  ? 'border-slate-200 hover:border-primary/50'
                  : 'border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed'
              }`}
            >
              <div className="flex items-start gap-3">
                <Cloud className={`h-5 w-5 mt-0.5 ${canUseManaged ? 'text-primary' : 'text-slate-400'}`} />
                <div className="flex-1">
                  <div className="font-semibold mb-1">אחסון מנוהל</div>
                  <p className="text-sm text-slate-600">
                    נאחסן בצורה מאובטחת על ידי TutTiud
                  </p>
                  {!canUseManaged && (
                    <Badge variant="secondary" className="mt-2">לא זמין בחבילה שלך</Badge>
                  )}
                </div>
                {selectedMode === STORAGE_MODES.MANAGED && (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                )}
              </div>
            </button>

            {/* BYOS Option */}
            <button
              type="button"
              onClick={() => canUseBYOS && setSelectedMode(STORAGE_MODES.BYOS)}
              disabled={!canUseBYOS}
              className={`p-4 border-2 rounded-lg text-right transition-all ${
                selectedMode === STORAGE_MODES.BYOS
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : canUseBYOS
                  ? 'border-slate-200 hover:border-primary/50'
                  : 'border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed'
              }`}
            >
              <div className="flex items-start gap-3">
                <HardDrive className={`h-5 w-5 mt-0.5 ${canUseBYOS ? 'text-primary' : 'text-slate-400'}`} />
                <div className="flex-1">
                  <div className="font-semibold mb-1">BYOS - אחסון משלך</div>
                  <p className="text-sm text-slate-600">
                    השתמש באחסון ענן משלך (S3, R2, Azure וכו')
                  </p>
                  {!canUseBYOS && (
                    <Badge variant="secondary" className="mt-2">לא זמין בחבילה שלך</Badge>
                  )}
                </div>
                {selectedMode === STORAGE_MODES.BYOS && (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                )}
              </div>
            </button>
          </div>
        </div>

        {/* Managed Storage Success Message */}
        {selectedMode === STORAGE_MODES.MANAGED && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-emerald-900 mb-1">נאחסן בצורה מאובטחת</div>
              <p className="text-sm text-emerald-700">
                הקבצים שלך יישמרו באופן מאובטח במערכת TutTiud ללא צורך בהגדרות נוספות.
              </p>
            </div>
          </div>
        )}

        {/* BYOS Configuration Form */}
        {selectedMode === STORAGE_MODES.BYOS && (
          <div className="space-y-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <div>
              <Label htmlFor="provider">ספק אחסון</Label>
              <select
                id="provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full mt-1 rounded-md border border-slate-300 p-2 text-sm"
                dir="ltr"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="endpoint">
                Endpoint <span className="text-red-500">*</span>
              </Label>
              <Input
                id="endpoint"
                type="url"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="https://s3.amazonaws.com"
                className="mt-1"
                dir="ltr"
                required
              />
              <p className="text-xs text-slate-500 mt-1">
                חובה להשתמש ב-HTTPS למניעת דליפת מפתחות
              </p>
            </div>

            <div>
              <Label htmlFor="bucket">
                Bucket <span className="text-red-500">*</span>
              </Label>
              <Input
                id="bucket"
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
                placeholder="my-bucket-name"
                className="mt-1"
                dir="ltr"
                required
              />
            </div>

            <div>
              <Label htmlFor="region">Region (אופציונלי)</Label>
              <Input
                id="region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="us-east-1"
                className="mt-1"
                dir="ltr"
              />
            </div>

            <div>
              <Label htmlFor="accessKeyId">
                Access Key ID <span className="text-red-500">*</span>
              </Label>
              <Input
                id="accessKeyId"
                type="text"
                value={accessKeyId}
                onChange={(e) => setAccessKeyId(e.target.value)}
                placeholder="AKIAIOSFODNN7EXAMPLE"
                className="mt-1"
                dir="ltr"
                required
              />
            </div>

            <div>
              <Label htmlFor="secretAccessKey">
                Secret Access Key <span className="text-red-500">*</span>
              </Label>
              <Input
                id="secretAccessKey"
                type="password"
                value={secretAccessKey}
                onChange={(e) => setSecretAccessKey(e.target.value)}
                placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                className="mt-1"
                dir="ltr"
                required
              />
              <p className="text-xs text-slate-500 mt-1">
                המפתחות נשמרים באופן מוצפן
              </p>
            </div>
          </div>
        )}

        {/* Save Button */}
        {selectedMode && (
          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            <Button
              onClick={handleSave}
              disabled={saveState === REQUEST.loading || !selectedMode}
              className="gap-2"
            >
              {saveState === REQUEST.loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  שומר...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  שמירת הגדרות
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
