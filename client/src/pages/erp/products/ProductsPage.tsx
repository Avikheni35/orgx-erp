import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Chip, TextField, InputAdornment,
  Table, TableHead, TableBody, TableRow, TableCell, Paper, CircularProgress,
  Alert, Dialog, DialogTitle, DialogContent, DialogActions, FormControl,
  InputLabel, Select, MenuItem, FormControlLabel, Switch, Grid, Divider,
  List, ListItemButton, ListItemText, Tooltip, IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import FolderIcon from '@mui/icons-material/Folder';
import InventoryIcon from '@mui/icons-material/Inventory2';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { productsApi, ProductCategory } from '../../../api/products';

const fmt = (cents: number) => (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' €';

export default function ProductsPage() {
  const { i18n } = useTranslation();
  const de = i18n.language === 'de';
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'service' | 'product'>('all');

  // category dialog
  const [catDialog, setCatDialog] = useState(false);
  const [catForm, setCatForm] = useState<Partial<ProductCategory>>({ name: '', description: '' });
  const [editingCat, setEditingCat] = useState<ProductCategory | null>(null);

  const { data: categories = [] } = useQuery({ queryKey: ['m3-product-categories'], queryFn: productsApi.listCategories });
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['m3-products', selectedCat, search, typeFilter],
    queryFn: () => productsApi.list({
      ...(selectedCat ? { category: selectedCat } : {}),
      ...(search ? { search } : {}),
      ...(typeFilter !== 'all' ? { type: typeFilter } : {}),
    }),
  });

  const catMutation = useMutation({
    mutationFn: (data: Partial<ProductCategory>) =>
      editingCat ? productsApi.updateCategory(editingCat._id, data) : productsApi.createCategory(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['m3-product-categories'] }); setCatDialog(false); setEditingCat(null); setCatForm({ name: '', description: '' }); },
  });

  const openCatDialog = (cat?: ProductCategory) => {
    setEditingCat(cat ?? null);
    setCatForm(cat ? { name: cat.name, description: cat.description } : { name: '', description: '' });
    setCatDialog(true);
  };

  // build category tree (parent → children)
  const rootCats = categories.filter(c => !c.parentId);
  const childCats = (parentId: string) => categories.filter(c => c.parentId === parentId);

  const lowStock = products.filter(p => !p.isService && p.totalStock !== undefined && p.totalStock <= p.lowStockThreshold && p.totalStock > 0).length;
  const outOfStock = products.filter(p => !p.isService && (p.totalStock ?? 0) === 0 && !p.hasVariants).length;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{de ? 'Produkte & Dienstleistungen' : 'Products & Services'}</Typography>
          <Stack direction="row" gap={1} mt={0.5}>
            <Chip label={`${products.length} ${de ? 'Artikel' : 'items'}`} size="small" />
            {lowStock > 0 && <Chip label={`${lowStock} ${de ? 'Mindestbestand' : 'low stock'}`} size="small" color="warning" />}
            {outOfStock > 0 && <Chip label={`${outOfStock} ${de ? 'ausverkauft' : 'out of stock'}`} size="small" color="error" />}
          </Stack>
        </Box>
        <Stack direction="row" gap={1}>
          <Button variant="outlined" startIcon={<FolderIcon />} onClick={() => openCatDialog()} size="small">
            {de ? 'Kategorie' : 'Category'}
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/erp/products/new')}>
            {de ? 'Neues Produkt' : 'New product'}
          </Button>
        </Stack>
      </Stack>

      <Stack direction="row" gap={2} alignItems="flex-start">
        {/* Category sidebar */}
        <Paper sx={{ minWidth: 200, maxWidth: 220, flexShrink: 0 }}>
          <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              {de ? 'KATEGORIEN' : 'CATEGORIES'}
            </Typography>
          </Box>
          <List dense disablePadding>
            <ListItemButton selected={!selectedCat} onClick={() => setSelectedCat(null)}>
              <ListItemText primary={de ? 'Alle' : 'All'} />
            </ListItemButton>
            {rootCats.map(cat => (
              <Box key={cat._id}>
                <ListItemButton selected={selectedCat === cat._id} onClick={() => setSelectedCat(cat._id)} sx={{ pl: 2 }}>
                  <ListItemText primary={cat.name} primaryTypographyProps={{ variant: 'body2' }} />
                  <Tooltip title={de ? 'Bearbeiten' : 'Edit'}>
                    <IconButton size="small" onClick={e => { e.stopPropagation(); openCatDialog(cat); }}>
                      <EditIcon fontSize="inherit" />
                    </IconButton>
                  </Tooltip>
                </ListItemButton>
                {childCats(cat._id).map(child => (
                  <ListItemButton key={child._id} selected={selectedCat === child._id} onClick={() => setSelectedCat(child._id)} sx={{ pl: 4 }}>
                    <ListItemText primary={child.name} primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }} />
                  </ListItemButton>
                ))}
              </Box>
            ))}
          </List>
        </Paper>

        {/* Main content */}
        <Box flex={1} minWidth={0}>
          {/* Filters */}
          <Stack direction="row" gap={1} mb={2} flexWrap="wrap">
            <TextField
              size="small" placeholder={de ? 'Suche…' : 'Search…'}
              value={search} onChange={e => setSearch(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
              sx={{ minWidth: 200 }}
            />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>{de ? 'Typ' : 'Type'}</InputLabel>
              <Select value={typeFilter} label={de ? 'Typ' : 'Type'} onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}>
                <MenuItem value="all">{de ? 'Alle' : 'All'}</MenuItem>
                <MenuItem value="product">{de ? 'Produkte' : 'Products'}</MenuItem>
                <MenuItem value="service">{de ? 'Dienstleistungen' : 'Services'}</MenuItem>
              </Select>
            </FormControl>
          </Stack>

          {isLoading && <CircularProgress />}

          {!isLoading && (
            <Paper>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{de ? 'Name' : 'Name'}</TableCell>
                    <TableCell>{de ? 'SKU' : 'SKU'}</TableCell>
                    <TableCell>{de ? 'Typ' : 'Type'}</TableCell>
                    <TableCell>{de ? 'Kategorie' : 'Category'}</TableCell>
                    <TableCell align="right">{de ? 'Preis' : 'Price'}</TableCell>
                    <TableCell align="right">{de ? 'Bestand' : 'Stock'}</TableCell>
                    <TableCell>{de ? 'MwSt.' : 'VAT'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {products.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                        <InventoryIcon sx={{ fontSize: 40, mb: 1, opacity: 0.3, display: 'block', mx: 'auto' }} />
                        {de ? 'Keine Produkte gefunden.' : 'No products found.'}
                      </TableCell>
                    </TableRow>
                  ) : products.map(p => (
                    <TableRow key={p._id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/erp/products/${p._id}`)}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>{p.name}</Typography>
                        {p.hasVariants && (
                          <Typography variant="caption" color="text.secondary">
                            {p.variantCount} {de ? 'Varianten' : 'variants'}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" fontFamily="monospace">{p.sku || '—'}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={p.isService ? (de ? 'Dienstl.' : 'Service') : (de ? 'Produkt' : 'Product')}
                          size="small"
                          color={p.isService ? 'info' : 'default'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">{p.categoryName || '—'}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                          {fmt(p.defaultUnitPriceCents)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        {p.isService ? (
                          <Typography variant="caption" color="text.secondary">—</Typography>
                        ) : (
                          <Chip
                            label={p.totalStock ?? 0}
                            size="small"
                            color={(p.totalStock ?? 0) === 0 ? 'error' : (p.totalStock ?? 0) <= p.lowStockThreshold ? 'warning' : 'default'}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">{p.vatRate}%</Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}
        </Box>
      </Stack>

      {/* Category dialog */}
      <Dialog open={catDialog} onClose={() => setCatDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editingCat ? (de ? 'Kategorie bearbeiten' : 'Edit category') : (de ? 'Neue Kategorie' : 'New category')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField label={de ? 'Name' : 'Name'} value={catForm.name ?? ''} onChange={e => setCatForm(p => ({ ...p, name: e.target.value }))} fullWidth size="small" />
            <TextField label={de ? 'Beschreibung' : 'Description'} value={catForm.description ?? ''} onChange={e => setCatForm(p => ({ ...p, description: e.target.value }))} fullWidth size="small" multiline rows={2} />
            <FormControl fullWidth size="small">
              <InputLabel>{de ? 'Übergeordnete Kategorie' : 'Parent category'}</InputLabel>
              <Select
                value={catForm.parentId ?? ''}
                label={de ? 'Übergeordnete Kategorie' : 'Parent category'}
                onChange={e => setCatForm(p => ({ ...p, parentId: e.target.value || null }))}
              >
                <MenuItem value="">{de ? '— Keine —' : '— None —'}</MenuItem>
                {categories.filter(c => c._id !== editingCat?._id).map(c => (
                  <MenuItem key={c._id} value={c._id}>{c.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCatDialog(false)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button variant="contained" onClick={() => catMutation.mutate(catForm)} disabled={catMutation.isPending || !catForm.name}>
            {de ? 'Speichern' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
