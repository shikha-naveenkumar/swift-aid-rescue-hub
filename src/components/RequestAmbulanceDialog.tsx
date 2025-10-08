import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface RequestAmbulanceDialogProps {
  userLocation: [number, number];
  onRequestCreated?: () => void;
}

export default function RequestAmbulanceDialog({ 
  userLocation, 
  onRequestCreated 
}: RequestAmbulanceDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [medicalNotes, setMedicalNotes] = useState("");
  const { toast } = useToast();

  const handleRequest = async () => {
    setLoading(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Authentication Required",
          description: "Please log in to request an ambulance",
          variant: "destructive"
        });
        return;
      }

      // Create request
      const { data: request, error: requestError } = await supabase
        .from('requests')
        .insert({
          patient_id: session.user.id,
          pickup_latitude: userLocation[0],
          pickup_longitude: userLocation[1],
          status: 'REQUESTED',
          notes: medicalNotes || null
        })
        .select()
        .single();

      if (requestError) throw requestError;

      // Call edge function to assign ambulance
      const { data: assignment, error: assignError } = await supabase.functions.invoke('assign-ambulance', {
        body: {
          requestId: request.id,
          pickupLat: userLocation[0],
          pickupLng: userLocation[1]
        }
      });

      if (assignError) {
        toast({
          title: "No Ambulances Available",
          description: "All ambulances are currently busy. Please try again shortly.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Ambulance Assigned!",
          description: `${assignment.ambulance.vehicle_number} is on the way. ETA: ${assignment.distance} km`,
        });
        
        setOpen(false);
        setMedicalNotes("");
        if (onRequestCreated) onRequestCreated();
      }
    } catch (error) {
      console.error("Error requesting ambulance:", error);
      toast({
        title: "Error",
        description: "Failed to request ambulance. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="bg-warning hover:bg-warning/90 text-white font-bold">
          🚨 Request Ambulance
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-destructive">Emergency Ambulance Request</DialogTitle>
          <DialogDescription>
            An ambulance will be dispatched to your current location immediately.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Your Location</Label>
            <div className="text-sm text-muted-foreground">
              Lat: {userLocation[0].toFixed(6)}, Lng: {userLocation[1].toFixed(6)}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="medical-notes">Medical Notes (Optional)</Label>
            <Textarea
              id="medical-notes"
              placeholder="Describe the emergency situation, symptoms, or any relevant medical information..."
              value={medicalNotes}
              onChange={(e) => setMedicalNotes(e.target.value)}
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button 
            onClick={handleRequest} 
            disabled={loading}
            className="bg-destructive hover:bg-destructive/90"
          >
            {loading ? "Requesting..." : "Confirm Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
