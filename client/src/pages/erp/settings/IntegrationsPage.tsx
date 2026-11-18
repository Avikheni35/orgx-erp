import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Grid, Card, CardContent, Chip, Button, Stack,
  TextField, Switch, FormControlLabel, IconButton, Tooltip, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Divider,
  Alert,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import SyncIcon from '@mui/icons-material/Sync';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { integrationsApi, ServiceConnectionView } from '../../../api/integrations';

// ── Third-party integration cards (static) ───────────────────────────────────
type IntegrationStatus = 'active' | 'configured' | 'coming_soon';
interface ThirdPartyIntegration {
  key: string; name: string; descDe: string; descEn: string;
  status: IntegrationStatus; initials: string; color: string; navigateTo?: string;
}
const THIRD_PARTY: ThirdPartyIntegration[] = [
  { key: 'datev',   name: 'DATEV',           status: 'coming_soon', initials: 'DTV',  color: '#1565C0', descDe: 'Buchungsdaten-Export für Steuerberater', descEn: 'Accounting data export for tax advisors' },
  { key: 'smtp',    name: 'E-Mail (SMTP)',    status: 'configured',  initials: 'SMTP', color: '#2E7D32', descDe: 'Transaktionsmails via SMTP', descEn: 'Transactional emails via SMTP', navigateTo: '/erp/einstellungen/unternehmen' },
  { key: 'stripe',  name: 'Stripe',          status: 'coming_soon', initials: 'STR',  color: '#6772E5', descDe: 'SaaS-Abonnements und Zahlungen', descEn: 'SaaS subscriptions and payments' },
  { key: 'twilio',  name: 'Twilio SMS',      status: 'coming_soon', initials: 'SMS',  color: '#F22F46', descDe: 'SMS-Benachrichtigungen', descEn: 'SMS notifications' },
  { key: 'fcm',     name: 'Firebase (Push)', status: 'coming_soon', initials: 'FCM',  color: '#F57C00', descDe: 'Push-Benachrichtigungen für PWA', descEn: 'Push notifications for PWA' },
  { key: 's3',      name: 'S3 / Objektspeicher', status: 'coming_soon', initials: 'S3', color: '#FF9900', descDe: 'Dokumenten- und PDF-Speicher', descEn: 'Document and PDF storage' },
  { key: 'maps',    name: 'Google Maps',     status: 'coming_soon', initials: 'MAP',  color: '#0F9D58', descDe: 'Geocodierung und Entfernungen', descEn: 'Geocoding and distance calculation' },
  { key: 'elster',  name: 'ELSTER',          status: 'active',      initials: 'ELT',  color: '#00838F', descDe: 'Steueranmeldung (manuell)', descEn: 'Tax filing (manual workflow)', navigateTo: '/erp/steuer/elster' },
];
const STATUS_COLOR: Record<IntegrationStatus, 'success' | 'info' | 'default'> = {
  active: 'success', configured: 'info', coming_soon: 'default',
};

// ── Connected Module Card ─────────────────────────────────────────────────────
interface ModuleCardProps {
  module: 'm1' | 'm2';
  label: string;
  description: string;
  connection?: ServiceConnectionView;
}

