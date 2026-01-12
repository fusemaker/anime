import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import styled from 'styled-components';
import L from 'leaflet';
import 'leaflet.markercluster';
import api from '../utils/axiosConfig';

// Fix icons
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34]
});

L.Marker.prototype.options.icon = DefaultIcon;

// --- Styles ---
const MapWrapper = styled.div`
  height: 100vh;
  width: 100%;
  position: relative;
  background: #1a1a1a;
`;

const OverlayControls = styled.div`
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
  & > * { pointer-events: auto; }
`;

const ControlCard = styled.div`
  background: rgba(16, 18, 27, 0.9);
  padding: 12px 16px;
  border-radius: 12px;
  color: white;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
  min-width: 200px;
`;

const BackButton = styled.button`
  background: #3b82f6;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);
  &:hover { background: #2563eb; }
`;

const ActionButton = styled.button`
  margin-top: 8px;
  padding: 6px 12px;
  background: ${props => props.$primary ? '#10b981' : '#374151'};
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  width: 100%;
  font-size: 0.85rem;
  &:hover { filter: brightness(1.1); }
`;

// --- Components ---

const LocationMarker = ({ onLocationFound }) => {
    const map = useMap();
    
    useMapEvents({
        locationfound(e) {
            onLocationFound(e.latlng);
            map.flyTo(e.latlng, map.getZoom());
        },
    });

    useEffect(() => {
        if (map) {
            map.locate();
        }
    }, [map]);

    return null;
};

// EventMarkers component that handles clustering properly
const EventMarkers = ({ events, onGetDirections, isRouting }) => {
    const map = useMap();
    const clusterGroupRef = useRef(null);
    const markersRef = useRef([]);
    const directionsHandlerRef = useRef(onGetDirections);

    // Update ref when handler changes
    useEffect(() => {
        directionsHandlerRef.current = onGetDirections;
    }, [onGetDirections]);

    useEffect(() => {
        if (!map || !events || events.length === 0) {
            // Clean up if no events
            if (clusterGroupRef.current) {
                map.removeLayer(clusterGroupRef.current);
                clusterGroupRef.current = null;
            }
            return;
        }

        // Create cluster group
        clusterGroupRef.current = L.markerClusterGroup({
            chunkedLoading: true,
            maxClusterRadius: 80,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: true,
            zoomToBoundsOnClick: true
        });

        // Clear previous markers
        if (markersRef.current.length > 0) {
            markersRef.current.forEach(marker => {
                if (marker && clusterGroupRef.current) {
                    clusterGroupRef.current.removeLayer(marker);
                }
            });
        }
        markersRef.current = [];

        // Create markers for each event
        events.forEach((event, idx) => {
            if (!event.lat || !event.lng) return;

            const marker = L.marker([event.lat, event.lng], {
                icon: DefaultIcon
            });

            // Create popup content with proper event handlers
            const popupDiv = document.createElement('div');
            popupDiv.style.minWidth = '200px';
            popupDiv.innerHTML = `
                <h3 style="margin: 0 0 5px 0; color: #1f2937;">${event.title || 'Event'}</h3>
                <p style="margin: 3px 0; color: #4b5563; font-size: 13px;">📍 ${event.location || 'Unknown'}</p>
                <div style="display: flex; gap: 5px; margin: 5px 0;">
                    <span style="padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; background: ${event._id && event._id.toString().startsWith('serp_') ? '#e0f2fe' : '#dcfce7'}; color: ${event._id && event._id.toString().startsWith('serp_') ? '#0369a1' : '#15803d'};">
                        ${event._id && event._id.toString().startsWith('serp_') ? 'External' : 'Internal'}
                    </span>
                </div>
                <div style="display: flex; gap: 8px; margin-top: 8px;">
                    <button class="directions-btn" data-lat="${event.lat}" data-lng="${event.lng}" style="padding: 6px 12px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; width: 100%; font-size: 0.85rem;">
                        ${isRouting ? '...' : '🚗 Directions'}
                    </button>
                    <button class="details-btn" data-title="${encodeURIComponent(event.title)}" style="padding: 6px 12px; background: #374151; color: white; border: none; border-radius: 6px; cursor: pointer; width: 100%; font-size: 0.85rem;">
                        ↗ Details
                    </button>
                </div>
            `;

            // Add event listeners
            const directionsBtn = popupDiv.querySelector('.directions-btn');
            const detailsBtn = popupDiv.querySelector('.details-btn');

            if (directionsBtn) {
                directionsBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const lat = parseFloat(e.target.getAttribute('data-lat'));
                    const lng = parseFloat(e.target.getAttribute('data-lng'));
                    if (directionsHandlerRef.current) {
                        directionsHandlerRef.current(lat, lng);
                    }
                });
            }

            if (detailsBtn) {
                detailsBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const title = decodeURIComponent(e.target.getAttribute('data-title'));
                    window.open(`https://google.com/search?q=${encodeURIComponent(title)}`, '_blank');
                });
            }

            marker.bindPopup(popupDiv);
            clusterGroupRef.current.addLayer(marker);
            markersRef.current.push(marker);
        });

        // Add cluster group to map
        map.addLayer(clusterGroupRef.current);

        return () => {
            if (clusterGroupRef.current) {
                map.removeLayer(clusterGroupRef.current);
            }
            markersRef.current = [];
        };
    }, [map, events, isRouting]);

    return null;
};

