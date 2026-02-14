'use client';

import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import DPage from '@/components/ui/DPage';
import DCard from '@/components/ui/DCard';
import { DErrorState } from '@/components/ui/DStates';
import { useToast } from '@/components/ui/DToast';
import { http, ApiError } from '@/lib/http';

interface Pref {
  category: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  LEAD: 'Leads',
  TASK: 'Tâches',
  CASE: 'Dossiers',
  LISTING: 'Annonces',
  INBOX: 'Messagerie',
  BILLING: 'Facturation',
  KYC: 'Vérification KYC',
  SYSTEM: 'Système',
};

export default function NotificationPreferencesPage() {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [phoneVerified, setPhoneVerified] = useState(false);

  const fetchPrefs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [prefsRes, meRes] = await Promise.all([
        http.get<Pref[]>('/me/notification-preferences'),
        http.get<{ user: { phone?: string | null; phoneVerifiedAt?: string | null } }>('/auth/me'),
      ]);
      setPrefs(prefsRes);
      setPhoneVerified(!!meRes.user.phone && !!meRes.user.phoneVerifiedAt);
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPrefs(); }, [fetchPrefs]);

  const handleToggle = async (category: string, field: 'emailEnabled' | 'whatsappEnabled', value: boolean) => {
    const prev = [...prefs];
    setPrefs((p) => p.map((pref) => pref.category === category ? { ...pref, [field]: value } : pref));

    try {
      await http.patch('/me/notification-preferences', { category, [field]: value });
    } catch (e) {
      setPrefs(prev);
      if (e instanceof ApiError) {
        if (e.code === 'PHONE_NOT_VERIFIED') {
          toast('Veuillez vérifier votre numéro de téléphone pour activer WhatsApp', 'error');
        } else {
          toast(e.message, 'error');
        }
      }
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 'var(--space-32)' }}><CircularProgress /></Box>;
  if (error) return <DErrorState requestId={error.requestId} cta={{ label: 'Réessayer', onClick: fetchPrefs }} />;

  return (
    <DPage title="Préférences de notifications" subtitle="Configurez vos canaux de notification par catégorie">
      <DCard>
        {/* Header */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '1fr 80px 100px',
            gap: 'var(--space-8)',
            pb: 'var(--space-12)',
            borderBottom: '1px solid var(--line)',
            mb: 'var(--space-8)',
          }}
        >
          <Typography sx={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)' }}>Catégorie</Typography>
          <Typography sx={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', textAlign: 'center' }}>Email</Typography>
          <Typography sx={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', textAlign: 'center' }}>WhatsApp</Typography>
        </Box>

        {/* Rows */}
        {prefs.map((pref) => (
          <Box
            key={pref.category}
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr 80px 100px',
              gap: 'var(--space-8)',
              alignItems: 'center',
              py: 'var(--space-8)',
              borderBottom: '1px solid var(--line)',
              '&:last-child': { borderBottom: 'none' },
            }}
          >
            <Typography sx={{ fontSize: '14px' }}>
              {CATEGORY_LABELS[pref.category] ?? pref.category}
            </Typography>
            <Box sx={{ textAlign: 'center' }}>
              <Switch
                size="small"
                checked={pref.emailEnabled}
                onChange={(_, v) => handleToggle(pref.category, 'emailEnabled', v)}
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--brand-copper)' },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'var(--brand-copper)' },
                }}
              />
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Tooltip
                title={phoneVerified ? '' : 'Vérifiez votre téléphone pour activer WhatsApp'}
                arrow
                disableHoverListener={phoneVerified}
              >
                <span>
                  <Switch
                    size="small"
                    checked={pref.whatsappEnabled}
                    disabled={!phoneVerified}
                    onChange={(_, v) => handleToggle(pref.category, 'whatsappEnabled', v)}
                    sx={phoneVerified ? {
                      '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--brand-copper)' },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'var(--brand-copper)' },
                    } : undefined}
                  />
                </span>
              </Tooltip>
            </Box>
          </Box>
        ))}
      </DCard>
    </DPage>
  );
}
