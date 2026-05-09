import { DocumentReference } from "firebase/firestore";

export interface AppUser {
  id: string;
  email: string;
  role: "admin" | "store" | "warehouse";
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
}

export interface InventoryBottle {
  id: string;
  masterWineRef: DocumentReference;
  locationRef: DocumentReference | null;
  sku: string;
  status: "received" | "shelved" | "consumed" | "damaged" | "lost";
  receiptId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Location {
  id: string;
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
