import { DocumentReference } from "firebase/firestore";

export interface AppUser {
  id: string;
  email: string;
  role: "admin" | "user";
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
  failSafeCode: string;
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
