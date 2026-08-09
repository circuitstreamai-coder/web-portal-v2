import { restRequest } from "$lib/api/rest";
import { invalidate } from "$lib/stores/query";

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

export interface InventoryItem {
  id: string;
  name: string;
  sku: string | null;
  quantity: number;
  location: string | null;
  assetType: AssetType;
  serialNumber: string | null;
  purchaseDate: string | null;
  warrantyExpiry: string | null;
  expiryDate: string | null;
  ownershipType: OwnershipType;
  customerId: string | null;
  status: ItemStatus;
  replacedByItemId: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface CreateInventoryInput {
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

export interface UpdateInventoryInput extends Partial<CreateInventoryInput> {
  id: string;
  status?: ItemStatus;
}

export async function createInventoryItem(input: CreateInventoryInput): Promise<InventoryItem> {
  const result = await restRequest<InventoryItem>("/api/inventory", {
    method: "POST",
    body: JSON.stringify(input),
  });
  invalidate("inventory");
  return result;
}

export async function updateInventoryItem(input: UpdateInventoryInput): Promise<InventoryItem> {
  const { id, ...body } = input;
  const result = await restRequest<InventoryItem>(`/api/inventory/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  invalidate("inventory");
  return result;
}
