export interface LookupItem {
  lookupType: string;
  lookupId: number;
  lookupName: string | null;
  parentId: number | null;
  isDeleted: boolean;
}
