import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import LeafletMap from "@/components/Map/LeafletMap";

export default function TrackAmbulance() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState<any>(null);
  const [ambulance, setAmbulance] = useState<any>(null);
  const [eta, setEta] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRequestData();

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`request-${requestId}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'requests',
        filter: `id=eq.${requestId}`
      }, (payload) => {
        setRequest(payload.new);
      })
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'ambulances'
      }, () => {
        loadRequestData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [requestId]);

  const loadRequestData = async () => {
    const { data: requestData, error: requestError } = await supabase
      .from('requests')
      .select('*, ambulances(*), hospitals(*)')
      .eq('id', requestId)
      .single();

    if (requestError) {
      console.error("Error loading request:", requestError);
    } else {
      setRequest(requestData);
      if (requestData.ambulances) {
        setAmbulance(requestData.ambulances);
        calculateETA(requestData);
      }
    }
    setLoading(false);
  };

  const calculateETA = async (requestData: any) => {
    if (!requestData.ambulances) return;

    const { data, error } = await supabase.functions.invoke('calculate-eta', {
      body: {
        fromLat: requestData.ambulances.current_lat,
        fromLng: requestData.ambulances.current_lng,
        toLat: requestData.pickup_latitude,
        toLng: requestData.pickup_longitude
      }
    });

    if (!error && data) {
      setEta(data.duration);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!request) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card>
          <CardContent className="p-6">
            <p>Request not found</p>
            <Button onClick={() => navigate("/dashboard")} className="mt-4">
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-destructive">SwiftAid Tracking</h1>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            Back to Dashboard
          </Button>
        </div>
      </header>

      <div className="container mx-auto p-6 space-y-6">
        {/* Status Card */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Request Status</CardTitle>
              <Badge variant={
                request.status === 'COMPLETED' ? 'default' :
                request.status === 'EN_ROUTE' ? 'secondary' :
                'outline'
              }>
                {request.status}
              </Badge>
            </div>
            <CardDescription>Request ID: {request.id.slice(0, 8)}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              {ambulance && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg">Ambulance Details</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Vehicle:</span>
                      <span className="font-medium">{ambulance.vehicle_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Driver:</span>
                      <span className="font-medium">{ambulance.driver_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Contact:</span>
                      <span className="font-medium">{ambulance.driver_contact}</span>
                    </div>
                  </div>
                </div>
              )}
              
              {eta !== null && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg">Estimated Time</h3>
                  <div className="text-4xl font-bold text-warning">
                    {eta} min
                  </div>
                  <p className="text-sm text-muted-foreground">
                    The ambulance is on its way to your location
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Map */}
        <Card>
          <CardContent className="p-0">
            <div style={{ height: '500px' }}>
              <LeafletMap
                center={[request.pickup_latitude, request.pickup_longitude]}
                userLocation={[request.pickup_latitude, request.pickup_longitude]}
                ambulances={ambulance ? [ambulance] : []}
                hospitals={request.hospitals ? [request.hospitals] : []}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
