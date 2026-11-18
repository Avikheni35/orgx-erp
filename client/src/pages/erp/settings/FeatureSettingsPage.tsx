import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Chip,
  Divider, FormControl, FormHelperText, MenuItem, Select,
  Stack, Switch, Typography,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import CheckIcon from '@mui/icons-material/Check';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useTranslation } from 'react-i18next';
import { settingsApi, type M3FeatureFlags, DEFAULT_M3_FLAGS } from '../../../api/settings';

function SectionTitle({ children }: { children: string }) {
  return (
    <Typography variant="overline" color="text.secondary" fontWeight={600} display="block" mb={0.5}>
      {children}
    </Typography>
  );
}

function SettingRow({
  label, description, checked, onChange, dangerous,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  dangerous?: boolean;
}) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', py: 1.5 }}>
      <Box sx={{ maxWidth: '75%' }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2" fontWeight={500}>{label}</Typography>
          {dangerous && (
            <Chip
              icon={<WarningAmberIcon sx={{ fontSize: 12 }} />}
              label="GoBD-kritisch"
              size="small"
              color="error"
              variant="outlined"
              sx={{ height: 18, fontSize: 10 }}
            />
          )}
        </Stack>
        {description && <Typography variant="caption" color="text.secondary">{description}</Typography>}
      </Box>
      <Switch checked={checked} onChange={(e) => onChange(e.target.checked)} size="small" />
    </Box>
  );
}

