export interface MediaIncident {
  incidentId: number;
  refId: string | null;
  mainCategoryId: number | null;
  mainCategoryName: string | null;
  subCategoryId: number | null;
  subCategoryName: string | null;
  quantityValue: number | null;
  priorityId: number | null;
  priorityName: string | null;
  priorityColor: string | null;
  centerId: number | null;
  centerName: string | null;
  neighborhoodId: number | null;
  neighborhoodName: string | null;
  roadId: number | null;
  roadName: string | null;
  statusId: number | null;
  statusName: string | null;
  statusArabicName: string | null;
  statusEnglishName: string | null;
  statusColor: string | null;
  sourceOfIncident: string | null;
  representativeImageUrl: string | null;
  createdAt: string;
  lat: number | null;
  lng: number | null;
}

export interface MediaIncidentFilters {
  centerId?: number | null;
  neighborhoodId?: number | null;
  roadId?: number | null;
  subCategoryId?: number | null;
  statusId?: number | null;
  priorityId?: number | null;
  search?: string | null;
  pageNumber?: number;
  pageSize?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    currentPage: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}
