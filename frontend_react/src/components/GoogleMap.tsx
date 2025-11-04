import { APIProvider, Map, useMap } from '@vis.gl/react-google-maps';
import { useEffect } from 'react';

const GeoJsonLayer = ({ geojsonUrl }: { geojsonUrl: string }) => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    map.data.loadGeoJson(geojsonUrl);

    map.data.setStyle({
      fillColor: '#4285F4',
      fillOpacity: 0.4,
      strokeColor: '#1a73e8',
      strokeWeight: 2,
    });

    map.data.addListener('click', (event: google.maps.Data.MouseEvent) => {
      const properties = event.feature.getProperty('NAME');
      console.log('Clicked building:', properties);
    });

    return () => {
      map.data.forEach((feature: object) => {
        map.data.remove(feature);
      });
    };
  }, [map, geojsonUrl]);

  return null;
};


const GoogleMap = () => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const defaultCenter = {lat: 40.8202, lng: -96.7006};
  
  return (
    <APIProvider apiKey={apiKey}>
      <Map
        style={{ width: '100%', height: '100%' }}
        defaultCenter={defaultCenter}
        defaultZoom={16}
        gestureHandling={'greedy'}
        mapTypeControl={true}
        streetViewControl={false}
        fullscreenControl={false}
        zoomControl={true}
        styles={[
          {
            "featureType": "poi",
            "elementType": "labels",
            "stylers": [{visibility: "off"}]
          },
        ]}
      >
        <GeoJsonLayer geojsonUrl="buildings.geojson" />
      </Map>
    </APIProvider>
  );
};

export default GoogleMap;