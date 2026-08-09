export type AssetType =
  | "hardware"
  | "software_license"
  | "network_equipment"
  | "tool"
  | "other";

export type OwnershipType = "innoserve" | "customer";

export type ItemStatus =
  | "available"
  | "in_use"
  | "under_maintenance"
  | "retired"
  | "replaced"
  | "deployed_externally";

export type MaintenanceStatus =
  | "scheduled"
  | "in_repair"
  | "out_of_service"
  | "completed";

export interface CreateInventoryItemBody {
  name: string;
  sku?: string;
  quantity?: number;
  location?: string;
  assetType?: AssetType;
  serialNumber?: string;
  purchaseDate?: string;
  warrantyExpiry?: string;
  expiryDate?: string;
  ownershipType?: OwnershipType;
  customerId?: string;
}

export interface UpdateInventoryItemBody {
  name?: string;
  sku?: string;
  location?: string;
  assetType?: AssetType;
  serialNumber?: string;
  purchaseDate?: string;
  warrantyExpiry?: string;
  expiryDate?: string;
  ownershipType?: OwnershipType;
  customerId?: string;
  status?: ItemStatus;
}

export interface AddStockBody {
  quantity: number;
  remarks?: string;
}

export interface UseItemBody {
  itemId: string;
  quantity: number;
}

export interface CreateMaintenanceBody {
  reason: string;
  startDate: string;
  expectedReturnDate?: string;
  technicianNotes?: string;
}

export interface CompleteMaintenanceBody {
  technicianNotes?: string;
  completedDate?: string;
}

export interface CreateExternalDeploymentBody {
  itemId: string;
  clientName: string;
  siteLocation?: string;
  deployedAt: string;
  expectedReturnDate?: string;
  notes?: string;
}

export interface ReturnExternalDeploymentBody {
  returnedAt?: string;
  notes?: string;
}

export interface ReplaceItemBody {
  replacementItemId: string;
  notes?: string;
}
