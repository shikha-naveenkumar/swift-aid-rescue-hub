import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom icons with color coding
const createCustomIcon = (color: string) => {
  return L.divIcon({
    className: 'custom-leaflet-icon',
    html: `<div style="background-color: ${color}; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
};

const ambulanceIcons = {
  AVAILABLE: createCustomIcon('#2E7D32'), // Forest Green
  EN_ROUTE: createCustomIcon('#FF7043'), // Action Orange
  ARRIVED: createCustomIcon('#E53935'), // Urgent Red
  OFF_DUTY: createCustomIcon('#424242') // Neutral Grey
};

const hospitalIcon = L.divIcon({
  className: 'hospital-leaflet-icon',
  html: `<div style="background-color: #1976D2; width: 35px; height: 35px; border-radius: 5px; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 20px;">H</div>`,
  iconSize: [35, 35],
  iconAnchor: [17, 17]
});

const userIcon = createCustomIcon('#9C27B0');

interface LeafletMapProps {
  center: [number, number];
  zoom?: number;
  hospitals?: Array<{ id: string; name: string; latitude: number; longitude: number; capacity: number }>;
  ambulances?: Array<{ id: string; vehicle_number: string; status: string; current_latitude: number; current_longitude: number; driver_name: string }>;
  userLocation?: [number, number];
  route?: Array<[number, number]>;
}

export default function LeafletMap({ 
  center, 
  zoom = 13, 
  hospitals = [], 
  ambulances = [],
  userLocation,
  route = []
}: LeafletMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const polylineRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Initialize map
    const map = L.map(containerRef.current).setView(center, zoom);
    mapRef.current = map;

    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update map center
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setView(center, mapRef.current.getZoom());
    }
  }, [center]);

  // Update markers
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Add user location marker
    if (userLocation) {
      const marker = L.marker(userLocation, { icon: userIcon })
        .bindPopup('Your Location')
        .addTo(mapRef.current);
      markersRef.current.push(marker);
    }

    // Add hospital markers
    hospitals.forEach((hospital) => {
      const marker = L.marker([hospital.latitude, hospital.longitude], { icon: hospitalIcon })
        .bindPopup(`<b>${hospital.name}</b><br/>Capacity: ${hospital.capacity}`)
        .addTo(mapRef.current!);
      markersRef.current.push(marker);
    });

    // Add ambulance markers
    ambulances.forEach((ambulance) => {
      const icon = ambulanceIcons[ambulance.status as keyof typeof ambulanceIcons] || ambulanceIcons.AVAILABLE;
      const marker = L.marker([ambulance.current_latitude, ambulance.current_longitude], { icon })
        .bindPopup(`<b>${ambulance.vehicle_number}</b><br/>Driver: ${ambulance.driver_name}<br/>Status: ${ambulance.status}`)
        .addTo(mapRef.current!);
      markersRef.current.push(marker);
    });
  }, [hospitals, ambulances, userLocation]);

  // Update route polyline
  useEffect(() => {
    if (!mapRef.current) return;

    // Remove existing polyline
    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }

    // Add new polyline if route exists
    if (route.length > 0) {
      polylineRef.current = L.polyline(route, {
        color: '#FF7043',
        weight: 4,
        opacity: 0.7
      }).addTo(mapRef.current);
    }
  }, [route]);

  return <div ref={containerRef} style={{ height: '100%', width: '100%', borderRadius: '8px' }} />;
}
