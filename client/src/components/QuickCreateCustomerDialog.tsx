import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Stack, Alert, CircularProgress,
  Accordion, AccordionSummary, AccordionDetails, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { customersApi, type Customer } from '../api/customers';

interface Props {
  open:       boolean;
  onClose:    () => void;
  onCreated:  (customer: Customer) => void;
  defaultName?: string;
}

export default function QuickCreateCustomerDialog({ open, onClose, onCreated, defaultName = '' }: Props) {
  const { i18n } = useTranslation();
  const de = i18n.language === 'de';
  const qc = useQueryClient();

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  // Required
  const [companyName, setCompanyName] = useState(defaultName);

  // Contact (optional)
  const [contactName,  setContactName]  = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  // Optional details
  const [vatId,   setVatId]   = useState('');
  const [street,  setStreet]  = useState('');
  const [city,    setCity]    = useState('');
  const [zip,     setZip]     = useState('');
  const [country, setCountry] = useState('');
  const [notes,   setNotes]   = useState('');

  const reset = () => {
    setCompanyName(defaultName);
    setContactName(''); setContactEmail(''); setContactPhone('');
    setVatId(''); setStreet(''); setCity(''); setZip(''); setCountry('');
    setNotes(''); setError('');
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSave = async () => {
    if (!companyName.trim()) {
      setError(de ? 'Firmenname ist Pflichtfeld.' : 'Company name is required.');
      return;
    }
    setSaving(true); setError('');
    try {
      const contacts = contactName.trim()
        ? [{ name: contactName.trim(), email: contactEmail.trim() || undefined, phone: contactPhone.trim() || undefined, isPrimary: true }]
        : [];
      const res = await customersApi.create({
        companyName: companyName.trim(),
        contacts,
        address: { street: street.trim(), city: city.trim(), zip: zip.trim(), country: country.trim() || 'DE' },
        vatId:   vatId.trim() || undefined,
        notes:   notes.trim() || undefined,
        paymentTermsDays: 30,
        creditLimitCents: 0,
        dunningBlock: false,
        taxExempt:    false,
        isActive:     true,
      });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customers-all'] });
      onCreated(res.data);
      handleClose();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? (de ? 'Fehler beim Speichern.' : 'Save failed.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{de ? 'Neuen Kunden anlegen' : 'Create customer'}</DialogTitle>
      <DialogContent>
        <Stack gap={2} mt={1}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label={de ? 'Firmenname *' : 'Company name *'}
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
            size="small"
            fullWidth
            autoFocus
          />

          {/* Primary contact */}
          <Stack gap={1.5}>
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {de ? 'Ansprechpartner' : 'Contact person'} ({de ? 'optional' : 'optional'})
            </Typography>
            <Stack direction="row" gap={1.5} flexWrap="wrap">
              <TextField
                label={de ? 'Name' : 'Name'}
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                size="small"
                sx={{ flex: '1 1 160px' }}
              />
              <TextField
                label={de ? 'E-Mail' : 'Email'}
                type="email"
                value={contactEmail}
                onChange={e => setContactEmail(e.target.value)}
                size="small"
                sx={{ flex: '1 1 160px' }}
              />
              <TextField
                label={de ? 'Telefon' : 'Phone'}
                value={contactPhone}
                onChange={e => setContactPhone(e.target.value)}
                size="small"
                sx={{ flex: '1 1 130px' }}
              />
            </Stack>
          </Stack>

          {/* Optional: address + vatId + notes */}
          <Accordion disableGutters elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" color="text.secondary">
                {de ? 'Weitere Details (optional)' : 'Additional details (optional)'}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack gap={1.5}>
                <TextField label={de ? 'Straße' : 'Street'} value={street} onChange={e => setStreet(e.target.value)} size="small" fullWidth />
                <Stack direction="row" gap={1.5}>
                  <TextField label={de ? 'PLZ' : 'ZIP'} value={zip} onChange={e => setZip(e.target.value)} size="small" sx={{ width: 110 }} />
                  <TextField label={de ? 'Stadt' : 'City'} value={city} onChange={e => setCity(e.target.value)} size="small" sx={{ flex: 1 }} />
                  <TextField label={de ? 'Land' : 'Country'} value={country} onChange={e => setCountry(e.target.value)} size="small" sx={{ width: 90 }} placeholder="DE" />
                </Stack>
                <TextField label={de ? 'USt-IdNr.' : 'VAT ID'} value={vatId} onChange={e => setVatId(e.target.value)} size="small" fullWidth />
                <TextField label={de ? 'Notizen' : 'Notes'} value={notes} onChange={e => setNotes(e.target.value)} size="small" fullWidth multiline rows={2} />
              </Stack>
            </AccordionDetails>
          </Accordion>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={saving}>{de ? 'Abbrechen' : 'Cancel'}</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {de ? 'Erstellen' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
