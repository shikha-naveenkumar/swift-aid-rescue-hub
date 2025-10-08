import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import LeafletMap from "@/components/Map/LeafletMap";
import RequestAmbulanceDialog from "@/components/RequestAmbulanceDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Hospital = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  capacity: number;
};

type Ambulance = {
  id: string;
  vehicle_number: string;
  status: string;
  current_latitude: number;
  current_longitude: number;
  driver_name: string;
  driver_phone: string;
};

type Request = {
  id: string;
  created_at: string;
  status: string;
  pickup_latitude: number;
  pickup_longitude: number;
  eta_minutes: number | null;
  ambulances: { vehicle_number: string; driver_name: string } | null;
  hospitals: { name: string } | null;
};

export default function SimpleDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number]>([28.6139, 77.2090]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [ambulances, setAmbulances] = useState<Ambulance[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);

  useEffect(() => {
    checkAuth();
    getUserLocation();
    loadData();

    const channel = supabase
      .channel('dashboard-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ambulances' }, () => {
        loadAmbulances();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, () => {
        loadRequests();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', session.user.id)
      .single();

    if (roleData) {
      setUserRole(roleData.role);
    }
    setLoading(false);
  };

  const getUserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation([position.coords.latitude, position.coords.longitude]);
        },
        (error) => {
          console.error("Error getting location:", error);
          toast({
            title: "Location Access",
            description: "Using default location. Please enable location access for accurate service.",
            variant: "destructive"
          });
        }
      );
    }
  };

  const loadData = async () => {
    await Promise.all([loadHospitals(), loadAmbulances(), loadRequests()]);
  };

  const loadHospitals = async () => {
    const result = await supabase
      .from('hospitals')
      .select('id, name, latitude, longitude, capacity')
      .eq('is_active', true);
    
    if (result.error) {
      console.error("Error loading hospitals:", result.error);
    } else if (result.data) {
      setHospitals(result.data as Hospital[]);
    }
  };

  const loadAmbulances = async () => {
    const result = await supabase
      .from('ambulances')
      .select('id, vehicle_number, status, current_latitude, current_longitude, driver_name, driver_phone');
    
    if (result.error) {
      console.error("Error loading ambulances:", result.error);
    } else if (result.data) {
      setAmbulances(result.data as Ambulance[]);
    }
  };

  const loadRequests = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const result = userRole === 'PATIENT'
      ? await supabase
          .from('requests')
          .select('id, created_at, status, pickup_latitude, pickup_longitude, ambulances(vehicle_number, driver_name), hospitals(name)')
          .eq('patient_id', session.user.id)
          .order('created_at', { ascending: false })
      : await supabase
          .from('requests')
          .select('id, created_at, status, pickup_latitude, pickup_longitude, ambulances(vehicle_number, driver_name), hospitals(name)')
          .order('created_at', { ascending: false });
    
    if (result.error) {
      console.error("Error loading requests:", result.error);
    } else if (result.data) {
      setRequests(result.data as any);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-destructive">SwiftAid</h1>
            <p className="text-sm text-muted-foreground">Emergency Response System</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Role: {userRole}</span>
            <Button variant="outline" onClick={handleLogout}>Logout</Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto p-6">
        <Tabs defaultValue="map" className="space-y-6">
          <TabsList>
            <TabsTrigger value="map">Map View</TabsTrigger>
            <TabsTrigger value="requests">Requests</TabsTrigger>
            {(userRole === 'HOSPITAL_STAFF' || userRole === 'ADMIN') && (
              <TabsTrigger value="ambulances">Ambulances</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="map" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Live Map</h2>
              {userRole === 'PATIENT' && (
                <RequestAmbulanceDialog 
                  userLocation={userLocation} 
                  onRequestCreated={loadRequests}
                />
              )}
            </div>
            <Card>
              <CardContent className="p-0">
                <div style={{ height: '600px' }}>
                  <LeafletMap
                    center={userLocation}
                    hospitals={hospitals}
                    ambulances={ambulances}
                    userLocation={userLocation}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="requests">
            <div className="space-y-4">
              {requests.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center text-muted-foreground">
                    No requests found
                  </CardContent>
                </Card>
              ) : (
                requests.map((request) => (
                  <Card key={request.id}>
                    <CardHeader>
                      <CardTitle className="flex justify-between items-center">
                        <span>Request #{request.id.slice(0, 8)}</span>
                        <span className={`text-sm px-3 py-1 rounded-full ${
                          request.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                          request.status === 'EN_ROUTE' ? 'bg-orange-100 text-orange-800' :
                          request.status === 'ASSIGNED' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {request.status}
                        </span>
                      </CardTitle>
                      <CardDescription>
                        {new Date(request.created_at).toLocaleString()}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-semibold">Pickup:</span> {request.pickup_latitude.toFixed(4)}, {request.pickup_longitude.toFixed(4)}
                        </div>
                        {request.ambulances && (
                          <div>
                            <span className="font-semibold">Ambulance:</span> {request.ambulances.vehicle_number}
                          </div>
                        )}
                        {request.hospitals && (
                          <div>
                            <span className="font-semibold">Hospital:</span> {request.hospitals.name}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {(userRole === 'HOSPITAL_STAFF' || userRole === 'ADMIN') && (
            <TabsContent value="ambulances">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {ambulances.map((ambulance) => (
                  <Card key={ambulance.id}>
                    <CardHeader>
                      <CardTitle>{ambulance.vehicle_number}</CardTitle>
                      <CardDescription>{ambulance.driver_name}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="font-semibold">Status:</span>
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            ambulance.status === 'AVAILABLE' ? 'bg-green-100 text-green-800' :
                            ambulance.status === 'EN_ROUTE' ? 'bg-orange-100 text-orange-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {ambulance.status}
                          </span>
                        </div>
                        <div>
                          <span className="font-semibold">Contact:</span> {ambulance.driver_phone}
                        </div>
                        <div>
                          <span className="font-semibold">Location:</span> {ambulance.current_latitude.toFixed(4)}, {ambulance.current_longitude.toFixed(4)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
