import React, { useState, useEffect } from 'react';
import { PageHeader, SectionCard } from '@/components/ui-enterprise';
import { Search, Plus, Users, Briefcase, MoreHorizontal, Edit, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { assetApi } from '@/lib/api-assets';

export default function AssetDepartmentsPage() {
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ code: '', name: '', manager: '', employee_count: 0 });
  const [departments, setDepartments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDepartments = async () => {
    setIsLoading(true);
    try {
      const data = await assetApi.getDepartments();
      setDepartments(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  const filteredDepartments = departments.filter(dept => 
    dept.name.toLowerCase().includes(search.toLowerCase()) || 
    dept.code.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await assetApi.createDepartment(formData);
      setIsModalOpen(false);
      setFormData({ code: '', name: '', manager: '', employee_count: 0 });
      fetchDepartments(); // Refresh data
    } catch (err) {
      alert("Failed to save department");
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this department?")) {
      try {
        await assetApi.deleteDepartment(id);
        fetchDepartments();
      } catch (err) {
        alert("Failed to delete department");
      }
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <PageHeader 
        title="Departments" 
        subtitle="Manage company departments for asset assignments and tracking."
      />

      <SectionCard>
        <div className="flex flex-col md:flex-row gap-4 justify-between items-center mb-6">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search departments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-md text-sm outline-none focus:border-primary transition-all"
            />
          </div>
          
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <button className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
                <Plus className="w-4 h-4" />
                Add Department
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New Department</DialogTitle>
                <DialogDescription>
                  Register a new department in the organization.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Department Code</label>
                  <input disabled value="[Auto-generated]" className="w-full p-2 border rounded-md bg-gray-100 text-gray-500 cursor-not-allowed" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Department Name</label>
                  <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2 border rounded-md" placeholder="e.g. Information Technology" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Manager Name</label>
                  <input value={formData.manager} onChange={e => setFormData({...formData, manager: e.target.value})} className="w-full p-2 border rounded-md" placeholder="e.g. John Doe" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Employee Count</label>
                  <input type="number" min="0" value={formData.employee_count} onChange={e => setFormData({...formData, employee_count: parseInt(e.target.value) || 0})} className="w-full p-2 border rounded-md" />
                </div>
                <DialogFooter className="pt-4">
                  <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium">Save Department</button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? (
            <div className="col-span-full py-12 text-center text-muted-foreground">Loading departments...</div>
          ) : filteredDepartments.length > 0 ? (
            filteredDepartments.map(dept => (
              <div key={dept.id} className="p-5 rounded-xl border border-border bg-card hover:border-primary/50 transition-colors group">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      <Briefcase className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{dept.name}</h3>
                      <p className="text-xs text-muted-foreground">{dept.code}</p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors outline-none focus:ring-2 focus:ring-primary">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => alert("Edit Modal Not Implemented")} className="cursor-pointer">
                          <Edit className="w-4 h-4 mr-2" /> Edit Department
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleDelete(dept.id)} className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-100 dark:focus:bg-red-900/30">
                          <Trash2 className="w-4 h-4 mr-2" /> Delete Department
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                
                <div className="space-y-2 mt-4 pt-4 border-t border-border">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Manager</span>
                    <span className="font-medium">{dept.manager || '-'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Team Size</span>
                    <span className="font-medium flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-muted-foreground" />
                      {dept.employee_count}
                    </span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full py-12 text-center border border-dashed rounded-xl border-border">
              <Briefcase className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">No departments found matching your criteria.</p>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
