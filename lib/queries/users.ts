import { apiFetch } from "@/lib/api";
import { AppUser } from "@/types";

export type { AppUser };

export async function fetchStoreStaff(locationId?: string | null): Promise<AppUser[]> {
  try {
    const data = await apiFetch("/users");
    const userList: AppUser[] = Array.isArray(data) ? data : Array.isArray(data.users) ? data.users : [];
    if (locationId) {
      const storeUsers = userList.filter((u) => u.locationId === locationId);
      if (storeUsers.length > 0) return storeUsers;
    }
    return userList;
  } catch (error) {
    console.error("[fetchStoreStaff] Failed to fetch store users:", error);
    return [];
  }
}
