import { useState } from 'react'
import './App.css'
import GoogleMap from './components/GoogleMap'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <div className="header">
        <h1>UNL Campus Map</h1>
      </div>
      <div className="map-container">
        <GoogleMap />
      </div>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
      </div>
    </>
  )
}

export default App