function ModuleCard({ module, label, description, connection }: ModuleCardProps) {
  const qc = useQueryClient();
  const [url, setUrl]       = useState(connection?.url ?? '');
  const [token, setToken]   = useState('');
  const [enabled, setEnabled] = useState(connection?.enabled ?? true);

  useEffect(() => {
    if (connection?.url !== undefined) setUrl(connection.url);
    if (connection?.enabled !== undefined) setEnabled(connection.enabled);
  }, [connection?.url, connection?.enabled]);
  const [testResult, setTestResult] = useState<{ ok: boolean; latencyMs?: number } | null>(null);
  const [testing, setTesting] = useState(false);

  const saveMutation = useMutation({
    mutationFn: () => integrationsApi.saveConnection(module, url, token || (connection?.token ?? ''), enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  });

  async function handleTest() {
    if (!url) return;
    if (token) await saveMutation.mutateAsync();
    setTesting(true);
    setTestResult(null);
    const result = await integrationsApi.testConnection(module);
    setTestResult(result);
    setTesting(false);
    if (result.ok) qc.invalidateQueries({ queryKey: ['integrations'] });
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
          <Box>
            <Typography fontWeight={700}>{label}</Typography>
            <Typography variant="body2" color="text.secondary">{description}</Typography>
          </Box>
          {connection?.lastPingAt && (
            <Chip
              size="small"
              icon={connection.lastPingOk ? <CheckCircleIcon /> : <ErrorIcon />}
              label={connection.lastPingOk ? 'Connected' : 'Error'}
              color={connection.lastPingOk ? 'success' : 'error'}
            />
          )}
        </Stack>

        <Stack spacing={2}>
          <TextField
            label="URL"
            size="small"
            fullWidth
            placeholder="https://m1.company.de"
            value={url}
            onChange={e => setUrl(e.target.value)}
          />
          <TextField
            label="Service Token"
            size="small"
            fullWidth
            type="password"
            placeholder={connection ? '(stored — paste new token to update)' : 'sk_m1_…'}
            value={token}
            onChange={e => setToken(e.target.value)}
          />
          <FormControlLabel
            control={<Switch checked={enabled} onChange={e => setEnabled(e.target.checked)} size="small" />}
            label="Enabled"
          />

          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              size="small"
              disabled={!url || testing}
              onClick={handleTest}
              startIcon={testing ? <CircularProgress size={14} /> : undefined}
            >
              Test Connection
            </Button>
            <Button
              variant="contained"
              size="small"
              disabled={!url || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              Save
            </Button>
          </Stack>

          {testResult && (
            <Alert severity={testResult.ok ? 'success' : 'error'} sx={{ py: 0.5 }}>
              {testResult.ok
                ? `Connected — ${testResult.latencyMs}ms`
                : 'Connection failed — check URL and token'}
            </Alert>
          )}
          {connection?.lastPingAt && (
            <Typography variant="caption" color="text.secondary">
              Last ping: {new Date(connection.lastPingAt).toLocaleString()}
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

// ── M2 Sync Status Card ───────────────────────────────────────────────────────
function M2SyncCard({ de }: { de: boolean }) {
  const qc = useQueryClient();
  const [syncResult, setSyncResult] = useState<{ timesheets: { ok: number; failed: number }; invoices: { ok: number; failed: number } } | null>(null);

  const { data: syncStatus } = useQuery({
    queryKey: ['m2-sync-status'],
    queryFn:  integrationsApi.getM2SyncStatus,
    refetchInterval: 30_000,
  });

  const syncMutation = useMutation({
    mutationFn: integrationsApi.m2SyncNow,
    onSuccess: (result) => {
      setSyncResult(result as { timesheets: { ok: number; failed: number }; invoices: { ok: number; failed: number } });
      qc.invalidateQueries({ queryKey: ['m2-sync-status'] });
    },
  });

  if (!syncStatus?.connected) return null;

  const { timesheets, invoices } = syncStatus;
  const pendingTotal = (timesheets?.pending ?? 0) + (invoices?.pending ?? 0);
  const failedTotal  = (timesheets?.failed ?? 0)  + (invoices?.failed ?? 0);

  return (
    <Card variant="outlined" sx={{ mb: 3 }}>
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
          <Typography variant="subtitle2" fontWeight={600}>
            {de ? 'Sync-Status (M2 → M3)' : 'Sync Status (M2 → M3)'}
          </Typography>
          <Stack direction="row" spacing={1}>
            {pendingTotal > 0 && <Chip size="small" label={`${pendingTotal} ${de ? 'ausstehend' : 'pending'}`} color="warning" />}
            {failedTotal  > 0 && <Chip size="small" label={`${failedTotal} ${de ? 'Fehler' : 'failed'}`} color="error" />}
            {pendingTotal === 0 && failedTotal === 0 && <Chip size="small" icon={<CheckCircleIcon />} label={de ? 'Alles synchronisiert' : 'All synced'} color="success" />}
          </Stack>
        </Stack>
        <Typography variant="body2" color="text.secondary" mb={1.5}>
          {de
            ? 'Wiederholt alle fehlgeschlagenen oder ausstehenden Buchungen (Stundenzettel + Rechnungen).'
            : 'Retries all failed or pending records (timesheets + invoices).'}
        </Typography>
        <Stack direction="row" gap={1} alignItems="center">
          <Button
            variant="outlined"
            size="small"
            startIcon={syncMutation.isPending ? <CircularProgress size={14} /> : <SyncIcon />}
            disabled={syncMutation.isPending || (pendingTotal === 0 && failedTotal === 0)}
            onClick={() => { setSyncResult(null); syncMutation.mutate(); }}
          >
            {de ? 'Jetzt synchronisieren' : 'Sync Now'}
          </Button>
        </Stack>
        {syncResult && (
          <Alert
            severity={syncResult.timesheets.failed + syncResult.invoices.failed === 0 ? 'success' : 'warning'}
            sx={{ mt: 1.5, py: 0.5 }}
          >
            {de
              ? `Stundenzettel: ${syncResult.timesheets.ok} OK, ${syncResult.timesheets.failed} Fehler — Rechnungen: ${syncResult.invoices.ok} OK, ${syncResult.invoices.failed} Fehler`
              : `Timesheets: ${syncResult.timesheets.ok} OK, ${syncResult.timesheets.failed} failed — Invoices: ${syncResult.invoices.ok} OK, ${syncResult.invoices.failed} failed`}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function IntegrationsPage() {
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const navigate = useNavigate();
  const qc       = useQueryClient();

  const [copied, setCopied]           = useState(false);
  const [regenDialog, setRegenDialog] = useState(false);
  const [newToken, setNewToken]       = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn:  integrationsApi.get,
  });

  const regenMutation = useMutation({
    mutationFn: integrationsApi.regenerateToken,
    onSuccess: (token) => {
      setNewToken(token);
      setRegenDialog(false);
      qc.invalidateQueries({ queryKey: ['integrations'] });
    },
  });

  function copyToken() {
    const t = newToken ?? data?.ownServiceToken;
    if (!t) return;
    navigator.clipboard.writeText(t);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function statusLabel(s: IntegrationStatus) {
    if (s === 'active')     return de ? 'Aktiv'         : 'Active';
    if (s === 'configured') return de ? 'Konfiguriert'  : 'Configured';
    return de ? 'Bald verfügbar' : 'Coming soon';
  }

  const displayToken = newToken ?? data?.ownServiceToken ?? '';

  return (
    <Box>
      {/* Page header */}
      <Box mb={3}>
        <Typography variant="h5" fontWeight={700}>
          {de ? 'Integrationen' : 'Integrations'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {de
            ? 'Module verknüpfen und externe Dienste konfigurieren'
            : 'Connect modules and configure external services'}
        </Typography>
      </Box>

      {/* ── Module Integration ── */}
      <Typography variant="h6" fontWeight={600} mb={1}>
        {de ? 'Modulverbindungen' : 'Module Connections'}
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>
        {de
          ? 'Verknüpfen Sie dieses ERP-Modul mit M1 (Personalvermittlung) oder M2 (Events). Teilen Sie Ihren Service-Token mit dem Administrator des anderen Moduls.'
          : "Connect this ERP module with M1 (Staffing) or M2 (Events). Share your Service Token with the other module's administrator."}
      </Typography>

      {/* Your Service Token card */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography fontWeight={600} mb={0.5}>
            {de ? 'Ihr Service-Token' : 'Your Service Token'}
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            {de
              ? 'Teilen Sie diesen Token mit anderen Modulen, die sich mit M3 verbinden möchten.'
              : 'Share this token with other modules that want to connect to M3.'}
          </Typography>

          {isLoading ? (
            <CircularProgress size={20} />
          ) : (
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField
                size="small"
                value={displayToken}
                InputProps={{ readOnly: true }}
                sx={{ flex: 1, fontFamily: 'monospace', '& input': { fontFamily: 'monospace', fontSize: 13 } }}
              />
              <Tooltip title={copied ? (de ? 'Kopiert!' : 'Copied!') : (de ? 'Kopieren' : 'Copy')}>
                <IconButton size="small" onClick={copyToken}>
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Button
                size="small"
                variant="outlined"
                color="warning"
                onClick={() => setRegenDialog(true)}
              >
                {de ? 'Neu generieren' : 'Regenerate'}
              </Button>
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* Connected modules */}
      <Grid container spacing={2} mb={4}>
        <Grid item xs={12} md={6}>
          <ModuleCard
            module="m1"
            label={de ? 'Personalvermittlung (M1)' : 'Staffing Platform (M1)'}
            description={de ? 'Synchronisiert Rechnungen, Zeiterfassung und Mitarbeiter' : 'Syncs invoices, timesheets and workers'}
            connection={data?.connectedServices?.m1}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <ModuleCard
            module="m2"
            label={de ? 'Eventmanagement (M2)' : 'Event Staffing (M2)'}
            description={de ? 'Überträgt Event-Rechnungen in das Buchhaltungssystem' : 'Posts event invoices into the accounting system'}
            connection={data?.connectedServices?.m2}
          />
        </Grid>
      </Grid>

      <M2SyncCard de={de} />

      <Divider sx={{ mb: 3 }} />

      {/* ── Third-party integrations ── */}
      <Typography variant="h6" fontWeight={600} mb={1}>
        {de ? 'Externe Dienste' : 'External Services'}
      </Typography>
      <Grid container spacing={2}>
        {THIRD_PARTY.map(intg => (
          <Grid item key={intg.key} xs={12} sm={6} md={4}>
            <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Stack direction="row" alignItems="center" gap={1.5}>
                  <Box sx={{
                    width: 44, height: 44, borderRadius: 1.5, bgcolor: intg.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Typography variant="caption" fontWeight={700} color="#fff"
                      sx={{ fontSize: intg.initials.length > 3 ? 9 : 11, letterSpacing: 0 }}>
                      {intg.initials}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="h6" fontWeight={700} lineHeight={1.2} fontSize="0.95rem">
                      {intg.name}
                    </Typography>
                    <Chip size="small" label={statusLabel(intg.status)} color={STATUS_COLOR[intg.status]}
                      sx={{ mt: 0.25, height: 18, fontSize: 10 }} />
                  </Box>
                </Stack>
                <Typography variant="body2" color="text.secondary" flex={1}>
                  {de ? intg.descDe : intg.descEn}
                </Typography>
                {intg.status === 'coming_soon' ? (
                  <Button size="small" variant="outlined" disabled fullWidth>
                    {de ? 'Bald verfügbar' : 'Coming soon'}
                  </Button>
                ) : (
                  <Button size="small" variant="outlined" fullWidth
                    onClick={() => intg.navigateTo && navigate(intg.navigateTo)}>
                    {de ? 'Konfigurieren' : 'Configure'}
                  </Button>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Regenerate token confirmation dialog */}
      <Dialog open={regenDialog} onClose={() => setRegenDialog(false)}>
        <DialogTitle>{de ? 'Token neu generieren?' : 'Regenerate token?'}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {de
              ? 'Dies invalidiert alle bestehenden Verbindungen. Andere Module müssen den neuen Token eintragen.'
              : 'This invalidates all existing connections. Other modules must update to the new token.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRegenDialog(false)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button
            color="warning"
            variant="contained"
            disabled={regenMutation.isPending}
            onClick={() => regenMutation.mutate()}
          >
            {de ? 'Neu generieren' : 'Regenerate'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
