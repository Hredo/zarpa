import * as Crypto from 'expo-crypto';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

/*
 * Mapa del Atlas: MapLibre GL JS dentro de un WebView, igual que en el TFG
 * (gratis, sin clave de API, teselas de OpenFreeMap) y con sus mismos cierres
 * de seguridad, porque este WebView ejecuta código descargado y comparte
 * proceso con la ubicación del usuario:
 *
 *   1. MapLibre en versión exacta con huella SRI: si el fichero servido no es
 *      el revisado, el navegador no lo ejecuta (mapa en blanco, que es lo
 *      correcto).
 *   2. CSP con nonce: solo corren ese script y el bloque propio.
 *   3. Ningún dato de la app se convierte en código: todo entra por
 *      `injectJavaScript` como JSON serializado.
 *   4. Sin navegación fuera del documento.
 *
 * Capas:
 *   - relieve sombreado con los modelos de elevación «Terrarium» (AWS Open
 *     Data, sin clave): el mapa se lee como un topográfico;
 *   - una capa por especie guardada con las teselas vectoriales de densidad de
 *     GBIF (observaciones humanas): hexágonos hasta el zoom 11 y puntos exactos
 *     a partir de ahí, cada especie en su color;
 *   - los avistamientos del propio usuario.
 */

const MAPLIBRE = '5.24.0';
const MAPLIBRE_JS = `https://unpkg.com/maplibre-gl@${MAPLIBRE}/dist/maplibre-gl.js`;
const MAPLIBRE_JS_SRI = 'sha384-5+cfbwT0iiub6VsQAdn6yz16nr6sDiQoHx6tm4O8OVYXHYOxcffFmCJBL0dgdvGp';
const MAPLIBRE_CSS = `https://unpkg.com/maplibre-gl@${MAPLIBRE}/dist/maplibre-gl.css`;
const MAPLIBRE_CSS_SRI = 'sha384-uTttxo/aOKbdE5RlD/SPzSDoDmNvGlUYPjONi2MN/b7c9HPSvW07OIuyP7uL6jxK';

export type MapLayer = { key: number; hue: number; visible: boolean };
export type MapPin = { id: string; lng: number; lat: number; label: string };
export type MapTap = { lng: number; lat: number; zoom: number; hits: { key: number; total: number }[] };

export type MapCanvasHandle = {
  flyTo: (lng: number, lat: number, zoom: number) => void;
  fitWorld: () => void;
};

type Props = {
  dark: boolean;
  layers: MapLayer[];
  pins: MapPin[];
  onTap?: (tap: MapTap) => void;
  initial?: { lng: number; lat: number; zoom: number };
};