// --- Main Map Component ---

const InteractiveMap = ({ user }) => {
    const [events, setEvents] = useState([]);
    const [mapCenter, setMapCenter] = useState([20.5937, 78.9629]); // Default India
    const [userLocation, setUserLocation] = useState(null);
    const [loading, setLoading] = useState(false);

    // Routing State
    const [routeCoords, setRouteCoords] = useState([]);
    const [routeError, setRouteError] = useState(null);
    const [isRouting, setIsRouting] = useState(false);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const lat = params.get('lat');
        const lng = params.get('lng');
        const locationName = params.get('location');

        if (lat && lng) {
            setMapCenter([parseFloat(lat), parseFloat(lng)]);
        }

        fetchEvents(locationName || 'India');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchEvents = async (location = 'India') => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                filter: 'discovery',
                limit: 100,
                location: location
            });
            const response = await api.get(`/api/events?${params}`);

            // Handle API response structure: { success: true, events: [...], total: ... }
            const eventsArray = response.data?.events || response.data || [];
            
            // Map events and ensure coords exist (Demo Fallback for consistency)
            const validEvents = Array.isArray(eventsArray) ? eventsArray.map(e => ({
                ...e,
                lat: e.geometry?.lat || e.lat || (20.59 + (Math.random() - 0.5) * 10),
                lng: e.geometry?.lng || e.lng || (78.96 + (Math.random() - 0.5) * 10)
            })) : [];
            setEvents(validEvents);
        } catch (error) {
            console.error("Fetch error", error);
            // Set empty array on error to prevent crashes
            setEvents([]);
            // Show user-friendly error message
            if (error.response?.status === 401) {
                console.error("Authentication required");
            } else if (error.response?.status >= 500) {
                console.error("Server error. Please try again later.");
            } else if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
                console.error("Network error. Please check your connection.");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleGetDirections = async (destLat, destLng) => {
        if (!userLocation) {
            alert("Waiting for your location...");
            return;
        }

        setIsRouting(true);
        setRouteError(null);
        setRouteCoords([]); // Clear previous

        try {
            const start = [userLocation.lat, userLocation.lng];
            const end = [destLat, destLng];

            // OSRM Public API (Driving)
            // Format: {lon},{lat};{lon},{lat}
            const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;

            const res = await fetch(url);
            const data = await res.json();

            if (data.code !== 'Ok') throw new Error('Route not found');

            // GeoJSON returns [lng, lat], Leaflet needs [lat, lng]
            const path = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
            setRouteCoords(path);

        } catch (err) {
            console.error("Routing failed", err);
            setRouteError("Routing Unavailable - Opening Maps");
            window.open(`https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}`, '_blank');
        } finally {
            setIsRouting(false);
        }
    };

    return (
        <MapWrapper>
            <OverlayControls>
                <BackButton onClick={() => window.history.back()}>← Back to Chat</BackButton>
                <ControlCard>
                    <div style={{ fontWeight: 'bold' }}>Interactive Event Map</div>
                    <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                        {loading ? 'Refreshing...' : `${events.length} events loaded`}
                    </div>
                    {routeError && <div style={{ color: '#f87171', fontSize: '0.75rem', marginTop: 5 }}>⚠️ {routeError}</div>}
                    <ActionButton $primary onClick={() => fetchEvents()}>↻ Refresh Area</ActionButton>
                </ControlCard>
            </OverlayControls>

            <MapContainer
                center={mapCenter}
                zoom={5}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={true}
            >
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; OpenStreetMap'
                />

                <LocationMarker onLocationFound={setUserLocation} />
                {userLocation && <Marker position={[userLocation.lat, userLocation.lng]} icon={DefaultIcon}><Popup>You</Popup></Marker>}

                {/* Route Line */}
                {routeCoords.length > 0 && <Polyline positions={routeCoords} pathOptions={{ color: 'blue', weight: 4 }} />}

                <EventMarkers events={events} onGetDirections={handleGetDirections} isRouting={isRouting} />
            </MapContainer>
        </MapWrapper>
    );
};

export default InteractiveMap;
