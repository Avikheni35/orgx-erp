import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Button, Card, Table, TableHead, TableBody, TableRow, TableCell,
  Chip, Stack, IconButton, Tooltip, TextField, CircularProgress, Alert,
  InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import { useTranslation } from 'react-i18next';
import { serviceItemsApi, type ServiceItem } from '../../../api/serviceItems';
import ServiceItemFormDialog from '../../../components/ServiceItemFormDialog';

function money(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2 }) + ' €';
}

export default function CatalogPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const locale = i18n.language === 'de' ? 'de-DE' : 'en-GB';
  const de = i18n.language === 'de';

  const [search, setSearch]         = useState('');
  const [activeCategory, setActive] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem]     = useState<ServiceItem | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['service-items'],
    queryFn: () => serviceItemsApi.list(),
  });
  const items = data?.data?.items ?? [];

  // derive sorted unique categories
  const categories = Array.from(
    new Set(items.map(i => i.category).filter(Boolean))
  ).sort() as string[];

  const filtered = items.filter(it => {
    const matchSearch = !search.trim() ||
      it.name.toLowerCase().includes(search.toLowerCase()) ||
      it.description.toLowerCase().includes(search.toLowerCase()) ||
      it.category.toLowerCase().includes(search.toLowerCase());
    const matchCat = !activeCategory || it.category === activeCategory;
    return matchSearch && matchCat;
  });

  // group filtered items by category for display
  const grouped: { category: string; items: ServiceItem[] }[] = [];
  const seen = new Set<string>();
  for (const item of filtered) {
    const cat = item.category || (de ? 'Sonstige' : 'Other');
    if (!seen.has(cat)) { seen.add(cat); grouped.push({ category: cat, items: [] }); }
    grouped.find(g => g.category === cat)!.items.push(item);
  }

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

  const activeCount   = items.filter(i => i.isActive).length;
  const inactiveCount = items.length - activeCount;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {de ? 'Artikelkatalog' : 'Item Catalog'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {de
              ? `${items.length} Artikel · ${activeCount} aktiv · ${inactiveCount} inaktiv · ${categories.length} Kategorien`
              : `${items.length} items · ${activeCount} active · ${inactiveCount} inactive · ${categories.length} categories`}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          {de ? 'Neuer Artikel' : 'New item'}
        </Button>
      </Stack>

      <Card sx={{ mb: 2, p: 2 }}>
        <Stack gap={1.5}>
          <TextField
            size="small"
            placeholder={de ? 'Artikel oder Kategorie suchen…' : 'Search items or categories…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            sx={{ maxWidth: 340 }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
            }}
          />
          {categories.length > 0 && (
            <Stack direction="row" gap={1} flexWrap="wrap">
              <Chip
                label={de ? 'Alle' : 'All'}
                size="small"
                onClick={() => setActive(null)}
                color={activeCategory === null ? 'primary' : 'default'}
                variant={activeCategory === null ? 'filled' : 'outlined'}
              />
              {categories.map(cat => (
                <Chip
                  key={cat}
                  label={cat}
                  size="small"
                  onClick={() => setActive(p => p === cat ? null : cat)}
                  color={activeCategory === cat ? 'primary' : 'default'}
                  variant={activeCategory === cat ? 'filled' : 'outlined'}
                />
              ))}
            </Stack>
          )}
        </Stack>
      </Card>

      {isLoading && <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>}
      {error && <Alert severity="error">{t('common.error')}</Alert>}

      {!isLoading && (
        <Card>
          {filtered.length === 0 ? (
            <Box textAlign="center" py={6}>
              <Typography color="text.secondary">
                {search || activeCategory
                  ? (de ? 'Keine Artikel gefunden.' : 'No items found.')
                  : (de ? 'Noch keine Artikel im Katalog.' : 'No items in catalog yet.')}
              </Typography>
              {!search && !activeCategory && (
                <Button sx={{ mt: 2 }} variant="outlined" startIcon={<AddIcon />} onClick={openCreate}>
                  {de ? 'Ersten Artikel anlegen' : 'Create first item'}
                </Button>
              )}
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{de ? 'Name' : 'Name'}</TableCell>
                  <TableCell>{de ? 'Rechnungstext' : 'Invoice text'}</TableCell>
                  <TableCell>{de ? 'Kategorie' : 'Category'}</TableCell>
                  <TableCell>{de ? 'Einheit' : 'Unit'}</TableCell>
                  <TableCell align="right">{de ? 'EK (netto)' : 'Cost (net)'}</TableCell>
                  <TableCell align="right">{de ? 'VK (netto)' : 'Price (net)'}</TableCell>
                  <TableCell align="right">{de ? 'Marge' : 'Margin'}</TableCell>
                  <TableCell align="right">MwSt.</TableCell>
                  <TableCell>{t('common.status')}</TableCell>
                  <TableCell align="right">{t('common.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {grouped.map(group => (
                  <>
                    <TableRow key={`group-${group.category}`}>
                      <TableCell
                        colSpan={10}
                        sx={{
                          bgcolor: 'action.hover',
                          py: 0.75,
                          borderBottom: 'none',
                        }}
                      >
                        <Typography variant="caption" fontWeight={700} textTransform="uppercase" letterSpacing={0.8} color="text.secondary">
                          {group.category}
                          <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 1 }}>
                            ({group.items.length})
                          </Typography>
                        </Typography>
                      </TableCell>
                    </TableRow>
                    {group.items.map(item => {
                      const ek = item.costPriceCents;
                      const vk = item.defaultUnitPriceCents;
                      const margin = ek > 0 && vk > 0 ? Math.round(((vk - ek) / vk) * 100) : null;
                      return (
                        <TableRow key={item._id} hover sx={{ opacity: item.isActive ? 1 : 0.55 }}>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>{item.name}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">{item.description || '—'}</Typography>
                          </TableCell>
                          <TableCell>
                            {item.category
                              ? <Chip size="small" label={item.category} variant="outlined" />
                              : <Typography variant="body2" color="text.disabled">—</Typography>}
                          </TableCell>
                          <TableCell>{item.unit}</TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                            {ek > 0 ? money(ek, locale) : <Typography variant="body2" color="text.disabled">—</Typography>}
                          </TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                            {money(vk, locale)}
                          </TableCell>
                          <TableCell align="right">
                            {margin !== null ? (
                              <Chip
                                size="small"
                                label={`${margin} %`}
                                color={margin >= 30 ? 'success' : margin >= 15 ? 'warning' : 'error'}
                                sx={{ fontVariantNumeric: 'tabular-nums' }}
                              />
                            ) : <Typography variant="body2" color="text.disabled">—</Typography>}
                          </TableCell>
                          <TableCell align="right">{item.vatRate} %</TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={item.isActive ? t('common.active') : t('common.inactive')}
                              color={item.isActive ? 'success' : 'default'}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" justifyContent="flex-end" gap={0.5}>
                              <Tooltip title={t('common.edit')}>
                                <IconButton size="small" onClick={() => openEdit(item)}>
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              {item.isActive ? (
                                <Tooltip title={de ? 'Deaktivieren' : 'Deactivate'}>
                                  <IconButton size="small" color="warning" onClick={() => deactivate.mutate(item._id)}>
                                    <BlockIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              ) : (
                                <Tooltip title={de ? 'Reaktivieren' : 'Reactivate'}>
                                  <IconButton size="small" color="success" onClick={() => reactivate.mutate(item._id)}>
                                    <CheckCircleIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              )}
                              <Tooltip title={t('common.delete')}>
                                <IconButton size="small" color="error" onClick={() => remove.mutate(item._id)}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      <ServiceItemFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {}}
        editItem={editItem}
      />
    </Box>
  );
}
