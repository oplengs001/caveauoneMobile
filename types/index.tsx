import { DocumentReference } from "firebase/firestore";

export interface AppUser {
  id: string;
  email: string;
  role: "admin" | "finance" | "store" | "store_manager" | "store_staff" | "warehouse";
  accountId?: string;
  locationId?: string;
  createdAt: Date;
  pushTokens?: string[];
}

export interface MasterWine {
  id: string;
  name: string;
  vintage: string;
  price: number;
  producer?: string;
  region?: string;
  type?: string;
  sku?: string;
  format?: string;
  grapeVariety?: string;
  wineCategory?: "fast" | "fine" | "reserve" | null;
}

export interface InventoryBottle {
  id: string;
  bottleId?: string;
  masterWineRef?: any;
  locationRef?: any;
  storeRef?: any;
  outboundLocationRef?: any;
  masterWineId?: string;
  locationId?: string | null;
  storeId?: string | null;
  outboundStoreId?: string | null;
  sku: string;
  readableId?: string;
  isTagged?: boolean;
  status:
    | "incoming"
    | "received"
    | "tagged"
    | "shelved"
    | "open"
    | "consumed"
    | "damaged"
    | "lost"
    | "outbound";
  glassesRemaining?: number;
  receiptId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Store {
  id: string;
  name: string;
  type: "Boutique" | "Warehouse";
  address?: string;
  createdAt?: any;
}

export interface Location {
  id: string;
  storeId: string;
  name: string;
  type: string;
  capacity?: number;
}

export interface PulloutRequestItem {
  masterWineId: string;
  wineName: string;
  vintage?: string;
  producer?: string;
  format?: string;
  sku: string;
  requestedQty: number;
  pulledQty: number;
  pulledBottleIds: string[];
  skipped?: boolean;
  skippedAt?: any;
  skippedQty?: number;
}

export interface PulloutRequest {
  id: string;
  wineRequestId: string;
  sourceStoreId?: string;
  outBoundStoreId?: string;
  items: PulloutRequestItem[];
  status: "pending" | "in_progress" | "completed";
  createdAt: any;
  updatedAt: any;
}

export interface IndividualLabelData {
  wineName: string;
  sku: string;
  dateAdded: string;
  bottleId: string;
}

export interface WineRequestItem {
  masterWineId: string;
  wineName: string;
  vintage: string;
  producer: string;
  format: string;
  sku: string;
  qty: number;
  skippedQty?: number;
  pulledQty?: number;
  ingressedQty?: number;
  price?: number;
}

export interface WineRequest {
  id: string;
  storeId: string;
  targetStoreId?: string;
  createdBy: string;
  status:
    | "pending"
    | "converted"
    | "rejected"
    | "ingress_complete"
    | "receiving"
    | "outbound";
  items: WineRequestItem[];
  totalAmount: number;
  createdAt: any;
  updatedAt: any;
  rejectionReason?: string;
  resolutionType?: "swap" | "discontinued" | "stay_pending" | "stockout" | null;
}

export interface DeliveryItem {
  masterWineId: string;
  wineName: string;
  vintage?: string;
  producer?: string;
  format?: string;
  sku: string;
  qty: number;
  ingressedQty: number;
  bottleIds: string[];
}

export interface Delivery {
  id: string;
  storeId: string;
  createdBy: string;
  notes?: string;
  status: "dispatched" | "receiving" | "ingress_complete" | "cancelled";
  items: DeliveryItem[];
  totalBottles: number;
  createdAt: any;
  updatedAt: any;
}

export type WineFormat =
  | "37.5cl"
  | "50cl"
  | "70cl"
  | "75cl"
  | "150cl"
  | "300cl"
  | "600cl";
export type WineType =
  | "Red Wine"
  | "White wine"
  | "Sweet Wine"
  | "Sparkling wine"
  | "Rose wine";

export interface OnboardingItem {
  id: string;
  sku: string;
  price: number;
  qty: number;
  producerName: string;
  wineName: string;
  vintage: string;
  format: WineFormat;
  country: string;
  region: string;
  subregion?: string;
  classification?: string;
  grapeVariety: string;
  wineType: WineType;
  issues?: string[];

  // Progress tracking
  onboardedQty: number;
  bottleIds: string[];
}

export interface OnboardingTask {
  id: string;
  invoiceUrl?: string;
  reports: any[];
  status: "pending_review" | "warehouse" | "completed";
  items: OnboardingItem[];
  uploadedBy: string;
  uploadedEmail: string;
  createdAt: any;
  updatedAt: any;
}

export type StockStatus =
  | "in_stock"
  | "stockout"
  | "overstock"
  | "par_alert"
  | "under_safety"
  | "unset"
  | "discontinued";

export interface StoreWineSetting {
  id: string;
  storeId: string;
  masterWineId: string;
  parLevel: number;
  safetyStock: number;
  discontinued: boolean;
  createdAt: any;
  updatedAt: any;
  wineCategory?: "fast" | "fine" | "reserve" | null;
  sellingPrice?: number;
  vatMode?: "included" | "excluded";
}

export interface ActivityLog {
  id: string;
  action: string;
  entity: string;           // Firestore collection name
  entityId: string;         // Document ID that was mutated
  summary: string;          // Human-readable one-liner
  details?: Record<string, any>; // Optional extra payload
  performedBy: string;      // email or uid
  performedByRole: string;  // "admin" | "store" | "warehouse"
  source: "admin" | "warehouse";
  timestamp: any;           // Firestore Timestamp
}

export interface Customer {
  id: string;
  name: string;
  email?: string;
  contactNo?: string;
  notes?: string;
  favoriteProducers?: string[];
  favoriteRegions?: string[];
  favoriteWineStyle?: string;
  storeId: string;
  createdAt: any;
  updatedAt: any;
  totalSpend: number;
  totalOrders: number;
}
