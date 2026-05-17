import { DocumentReference } from "firebase/firestore";

export interface AppUser {
  id: string;
  email: string;
  role: "admin" | "store" | "warehouse";
  locationId?: string;
  createdAt: Date;
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
}

export interface InventoryBottle {
  id: string;
  masterWineRef: DocumentReference;
  locationRef: DocumentReference | null;
  storeRef: DocumentReference | null;
  sku: string;
  status: "incoming" | "received" | "shelved" | "consumed" | "damaged" | "lost" | "outbound";
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
  sku: string;
  requestedQty: number;
  pulledQty: number;
  pulledBottleIds: string[];
  skipped?: boolean;
  skippedAt?: any;
}

export interface PulloutRequest {
  id: string;
  wineRequestId: string;
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
  format?: string;
  sku: string;
  qty: number;
  pulledQty?: number;
  price?: number;
}

export interface WineRequest {
  id: string;
  storeId: string;
  storeEmail: string;
  status: "pending" | "converted" | "rejected";
  items: WineRequestItem[];
  totalAmount: number;
  createdAt: any;
  updatedAt: any;
}

export type WineFormat = "37.5cl" | "50cl" | "70cl" | "75cl" | "150cl" | "300cl" | "600cl";
export type WineType = "Red Wine" | "White wine" | "Sweet Wine" | "Sparkling wine" | "Rose wine";

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

  // Progress tracking
  onboardedQty: number;
  bottleIds: string[];
}

export interface OnboardingTask {
  id: string;
  invoiceUrl?: string;
  status: "pending_review" | "warehouse" | "completed";
  items: OnboardingItem[];
  uploadedBy: string;
  uploadedEmail: string;
  createdAt: any;
  updatedAt: any;
}

export type StockStatus = "in_stock" | "stockout" | "overstock" | "par_alert" | "discontinued";

export interface StoreWineSetting {
  id: string;
  storeId: string;
  masterWineId: string;
  parLevel: number;
  safetyStock: number;
  discontinued: boolean;
  createdAt: any;
  updatedAt: any;
}
