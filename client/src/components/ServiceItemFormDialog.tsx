import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, Select, MenuItem, FormControl, InputLabel, Stack, Alert,
  CircularProgress, Autocomplete,
} from '@mui/material';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { serviceItemsApi, type ServiceItem } from '../api/serviceItems';

const UNITS = ['Stunde', 'Tag', 'Stück', 'Pauschale', 'km', 'Monat'];
const VAT_RATES = [19, 7, 0];

interface FormState {
  name:                  string;
  description:           string;
  unit:                  string;
  category:              string;
  costPriceCents:        string;
  defaultUnitPriceCents: string;
  vatRate:               string;
  notes:                 string;
}

const emptyForm = (defaultName = ''): FormState => ({
  name: defaultName, description: '', unit: 'Stück', category: '',
  costPriceCents: '', defaultUnitPriceCents: '', vatRate: '19', notes: '',
});

interface Props {
  open:        boolean;
  onClose:     () => void;
  onSaved:     (item: ServiceItem) => void;
  editItem?:   ServiceItem | null;
  defaultName?: string;
}

export default function ServiceItemFormDialog({ open, onClose, onSaved, editItem, defaultName }: Props) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();

  const [form, setForm]     = useState<FormState>(emptyForm(defaultName));
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const { data: catData } = useQuery({
    queryKey: ['service-item-categories'],
    queryFn:  () => serviceItemsApi.listCategories(),
    staleTime: 60_000,
  });
  const categorySuggestions = catData?.data?.categories ?? [];

  useEffect(() => {
    if (open) {
      if (editItem) {
        setForm({
          name:                  editItem.name,
          description:           editItem.description,
          unit:                  editItem.unit,
          category:              editItem.category ?? '',
          costPriceCents:        editItem.costPriceCents > 0 ? String((editItem.costPriceCents / 100).toFixed(2)) : '',
          defaultUnitPriceCents: String((editItem.defaultUnitPriceCents / 100).toFixed(2)),
          vatRate:               String(editItem.vatRate),
          notes:                 editItem.notes ?? '',
        });
      } else {
        setForm(emptyForm(defaultName ?? ''));
      }
      setError('');
    }
  }, [open, editItem, defaultName]);

  const f = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [key]: e.target.value }));

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError(i18n.language === 'de' ? 'Name ist erforderlich.' : 'Name is required.');
      return;
    }
    setSaving(true); setError('');
    try {
      const payload = {
        name:                  form.name.trim(),
        description:           form.description.trim(),
        unit:                  form.unit,
        category:              form.category.trim(),
        costPriceCents:        Math.round((parseFloat(form.costPriceCents) || 0) * 100),
        defaultUnitPriceCents: Math.round((parseFloat(form.defaultUnitPriceCents) || 0) * 100),
        vatRate:               parseFloat(form.vatRate) || 19,
        isActive:              true,
        stockQuantity:         0,
        notes:                 form.notes.trim() || undefined,
      };
      let saved: ServiceItem;
      if (editItem) {
        saved = (await serviceItemsApi.update(editItem._id, payload)).data;
      } else {
        saved = (await serviceItemsApi.create(payload)).data;
      }
      await qc.invalidateQueries({ queryKey: ['service-items'] });
      await qc.invalidateQueries({ queryKey: ['service-items-active'] });
      await qc.invalidateQueries({ queryKey: ['service-item-categories'] });
      onSaved(saved);
      onClose();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const title = editItem
    ? (i18n.language === 'de' ? 'Artikel bearbeiten' : 'Edit item')
    : (i18n.language === 'de' ? 'Neuer Artikel' : 'New item');

  return (
    <Dialog open={open} onClose={() => !saving && onClose()} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack gap={2} pt={1}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            fullWidth size="small" required autoFocus
            label={i18n.language === 'de' ? 'Name' : 'Name'}
            value={form.name}
            onChange={f('name')}
          />
          <Autocomplete
            freeSolo
            options={categorySuggestions}
            value={form.category}
            inputValue={form.category}
            onInputChange={(_, v) => setForm(p => ({ ...p, category: v }))}
            renderInput={params => (
              <TextField
                {...params}
                size="small"
                label={i18n.language === 'de' ? 'Kategorie' : 'Category'}
                placeholder={i18n.language === 'de' ? 'z.B. Molkereiprodukte' : 'e.g. Dairy'}
                helperText={i18n.language === 'de' ? 'Gruppe für Suchergebnisse in Rechnungen' : 'Group shown in invoice search results'}
              />
            )}
          />
          <TextField
            fullWidth size="small"
            label={i18n.language === 'de' ? 'Beschreibung (Rechnungstext)' : 'Description (invoice text)'}
            multiline rows={2}
            value={form.description}
            onChange={f('description')}
            helperText={i18n.language === 'de' ? 'Wird als Positionstext auf Rechnungen vorgeschlagen' : 'Pre-fills invoice line description'}
          />
          <Stack direction="row" gap={2}>
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>{i18n.language === 'de' ? 'Einheit' : 'Unit'}</InputLabel>
              <Select
                value={form.unit}
                label={i18n.language === 'de' ? 'Einheit' : 'Unit'}
                onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}
              >
                {UNITS.map(u => <MenuItem key={u} value={u}>{u}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 110 }}>
              <InputLabel>MwSt. %</InputLabel>
              <Select
                value={form.vatRate}
                label="MwSt. %"
                onChange={e => setForm(p => ({ ...p, vatRate: String(e.target.value) }))}
              >
                {VAT_RATES.map(r => <MenuItem key={r} value={String(r)}>{r} %</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>
          <Stack direction="row" gap={2}>
            <TextField
              size="small" type="number"
              label={i18n.language === 'de' ? 'Einkaufspreis (€ netto)' : 'Cost price (€ net)'}
              value={form.costPriceCents}
              onChange={f('costPriceCents')}
              inputProps={{ min: 0, step: 0.01 }}
              sx={{ flex: 1 }}
              helperText={i18n.language === 'de' ? 'Für Eingangsrechnungen' : 'For vendor invoices'}
            />
            <TextField
              size="small" type="number"
              label={i18n.language === 'de' ? 'Verkaufspreis (€ netto)' : 'Selling price (€ net)'}
              value={form.defaultUnitPriceCents}
              onChange={f('defaultUnitPriceCents')}
              inputProps={{ min: 0, step: 0.01 }}
              sx={{ flex: 1 }}
              helperText={i18n.language === 'de' ? 'Für Ausgangsrechnungen' : 'For sales invoices'}
            />
          </Stack>
          <TextField
            fullWidth size="small"
            label={t('common.notes')}
            value={form.notes}
            onChange={f('notes')}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}
          startIcon={saving ? <CircularProgress size={16} /> : undefined}>
          {t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
