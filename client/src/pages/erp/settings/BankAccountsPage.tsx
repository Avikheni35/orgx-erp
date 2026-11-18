import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, Chip, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Grid, Switch,
  FormControlLabel, Divider, IconButton, Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import BlockIcon from '@mui/icons-material/Block';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import StarIcon from '@mui/icons-material/Star';
import { useTranslation } from 'react-i18next';
import { bankAccountsApi, type BankAccount, type BankAccountPayload } from '../../../api/bankAccounts';

function formatIban(iban: string) {
  return iban.replace(/(.{4})/g, '$1 ').trim();
}

const emptyForm = (): BankAccountPayload => ({
  accountName: '', bankName: '', iban: '', bic: '', accountHolder: '',
  currency: 'EUR', isDefault: false, glAccount: '1200', notes: '',
});

export default function BankAccountsPage() {
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const qc       = useQueryClient();

  const [dialogOpen,   setDialogOpen]   = useState(false);
  const [editingId,    setEditingId]     = useState<string | null>(null);
  const [form,         setForm]          = useState<BankAccountPayload>(emptyForm());
  const [formError,    setFormError]     = useState('');
  const [deactivateId, setDeactivateId]  = useState<string | null>(null);
  const [actionError,  setActionError]   = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn:  () => bankAccountsApi.list({ isActive: true }),
  });
  const accounts: BankAccount[] = data?.data?.accounts ?? [];

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setFormError('');
    setDialogOpen(true);
  }

  function openEdit(acc: BankAccount) {
    setEditingId(acc._id);
    setForm({
      accountName:   acc.accountName,
      bankName:      acc.bankName,
      iban:          acc.iban,
      bic:           acc.bic,
      accountHolder: acc.accountHolder,
      currency:      acc.currency,
      isDefault:     acc.isDefault,
      glAccount:     acc.glAccount,
      notes:         acc.notes,
    });
    setFormError('');
    setDialogOpen(true);
  }

  function setField<K extends keyof BankAccountPayload>(k: K, v: BankAccountPayload[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function onErr(e: unknown) {
    const err = e as { response?: { data?: { message?: string } } };
    setFormError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
  }

  const saveMut = useMutation({
    mutationFn: () => editingId
      ? bankAccountsApi.update(editingId, form)
      : bankAccountsApi.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
      setDialogOpen(false);
    },
    onError: onErr,
  });

  const deactivateMut = useMutation({
    mutationFn: (id: string) => bankAccountsApi.deactivate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
      setDeactivateId(null);
      setActionError('');
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setActionError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
      setDeactivateId(null);
    },
  });

  function validate() {
    if (!form.accountName.trim()) { setFormError(de ? 'Kontoname eingeben.' : 'Enter account name.'); return false; }
    if (!form.iban.trim())        { setFormError(de ? 'IBAN eingeben.' : 'Enter IBAN.'); return false; }
    return true;
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{de ? 'Bankkonten' : 'Bank Accounts'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {de ? 'Unternehmenskonten für Zahlungsverkehr und Buchführung' : 'Company bank accounts for payments and bookkeeping'}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          {de ? 'Neues Konto' : 'New account'}
        </Button>
      </Stack>

      {actionError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError('')}>{actionError}</Alert>}

      {isLoading && <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>}
      {isError   && <Alert severity="error">{de ? 'Fehler beim Laden.' : 'Failed to load.'}</Alert>}

      {!isLoading && !isError && accounts.length === 0 && (
        <Card variant="outlined" sx={{ textAlign: 'center', py: 6 }}>
          <AccountBalanceIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.disabled">
            {de ? 'Noch keine Bankkonten hinterlegt.' : 'No bank accounts configured yet.'}
          </Typography>
          <Button variant="outlined" startIcon={<AddIcon />} sx={{ mt: 2 }} onClick={openCreate}>
            {de ? 'Erstes Konto anlegen' : 'Add first account'}
          </Button>
        </Card>
      )}

      <Stack gap={2}>
        {accounts.map(acc => (
          <Card key={acc._id} variant="outlined"
            sx={{ borderColor: acc.isDefault ? 'primary.main' : undefined, position: 'relative' }}>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Stack direction="row" gap={1.5} alignItems="center">
                  <AccountBalanceIcon color={acc.isDefault ? 'primary' : 'action'} />
                  <Box>
                    <Stack direction="row" gap={1} alignItems="center">
                      <Typography variant="subtitle1" fontWeight={700}>{acc.accountName}</Typography>
                      {acc.isDefault && (
                        <Chip size="small" icon={<StarIcon fontSize="small" />}
                          label={de ? 'Standard' : 'Default'} color="primary" />
                      )}
                    </Stack>
                    {acc.bankName && (
                      <Typography variant="body2" color="text.secondary">{acc.bankName}</Typography>
                    )}
                  </Box>
                </Stack>
                <Stack direction="row" gap={0.5}>
                  <Tooltip title={de ? 'Bearbeiten' : 'Edit'}>
                    <IconButton size="small" onClick={() => openEdit(acc)}><EditIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  <Tooltip title={de ? 'Deaktivieren' : 'Deactivate'}>
                    <IconButton size="small" color="error" onClick={() => setDeactivateId(acc._id)}>
                      <BlockIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>

              <Divider sx={{ my: 1.5 }} />

              <Grid container spacing={2}>
                <Grid item xs={12} sm={5}>
                  <Typography variant="caption" color="text.secondary" display="block">IBAN</Typography>
                  <Typography variant="body2" fontFamily="monospace" letterSpacing="0.05em">
                    {formatIban(acc.iban)}
                  </Typography>
                </Grid>
                {acc.bic && (
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary" display="block">BIC</Typography>
                    <Typography variant="body2" fontFamily="monospace">{acc.bic}</Typography>
                  </Grid>
                )}
                <Grid item xs={6} sm={2}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {de ? 'SKR03-Konto' : 'GL account'}
                  </Typography>
                  <Typography variant="body2" fontFamily="monospace">{acc.glAccount}</Typography>
                </Grid>
                <Grid item xs={6} sm={2}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {de ? 'Währung' : 'Currency'}
                  </Typography>
                  <Typography variant="body2">{acc.currency}</Typography>
                </Grid>
                {acc.accountHolder && (
                  <Grid item xs={12}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {de ? 'Kontoinhaber' : 'Account holder'}
                    </Typography>
                    <Typography variant="body2">{acc.accountHolder}</Typography>
                  </Grid>
                )}
                {acc.notes && (
                  <Grid item xs={12}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {de ? 'Notizen' : 'Notes'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">{acc.notes}</Typography>
                  </Grid>
                )}
              </Grid>
            </CardContent>
          </Card>
        ))}
      </Stack>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingId
            ? (de ? 'Bankkonto bearbeiten' : 'Edit bank account')
            : (de ? 'Neues Bankkonto' : 'New bank account')}
        </DialogTitle>
        <DialogContent>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <TextField label={`${de ? 'Kontoname' : 'Account name'} *`} size="small" fullWidth
                value={form.accountName} onChange={e => setField('accountName', e.target.value)}
                placeholder={de ? 'z.B. Hauptkonto, Geschäftskonto' : 'e.g. Main account'} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label={de ? 'Bank' : 'Bank name'} size="small" fullWidth
                value={form.bankName} onChange={e => setField('bankName', e.target.value)}
                placeholder="Commerzbank, Sparkasse …" />
            </Grid>
            <Grid item xs={12} sm={8}>
              <TextField label={`IBAN *`} size="small" fullWidth
                value={form.iban}
                onChange={e => setField('iban', e.target.value.toUpperCase().replace(/\s/g, ''))}
                inputProps={{ style: { fontFamily: 'monospace', letterSpacing: '0.05em' } }}
                placeholder="DE89370400440532013000" />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="BIC" size="small" fullWidth
                value={form.bic} onChange={e => setField('bic', e.target.value.toUpperCase())}
                inputProps={{ style: { fontFamily: 'monospace' } }}
                placeholder="COBADEFFXXX" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label={de ? 'Kontoinhaber' : 'Account holder'} size="small" fullWidth
                value={form.accountHolder} onChange={e => setField('accountHolder', e.target.value)} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField label={de ? 'SKR03-Konto' : 'GL account'} size="small" fullWidth
                value={form.glAccount} onChange={e => setField('glAccount', e.target.value)}
                inputProps={{ style: { fontFamily: 'monospace' } }}
                helperText="SKR03" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField label={de ? 'Währung' : 'Currency'} size="small" fullWidth
                value={form.currency} onChange={e => setField('currency', e.target.value)} />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={<Switch checked={form.isDefault} onChange={e => setField('isDefault', e.target.checked)} />}
                label={de ? 'Als Standardkonto festlegen' : 'Set as default account'} />
            </Grid>
            <Grid item xs={12}>
              <TextField label={de ? 'Notizen' : 'Notes'} size="small" fullWidth multiline rows={2}
                value={form.notes} onChange={e => setField('notes', e.target.value)} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button variant="contained" disabled={saveMut.isPending}
            onClick={() => { if (validate()) saveMut.mutate(); }}>
            {de ? 'Speichern' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Deactivate confirmation */}
      <Dialog open={!!deactivateId} onClose={() => setDeactivateId(null)} maxWidth="xs">
        <DialogTitle>{de ? 'Konto deaktivieren?' : 'Deactivate account?'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {de
              ? 'Das Konto wird deaktiviert und nicht mehr angezeigt. Diese Aktion kann rückgängig gemacht werden.'
              : 'The account will be deactivated and hidden. This action can be undone by an admin.'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeactivateId(null)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button variant="contained" color="error" disabled={deactivateMut.isPending}
            onClick={() => deactivateId && deactivateMut.mutate(deactivateId)}>
            {de ? 'Deaktivieren' : 'Deactivate'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
