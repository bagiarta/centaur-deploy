// Base URL from the local server proxy or API URL
const BASE_URL = '/api/assets';

export const assetApi = {
  // ==========================
  // LOCATIONS
  // ==========================
    getLocationAssets: async (code: string, name: string) => {
    const res = await fetch(`${BASE_URL}/locations/${code}/assets?name=${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error('Failed to fetch location assets');
    return res.json();
  },
  getLocations: async () => {
    const res = await fetch(`${BASE_URL}/locations`);
    if (!res.ok) throw new Error('Failed to fetch locations');
    return res.json();
  },
  createLocation: async (data: any) => {
    const res = await fetch(`${BASE_URL}/locations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create location');
    return res.json();
  },
  updateLocation: async (id: number, data: any) => {
    const res = await fetch(`${BASE_URL}/locations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update location');
    return res.json();
  },
  deleteLocation: async (id: number) => {
    const res = await fetch(`${BASE_URL}/locations/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete location');
    return res.json();
  },

  // ==========================
  // DEPARTMENTS
  // ==========================
  getDepartments: async () => {
    const res = await fetch(`${BASE_URL}/departments`);
    if (!res.ok) throw new Error('Failed to fetch departments');
    return res.json();
  },
  createDepartment: async (data: any) => {
    const res = await fetch(`${BASE_URL}/departments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create department');
    return res.json();
  },
  updateDepartment: async (id: number, data: any) => {
    const res = await fetch(`${BASE_URL}/departments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update department');
    return res.json();
  },
  deleteDepartment: async (id: number) => {
    const res = await fetch(`${BASE_URL}/departments/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete department');
    return res.json();
  },

  // ==========================
  // CATEGORIES
  // ==========================
  getCategories: async () => {
    const res = await fetch(`${BASE_URL}/categories`);
    if (!res.ok) throw new Error('Failed to fetch categories');
    return res.json();
  },
  createCategory: async (data: any) => {
    const res = await fetch(`${BASE_URL}/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create category');
    return res.json();
  },
  updateCategory: async (id: number, data: any) => {
    const res = await fetch(`${BASE_URL}/categories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update category');
    return res.json();
  },
  deleteCategory: async (id: number) => {
    const res = await fetch(`${BASE_URL}/categories/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete category');
    return res.json();
  },

  // ==========================
  // VENDORS
  // ==========================
  getVendors: async () => {
    const res = await fetch(`${BASE_URL}/vendors`);
    if (!res.ok) throw new Error('Failed to fetch vendors');
    return res.json();
  },
  createVendor: async (data: any) => {
    const res = await fetch(`${BASE_URL}/vendors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create vendor');
    return res.json();
  },
  updateVendor: async (id: number, data: any) => {
    const res = await fetch(`${BASE_URL}/vendors/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update vendor');
    return res.json();
  },
  deleteVendor: async (id: number) => {
    const res = await fetch(`${BASE_URL}/vendors/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete vendor');
    return res.json();
  },

  // ==========================
  // ASSETS
  // ==========================
  getAssets: async () => {
    const res = await fetch(`${BASE_URL}/assets`);
    if (!res.ok) throw new Error('Failed to fetch assets');
    return res.json();
  },
  createAsset: async (data: any) => {
    const res = await fetch(`${BASE_URL}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create asset');
    return res.json();
  },
  updateAsset: async (id: number, data: any) => {
    const res = await fetch(`${BASE_URL}/assets/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update asset');
    return res.json();
  },
  deleteAsset: async (id: number) => {
    const res = await fetch(`${BASE_URL}/assets/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete asset');
    return res.json();
  },

  // ==========================
  // ASSIGNMENTS
  // ==========================
  getAssignments: async () => {
    const res = await fetch(`${BASE_URL}/assignments`);
    if (!res.ok) throw new Error('Failed to fetch assignments');
    return res.json();
  },
  getBAST: async (bast_number: string) => {
    const res = await fetch(`${BASE_URL}/assignments/bast/${bast_number}`);
    if (!res.ok) throw new Error('Failed to fetch BAST data');
    return res.json();
  },
  createAssignment: async (data: any) => {
    const res = await fetch(`${BASE_URL}/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create assignment');
    return res.json();
  },
  updateAssignment: async (id: number, data: any) => {
    const res = await fetch(`${BASE_URL}/assignments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update assignment');
    return res.json();
  },
  returnAsset: async (id: number, return_condition: string, return_notes: string) => {
    const res = await fetch(`${BASE_URL}/assignments/${id}/return`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ return_condition, return_notes })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to return asset');
    }
    return res.json();
  },
  deleteAssignment: async (id: number) => {
    const res = await fetch(`${BASE_URL}/assignments/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete assignment');
    return res.json();
  },

  // ==========================
  // MOVEMENTS
  // ==========================
  getMovements: async () => {
    const res = await fetch(`${BASE_URL}/movements`);
    if (!res.ok) throw new Error('Failed to fetch movements');
    return res.json();
  },
  createMovement: async (data: any) => {
    const res = await fetch(`${BASE_URL}/movements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create movement');
    return res.json();
  },
  updateMovement: async (id: number, data: any) => {
    const res = await fetch(`${BASE_URL}/movements/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update movement');
    return res.json();
  },
  deleteMovement: async (id: number) => {
    const res = await fetch(`${BASE_URL}/movements/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete movement');
    return res.json();
  },

  // ==========================
  // DASHBOARD
  // ==========================
  getDashboardStats: async () => {
    const res = await fetch(`${BASE_URL}/dashboard-stats`);
    if (!res.ok) throw new Error('Failed to fetch dashboard stats');
    return res.json();
  },

  // ==========================
  // COMPONENTS
  // ==========================
  getComponents: async (assetCode: string) => {
    const res = await fetch(`${BASE_URL}/assets/${assetCode}/components`);
    if (!res.ok) throw new Error('Failed to fetch components');
    return res.json();
  },
  createComponent: async (assetCode: string, data: any) => {
    const res = await fetch(`${BASE_URL}/assets/${assetCode}/components`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create component');
    return res.json();
  },
  deleteComponent: async (id: number) => {
    const res = await fetch(`${BASE_URL}/components/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete component');
    return res.json();
  }
};


