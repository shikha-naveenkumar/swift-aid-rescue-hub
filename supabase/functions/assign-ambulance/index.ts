import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { requestId, pickupLat, pickupLng } = await req.json();

    // Find nearest available ambulance
    const { data: ambulances, error: ambulanceError } = await supabaseClient
      .from('ambulances')
      .select('*')
      .eq('status', 'AVAILABLE');

    if (ambulanceError) throw ambulanceError;
    if (!ambulances || ambulances.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No available ambulances' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // Calculate distance to each ambulance and find nearest
    let nearest = null;
    let minDistance = Infinity;

    for (const ambulance of ambulances) {
      const R = 6371;
      const dLat = (pickupLat - ambulance.current_lat) * Math.PI / 180;
      const dLng = (pickupLng - ambulance.current_lng) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(ambulance.current_lat * Math.PI / 180) * Math.cos(pickupLat * Math.PI / 180) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;

      if (distance < minDistance) {
        minDistance = distance;
        nearest = ambulance;
      }
    }

    if (!nearest) {
      return new Response(
        JSON.stringify({ error: 'Could not find nearest ambulance' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // Update request with assigned ambulance
    const { data: updatedRequest, error: updateError } = await supabaseClient
      .from('requests')
      .update({
        assigned_ambulance_id: nearest.id,
        status: 'ASSIGNED'
      })
      .eq('id', requestId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Update ambulance status
    await supabaseClient
      .from('ambulances')
      .update({ status: 'EN_ROUTE' })
      .eq('id', nearest.id);

    return new Response(
      JSON.stringify({
        ambulance: nearest,
        request: updatedRequest,
        distance: minDistance.toFixed(2)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
