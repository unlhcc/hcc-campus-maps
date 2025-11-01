import {APIProvider, Map} from '@vis.gl/react-google-maps';

const GoogleMap = () => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  // university of nebraska lincoln
  const defaultCenter = {lat: 40.8202, lng: -96.7006};
  
  return (
    <APIProvider apiKey={apiKey}>
      <Map
        style={{ width: '100%', height: '100vh' }}
        defaultCenter={defaultCenter}
        defaultZoom={16}
        gestureHandling={'greedy'}
        disableDefaultUI={false}
      />
    </APIProvider>
  );
};

export default GoogleMap;