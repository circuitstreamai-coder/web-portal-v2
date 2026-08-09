export interface CreateCustomerBody {
  companyName?: string;
  contactPersonName?: string;
  email?: string;
  phone?: string;
  secondaryContactName?: string;
  secondaryContactEmail?: string;
  secondaryContactPhone?: string;
  addressState?: string;
  addressCity?: string;
  addressPincode?: string;
  userId?: string;
  author?: string;
}

export interface UpdateCustomerBody {
  companyName?: string;
  contactPersonName?: string;
  email?: string;
  phone?: string;
  secondaryContactName?: string;
  secondaryContactEmail?: string;
  secondaryContactPhone?: string;
  addressState?: string;
  addressCity?: string;
  addressPincode?: string;
}

export interface UpdateCustomerStatusBody {
  status?: string;
}
