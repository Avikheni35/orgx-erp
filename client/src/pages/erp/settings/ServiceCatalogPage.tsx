import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Button, Card, Table, TableHead, TableBody, TableRow, TableCell,
  Chip, Stack, IconButton, Tooltip,
  CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteIcon from '@mui/icons-material/Delete';
import { useTranslation } from 'react-i18next';
import { serviceItemsApi, type ServiceItem } from '../../../api/serviceItems';
import ServiceItemFormDialog from '../../../components/ServiceItemFormDialog';

function money(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2 }) + ' €';
}

export default function ServiceCatalogPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const locale = i18n.language === 'de' ? 'de-DE' : 'en-GB';

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem,   setEditItem]   = useState<ServiceItem | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['service-items'],
    queryFn: () => serviceItemsApi.list(),
  });
  const items = data?.data?.items ?? [];

  const deactivate = useMutation({
    mutationFn: (id: string) => serviceItemsApi.deactivate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-items'] }),
  });
  const reactivate = useMutation({
    mutationFn: (id: string) => serviceItemsApi.reactivate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-items'] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => serviceItemsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-items'] }),
  });

  const openCreate = () => { setEditItem(null); setDialogOpen(true); };
  const openEdit   = (item: ServiceItem) => { setEditItem(item); setDialogOpen(true); };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{t('serviceItems.title')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('serviceItems.subtitle')}</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          {t('serviceItems.createItem')}
        </Button>
      </Stack>

      <Card>
        {isLoading ? (
          <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
        ) : items.length === 0 ? (
          <Box textAlign="center" py={6}>
            <Typography color="text.secondary">{t('serviceItems.noItems')}</Typography>
            <Button sx={{ mt: 2 }} variant="outlined" startIcon={<AddIcon />} onClick={openCreate}>
              {t('serviceItems.createItem')}
            </Button>
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('serviceItems.name')}</TableCell>
                <TableCell>{i18n.language === 'de' ? 'Kategorie' : 'Category'}</TableCell>
                <TableCell>{t('serviceItems.description')}</TableCell>
                <TableCell>{t('serviceItems.unit')}</TableCell>
                <TableCell align="right">{t('serviceItems.defaultUnitPrice')}</TableCell>
                <TableCell align="right">{t('salesInvoices.vatRate')}</TableCell>
                <TableCell>{t('common.status')}</TableCell>
                <TableCell align="right">{t('common.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map(item => (
                <TableRow key={item._id} hover sx={{ opacity: item.isActive ? 1 : 0.5 }}>
                  <TableCell><Typography fontWeight={600}>{item.name}</Typography></TableCell>
                  <TableCell>
                    {item.category
                      ? <Chip label={item.category} size="small" variant="outlined" />
                      : <Typography variant="body2" color="text.disabled">—</Typography>}
                  </TableCell>
                  <TableCell><Typography variant="body2" color="text.secondary">{item.description || '—'}</Typography></TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{money(item.defaultUnitPriceCents, locale)}</TableCell>
                  <TableCell align="right">{item.vatRate} %</TableCell>
                  <TableCell>
                    <Chip size="small" label={item.isActive ? t('common.active') : t('common.inactive')} color={item.isActive ? 'success' : 'default'} />
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" justifyContent="flex-end" gap={0.5}>
                      <Tooltip title={t('common.edit')}>
                        <IconButton size="small" onClick={() => openEdit(item)}><EditIcon fontSize="small" /></IconButton>
                      </Tooltip>
                      {item.isActive ? (
                        <Tooltip title={t('common.deactivate')}>
                          <IconButton size="small" color="warning" onClick={() => deactivate.mutate(item._id)}><BlockIcon fontSize="small" /></IconButton>
                        </Tooltip>
                      ) : (
                        <Tooltip title={t('common.reactivate')}>
                          <IconButton size="small" color="success" onClick={() => reactivate.mutate(item._id)}><CheckCircleIcon fontSize="small" /></IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title={t('common.delete')}>
                        <IconButton size="small" color="error" onClick={() => remove.mutate(item._id)}><DeleteIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <ServiceItemFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={() => setDialogOpen(false)}
        editItem={editItem}
      />
    </Box>
  );
}