export default function FeatureSettingsPage() {
  const { t, i18n } = useTranslation();
  const de = i18n.language === 'de';
  const qc = useQueryClient();
  const [form, setForm] = useState<M3FeatureFlags>(DEFAULT_M3_FLAGS);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'features', 'm3'],
    queryFn: settingsApi.getFeatures,
  });

  useEffect(() => {
    if (data) setForm({ ...DEFAULT_M3_FLAGS, ...data });
  }, [data]);

  const mutation = useMutation({
    mutationFn: (flags: Partial<M3FeatureFlags>) => settingsApi.updateFeatures(flags),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'features', 'm3'] });
      qc.invalidateQueries({ queryKey: ['settings', 'company'] });
      setSaved(true); setError('');
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (de ? 'Fehler beim Speichern' : 'Save failed')
      );
    },
  });

  const set = <K extends keyof M3FeatureFlags>(key: K, val: M3FeatureFlags[K]) =>
    setForm((p) => ({ ...p, [key]: val }));

  if (isLoading) return <CircularProgress />;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {de ? 'Features & Module' : 'Features & Modules'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {de
              ? 'Aktivieren oder deaktivieren Sie ERP-Module je nach Bedarf Ihres Unternehmens.'
              : 'Enable or disable ERP modules based on your company needs.'}
          </Typography>
        </Box>
        <Button
          variant="contained"
          disabled={mutation.isPending}
          startIcon={saved ? <CheckIcon /> : <SaveIcon />}
          color={saved ? 'success' : 'primary'}
          onClick={() => mutation.mutate(form)}
        >
          {mutation.isPending ? '…' : saved ? (de ? 'Gespeichert' : 'Saved') : (de ? 'Speichern' : 'Save')}
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card>
        <CardContent sx={{ p: 3 }}>

          {/* Vertrieb & Geschäftsmodell */}
          <SectionTitle>{de ? 'VERTRIEB & GESCHÄFTSMODELL' : 'SALES & BUSINESS MODEL'}</SectionTitle>
          <Divider sx={{ mb: 1 }} />
          <Box py={1.5}>
            <Typography variant="body2" fontWeight={500} mb={0.5}>
              {de ? 'Mehrwährung' : 'Multi-currency'}
            </Typography>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Switch size="small" checked={form.multiCurrency} onChange={(e) => set('multiCurrency', e.target.checked)} />
              <Typography variant="body2" color="text.secondary">
                {de
                  ? 'Rechnungen in Fremdwährungen mit EUR-Umrechnungskurs'
                  : 'Allow invoices in foreign currencies with EUR conversion'}
              </Typography>
            </Stack>
          </Box>

          {/* Module */}
          <Box mt={3}>
            <SectionTitle>{de ? 'MODULE AKTIVIEREN / DEAKTIVIEREN' : 'MODULE ENABLE / DISABLE'}</SectionTitle>
            <Divider sx={{ mb: 1 }} />
          </Box>
          <SettingRow
            label={de ? 'Anlagevermögen (Fixed Assets)' : 'Fixed Assets'}
            description={de
              ? 'Aktiviert das Anlagevermögen-Modul, Abschreibungsläufe und Entsorgungsflüsse. Reine Dienstleistungsunternehmen können dies deaktivieren.'
              : 'Enable Fixed Asset model, depreciation runs and disposal flows.'}
            checked={form.enableFixedAssets}
            onChange={(v) => set('enableFixedAssets', v)}
          />
          <SettingRow
            label={de ? 'Rechnungsabgrenzungsposten (Accruals)' : 'Accruals'}
            description={de
              ? 'Ermöglicht Abgrenzungs- und latente Umsatzbuchungen. Für Cash-Basis-Buchhaltung deaktivieren.'
              : 'Enable accrual and deferred revenue accounting.'}
            checked={form.enableAccruals}
            onChange={(v) => set('enableAccruals', v)}
          />
          <SettingRow
            label={de ? 'Lastschrift (SEPA Direct Debit)' : 'SEPA Direct Debit'}
            description={de
              ? 'Aktiviert SEPA-Lastschriftläufe. Erfordert konfigurierte Gläubiger-ID und Mandatsverwaltung.'
              : 'Activate SEPA direct debit runs. Requires CreditorID configuration.'}
            checked={form.enableDirectDebit}
            onChange={(v) => set('enableDirectDebit', v)}
          />
          <SettingRow
            label={de ? 'ELSTER-Übermittlung' : 'ELSTER Filing'}
            description={de
              ? 'Aktiviert die USt-Voranmeldung via ELSTER. Erfordert ein gültiges ELSTER-Zertifikat.'
              : 'Enable VAT pre-registration and filing via ELSTER. Requires a valid certificate.'}
            checked={form.enableElster}
            onChange={(v) => set('enableElster', v)}
          />
          <SettingRow
            label={de ? 'Lagerverwaltung (Inventory)' : 'Inventory'}
            description={de
              ? 'Aktiviert Produkt-/Artikellagerverwaltung. Für reine Dienstleistungsunternehmen nicht erforderlich.'
              : 'Enable product/item stock tracking. Not needed for pure service companies.'}
            checked={form.enableInventory}
            onChange={(v) => set('enableInventory', v)}
          />

          {/* Kostenstellen */}
          <Box mt={3}>
            <SectionTitle>{de ? 'KOSTENSTELLEN & REPORTING' : 'COST CENTERS & REPORTING'}</SectionTitle>
            <Divider sx={{ mb: 1 }} />
          </Box>
          <SettingRow
            label={de ? 'Kostenstellen aktivieren' : 'Enable Cost Centers'}
            description={de
              ? 'Aktiviert die Kostenstellen-Dimension auf Buchungen, Rechnungen und Lohnabrechnungen.'
              : 'Enable CostCenter dimension on journal entries, invoices, and payroll.'}
            checked={form.enableCostCenters}
            onChange={(v) => set('enableCostCenters', v)}
          />
          {form.enableCostCenters && (
            <SettingRow
              label={de ? 'Kostenstelle als Pflichtfeld' : 'Cost Center required'}
              description={de
                ? 'Kostenstelle muss auf jeder Buchung angegeben werden.'
                : 'CostCenter must be set on every journal entry.'}
              checked={form.costCenterRequired}
              onChange={(v) => set('costCenterRequired', v)}
            />
          )}
          <Box py={1.5}>
            <Typography variant="body2" fontWeight={500} mb={0.5}>
              {de ? 'Periodenabschluss' : 'Period Lock Policy'}
            </Typography>
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <Select
                value={form.periodLockPolicy}
                onChange={(e) => set('periodLockPolicy', e.target.value as M3FeatureFlags['periodLockPolicy'])}
              >
                <MenuItem value="manual">{de ? 'Manuell (Buchhalter schließt Perioden)' : 'Manual (accountant closes periods)'}</MenuItem>
                <MenuItem value="auto-monthly">{de ? 'Automatisch (am 1. jedes Monats)' : 'Automatic (on 1st of each month)'}</MenuItem>
              </Select>
              <FormHelperText>
                {de
                  ? 'Auto-Abschluss setzt Status auf "closed" und finalisiert den GoBD-Hash.'
                  : 'Auto-close sets status to "closed" and finalizes the GoBD hash.'}
              </FormHelperText>
            </FormControl>
          </Box>

          {/* Mahnwesen */}
          <Box mt={3}>
            <SectionTitle>{de ? 'MAHNWESEN & ZAHLUNGSVERKEHR' : 'DUNNING & PAYMENTS'}</SectionTitle>
            <Divider sx={{ mb: 1 }} />
          </Box>
          <SettingRow
            label={de ? 'Mahnwesen aktivieren' : 'Enable Dunning'}
            description={de
              ? 'Automatisierte Mahnläufe für überfällige Rechnungen. Deaktivieren, wenn Inkasso extern gehandhabt wird.'
              : 'Automated dunning for overdue invoices. Disable if collections are handled externally.'}
            checked={form.dunningEnabled}
            onChange={(v) => set('dunningEnabled', v)}
          />

          {/* Compliance */}
          <Box mt={3}>
            <SectionTitle>{de ? 'COMPLIANCE & GOBD' : 'COMPLIANCE & GOBD'}</SectionTitle>
            <Divider sx={{ mb: 1 }} />
          </Box>
          <SettingRow
            label={de ? 'GoBD-Audit-Log (Unveränderlichkeit)' : 'GoBD Audit Log (Immutability)'}
            description={de
              ? 'SHA-256-Hash auf jedem Buchungssatz und Kassenbucheintrag. Für GoBD-Konformität erforderlich.'
              : 'SHA-256 hash on every journal entry and cash book entry. Required for GoBD compliance.'}
            checked={form.gobdAuditLog}
            onChange={(v) => set('gobdAuditLog', v)}
            dangerous
          />
          <SettingRow
            label={de ? 'Buchungs-Freigabe-Workflow' : 'Booking Approval Workflow'}
            description={de
              ? 'Buchungen erfordern eine zweite Genehmigung. Sinnvoll für größere Unternehmen mit Funktionstrennung.'
              : 'Journal entries require a second accountant approval. Useful for segregation-of-duties.'}
            checked={form.bookingApprovalWorkflow}
            onChange={(v) => set('bookingApprovalWorkflow', v)}
          />
          <SettingRow
            label={de ? 'Steuerberater-Zugang aktivieren' : 'Tax Advisor Access'}
            description={de
              ? 'Gibt die Rolle "Steuerberater" und schreibgeschützte Datenexport-Routen frei.'
              : 'Expose the tax_advisor role and its read-only data export routes.'}
            checked={form.taxAdvisorAccess}
            onChange={(v) => set('taxAdvisorAccess', v)}
          />

          {/* MIS & AI */}
          <Box mt={3}>
            <SectionTitle>{de ? 'MIS & KI-ASSISTENT' : 'MIS & AI ASSISTANT'}</SectionTitle>
            <Divider sx={{ mb: 1 }} />
          </Box>
          <Box py={1.5}>
            <Typography variant="body2" fontWeight={500} mb={0.25}>
              {de ? 'Chatbot Intent-Erkennung' : 'Chatbot Intent Mode'}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" mb={1}>
              {de
                ? 'Bestimmt, wie der MIS-Chatbot die Frage des Benutzers klassifiziert, um die richtigen Daten zu laden.'
                : 'Determines how the MIS chatbot classifies the user\'s question to load the right data.'}
            </Typography>
            <FormControl size="small" sx={{ minWidth: 280 }}>
              <Select
                value={form.misIntentMode}
                onChange={(e) => set('misIntentMode', e.target.value as M3FeatureFlags['misIntentMode'])}
              >
                <MenuItem value="regex">
                  {de ? 'Regex (schnell, regelbasiert)' : 'Regex (fast, rule-based)'}
                </MenuItem>
                <MenuItem value="ai">
                  {de ? 'KI-Klassifizierung (robuster, +200 ms)' : 'AI Classification (smarter, +200ms)'}
                </MenuItem>
              </Select>
              <FormHelperText>
                {form.misIntentMode === 'regex'
                  ? (de
                    ? 'Lädt immer Kerndaten (heute, diese Woche, Rückgaben). Exotische Formulierungen können unerkannt bleiben.'
                    : 'Always loads core data (today, this week, returns). Unusual phrasing may still be missed.')
                  : (de
                    ? 'GPT-4o-mini klassifiziert die Absicht vor jeder Antwort — erkennt beliebige Formulierungen in DE/EN.'
                    : 'GPT-4o-mini classifies intent before each reply — handles any phrasing in DE/EN.')}
              </FormHelperText>
            </FormControl>
          </Box>

        </CardContent>
      </Card>
    </Box>
  );
}
