import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export interface Enquiry {
  id: string;
  property_id: string;
  tenant_id: string;
  message: string | null;
  status: string;
  visit_date: string | null;
  created_at: string;
  properties?: { title: string; address: string; landlord_id: string };
  profiles?: { full_name: string | null };
}

// Fire-and-forget email notification; never blocks the UI.
function notify(type: 'enquiry_created' | 'enquiry_status', enquiryId: string) {
  supabase.functions
    .invoke('notify-email', { body: { type, enquiry_id: enquiryId } })
    .then(({ error }) => { if (error) console.warn('notify-email failed:', error); });
}

export function useEnquiries(mode: 'tenant' | 'landlord') {
  const { user } = useAuth();
  const { toast } = useToast();
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEnquiries = async () => {
    if (!user) return;
    setLoading(true);

    let query = supabase
      .from('enquiries')
      .select('*, properties(title, address, landlord_id)')
      .order('created_at', { ascending: false });

    if (mode === 'tenant') {
      query = query.eq('tenant_id', user.id);
    }
    // For landlord mode, RLS handles filtering via property ownership

    const { data, error } = await query;
    if (error) console.error('Enquiries fetch error:', error);
    setEnquiries((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchEnquiries();
  }, [user, mode]);

  const createEnquiry = async (propertyId: string, message?: string) => {
    if (!user) {
      toast({ variant: 'destructive', title: 'Please login first' });
      return null;
    }

    const { data, error } = await supabase
      .from('enquiries')
      .insert({
        property_id: propertyId,
        tenant_id: user.id,
        message: message || 'I am interested in this property',
        status: 'initiated',
      })
      .select()
      .single();

    if (error) {
      if (error.message.includes('Rate limit')) {
        toast({ variant: 'destructive', title: 'Rate limit reached', description: 'Maximum 5 enquiries per day.' });
      } else {
        toast({ variant: 'destructive', title: 'Failed to create enquiry' });
      }
      return null;
    }

    if (data?.id) notify('enquiry_created', data.id);
    toast({ title: 'Enquiry sent!', description: 'You can now chat with the owner.' });
    await fetchEnquiries();
    return data;
  };

  const updateStatus = async (enquiryId: string, status: string) => {
    const { error } = await supabase
      .from('enquiries')
      .update({ status })
      .eq('id', enquiryId);

    if (error) toast({ variant: 'destructive', title: 'Failed to update status' });
    else {
      notify('enquiry_status', enquiryId);
      setEnquiries(prev => prev.map(e => e.id === enquiryId ? { ...e, status } : e));
    }
  };

  return { enquiries, loading, createEnquiry, updateStatus, refetch: fetchEnquiries };
}
