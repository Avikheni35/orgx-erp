import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { Customer } from '../../models/Customer';
import { nextSeq } from '../../models/Counter';
import mongoose from 'mongoose';

const router = Router();

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const tenantId = req.internalTenantId!;
    const {
      m1BusinessId,
      name,
      vatId,
      email,
      address,
    } = req.body as {
      m1BusinessId: string;
      name:         string;
      vatId?:       string;
      email?:       string;
      address?:     { street?: string; city?: string; zip?: string };
    };

    const tenantOid = new mongoose.Types.ObjectId(tenantId);

    let customer = await Customer.findOne({ tenantId: tenantOid, notes: `m1:${m1BusinessId}` });

    if (customer) {
      customer.companyName = name;
      if (vatId !== undefined) customer.vatId = vatId;
      if (address?.street)  customer.address.street  = address.street;
      if (address?.city)    customer.address.city    = address.city;
      if (address?.zip)     customer.address.zip     = address.zip;
      if (email) {
        const primary = customer.contacts.find(c => c.isPrimary);
        if (primary) primary.email = email;
      }
      await customer.save();
      return res.json({ id: customer._id, updated: true });
    }

    const seq = await nextSeq(tenantId, 'customer');
    const customerNumber = `KD-${String(seq).padStart(5, '0')}`;

    customer = await Customer.create({
      tenantId:       tenantOid,
      customerNumber,
      companyName:    name,
      vatId:          vatId ?? '',
      address: {
        street:  address?.street ?? '',
        city:    address?.city   ?? '',
        zip:     address?.zip    ?? '',
        country: 'DE',
      },
      contacts: email ? [{ name, email, isPrimary: true }] : [],
      notes:    `m1:${m1BusinessId}`,
    });

    res.status(201).json({ id: customer._id, updated: false });
  })
);

export default router;
