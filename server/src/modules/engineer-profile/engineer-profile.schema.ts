export type DocumentsStatus = "pending" | "approved" | "rejected" | "reupload";

export interface UpdateDocumentsStatusBody {
  documentsStatus: DocumentsStatus;
}

export type AccountStatus = "active" | "suspended";

export interface UpdateAccountStatusBody {
  accountStatus: AccountStatus;
}

export interface UpdateEngineerProfileBody {
  userName?: string;
  userPhone?: string;
  addressState?: string;
  addressCity?: string;
  addressPincode?: string;
  bankAccountNumber?: string;
  ifscCode?: string;
  accountHolderName?: string;
}
