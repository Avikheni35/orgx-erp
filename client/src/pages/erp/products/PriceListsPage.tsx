import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, Table, TableHead,
  TableBody, TableRow, TableCell, Paper, CircularProgress, Alert, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, FormControlLabel,
  Switch, Grid, Divider, IconButton, Tooltip, InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import StarIcon from '@mui/icons-material/Star';
import PeopleIcon from '@mui/icons-material/People';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { priceListsApi, PriceList, productsApi } from '../../../api/products';

const fmt = (cents: number) => (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' €';

export default function PriceListsPage() {
  const { i18n } = useTranslation();
  const de = i18n.language === 'de';
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState<Partial<PriceList>>({ name: '', description: '', isDefault: false, discountPercent: 0 });

  const { data: lists = [], isLoading } = useQuery({ queryKey: ['m3-price-lists'], queryFn: priceListsApi.list });

  const createMutation = useMutation({
    mutationFn: () => priceListsApi.create(form),
    onSuccess: (created) => { qc.invalidateQueries({ queryKey: ['m3-price-lists'] }); setDialog(false); navigate(`/erp/price-lists/${created._id}`); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => priceListsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['m3-price-lists'] }),
  });

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{de ? 'Preislisten' : 'Price Lists'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {de ? 'Kundengruppen, Großhandel, Staffelpreise' : 'Customer groups, wholesale, volume pricing'}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog(true)}>
          {de ? 'Neue Preisliste' : 'New price list'}
        </Button>
      </Stack>

      {isLoading && <CircularProgress />}

      {!isLoading && (
        <Grid container spacing={2}>
          {lists.length === 0 ? (
            <Grid item xs={12}>
              <Paper sx={{ py: 6, textAlign: 'center' }}>
                <Typography color="text.secondary">{de ? 'Keine Preislisten vorhanden.' : 'No price lists yet.'}</Typography>
                <Button sx={{ mt: 2 }} onClick={() => setDialog(true)}>{de ? 'Erste Preisliste erstellen' : 'Create first price list'}</Button>
              </Paper>
            </Grid>
          ) : lists.map(list => (
            <Grid item xs={12} sm={6} md={4} key={list._id}>
              <Card
                sx={{ cursor: 'pointer', border: list.isDefault ? 2 : 1, borderColor: list.isDefault ? 'primary.main' : 'divider', height: '100%' }}
                onClick={() => navigate(`/erp/price-lists/${list._id}`)}
              >
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box flex={1}>
                      <Stack direction="row" alignItems="center" gap={0.5}>
                        <Typography variant="subtitle1" fontWeight={700}>{list.name}</Typography>
                        {list.isDefault && <StarIcon fontSize="small" color="primary" />}
                      </Stack>
                      <Typography variant="caption" color="text.secondary">{list.description || '—'}</Typography>
                    </Box>
                    <Tooltip title={de ? 'Löschen' : 'Delete'}>
                      <IconButton size="small" onClick={e => { e.stopPropagation(); deleteMutation.mutate(list._id); }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>

                  <Divider sx={{ my: 1.5 }} />

                  <Stack spacing={0.5}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="caption" color="text.secondary">{de ? 'Rabatt' : 'Discount'}</Typography>
                      <Typography variant="caption" fontWeight={600}>
                        {list.discountPercent > 0 ? `${list.discountPercent}%` : '—'}
                      </Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="caption" color="text.secondary">{de ? 'Einträge' : 'Entries'}</Typography>
                      <Chip label={list.entryCount ?? 0} size="small" variant="outlined" />
                    </Stack>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption" color="text.secondary">{de ? 'Kunden' : 'Customers'}</Typography>
                      <Stack direction="row" alignItems="center" gap={0.5}>
                        <PeopleIcon fontSize="inherit" sx={{ color: 'text.secondary' }} />
                        <Typography variant="caption">{list.customerCount ?? 0}</Typography>
                      </Stack>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Create dialog */}
      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{de ? 'Neue Preisliste' : 'New price list'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField label={de ? 'Name' : 'Name'} value={form.name ?? ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} fullWidth size="small" placeholder={de ? 'z.B. Großhändler Gold' : 'e.g. Gold Wholesaler'} />
            <TextField label={de ? 'Beschreibung' : 'Description'} value={form.description ?? ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} fullWidth size="small" multiline rows={2} />
            <TextField
              label={de ? 'Pauschalrabatt (%)' : 'Flat discount (%)'}
              type="number" size="small" fullWidth
              value={form.discountPercent ?? 0}
              onChange={e => setForm(p => ({ ...p, discountPercent: Number(e.target.value) }))}
              helperText={de ? 'Gilt für alle Produkte ohne spezifischen Eintrag' : 'Applies to all products without a specific entry'}
              InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
            />
            <FormControlLabel
              control={<Switch checked={form.isDefault ?? false} onChange={e => setForm(p => ({ ...p, isDefault: e.target.checked }))} />}
              label={de ? 'Standard-Preisliste (für Kunden ohne Zuweisung)' : 'Default price list (for customers without assignment)'}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button variant="contained" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.name}>
            {de ? 'Erstellen' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
