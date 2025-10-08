import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard");
      }
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted to-background">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-20">
        <div className="text-center space-y-8">
          <h1 className="text-6xl font-bold text-destructive mb-4">
            SwiftAid
          </h1>
          <p className="text-2xl text-muted-foreground max-w-2xl mx-auto">
            Emergency Ambulance GPS Tracking System
          </p>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            Real-time ambulance tracking and dispatch system ensuring faster emergency response times and saving lives.
          </p>
          
          <div className="flex gap-4 justify-center mt-8">
            <Button 
              size="lg" 
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={() => navigate("/auth")}
            >
              Get Started
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              onClick={() => navigate("/auth")}
            >
              Login
            </Button>
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mt-20">
          <div className="bg-card p-6 rounded-lg border shadow-sm">
            <div className="text-4xl mb-4">🚨</div>
            <h3 className="text-xl font-semibold mb-2">Real-Time Tracking</h3>
            <p className="text-muted-foreground">
              Track ambulances in real-time with live GPS updates and accurate ETAs.
            </p>
          </div>
          
          <div className="bg-card p-6 rounded-lg border shadow-sm">
            <div className="text-4xl mb-4">⚡</div>
            <h3 className="text-xl font-semibold mb-2">Instant Dispatch</h3>
            <p className="text-muted-foreground">
              Automatic assignment of nearest available ambulance to emergency requests.
            </p>
          </div>
          
          <div className="bg-card p-6 rounded-lg border shadow-sm">
            <div className="text-4xl mb-4">🏥</div>
            <h3 className="text-xl font-semibold mb-2">Hospital Network</h3>
            <p className="text-muted-foreground">
              Integrated hospital network for seamless patient handoff and care coordination.
            </p>
          </div>
        </div>

        {/* Color Legend */}
        <div className="mt-20 bg-card p-8 rounded-lg border">
          <h3 className="text-xl font-semibold mb-6 text-center">Status Indicators</h3>
          <div className="grid md:grid-cols-4 gap-6">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full" style={{ backgroundColor: '#2E7D32' }}></div>
              <span className="text-sm">Available</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full" style={{ backgroundColor: '#FF7043' }}></div>
              <span className="text-sm">En Route</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full" style={{ backgroundColor: '#E53935' }}></div>
              <span className="text-sm">Emergency</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full" style={{ backgroundColor: '#424242' }}></div>
              <span className="text-sm">Off Duty</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
