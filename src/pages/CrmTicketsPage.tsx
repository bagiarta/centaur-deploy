import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { 
  Ticket, CheckCircle2, XCircle, AlertTriangle, Clock, 
  Search, Info, Plus, ChevronRight, User as UserIcon,
  ShieldCheck, CheckCheck, MapPin, Phone, Mail, CreditCard, Coins, Calendar,
  ArrowRightLeft
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

type Ticket = {
  ticket_id: string;
  requester_id: string;
  requester_name: string;
  unit_branch: string;
  request_type: string;
  priority: string;
  customer_id: string;
  status: string;
  current_approval_level: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  reason?: string;
  customer_name?: string;
  mobile_no?: string;
};

const renderStatusBadge = (status: string, level?: number) => {
  if (status === 'Approved') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shadow-sm">
        <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
        Approved
      </span>
    );
  }

  if (status.includes('Completed')) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-sm">
        <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
        {status}
      </span>
    );
  }

  if (status === 'Rejected') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-danger/10 text-danger border border-danger/20 shadow-sm">
        <XCircle className="w-3.5 h-3.5" />
        Rejected
      </span>
    );
  }

  if (status === 'Need Information') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shadow-sm">
        <AlertTriangle className="w-3.5 h-3.5" />
        Need Information
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-warning/10 text-warning border border-warning/20 shadow-sm">
      <Clock className="w-3.5 h-3.5" />
      {status} {status.includes('Approval') && level ? `(L${level})` : ''}
    </span>
  );
};

const renderRequestTypeBadge = (type: string) => {
  if (type === 'DATA_UPDATE') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25 shadow-sm">
        <UserIcon className="w-3.5 h-3.5 text-indigo-500" />
        Data Update
      </span>
    );
  }

  if (type === 'POINT_ADJUSTMENT') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25 shadow-sm">
        <Coins className="w-3.5 h-3.5 text-amber-500" />
        Point Adjustment
      </span>
    );
  }

  if (type === 'MERGE_POINTS') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/25 shadow-sm">
        <ArrowRightLeft className="w-3.5 h-3.5 text-teal-500" />
        Merge Points
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-surface-raised text-foreground-muted border border-border shadow-sm">
      <Ticket className="w-3.5 h-3.5 text-foreground-muted" />
      {type || 'General'}
    </span>
  );
};

