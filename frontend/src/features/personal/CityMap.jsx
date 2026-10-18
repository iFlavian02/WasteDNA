import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { IASI_CENTER, IASI_ZOOM, markerHtml, USER_LOCATION } from './places.js'

// OpenStreetMap's standard tiles need no API key (CARTO's now do); personal.css
// softens their colours. Keep the attribution: the OSM tile policy requires it.
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

const youIcon = L.divIcon({ className: 'food-pin-wrap', html: '<span class="you-pin"><i></i><b>You</b></span>', iconSize: [22, 22], iconAnchor: [11, 11] })

function PlaceMarker({ place, isNew, onOpen }) {
  const icon = useMemo(() => L.divIcon({ className: 'food-pin-wrap', html: markerHtml(place, { isNew }), iconSize: [46, 46], iconAnchor: [23, 23] }), [place, isNew])
  return <Marker
    position={[place.location.lat, place.location.lon]}
    icon={icon}
    title={`${place.name}: ${place.count} on sale`}
    keyboard={!!onOpen}
    interactive={!!onOpen}
    riseOnHover
    eventHandlers={onOpen ? { click: () => onOpen(place) } : undefined}
  />
}

/** Fit the view to the places (and the user) once, when the first places arrive. */
function FitOnce({ places }) {
  const map = useMap()
  const done = useRef(false)
  useEffect(() => {
    if (done.current || !places.length) return
    done.current = true
    const points = [[USER_LOCATION.lat, USER_LOCATION.lon], ...places.map(place => [place.location.lat, place.location.lon])]
    map.fitBounds(points, { padding: [36, 36], maxZoom: 15 })
  }, [map, places])
  return null
}

/** Below LABEL_ZOOM the name labels would overlap, so the map gets `is-far` and shows them on hover or focus only. */
const LABEL_ZOOM = 14
function LabelsByZoom() {
  const map = useMapEvents({ zoomend: () => sync() })
  const sync = () => { map.getContainer().classList.toggle('is-far', map.getZoom() < LABEL_ZOOM) }
  useEffect(sync)
  return null
}

/**
 * Leaflet map of Iași with one circle per place. With `onOpen`, circles are
 * clickable (and focusable: Enter opens them). `still` makes a small fixed map
 * centred on `center`, used on a restaurant's page.
 */
export default function CityMap({ places, fresh = new Set(), onOpen, center = IASI_CENTER, zoom = IASI_ZOOM, still = false, showYou = true, className = '' }) {
  const lock = still ? { dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false, zoomControl: false } : {}
  return <MapContainer className={`city-map ${className}`} center={[center.lat, center.lon]} zoom={zoom} minZoom={12} maxZoom={19} {...lock}>
    <TileLayer url={TILES} attribution={ATTRIBUTION} maxZoom={19} />
    {!still && <FitOnce places={places} />}
    <LabelsByZoom />
    {showYou && <Marker position={[USER_LOCATION.lat, USER_LOCATION.lon]} icon={youIcon} interactive={false} keyboard={false} zIndexOffset={-100} />}
    {places.map(place => <PlaceMarker key={place.id} place={place} isNew={fresh.has(place.id)} onOpen={onOpen} />)}
  </MapContainer>
}
