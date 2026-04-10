import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type UsageMapLocation = {
  key: string;
  label: string;
  latitude: number;
  longitude: number;
  count: number;
  activeCount: number;
};

function circleRadius(count: number) {
  return Math.max(8, Math.min(28, 8 + Math.sqrt(count) * 4));
}

export function UsageMap({ locations }: { locations: UsageMapLocation[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([18, 0], 2);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      layerRef.current?.clearLayers();
      layerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;

    if (!map || !layer) {
      return;
    }

    layer.clearLayers();

    if (locations.length === 0) {
      map.setView([18, 0], 2);
      return;
    }

    const bounds = L.latLngBounds([]);

    for (const location of locations) {
      const latLng = L.latLng(location.latitude, location.longitude);
      bounds.extend(latLng);

      L.circleMarker(latLng, {
        radius: circleRadius(location.count),
        color: "#fde047",
        weight: 2,
        fillColor: location.activeCount > 0 ? "#38bdf8" : "#f97316",
        fillOpacity: 0.62,
      })
        .bindPopup(
          `<strong>${location.label}</strong><br/>Sessions: ${location.count}<br/>Active now: ${location.activeCount}`,
        )
        .addTo(layer);
    }

    map.fitBounds(bounds.pad(0.25), { maxZoom: 5 });
  }, [locations]);

  return <div ref={containerRef} className="usage-map-canvas" />;
}