export default function CrmTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedTicketData, setSelectedTicketData] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [executeLoading, setExecuteLoading] = useState(false);
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [stores, setStores] = useState<any[]>([]);
  const { user } = useAuth();
  const currentUserRole = user?.role_name || '';
  const currentUserPosition = user?.position || '';
  const currentUserNIP = user?.username || '';
  const normalizedRole = currentUserRole.toLowerCase();
  const normalizedPosition = currentUserPosition.toLowerCase();
  const normalizedDivision = (user?.division || '').toLowerCase();
  const canApproveManager = user?.is_admin === true || normalizedPosition.includes('manager') || normalizedRole.includes('manager') || (normalizedRole === 'operation' && normalizedDivision === 'area manager');
  const canApproveMarketing = normalizedPosition.includes('marketing') || normalizedPosition.includes('director') || normalizedPosition.includes('head') || normalizedPosition.includes('vice president') || normalizedPosition === 'vp' || normalizedRole.includes('marketing') || normalizedDivision.includes('marketing') || normalizedRole.includes('director') || user?.is_admin === true;
  const canExecute = user?.is_admin === true || normalizedPosition.includes('sysadmin') || normalizedPosition.includes('system administrator') || normalizedPosition.includes('it operational') || normalizedRole.includes('it operational');
  const selectedTicketIsCompleted = String(selectedTicketData?.ticket?.status || '').toLowerCase().includes('completed');

  useEffect(() => {
    if (user?.username) {
      setFormData(prev => ({
        ...prev,
        requester_name: user.full_name || user.username || 'Requester Name'
      }));
    }
  }, [user]);

  // New Ticket Form State - Source Member (Member Lama)
  const [searchTermInput, setSearchTermInput] = useState('');
  const [customerDetails, setCustomerDetails] = useState<any>(null);
  const [dataUpdateField, setDataUpdateField] = useState('mobile_no');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null);

  // Target Member State (for MERGE_POINTS)
  const [targetSearchTermInput, setTargetSearchTermInput] = useState('');
  const [targetLookupLoading, setTargetLookupLoading] = useState(false);
  const [targetLookupError, setTargetLookupError] = useState('');
  const [targetCustomerDetails, setTargetCustomerDetails] = useState<any>(null);
  const [pointsToTransfer, setPointsToTransfer] = useState<number | ''>('');
  const [billingLookupLoading, setBillingLookupLoading] = useState(false);
  const [billingLookupError, setBillingLookupError] = useState('');
  const [billingData, setBillingData] = useState<{
    billing: string;
    net_value: number;
    points: number;
    org_cd?: string;
    store_name?: string;
    member_transaction_found?: boolean;
    transmition_type?: string | null;
    processed_flag?: number | null;
    extra_info_1?: string | null;
    automatic_remark?: string | null;
    can_submit?: boolean;
  } | null>(null);
  const lastBillingLookupRef = useRef<string | null>(null);
  const billingLookupInFlightRef = useRef<string | null>(null);

  const [formData, setFormData] = useState({
    customer_id: '',
    customer_name: '',
    card_no: '',
    mobile_no: '',
    request_type: 'POINT_ADJUSTMENT',
    priority: 'NORMAL',
    unit_branch: 'HQ',
    requester_name: user?.full_name || user?.username || 'Requester Name',
    details: [{ field_name: 'points', old_value: '0', new_value: '0', reason: '', transaction_ref: '', attachment_url: '' }]
  });

  const getCurrentFieldValue = useCallback((field: string, custOverride?: any): string => {
    const cust = custOverride !== undefined ? custOverride : customerDetails;
    if (!cust) {
      if (field === 'mobile_no') return formData.mobile_no || '';
      if (field === 'customer_name') return formData.customer_name || '';
      if (field === 'card_no') return formData.card_no || formData.customer_id || '';
      return '';
    }
    switch (field) {
      case 'customer_name':
        return cust.customer_name || cust.RLICM_NAME || cust.name || formData.customer_name || '';
      case 'mobile_no':
        return cust.mobile_no || cust.RLICM_MOBILE_NO || formData.mobile_no || '';
      case 'card_no':
        return cust.card_no || cust.RLICM_CARD_NO || cust.member_id || formData.card_no || '';
      case 'email':
        return cust.email || cust.RLICM_EMAIL_ID || '';
      case 'address':
        return cust.address || cust.ADDRESS || '';
      case 'city':
        return cust.city || cust.CITY || '';
      case 'district':
        return cust.district || cust.DISTRICT || '';
      case 'dob':
        return cust.dob || cust.RLICM_DOB || '';
      case 'gender':
        return cust.gender || cust.GENDER || '';
      case 'tier_name':
        return cust.tier_name || cust.CARD_TIER_NAME || '';
      case 'points':
        return String(cust.current_points ?? cust.LATEST_POINT ?? 0);
      default:
        return cust[field] || '';
    }
  }, [customerDetails, formData.mobile_no, formData.customer_name, formData.card_no, formData.customer_id]);

  // Keep formData.details[0].old_value and field_name automatically in sync with selected customer & field
  useEffect(() => {
    if (formData.request_type === 'DATA_UPDATE') {
      const curVal = getCurrentFieldValue(dataUpdateField) || '-';
      setFormData(prev => {
        const curDetail = prev.details[0];
        if (curDetail && curDetail.field_name === dataUpdateField && curDetail.old_value === curVal) {
          return prev;
        }
        return {
          ...prev,
          details: [{
            field_name: dataUpdateField,
            old_value: curVal,
            new_value: curDetail ? curDetail.new_value : '',
            reason: curDetail ? curDetail.reason : '',
            transaction_ref: curDetail ? curDetail.transaction_ref : '',
            attachment_url: curDetail ? curDetail.attachment_url : ''
          }]
        };
      });
    } else if (formData.request_type === 'POINT_ADJUSTMENT') {
      const curPts = String(customerDetails?.current_points ?? 0);
      setFormData(prev => {
        const curDetail = prev.details[0];
        if (curDetail && curDetail.field_name === 'points' && curDetail.old_value === curPts) {
          return prev;
        }
        return {
          ...prev,
          details: [{
            field_name: 'points',
            old_value: curPts,
            new_value: curDetail ? curDetail.new_value : '0',
            reason: curDetail ? curDetail.reason : '',
            transaction_ref: curDetail ? curDetail.transaction_ref : '',
            attachment_url: curDetail ? curDetail.attachment_url : ''
          }]
        };
      });
    }
  }, [customerDetails, dataUpdateField, formData.request_type, getCurrentFieldValue]);

  const handleCustomerLookup = async (overrideTerm?: string) => {
    const term = overrideTerm || searchTermInput;
    if (!term) return;
    setLookupLoading(true);
    setLookupError('');
    try {
      const res = await fetch(`/api/crm/tickets/customer-lookup?term=${encodeURIComponent(term)}`);
      if (res.ok) {
        const data = await res.json();
        setCustomerDetails(data);
        
        const curReqType = formData.request_type;
        const curField = dataUpdateField;
        const initialOldVal = curReqType === 'DATA_UPDATE' 
          ? (getCurrentFieldValue(curField, data) || '-') 
          : String(data.current_points ?? 0);
        const initialFieldName = curReqType === 'DATA_UPDATE' ? curField : 'points';

        setFormData(prev => ({
          ...prev,
          customer_id: data.card_no || data.mobile_no,
          customer_name: data.customer_name || data.RLICM_NAME || '',
          card_no: data.card_no || data.RLICM_CARD_NO || '',
          mobile_no: data.mobile_no || data.RLICM_MOBILE_NO || '',
          details: [{
            ...prev.details[0],
            field_name: initialFieldName,
            old_value: initialOldVal,
            new_value: prev.details[0]?.new_value || ''
          }]
        }));
      } else {
        const errData = await res.json();
        setLookupError(errData.error || 'Customer not found');
        setCustomerDetails(null);
      }
    } catch (err) {
      setLookupError('Failed to lookup customer');
      setCustomerDetails(null);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleTargetCustomerLookup = async () => {
    if (!targetSearchTermInput) return;
    setTargetLookupLoading(true);
    setTargetLookupError('');
    try {
      const res = await fetch(`/api/crm/tickets/customer-lookup?term=${encodeURIComponent(targetSearchTermInput)}`);
      if (res.ok) {
        const data = await res.json();
        if (customerDetails && (data.card_no === customerDetails.card_no || data.mobile_no === customerDetails.mobile_no)) {
          setTargetLookupError('Member Baru tidak boleh sama dengan Member Lama!');
          setTargetCustomerDetails(null);
          return;
        }
        setTargetCustomerDetails(data);
      } else {
        const errData = await res.json().catch(() => ({}));
        setTargetLookupError(errData.error || 'Member Baru tidak ditemukan');
        setTargetCustomerDetails(null);
      }
    } catch (err) {
      setTargetLookupError('Gagal mencari Member Baru');
      setTargetCustomerDetails(null);
    } finally {
      setTargetLookupLoading(false);
    }
  };

  const handleBillingLookup = async (billingOverride?: string) => {
    const billing = (billingOverride ?? formData.details[0]?.transaction_ref ?? '').trim();
    if (!billing || formData.request_type !== 'POINT_ADJUSTMENT') return;
    if (billingLookupInFlightRef.current === billing || lastBillingLookupRef.current === billing) return;

    billingLookupInFlightRef.current = billing;
    setBillingLookupLoading(true);
    setBillingLookupError('');
    try {
      const res = await fetch(`/api/crm/tickets/billing-lookup?billing=${encodeURIComponent(billing)}`);
      const data = await res.json().catch(() => ({}));
      lastBillingLookupRef.current = billing;
      if (!res.ok) {
        setBillingData(null);
        setBillingLookupError(data.error || 'Billing tidak ditemukan');
        if (data.code === 'BILL_ALREADY_SYNC') {
          alert(data.error || 'Bill sudah sync dan tidak dapat diajukan kembali sebagai ticket.');
          setFormData(prev => {
            if (prev.request_type !== 'POINT_ADJUSTMENT' || prev.details[0]?.transaction_ref !== billing) return prev;
            const nd = [...prev.details];
            nd[0] = { ...nd[0], new_value: '0' };
            return { ...prev, details: nd };
          });
        }
        return;
      }

      setBillingData(data);
      setFormData(prev => {
        if (prev.request_type !== 'POINT_ADJUSTMENT' || prev.details[0]?.transaction_ref !== billing) return prev;
        const nd = [...prev.details];
        nd[0] = {
          ...nd[0],
          new_value: String(data.points),
          reason: data.automatic_remark || nd[0].reason
        };
        return { ...prev, unit_branch: data.store_name || data.org_cd || prev.unit_branch, details: nd };
      });
    } catch (err) {
      lastBillingLookupRef.current = null;
      setBillingData(null);
      setBillingLookupError('Gagal mengambil net value billing');
    } finally {
      if (billingLookupInFlightRef.current === billing) billingLookupInFlightRef.current = null;
      setBillingLookupLoading(false);
    }
  };

  const handleRequestTypeChange = (newType: string) => {
    if (newType === 'DATA_UPDATE') {
      const oldVal = getCurrentFieldValue(dataUpdateField) || '-';
      setFormData(prev => ({
        ...prev,
        request_type: newType,
        details: [{
          ...prev.details[0],
          field_name: dataUpdateField,
          old_value: oldVal,
          new_value: '',
          transaction_ref: ''
        }]
      }));
    } else if (newType === 'MERGE_POINTS') {
      const curPts = customerDetails?.current_points ?? 0;
      setPointsToTransfer(curPts);
      setFormData(prev => ({
        ...prev,
        request_type: newType,
        details: [{
          ...prev.details[0],
          field_name: 'points',
          old_value: String(curPts),
          new_value: String(curPts),
          transaction_ref: targetCustomerDetails?.card_no || ''
        }]
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        request_type: newType,
        details: [{
          ...prev.details[0],
          field_name: 'points',
          old_value: String(customerDetails?.current_points ?? 0),
          new_value: '0',
          transaction_ref: ''
        }]
      }));
    }
  };

  const handleDataUpdateFieldChange = (field: string) => {
    setDataUpdateField(field);
    const oldVal = getCurrentFieldValue(field) || '-';
    setFormData(prev => ({
      ...prev,
      details: [{
        ...prev.details[0],
        field_name: field,
        old_value: oldVal,
        new_value: ''
      }]
    }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadLoading(true);
    const form = new FormData();
    form.append('attachment', file);

    try {
      const res = await fetch('/api/crm/tickets/upload', {
        method: 'POST',
        body: form
      });
      if (res.ok) {
        const data = await res.json();
        const nd = [...formData.details];
        nd[0].attachment_url = data.url;
        setFormData({ ...formData, details: nd });
      } else {
        alert('Upload failed.');
      }
    } catch (err) {
      console.error(err);
      alert('Upload failed.');
    } finally {
      setUploadLoading(false);
    }
  };

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const [ticketsRes, statsRes, storesRes] = await Promise.all([
        fetch("/api/crm/tickets"),
        fetch("/api/crm/tickets-dashboard"),
        fetch("/api/crm/reports/stores")
      ]);
      
      if (ticketsRes.ok) {
        const data = await ticketsRes.json();
        setTickets(data);
      }
      
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setDashboardStats(statsData);
      }

      if (storesRes.ok) {
        const storesData = await storesRes.json();
        setStores(storesData);
      }
    } catch (err) {
      console.error("Failed to load tickets or stats", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customer_id) return;
    try {
      let url = '/api/crm/tickets';
      
      const finalDetails = [...formData.details];
      if (formData.request_type === 'DATA_UPDATE') {
        const curOld = getCurrentFieldValue(dataUpdateField) || '-';
        finalDetails[0] = {
          ...finalDetails[0],
          field_name: dataUpdateField,
          old_value: curOld
        };
      } else if (formData.request_type === 'POINT_ADJUSTMENT') {
        finalDetails[0] = {
          ...finalDetails[0],
          field_name: 'points',
          old_value: String(customerDetails?.current_points ?? 0)
        };
      } else if (formData.request_type === 'MERGE_POINTS') {
        if (!targetCustomerDetails) {
          alert('Silakan cari dan pilih Member Baru (Tujuan) terlebih dahulu.');
          return;
        }
        if (targetCustomerDetails.card_no === customerDetails?.card_no) {
          alert('Member Baru tidak boleh sama dengan Member Lama.');
          return;
        }
        const transferPts = Number(pointsToTransfer) || 0;
        if (transferPts <= 0) {
          alert('Poin yang dipindahkan harus lebih besar dari 0.');
          return;
        }
        finalDetails[0] = {
          ...finalDetails[0],
          field_name: 'points',
          old_value: String(customerDetails?.current_points ?? 0),
          new_value: String(transferPts),
          transaction_ref: targetCustomerDetails.card_no || targetCustomerDetails.mobile_no,
          reason: `${formData.details[0].reason || 'Merge Points'} | Tujuan: ${targetCustomerDetails.customer_name} (${targetCustomerDetails.card_no})`
        };
      }

      let bodyData = { 
        requester_id: currentUserNIP || 'REQ-001', 
        ...formData,
        details: finalDetails
      };

      if (editingTicketId) {
        url = `/api/crm/tickets/${editingTicketId}/resubmit`;
        (bodyData as any).notes = 'Resubmitted with updated data';
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      });
      if (res.ok) {
        setIsCreateModalOpen(false);
        setEditingTicketId(null);
        fetchTickets();
      } else {
        const errorData = await res.json().catch(() => ({}));
        if (errorData.code === 'DATA_VALUE_ALREADY_USED' && Array.isArray(errorData.conflicts)) {
          const conflictText = errorData.conflicts.map((customer: any, index: number) =>
            `${index + 1}. Nama: ${customer.customer_name}\n   Card No: ${customer.card_no}\n   Mobile No: ${customer.mobile_no}`
          ).join('\n\n');
          alert(`${errorData.error}\n\nCustomer yang sudah menggunakan data tersebut:\n${conflictText}`);
          return;
        }
        alert(errorData.error || 'Failed to submit ticket');
      }
    } catch (err) {
      console.error(err);
      alert('Error saving ticket');
    }
  };

  const filteredTickets = useMemo(() => {
    let result = tickets;
    if (statusFilter) {
      result = result.filter(t => t.status.toLowerCase().includes(statusFilter.toLowerCase()));
    }
    if (typeFilter) {
      result = result.filter(t => t.request_type.toLowerCase() === typeFilter.toLowerCase());
    }
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      result = result.filter(t => 
        t.ticket_id.toLowerCase().includes(s) || 
        t.customer_id?.toLowerCase().includes(s) || 
        t.customer_name?.toLowerCase().includes(s) ||
        t.mobile_no?.toLowerCase().includes(s) ||
        t.requester_name?.toLowerCase().includes(s)
      );
    }
    return result;
  }, [tickets, searchTerm, statusFilter, typeFilter]);

  const openTicketDetail = async (id: string) => {
    setSelectedTicketId(id);
    setDetailLoading(true);
    setSelectedTicketData(null);
    try {
      const res = await fetch(`/api/crm/tickets/${id}`, {
        headers: {
          'x-user-id': user?.id || user?.username || ''
        }
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedTicketData(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Ticket className="w-6 h-6 text-primary" />
            </div>
            CRM Ticket Approvals
          </h1>
          <p className="text-sm text-foreground-muted mt-1 ml-11">
            Manage point adjustments and customer data updates.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-surface border border-border rounded-lg px-3 py-1 flex items-center gap-2">
            <UserIcon className="w-4 h-4 text-foreground-muted" />
            <span className="text-xs font-bold">{currentUserPosition || currentUserRole || 'User'}</span>
            <span className="text-border mx-1">|</span>
            <span className="text-xs font-mono text-foreground-muted">{currentUserNIP || '-'}</span>
          </div>
          <button
            onClick={() => {
              setEditingTicketId(null);
              setCustomerDetails(null);
              setDataUpdateField('mobile_no');
              setTargetSearchTermInput('');
              setTargetCustomerDetails(null);
              setTargetLookupError('');
              setPointsToTransfer('');
              setFormData({
                customer_id: '', customer_name: '', card_no: '', mobile_no: '', request_type: 'POINT_ADJUSTMENT',
                priority: 'NORMAL', unit_branch: 'HQ', requester_name: user?.full_name || user?.username || 'Requester Name',
                details: [{ field_name: 'points', old_value: '0', new_value: '0', reason: '', transaction_ref: '', attachment_url: '' }]
              });
              setSearchTermInput('');
              setIsCreateModalOpen(true);
            }}
            className="flex items-center gap-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 px-4 py-2 rounded-lg transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Create Ticket
          </button>
        </div>
      </div>

      {/* Dashboard Stats */}
      {dashboardStats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between shadow-sm">
            <span className="text-xs text-foreground-muted font-bold uppercase tracking-wider">Total Tickets</span>
            <div className="mt-2 text-2xl font-bold">{dashboardStats.total}</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between shadow-sm border-l-4 border-l-warning">
            <span className="text-xs text-foreground-muted font-bold uppercase tracking-wider">Pending Action</span>
            <div className="mt-2 text-2xl font-bold text-warning">{dashboardStats.pending_action}</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between shadow-sm border-l-4 border-l-blue-500">
            <span className="text-xs text-foreground-muted font-bold uppercase tracking-wider">Approved</span>
            <div className="mt-2 text-2xl font-bold text-blue-500">
              {dashboardStats.by_status?.find((s: any) => s.status === 'Approved')?.count || 0}
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between shadow-sm border-l-4 border-l-emerald-500">
            <span className="text-xs text-foreground-muted font-bold uppercase tracking-wider">Completed</span>
            <div className="mt-2 text-2xl font-bold text-emerald-500">
              {dashboardStats.by_status?.find((s: any) => s.status.includes('Completed'))?.count || 0}
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between shadow-sm border-l-4 border-l-danger">
            <span className="text-xs text-foreground-muted font-bold uppercase tracking-wider">Rejected</span>
            <div className="mt-2 text-2xl font-bold text-danger">
              {dashboardStats.by_status?.find((s: any) => s.status.includes('Rejected'))?.count || 0}
            </div>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-5 border-b border-border gap-4">
          <div className="flex flex-wrap gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64 max-w-xs w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
              <input 
                type="text"
                placeholder="Search by ID, Customer, Mobile..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-xs bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
            <select
              className="bg-surface border border-border text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-primary transition-all font-medium"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">All Types (Semua Tipe)</option>
              <option value="POINT_ADJUSTMENT">Point Adjustment</option>
              <option value="DATA_UPDATE">Data Update</option>
              <option value="MERGE_POINTS">Merge Points</option>
            </select>
            <select
              className="bg-surface border border-border text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-primary transition-all"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="need information">Need Information</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
             <div className="p-10 text-center text-foreground-muted">Loading...</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface/50">
                  <th className="text-left px-6 py-4 text-[10px] font-bold text-foreground-muted uppercase tracking-widest">Ticket ID</th>
                  <th className="text-left px-6 py-4 text-[10px] font-bold text-foreground-muted uppercase tracking-widest">Type</th>
                  <th className="text-left px-6 py-4 text-[10px] font-bold text-foreground-muted uppercase tracking-widest">Customer ID</th>
                  <th className="text-left px-6 py-4 text-[10px] font-bold text-foreground-muted uppercase tracking-widest">Name</th>
                  <th className="text-left px-6 py-4 text-[10px] font-bold text-foreground-muted uppercase tracking-widest">Mobile</th>
                  <th className="text-left px-6 py-4 text-[10px] font-bold text-foreground-muted uppercase tracking-widest">Status</th>
                  <th className="text-left px-6 py-4 text-[10px] font-bold text-foreground-muted uppercase tracking-widest">Reason</th>
                  <th className="text-left px-6 py-4 text-[10px] font-bold text-foreground-muted uppercase tracking-widest">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredTickets.map(t => (
                  <tr key={t.ticket_id} className="hover:bg-primary/[0.02] transition-colors cursor-pointer" onClick={() => openTicketDetail(t.ticket_id)}>
                    <td className="px-6 py-4 font-mono text-xs font-bold">{t.ticket_id}</td>
                    <td className="px-6 py-4">
                      {renderRequestTypeBadge(t.request_type)}
                    </td>
                    <td className="px-6 py-4 text-xs font-medium">{t.customer_id}</td>
                    <td className="px-6 py-4 text-xs">{t.customer_name || '-'}</td>
                    <td className="px-6 py-4 text-xs font-mono">{t.mobile_no || '-'}</td>
                    <td className="px-6 py-4">
                      {renderStatusBadge(t.status, t.current_approval_level)}
                    </td>
                    <td className="px-6 py-4 text-xs font-medium max-w-[150px] truncate" title={t.reason || '-'}>
                      {t.reason || '-'}
                    </td>
                    <td className="px-6 py-4 text-xs text-foreground-muted">
                      {new Date(t.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {filteredTickets.length === 0 && (
                  <tr><td colSpan={8} className="text-center p-10 text-foreground-muted">No tickets found</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsCreateModalOpen(false)} />
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-surface border border-border rounded-2xl shadow-2xl p-6">
            <h3 className="font-bold text-lg mb-4">{editingTicketId ? `Resubmit Ticket ${editingTicketId}` : 'Create New Ticket'}</h3>
            
            {/* Search Customer */}
            <div className="mb-4 p-4 bg-surface-raised rounded-xl border border-border">
              <label className="block text-xs font-bold mb-1">Search Customer (Card No / Mobile No)</label>
              <div className="flex gap-2">
                <input type="text" className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  placeholder="Enter Card No or Mobile No..."
                  value={searchTermInput} onChange={e => setSearchTermInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleCustomerLookup())}
                />
                <button type="button" onClick={() => handleCustomerLookup()} disabled={lookupLoading} className="px-4 py-2 bg-primary text-white text-sm font-bold rounded-lg shadow-sm hover:opacity-90 disabled:opacity-50">
                  {lookupLoading ? 'Searching...' : 'Search'}
                </button>
              </div>
              {lookupError && <p className="text-xs text-danger mt-2">{lookupError}</p>}
            </div>

            {/* Customer Details Summary Card */}
            {customerDetails && (
              <div className="mb-5 p-4 bg-primary/[0.04] border border-primary/20 rounded-xl space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">
                      <UserIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground">{customerDetails.customer_name || 'Unnamed Member'}</span>
                        {customerDetails.tier_name && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/20 text-primary border border-primary/30">
                            {customerDetails.tier_name}
                          </span>
                        )}
                        {customerDetails.member_status && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                            {customerDetails.member_status === '1' ? 'Active' : customerDetails.member_status}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-foreground-muted font-mono">{customerDetails.card_no}</span>
                    </div>
                  </div>
                  <div className="text-right bg-surface px-3 py-1.5 rounded-lg border border-border/60">
                    <span className="text-[10px] text-foreground-muted block uppercase font-bold tracking-wider">Current Points</span>
                    <span className="font-mono font-bold text-sm text-primary flex items-center justify-end gap-1">
                      <Coins className="w-3.5 h-3.5" />
                      {customerDetails.current_points ?? 0} pts
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-border/50 text-xs">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-foreground-muted flex items-center gap-1 font-semibold">
                      <Phone className="w-3 h-3 text-foreground-muted" /> Mobile No
                    </span>
                    <span className="font-mono font-medium text-foreground block truncate">{customerDetails.mobile_no || '-'}</span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-foreground-muted flex items-center gap-1 font-semibold">
                      <Mail className="w-3 h-3 text-foreground-muted" /> Email
                    </span>
                    <span className="font-medium text-foreground block truncate" title={customerDetails.email || '-'}>
                      {customerDetails.email || '-'}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-foreground-muted flex items-center gap-1 font-semibold">
                      <MapPin className="w-3 h-3 text-foreground-muted" /> City / Address
                    </span>
                    <span className="font-medium text-foreground block truncate" title={[customerDetails.address, customerDetails.city].filter(Boolean).join(', ') || '-'}>
                      {[customerDetails.city, customerDetails.district].filter(Boolean).join(', ') || customerDetails.address || '-'}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-foreground-muted flex items-center gap-1 font-semibold">
                      <Calendar className="w-3 h-3 text-foreground-muted" /> DOB / Gender
                    </span>
                    <span className="font-medium text-foreground block truncate">
                      {[customerDetails.dob, customerDetails.gender].filter(Boolean).join(' • ') || '-'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1">Customer Name</label>
                  <input readOnly type="text" className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm opacity-70" value={formData.customer_name} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Customer ID (Card/Mobile)</label>
                  <input readOnly type="text" className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm opacity-70" value={formData.customer_id} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Requester (User Create)</label>
                  <input required type="text" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" 
                    value={formData.requester_name} onChange={e => setFormData({...formData, requester_name: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Store Code (Branch)</label>
                  <select required className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" 
                    value={formData.unit_branch} onChange={e => setFormData({...formData, unit_branch: e.target.value})}>
                    <option value="">-- Select Store --</option>
                    <option value="HQ">HQ</option>
                    {stores.map((st: any) => (
                      <option key={st.org_cd} value={st.org_name}>{st.org_cd} - {st.org_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <label className="block text-xs font-bold mb-1">Request Type</label>
                <select className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary font-medium"
                  value={formData.request_type} onChange={e => handleRequestTypeChange(e.target.value)}>
                  <option value="POINT_ADJUSTMENT">Point Adjustment (Penyesuaian Point)</option>
                  <option value="DATA_UPDATE">Data Update (Perubahan Data Customer)</option>
                  <option value="MERGE_POINTS">Merge Points (Penggabungan & Pindah Poin)</option>
                </select>
              </div>

              {/* Point Adjustment Section */}
              {formData.request_type === 'POINT_ADJUSTMENT' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-warning/5 rounded-xl border border-warning/20">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-bold text-warning">Points to Adjust</label>
                      {customerDetails?.current_points !== undefined && (
                        <span className="text-[10px] text-foreground-muted">Saldo Saat Ini: <b className="text-foreground">{customerDetails.current_points} pts</b></span>
                      )}
                    </div>
                    <input required type="number" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                      placeholder="Otomatis dari net value billing"
                      readOnly
                      value={formData.details[0].new_value} onChange={e => {
                        const nd = [...formData.details]; nd[0].new_value = e.target.value; setFormData({...formData, details: nd});
                      }} />
                    <p className="text-[10px] text-foreground-muted mt-1">Rumus: FLOOR(net value / 50.000), tanpa desimal.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1 text-warning">No Billing (Transaction Ref)</label>
                    <input required type="text" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                      placeholder="e.g. 001-20261010-0012"
                      value={formData.details[0].transaction_ref} onChange={e => {
                        const nd = [...formData.details];
                        nd[0] = { ...nd[0], transaction_ref: e.target.value, new_value: '0' };
                        lastBillingLookupRef.current = null;
                        setBillingData(null);
                        setBillingLookupError('');
                        setFormData({...formData, unit_branch: '', details: nd});
                      }} onBlur={() => handleBillingLookup()} onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); handleBillingLookup(); }
                      }} />
                    {billingLookupLoading && <p className="text-[10px] text-primary mt-1">Mencari billing...</p>}
                    {billingLookupError && <p className="text-[10px] text-danger mt-1">{billingLookupError}</p>}
                    {billingData && !billingData.member_transaction_found && (
                      <p className="text-[10px] text-warning mt-1">Data bill belum tercatat sebagai transaksi member. Remark otomatis sudah diisi.</p>
                    )}
                    {billingData?.member_transaction_found && billingData.processed_flag === 0 && !billingData.extra_info_1 && (
                      <p className="text-[10px] text-warning mt-1">Data member ditemukan tetapi belum sync. Remark otomatis sudah diisi.</p>
                    )}
                  </div>
                  <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg bg-surface border border-warning/20">
                      <span className="block text-[10px] uppercase font-bold text-foreground-muted">Net Value</span>
                      <span className="text-sm font-bold text-foreground">
                        {billingData ? `Rp ${billingData.net_value.toLocaleString('id-ID')}` : '-'}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-surface border border-warning/20">
                      <span className="block text-[10px] uppercase font-bold text-foreground-muted">Point Dihitung</span>
                      <span className="text-sm font-bold text-warning">{billingData ? `${billingData.points} pts` : '-'}</span>
                    </div>
                    <div className="p-3 rounded-lg bg-surface border border-warning/20">
                      <span className="block text-[10px] uppercase font-bold text-foreground-muted">Store</span>
                      <span className="text-sm font-bold text-foreground">
                        {billingData?.store_name || billingData?.org_cd || '-'}
                      </span>
                      {billingData?.store_name && billingData?.org_cd && (
                        <span className="block text-[10px] text-foreground-muted">{billingData.org_cd}</span>
                      )}
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold mb-1 text-warning">Attachment (Photo Billing)</label>
                    {formData.details[0].attachment_url ? (
                      <div className="flex items-center gap-2">
                        <a href={formData.details[0].attachment_url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-sm font-bold truncate max-w-xs">
                          {formData.details[0].attachment_url.split('/').pop()}
                        </a>
                        <button type="button" onClick={() => {
                          const nd = [...formData.details]; nd[0].attachment_url = ''; setFormData({...formData, details: nd});
                        }} className="text-danger text-xs font-bold">Remove</button>
                      </div>
                    ) : (
                      <input required type="file" accept="image/*,.pdf" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                        onChange={handleFileUpload} disabled={uploadLoading} />
                    )}
                    {uploadLoading && <p className="text-xs text-primary mt-1">Uploading...</p>}
                  </div>
                </div>
              )}

              {/* Data Update Section */}
              {formData.request_type === 'DATA_UPDATE' && (
                <div className="p-4 bg-primary/5 rounded-xl border border-primary/20 space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-primary/10">
                    <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                      <UserIcon className="w-4 h-4" /> Form Perubahan Data Customer
                    </span>
                    <span className="text-[10px] text-foreground-muted">Pilih field yang akan diperbarui</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold mb-1 text-primary">Field to Update (Data Diubah)</label>
                      <select 
                        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary font-medium"
                        value={dataUpdateField}
                        onChange={e => handleDataUpdateFieldChange(e.target.value)}
                      >
                        <option value="mobile_no">Nomor HP (Mobile No) {customerDetails?.mobile_no ? `• ${customerDetails.mobile_no}` : ''}</option>
                        <option value="customer_name">Nama Lengkap (Customer Name) {customerDetails?.customer_name ? `• ${customerDetails.customer_name}` : ''}</option>
                        <option value="email">Email Address {customerDetails?.email ? `• ${customerDetails.email}` : ''}</option>
                        <option value="address">Alamat (Address) {customerDetails?.address ? `• ${customerDetails.address}` : ''}</option>
                        <option value="city">Kota (City) {customerDetails?.city ? `• ${customerDetails.city}` : ''}</option>
                        <option value="district">Kecamatan (District) {customerDetails?.district ? `• ${customerDetails.district}` : ''}</option>
                        <option value="dob">Tanggal Lahir (Date of Birth) {customerDetails?.dob ? `• ${customerDetails.dob}` : ''}</option>
                        <option value="gender">Jenis Kelamin (Gender) {customerDetails?.gender ? `• ${customerDetails.gender}` : ''}</option>
                      </select>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-foreground-muted">Current Value (Nilai Saat Ini)</label>
                        {getCurrentFieldValue(dataUpdateField) ? (
                          <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded">Tersedia di DB</span>
                        ) : (
                          <span className="text-[10px] text-amber-500 font-semibold bg-amber-500/10 px-1.5 py-0.5 rounded">Belum ada / Kosong</span>
                        )}
                      </div>
                      <input 
                        readOnly 
                        type="text" 
                        className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm font-semibold text-foreground cursor-not-allowed select-all"
                        value={getCurrentFieldValue(dataUpdateField) || formData.details[0]?.old_value || '(Data belum terisi di sistem)'} 
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold mb-1 text-primary">New Value (Nilai Baru)</label>
                      <input 
                        required 
                        type="text" 
                        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary font-bold text-primary"
                        placeholder={`Masukkan ${dataUpdateField === 'mobile_no' ? 'Nomor HP Baru' : dataUpdateField === 'customer_name' ? 'Nama Baru' : dataUpdateField === 'email' ? 'Email Baru' : 'Nilai Baru'}...`}
                        value={formData.details[0]?.new_value || ''} 
                        onChange={e => {
                          const val = e.target.value;
                          setFormData(prev => {
                            const nd = [...prev.details]; 
                            nd[0] = { 
                              ...nd[0], 
                              new_value: val, 
                              field_name: dataUpdateField, 
                              old_value: getCurrentFieldValue(dataUpdateField) || '-' 
                            };
                            return { ...prev, details: nd };
                          });
                        }} 
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold mb-1 text-primary">Supporting Document / KTP (Bukti Pendukung)</label>
                    {formData.details[0].attachment_url ? (
                      <div className="flex items-center gap-2">
                        <a href={formData.details[0].attachment_url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-sm font-bold truncate max-w-xs">
                          {formData.details[0].attachment_url.split('/').pop()}
                        </a>
                        <button type="button" onClick={() => {
                          const nd = [...formData.details]; nd[0].attachment_url = ''; setFormData({...formData, details: nd});
                        }} className="text-danger text-xs font-bold">Remove</button>
                      </div>
                    ) : (
                      <input type="file" accept="image/*,.pdf" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                        onChange={handleFileUpload} disabled={uploadLoading} />
                    )}
                    {uploadLoading && <p className="text-xs text-primary mt-1">Uploading...</p>}
                    <span className="text-[10px] text-foreground-muted block mt-1">Lampirkan foto KTP atau kartu identitas member sebagai bukti verifikasi.</span>
                  </div>
                </div>
              )}

              {/* Merge Points Section */}
              {formData.request_type === 'MERGE_POINTS' && (
                <div className="p-4 bg-teal-500/5 rounded-xl border border-teal-500/25 space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-teal-500/20">
                    <span className="text-xs font-bold text-teal-600 dark:text-teal-400 flex items-center gap-1.5">
                      <ArrowRightLeft className="w-4 h-4" /> Penggabungan & Pemindahan Poin (Merge Points)
                    </span>
                    <span className="text-[10px] text-foreground-muted">Poin ditransfer & kartu lama dinonaktifkan</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Source Member Card (Member Lama) */}
                    <div className="p-3 bg-surface rounded-xl border border-border space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-danger flex items-center gap-1">
                          <UserIcon className="w-3.5 h-3.5 text-danger" /> Member Lama (Sumber)
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-danger/10 text-danger border border-danger/20">
                          Akan Dinonaktifkan
                        </span>
                      </div>
                      <div className="text-xs">
                        <p className="font-bold text-sm text-foreground">{customerDetails?.customer_name || 'Belum dipilih'}</p>
                        <p className="font-mono text-foreground-muted text-[11px]">{customerDetails?.card_no || '-'}</p>
                        <div className="mt-2 flex items-center justify-between pt-2 border-t border-border/60">
                          <span className="text-foreground-muted text-[11px]">Saldo Poin Saat Ini:</span>
                          <span className="font-mono font-bold text-sm text-foreground flex items-center gap-1">
                            <Coins className="w-3.5 h-3.5 text-warning" />
                            {customerDetails?.current_points ?? 0} pts
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-2 text-[11px]">
                          <div><span className="text-foreground-muted block">Total Expense H2H</span><b>Rp {new Intl.NumberFormat('id-ID').format(customerDetails?.total_expense ?? 0)}</b></div>
                          <div><span className="text-foreground-muted block">Lucky Draw H2H</span><b className="text-warning">{customerDetails?.lucky_draw_points ?? 0} pts</b></div>
                        </div>
                      </div>
                    </div>

                    {/* Target Member Card (Member Baru) */}
                    <div className="p-3 bg-surface rounded-xl border border-border space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400 flex items-center gap-1">
                          <UserIcon className="w-3.5 h-3.5 text-teal-600" /> Member Baru (Tujuan)
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 border border-teal-500/20">
                          Penerima Poin
                        </span>
                      </div>

                      {/* Search Target Member */}
                      <div className="space-y-1.5">
                        <div className="flex gap-1.5">
                          <input 
                            type="text" 
                            className="flex-1 bg-surface-raised border border-border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-teal-500"
                            placeholder="Cari Card/HP Member Baru..."
                            value={targetSearchTermInput}
                            onChange={e => setTargetSearchTermInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleTargetCustomerLookup())}
                          />
                          <button 
                            type="button" 
                            onClick={handleTargetCustomerLookup} 
                            disabled={targetLookupLoading}
                            className="px-3 py-1.5 bg-teal-600 text-white text-xs font-bold rounded-lg shadow-sm hover:opacity-90 disabled:opacity-50"
                          >
                            {targetLookupLoading ? '...' : 'Cari'}
                          </button>
                        </div>
                        {targetLookupError && <p className="text-[10px] text-danger font-medium">{targetLookupError}</p>}
                      </div>

                      {targetCustomerDetails && (
                        <div className="text-xs pt-1 border-t border-border/60">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-bold text-foreground text-sm">{targetCustomerDetails.customer_name}</p>
                              <p className="font-mono text-foreground-muted text-[11px]">{targetCustomerDetails.card_no}</p>
                            </div>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-500/10 text-teal-600">
                              {targetCustomerDetails.tier_name || 'Member'}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-between pt-1 border-t border-border/40">
                            <span className="text-foreground-muted text-[11px]">Saldo Poin Sekarang:</span>
                            <span className="font-mono font-bold text-sm text-teal-600 flex items-center gap-1">
                              <Coins className="w-3.5 h-3.5" />
                              {targetCustomerDetails.current_points ?? 0} pts
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 pt-2 text-[11px]">
                            <div><span className="text-foreground-muted block">Total Expense H2H</span><b>Rp {new Intl.NumberFormat('id-ID').format(targetCustomerDetails.total_expense ?? 0)}</b></div>
                            <div><span className="text-foreground-muted block">Lucky Draw H2H</span><b className="text-warning">{targetCustomerDetails.lucky_draw_points ?? 0} pts</b></div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Transfer Simulation & Points Input */}
                  <div className="p-3 bg-surface rounded-xl border border-border space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Coins className="w-4 h-4 text-warning" /> Poin yang Dipindahkan (Points to Transfer)
                      </label>
                      <button 
                        type="button" 
                        onClick={() => {
                          const pts = customerDetails?.current_points ?? 0;
                          setPointsToTransfer(pts);
                          const nd = [...formData.details];
                          nd[0].new_value = String(pts);
                          setFormData({ ...formData, details: nd });
                        }}
                        className="text-[11px] font-bold text-teal-600 hover:underline"
                      >
                        Pindahkan Semua ({customerDetails?.current_points ?? 0} pts)
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                      <div className="sm:col-span-1">
                        <input 
                          required 
                          type="number" 
                          min="1"
                          max={customerDetails?.current_points ?? 999999}
                          className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm font-bold text-foreground focus:outline-none focus:border-teal-500 font-mono"
                          placeholder="Jumlah poin..."
                          value={pointsToTransfer}
                          onChange={e => {
                            const val = e.target.value === '' ? '' : Number(e.target.value);
                            setPointsToTransfer(val);
                            const nd = [...formData.details];
                            nd[0].new_value = String(val);
                            setFormData({ ...formData, details: nd });
                          }}
                        />
                      </div>

                      {/* Live Calculation preview */}
                      <div className="sm:col-span-2 p-2.5 bg-surface-raised rounded-lg border border-border text-xs flex items-center justify-around">
                        <div className="text-center">
                          <span className="text-[10px] text-foreground-muted block">Sisa Member Lama</span>
                          <span className="font-mono font-bold text-danger">
                            {Math.max(0, (customerDetails?.current_points ?? 0) - (Number(pointsToTransfer) || 0))} pts
                          </span>
                        </div>
                        <ArrowRightLeft className="w-4 h-4 text-teal-500" />
                        <div className="text-center">
                          <span className="text-[10px] text-foreground-muted block">Total Baru Member Baru</span>
                          <span className="font-mono font-bold text-teal-600">
                            {targetCustomerDetails 
                              ? (Number(targetCustomerDetails.current_points ?? 0) + (Number(pointsToTransfer) || 0)) + ' pts'
                              : '(Cari Member Baru)'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="p-2.5 bg-amber-500/10 border border-amber-500/25 rounded-lg text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        <b>Perhatian:</b> Setelah tiket disetujui (Approved) dan dieksekusi oleh Ops Admin, saldo poin akan dipindahkan ke Member Baru dan kartu Member Lama akan <b>dinonaktifkan (Status: Inactive / 0)</b>.
                      </span>
                    </div>
                  </div>

                  {/* Attachment for Merge Points */}
                  <div>
                    <label className="block text-xs font-bold mb-1 text-teal-600 dark:text-teal-400">Bukti Permohonan / Form Merger / KTP</label>
                    {formData.details[0].attachment_url ? (
                      <div className="flex items-center gap-2">
                        <a href={formData.details[0].attachment_url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-sm font-bold truncate max-w-xs">
                          {formData.details[0].attachment_url.split('/').pop()}
                        </a>
                        <button type="button" onClick={() => {
                          const nd = [...formData.details]; nd[0].attachment_url = ''; setFormData({...formData, details: nd});
                        }} className="text-danger text-xs font-bold">Remove</button>
                      </div>
                    ) : (
                      <input type="file" accept="image/*,.pdf" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-500"
                        onChange={handleFileUpload} disabled={uploadLoading} />
                    )}
                    {uploadLoading && <p className="text-xs text-primary mt-1">Uploading...</p>}
                    <span className="text-[10px] text-foreground-muted block mt-1">Lampirkan formulir penggabungan poin atau foto kartu identitas member sebagai bukti verifikasi.</span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold mb-1">Reason</label>
                <textarea required className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary min-h-[80px]"
                  value={formData.details[0].reason} onChange={e => {
                    const nd = [...formData.details]; nd[0].reason = e.target.value; setFormData({...formData, details: nd});
                  }} />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-border mt-4">
                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 text-sm font-bold text-foreground-muted hover:text-foreground">Cancel</button>
                <button
                  type="submit"
                  disabled={
                    !formData.customer_id ||
                    (formData.request_type === 'POINT_ADJUSTMENT' && (!billingData || billingData.can_submit === false))
                  }
                  className="px-6 py-2 text-sm font-bold bg-primary text-white rounded-lg shadow-sm hover:bg-primary/90 disabled:opacity-50"
                >
                  Submit Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedTicketId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedTicketId(null)} />
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-surface border border-border rounded-2xl shadow-2xl p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-bold text-xl flex items-center gap-2">
                  <Ticket className="w-5 h-5 text-primary" />
                  Ticket {selectedTicketId}
                </h3>
                {selectedTicketData?.ticket && (
                  <div className="text-xs text-foreground-muted mt-1 flex items-center gap-2">
                    <span>{new Date(selectedTicketData.ticket.created_at).toLocaleString()}</span>
                    <span>•</span>
                    {renderStatusBadge(selectedTicketData.ticket.status, selectedTicketData.ticket.current_approval_level)}
                  </div>
                )}
              </div>
              <button onClick={() => setSelectedTicketId(null)} className="p-2 rounded-full hover:bg-surface-raised text-foreground-muted transition-colors"><XCircle className="w-6 h-6"/></button>
            </div>
            
            {detailLoading || !selectedTicketData ? (
              <div className="py-20 text-center text-foreground-muted animate-pulse">Loading ticket details...</div>
            ) : (
              <div className="space-y-6">
                
                {/* Rejection / Return Reason Banner */}
                {(selectedTicketData.ticket.status === 'Need Information' || selectedTicketData.ticket.status === 'Rejected') && (
                  <div className="p-4 bg-danger/10 border-l-4 border-danger rounded-r-xl">
                    <h4 className="font-bold text-danger text-sm mb-1 flex items-center gap-2">
                      <XCircle className="w-4 h-4" /> 
                      {selectedTicketData.ticket.status === 'Need Information' ? 'Ticket Returned (Need Information)' : 'Ticket Rejected'}
                    </h4>
                    <p className="text-sm font-medium">
                      <span className="text-foreground-muted">Reason:</span> {
                        selectedTicketData.logs?.find((l: any) => l.action === 'RETURNED' || l.action === 'REJECTED')?.details?.replace(/.*Notes:\s*/, '') ||
                        selectedTicketData.approvals?.find((a: any) => a.action === 'RETURN' || a.action === 'REJECT')?.comments ||
                        "No specific reason provided."
                      }
                    </p>
                  </div>
                )}

                {/* Merge Points Informational & Deactivation Banner */}
                {selectedTicketData.ticket.request_type === 'MERGE_POINTS' && (
                  <div className="p-4 bg-teal-500/10 border border-teal-500/30 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 font-bold text-sm">
                        <ArrowRightLeft className="w-4 h-4" />
                        Penggabungan Poin & Penonaktifan Kartu Lama
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-700 dark:text-teal-300">
                        Merge Points
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3 bg-surface rounded-lg border border-border text-xs">
                        <span className="text-[10px] uppercase font-bold text-danger flex items-center gap-1 mb-1">
                          <UserIcon className="w-3 h-3" /> Member Lama (Sumber)
                        </span>
                        <div className="font-bold text-foreground text-sm">{selectedTicketData.ticket.customer_name || '-'}</div>
                        <div className="font-mono text-foreground-muted text-xs mt-0.5">{selectedTicketData.ticket.card_no || selectedTicketData.ticket.customer_id}</div>
                        <div className="mt-2 pt-2 border-t border-border flex items-center justify-between">
                          <span className="text-foreground-muted text-[11px]">Poin Awal:</span>
                          <span className="font-mono font-bold text-danger">{selectedTicketData.details?.[0]?.old_value ?? 0} pts</span>
                        </div>
                      </div>

                      <div className="p-3 bg-surface rounded-lg border border-border text-xs">
                        <span className="text-[10px] uppercase font-bold text-teal-600 dark:text-teal-400 flex items-center gap-1 mb-1">
                          <UserIcon className="w-3 h-3" /> Member Baru (Tujuan)
                        </span>
                        <div className="font-bold text-foreground text-sm">Penerima Poin</div>
                        <div className="font-mono text-teal-600 font-bold text-xs mt-0.5">
                          {selectedTicketData.details?.[0]?.transaction_ref || '-'}
                        </div>
                        <div className="mt-2 pt-2 border-t border-border flex items-center justify-between">
                          <span className="text-foreground-muted text-[11px]">Poin Ditransfer:</span>
                          <span className="font-mono font-bold text-teal-600">+{selectedTicketData.details?.[0]?.new_value ?? 0} pts</span>
                        </div>
                      </div>
                    </div>

                    {selectedTicketData.merge_h2h && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        {[
                          { label: 'H2H Member Lama', data: selectedTicketData.merge_h2h.source, tone: 'danger' },
                          { label: 'H2H Member Baru', data: selectedTicketData.merge_h2h.target, tone: 'teal' }
                        ].map(({ label, data, tone }) => (
                          <div key={label} className="p-3 bg-surface rounded-lg border border-border">
                            <div className={`font-bold mb-2 ${tone === 'danger' ? 'text-danger' : 'text-teal-600 dark:text-teal-400'}`}>{label} (Live)</div>
                            {data ? (
                              <div className="grid grid-cols-2 gap-2">
                                <span className="text-foreground-muted">Points</span><b>{data.current_points ?? 0} pts</b>
                                <span className="text-foreground-muted">Total Expense</span><b>Rp {new Intl.NumberFormat('id-ID').format(data.total_expense ?? 0)}</b>
                                <span className="text-foreground-muted">Lucky Draw</span><b className="text-warning">{data.lucky_draw_points ?? 0} pts</b>
                              </div>
                            ) : (
                              <span className="text-danger">{selectedTicketData.merge_h2h.errors?.[label === 'H2H Member Lama' ? 'source' : 'target'] || 'Data H2H tidak tersedia.'}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className={`text-xs px-3 py-2 rounded-lg font-medium flex items-center gap-2 ${
                      selectedTicketData.ticket.status.includes('Completed')
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30'
                    }`}>
                      {selectedTicketData.ticket.status.includes('Completed') ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                          <span>Poin berhasil digabungkan dan kartu lama <b>telah dinonaktifkan (Status: 0 / Inactive)</b> di database.</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                          <span><b>PENTING:</b> Saat dieksekusi oleh Ops Admin, seluruh poin dipindahkan ke Member Baru dan kartu member lama ({selectedTicketData.ticket.card_no || selectedTicketData.ticket.customer_id}) akan <b>otomatis dinonaktifkan (Status: 0 / Inactive)</b>.</span>
                        </>
                      )}
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-surface-raised rounded-xl space-y-3">
                    <h4 className="font-bold text-sm border-b border-border pb-2">Requester Info</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <span className="text-foreground-muted">Name:</span> <span className="font-medium">{selectedTicketData.ticket.requester_name}</span>
                      <span className="text-foreground-muted">ID:</span> <span className="font-medium">{selectedTicketData.ticket.requester_id}</span>
                      <span className="text-foreground-muted">Branch:</span> <span className="font-medium">{selectedTicketData.ticket.unit_branch}</span>
                    </div>
                  </div>
                  <div className="p-4 bg-surface-raised rounded-xl space-y-3">
                    <h4 className="font-bold text-sm border-b border-border pb-2">Request Info</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <span className="text-foreground-muted">Customer Name:</span> <span className="font-bold text-primary">{selectedTicketData.ticket.customer_name || '-'}</span>
                      <span className="text-foreground-muted">
                        {selectedTicketData.ticket.request_type === 'MERGE_POINTS' ? 'Member Lama (Card):' : 'Card No:'}
                      </span> 
                      <span className="font-bold text-primary">
                        {selectedTicketData.ticket.card_no || selectedTicketData.ticket.customer_id}
                        {selectedTicketData.ticket.request_type === 'MERGE_POINTS' && (
                          <span className="ml-1 text-[10px] text-danger font-normal">(Akan/Telah Nonaktif)</span>
                        )}
                      </span>
                      <span className="text-foreground-muted">Mobile No:</span> <span className="font-medium">{selectedTicketData.ticket.mobile_no || '-'}</span>
                      <span className="text-foreground-muted">Type:</span> <span>{renderRequestTypeBadge(selectedTicketData.ticket.request_type)}</span>
                      <span className="text-foreground-muted">Priority:</span> <span className="font-medium">{selectedTicketData.ticket.priority}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-bold text-sm">Ticket Details</h4>
                  <div className="bg-surface-raised rounded-xl overflow-hidden border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-surface">
                        <tr>
                          <th className="text-left px-4 py-2 font-bold text-foreground-muted uppercase">Field</th>
                          <th className="text-left px-4 py-2 font-bold text-foreground-muted uppercase">Old Value</th>
                          <th className="text-left px-4 py-2 font-bold text-foreground-muted uppercase">New Value</th>
                          <th className="text-left px-4 py-2 font-bold text-foreground-muted uppercase">Reason & Attachments</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {selectedTicketData.details?.map((d: any, idx: number) => {
                          const isMerge = selectedTicketData.ticket.request_type === 'MERGE_POINTS';
                          return (
                            <tr key={idx}>
                              <td className="px-4 py-3 font-medium align-top">
                                {isMerge ? (
                                  <span className="font-bold text-teal-600 dark:text-teal-400 flex items-center gap-1">
                                    <ArrowRightLeft className="w-3.5 h-3.5" /> Transfer Points
                                  </span>
                                ) : (
                                  d.field_name
                                )}
                              </td>
                              <td className="px-4 py-3 text-danger align-top font-mono">
                                {isMerge ? `${d.old_value} pts (Awal)` : d.old_value}
                              </td>
                              <td className="px-4 py-3 text-success font-bold align-top font-mono">
                                {isMerge ? `+${d.new_value} pts (Pindah)` : d.new_value}
                              </td>
                              <td className="px-4 py-3 text-foreground-muted align-top">
                                <div>{d.reason}</div>
                                {d.transaction_ref && (
                                  <div className="mt-1 text-[10px] bg-surface-raised px-2 py-1 rounded inline-block border border-border">
                                    <span className="font-bold text-foreground">
                                      {isMerge ? 'Member Baru (Tujuan):' : 'No Billing:'}
                                    </span> <span className="font-mono text-teal-600 font-bold">{d.transaction_ref}</span>
                                  </div>
                                )}
                                {d.attachment_url && (
                                  <div className="mt-1 ml-1 text-[10px] bg-primary/10 text-primary px-2 py-1 rounded inline-block border border-primary/20">
                                    <a href={d.attachment_url} target="_blank" rel="noreferrer" className="hover:underline font-bold">View Attachment</a>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {selectedTicketData.approvals?.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-bold text-sm">Approval History</h4>
                    <div className="space-y-2">
                      {selectedTicketData.approvals.map((app: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-3 p-3 bg-surface border border-border rounded-lg text-xs">
                          {app.status === 'APPROVE' ? <CheckCircle2 className="w-4 h-4 text-success" /> : <XCircle className="w-4 h-4 text-danger" />}
                          <div className="flex-1">
                            <span className="font-bold">{app.approver_name || app.approver_id}</span>
                            <span className="mx-2 text-foreground-muted">•</span>
                            <span className={app.status === 'APPROVE' ? 'text-success font-bold' : 'text-danger font-bold'}>{app.status}</span>
                            {app.comments && <p className="text-foreground-muted mt-1 italic">"{app.comments}"</p>}
                          </div>
                          <span className="text-foreground-muted">{new Date(app.created_at).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 justify-end pt-4 border-t border-border mt-4">
                  {/* Action Buttons with Dynamic Workflow Permissions */}
                  {!selectedTicketIsCompleted && (selectedTicketData.permissions
                    ? selectedTicketData.permissions.can_approve
                    : ((selectedTicketData.ticket.status === 'Pending Approval L1' && canApproveManager) ||
                       (selectedTicketData.ticket.status === 'Pending Approval L2' && canApproveManager) ||
                       (selectedTicketData.ticket.status === 'Pending Approval L3' && canApproveMarketing))
                  ) && (
                    <>
                      <button className="px-4 py-2 text-xs font-bold bg-danger text-white rounded-lg shadow-sm hover:opacity-90 flex items-center gap-2"
                        onClick={async () => {
                          const comments = prompt("Enter rejection reason:");
                          if (comments === null) return;
                          const approveResponse = await fetch(`/api/crm/tickets/${selectedTicketId}/approve`, {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              'x-user-id': user?.id || user?.username || ''
                            },
                            body: JSON.stringify({ approver_id: currentUserNIP, approver_name: currentUserNIP, approver_role: currentUserRole, action: 'REJECT', comments })
                          });
                          if (!approveResponse.ok) {
                            const errorData = await approveResponse.json().catch(() => ({}));
                            alert(errorData.error || 'Approval gagal diproses.');
                          }
                          openTicketDetail(selectedTicketId);
                          fetchTickets();
                        }}
                      >Reject</button>
                      <button className="px-4 py-2 text-xs font-bold bg-warning text-white rounded-lg shadow-sm hover:opacity-90 flex items-center gap-2"
                        onClick={async () => {
                          const comments = prompt("Enter return reason:");
                          if (comments === null) return;
                          await fetch(`/api/crm/tickets/${selectedTicketId}/approve`, {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              'x-user-id': user?.id || user?.username || ''
                            },
                            body: JSON.stringify({ approver_id: currentUserNIP, approver_name: currentUserNIP, approver_role: currentUserRole, action: 'RETURN', comments })
                          });
                          openTicketDetail(selectedTicketId);
                          fetchTickets();
                        }}
                      >Return (Need Info)</button>
                      <button className="px-4 py-2 text-xs font-bold bg-success text-white rounded-lg shadow-sm hover:opacity-90 flex items-center gap-2"
                        onClick={async () => {
                          const comments = prompt("Approval Comments:") || 'Approved';
                          const approveResponse = await fetch(`/api/crm/tickets/${selectedTicketId}/approve`, {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              'x-user-id': user?.id || user?.username || ''
                            },
                            body: JSON.stringify({ approver_id: currentUserNIP, approver_name: currentUserNIP, approver_role: currentUserRole, action: 'APPROVE', comments })
                          });
                          if (!approveResponse.ok) {
                            const errorData = await approveResponse.json().catch(() => ({}));
                            alert(errorData.error || 'Approval gagal diproses.');
                          }
                          openTicketDetail(selectedTicketId);
                          fetchTickets();
                        }}
                      >Approve</button>
                    </>
                  )}
                  {!selectedTicketIsCompleted && !selectedTicketData.permissions?.can_approve && selectedTicketData.ticket.status.includes('Pending Approval') && selectedTicketData.permissions?.approve_reason && (
                    <div className="w-full text-right text-[11px] text-foreground-muted italic py-1">
                      ℹ️ {selectedTicketData.permissions.approve_reason}
                    </div>
                  )}
                  {/* Action Button for Resubmit */}
                  {selectedTicketData.ticket.status === 'Need Information' &&
                    (user?.is_admin || user?.username === selectedTicketData.ticket.requester_id) && (
                    <button className="px-4 py-2 text-xs font-bold bg-success text-white rounded-lg shadow-sm hover:opacity-90 flex items-center gap-2"
                      onClick={() => {
                        // Pre-fill form
                        setEditingTicketId(selectedTicketId);
                        setFormData({
                          customer_id: selectedTicketData.ticket.customer_id,
                          customer_name: selectedTicketData.ticket.customer_name || '',
                          card_no: selectedTicketData.ticket.card_no || '',
                          mobile_no: selectedTicketData.ticket.mobile_no || '',
                          request_type: selectedTicketData.ticket.request_type,
                          priority: selectedTicketData.ticket.priority,
                          unit_branch: selectedTicketData.ticket.unit_branch,
                          requester_name: selectedTicketData.ticket.requester_name,
                          details: selectedTicketData.details.length > 0 ? selectedTicketData.details : [{ field_name: 'points', old_value: '0', new_value: '0', reason: '', transaction_ref: '', attachment_url: '' }]
                        });
                        setSearchTermInput(selectedTicketData.ticket.customer_id);
                        handleCustomerLookup(selectedTicketData.ticket.customer_id);
                        setSelectedTicketId(null);
                        setIsCreateModalOpen(true);
                      }}
                    >Edit & Resubmit Ticket</button>
                  )}
                  {/* Action Button for Execution */}
                  {!selectedTicketIsCompleted && (selectedTicketData.permissions
                    ? selectedTicketData.permissions.can_execute
                    : (selectedTicketData.ticket.status === 'Approved' && canExecute)
                  ) && (
                    <button className="px-4 py-2 text-xs font-bold bg-primary text-white rounded-lg shadow-sm hover:opacity-90 flex items-center gap-2"
                      onClick={async () => {
                        const isMerge = selectedTicketData.ticket.request_type === 'MERGE_POINTS';
                        const confirmMsg = isMerge
                          ? `⚠️ KONFIRMASI EKSEKUSI MERGE POINTS:\n\n1. Seluruh saldo ${selectedTicketData.details?.[0]?.new_value || ''} poin akan dipindahkan ke Member Baru (${selectedTicketData.details?.[0]?.transaction_ref}).\n2. KARTU MEMBER LAMA (${selectedTicketData.ticket.card_no || selectedTicketData.ticket.customer_id}) AKAN OTOMATIS DINONAKTIFKAN (STATUS: 0).\n\nMasukkan catatan eksekusi (atau tekan OK untuk melanjutkan):`
                          : "Enter execution notes:";
                        const notes = prompt(confirmMsg, isMerge ? 'Poin digabungkan & kartu lama dinonaktifkan' : '');
                        if (notes === null) return;
                        setExecuteLoading(true);
                        try {
                        const executeResponse = await fetch(`/api/crm/tickets/${selectedTicketId}/execute`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'x-user-id': user?.id || user?.username || ''
                          },
                          body: JSON.stringify({ executor_id: currentUserNIP, executor_name: currentUserNIP, result_notes: notes })
                        });
                        const executeData = await executeResponse.json().catch(() => ({}));
                        if (!executeResponse.ok) {
                          const validation = executeData.validation;
                          if (validation?.type === 'BILL_NOT_PROCESSED') {
                            alert(validation.found
                              ? `Bill No ${validation.bill_no || '-'} memiliki processed_flag ${validation.processed_flag ?? '-'}; nilai yang diizinkan hanya 1 atau -1.`
                              : `Bill No ${validation.bill_no || '-'} belum tercatat sebagai transaksi member.`);
                            openTicketDetail(selectedTicketId);
                            fetchTickets();
                            return;
                          }
                          const validationMessage = validation
                            ? validation.type === 'MERGE_POINTS_SOURCE_BALANCE'
                              ? `\n\nPoint sumber: ${validation.source_points}\nPoint ditransfer: ${validation.transferred_points}`
                              : validation.type === 'MERGE_POINTS'
                              ? `\n\nPoint H2H member tujuan: ${validation.target_h2h_points}\nPoint ditransfer: ${validation.transferred_points}`
                              + `\nExpense sumber/tujuan: Rp ${new Intl.NumberFormat('id-ID').format(validation.source_total_expense ?? 0)} / Rp ${new Intl.NumberFormat('id-ID').format(validation.target_total_expense ?? 0)}\nLucky draw sumber/tujuan: ${validation.source_lucky_draw_points ?? 0} / ${validation.target_lucky_draw_points ?? 0} pts`
                              : validation.type === 'DATA_UPDATE'
                                ? `\n\nField: ${validation.field}\nNilai H2H: ${validation.h2h_value ?? '-'}\nNilai diajukan: ${validation.requested_value}`
                                : `\n\nPoint H2H: ${validation.h2h_points}\nTarget minimum: ${validation.expected_points}`
                            : '';
                          alert((executeData.error || 'Eksekusi gagal.') + validationMessage);
                          openTicketDetail(selectedTicketId);
                          fetchTickets();
                          return;
                        }
                        alert('Execute berhasil diproses.');
                        openTicketDetail(selectedTicketId);
                        fetchTickets();
                        } finally {
                          setExecuteLoading(false);
                        }
                      }}
                      disabled={executeLoading}
                    >
                      {executeLoading ? (
                        'Validating & Executing...'
                      ) : selectedTicketData.ticket.request_type === 'MERGE_POINTS' ? (
                        <>
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          Execute Merge & Deactivate Old Card
                        </>
                      ) : (
                        'Execute Data Change'
                      )}
                    </button>
                  )}
                  {user?.is_admin && !selectedTicketIsCompleted && (
                    <button
                      onClick={async () => {
                        if (!confirm(`Hapus ticket ${selectedTicketId}? Data approval, detail, dan audit ticket akan ikut dihapus.`)) return;
                        const response = await fetch(`/api/crm/tickets/${selectedTicketId}`, { method: 'DELETE' });
                        const data = await response.json().catch(() => ({}));
                        if (!response.ok) {
                          alert(data.error || 'Ticket gagal dihapus.');
                          return;
                        }
                        alert('Ticket berhasil dihapus.');
                        setSelectedTicketId(null);
                        setSelectedTicketData(null);
                        fetchTickets();
                      }}
                      className="px-4 py-2 text-xs font-bold bg-danger text-white hover:opacity-90 rounded-lg"
                    >
                      Delete Ticket
                    </button>
                  )}
                  <button onClick={() => setSelectedTicketId(null)} className="px-4 py-2 text-xs font-bold border border-border text-foreground hover:bg-surface-raised rounded-lg ml-2">Close</button>
                </div>

                {selectedTicketData.logs?.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-bold text-sm">Execution & Audit History</h4>
                    <div className="space-y-2">
                      {selectedTicketData.logs.map((log: any, idx: number) => (
                        <div key={log.id || idx} className="p-3 bg-surface border border-border rounded-lg text-xs">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-bold text-primary">{log.action}</span>
                            <span className="text-foreground-muted">{new Date(log.created_at).toLocaleString()}</span>
                          </div>
                          <div className="mt-1 text-foreground-muted whitespace-pre-wrap">
                            {log.actor_name && <span className="font-semibold text-foreground">{log.actor_name}: </span>}
                            {log.details}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