function html(nonce: string, dark: boolean, initial: { lng: number; lat: number; zoom: number }): string {
  const style = dark ? 'https://tiles.openfreemap.org/styles/dark' : 'https://tiles.openfreemap.org/styles/liberty';
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' https://unpkg.com; style-src 'unsafe-inline' https://unpkg.com; img-src data: blob: https://*.openfreemap.org https://s3.amazonaws.com https://api.gbif.org; connect-src https://tiles.openfreemap.org https://*.openfreemap.org https://s3.amazonaws.com https://api.gbif.org; font-src https://tiles.openfreemap.org; worker-src blob:; child-src blob:">
<link rel="stylesheet" href="${MAPLIBRE_CSS}" integrity="${MAPLIBRE_CSS_SRI}" crossorigin="anonymous">
<style>html,body,#map{margin:0;height:100%;background:${dark ? '#0B120E' : '#E2E7DC'}}.maplibregl-ctrl-attrib{font:11px sans-serif}</style>
<script nonce="${nonce}" src="${MAPLIBRE_JS}" integrity="${MAPLIBRE_JS_SRI}" crossorigin="anonymous"></script>
</head><body><div id="map"></div>
<script nonce="${nonce}">
(function(){
  var post = function(m){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
  if (!window.maplibregl) { post({type:'error', message:'maplibre'}); return; }
  var map = new maplibregl.Map({ container:'map', style:${JSON.stringify(style)}, center:[${initial.lng},${initial.lat}], zoom:${initial.zoom}, attributionControl:{compact:true}, dragRotate:false, pitchWithRotate:false });
  map.touchZoomRotate.disableRotation();
  var layers = {};
  var GBIF = 'https://api.gbif.org/v2/map/occurrence/density/{z}/{x}/{y}.mvt?srs=EPSG:3857&basisOfRecord=HUMAN_OBSERVATION&taxonKey=';
  function firstSymbol(){ var ls = map.getStyle().layers; for (var i=0;i<ls.length;i++){ if (ls[i].type==='symbol') return ls[i].id; } return undefined; }
  function color(h){ return 'hsl('+h+', 72%, '+(${dark ? 58 : 42})+'%)'; }
  function addSpecies(l){
    var id = 'sp'+l.key;
    if (map.getSource(id+'h')) return;
    map.addSource(id+'h', { type:'vector', tiles:[GBIF+l.key+'&bin=hex&hexPerTile=48'], minzoom:0, maxzoom:11, attribution:'Observaciones: GBIF.org' });
    map.addSource(id+'p', { type:'vector', tiles:[GBIF+l.key], minzoom:11, maxzoom:16 });
    var before = firstSymbol();
    map.addLayer({ id:id+'hex', type:'fill', source:id+'h', 'source-layer':'occurrence', maxzoom:11,
      paint:{ 'fill-color':color(l.hue), 'fill-opacity':['interpolate',['linear'],['ln',['+',1,['get','total']]],0,0.28,3,0.5,7,0.78], 'fill-outline-color':color(l.hue) } }, before);
    map.addLayer({ id:id+'pt', type:'circle', source:id+'p', 'source-layer':'occurrence', minzoom:11,
      paint:{ 'circle-color':color(l.hue), 'circle-radius':['interpolate',['linear'],['zoom'],11,3,16,7], 'circle-stroke-color':'#FFFFFF', 'circle-stroke-width':1.2, 'circle-opacity':0.9 } }, before);
    layers[l.key] = l;
  }
  function removeSpecies(key){
    var id = 'sp'+key;
    ['hex','pt'].forEach(function(s){ if (map.getLayer(id+s)) map.removeLayer(id+s); });
    ['h','p'].forEach(function(s){ if (map.getSource(id+s)) map.removeSource(id+s); });
    delete layers[key];
  }
  window.zarpa = {
    setLayers: function(list){
      var want = {}; list.forEach(function(l){ want[l.key]=l; });
      Object.keys(layers).forEach(function(k){ if (!want[k]) removeSpecies(k); });
      list.forEach(function(l){
        addSpecies(l);
        var vis = l.visible ? 'visible' : 'none';
        ['hex','pt'].forEach(function(s){ if (map.getLayer('sp'+l.key+s)) map.setLayoutProperty('sp'+l.key+s,'visibility',vis); });
      });
    },
    setPins: function(geo){ var s = map.getSource('pins'); if (s) s.setData(geo); },
    flyTo: function(lng,lat,z){ map.flyTo({ center:[lng,lat], zoom:z, duration:900, essential:true }); },
    fitWorld: function(){ map.flyTo({ center:[10,25], zoom:1.3, duration:900 }); }
  };
  map.on('load', function(){
    map.addSource('terrain', { type:'raster-dem', tiles:['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding:'terrarium', tileSize:256, maxzoom:14, attribution:'Relieve: Mapzen Terrain Tiles (AWS Open Data)' });
    map.addLayer({ id:'relief', type:'hillshade', source:'terrain', paint:{ 'hillshade-exaggeration':0.35, 'hillshade-shadow-color':${dark ? "'#000000'" : "'#3E5246'"}, 'hillshade-highlight-color':${dark ? "'#2A3A30'" : "'#FFFFFF'"} } }, firstSymbol());
    map.addSource('pins', { type:'geojson', data:{ type:'FeatureCollection', features:[] } });
    map.addLayer({ id:'pins', type:'circle', source:'pins', paint:{ 'circle-radius':7, 'circle-color':'#F5C400', 'circle-stroke-color':'#0F1A14', 'circle-stroke-width':2 } });
    post({type:'ready'});
  });
  map.on('click', function(e){
    var ids = []; Object.keys(layers).forEach(function(k){ ids.push('sp'+k+'hex','sp'+k+'pt'); });
    ids = ids.filter(function(id){ return !!map.getLayer(id); });
    var feats = ids.length ? map.queryRenderedFeatures(e.point, { layers: ids }) : [];
    var hits = {};
    feats.forEach(function(f){ var key = Number(String(f.layer.id).replace(/^sp/,'').replace(/(hex|pt)$/,'')); hits[key] = (hits[key]||0) + (f.properties && f.properties.total ? Number(f.properties.total) : 1); });
    post({ type:'tap', lng:e.lngLat.lng, lat:e.lngLat.lat, zoom:map.getZoom(), hits:Object.keys(hits).map(function(k){ return { key:Number(k), total:hits[k] }; }) });
  });
  map.on('error', function(e){ post({type:'error', message: String(e && e.error && e.error.message || 'map')}); });
})();
</script></body></html>`;
}

export const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas({ dark, layers, pins, onTap, initial }, ref) {
  const web = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  // El HTML se genera una vez por montaje (cambiar de tema remonta el mapa):
  // regenerarlo en cada cambio de capas reiniciaría el encuadre.
  const source = useMemo(
    () => ({ html: html(Crypto.randomUUID().replace(/-/g, ''), dark, initial ?? { lng: -3.7, lat: 40.2, zoom: 4.6 }) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dark],
  );

  const call = (fn: string, ...args: unknown[]) => {
    web.current?.injectJavaScript(`window.zarpa && window.zarpa.${fn}(${args.map((a) => JSON.stringify(a)).join(',')}); true;`);
  };

  useImperativeHandle(ref, () => ({
    flyTo: (lng, lat, zoom) => call('flyTo', lng, lat, zoom),
    fitWorld: () => call('fitWorld'),
  }));

  useEffect(() => {
    if (ready) call('setLayers', layers.map((l) => ({ key: Math.trunc(l.key), hue: Math.trunc(l.hue), visible: !!l.visible })));
  }, [ready, layers]);

  useEffect(() => {
    if (!ready) return;
    call('setPins', {
      type: 'FeatureCollection',
      features: pins.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { id: p.id } })),
    });
  }, [ready, pins]);

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: { type?: string } & Partial<MapTap>;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'ready') setReady(true);
    if (msg.type === 'tap' && onTap && typeof msg.lng === 'number' && typeof msg.lat === 'number') {
      onTap({ lng: msg.lng, lat: msg.lat, zoom: Number(msg.zoom) || 0, hits: Array.isArray(msg.hits) ? msg.hits : [] });
    }
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <WebView
        key={dark ? 'dark' : 'light'}
        ref={web}
        source={source}
        originWhitelist={['about:blank']}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled={false}
        allowsInlineMediaPlayback={false}
        setSupportMultipleWindows={false}
        allowFileAccess={false}
        // Nada de navegar: el documento es el mapa y nada más.
        onShouldStartLoadWithRequest={(req) => req.url === 'about:blank' || req.url.startsWith('data:')}
        style={styles.web}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: 'transparent' },
});
