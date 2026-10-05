import * as Crypto from 'expo-crypto';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { palette } from '@/theme';

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
 *   - los avistamientos del propio usuario;
 *   - «Mis avistamientos»: mapa de calor con la densidad de los puntos del
 *     usuario y celdas punteadas de «zonas sin explorar» cerca de él;
 *   - precarga de teselas (`warmTiles`) para el modo sin conexión: el WebView
 *     las pide con `fetch` y el navegador las guarda en su caché HTTP, la misma
 *     que usará el mapa (OpenFreeMap las sirve con caducidad de 10 años).
 */

const MAPLIBRE = '5.24.0';
const MAPLIBRE_JS = `https://unpkg.com/maplibre-gl@${MAPLIBRE}/dist/maplibre-gl.js`;
const MAPLIBRE_JS_SRI = 'sha384-5+cfbwT0iiub6VsQAdn6yz16nr6sDiQoHx6tm4O8OVYXHYOxcffFmCJBL0dgdvGp';
const MAPLIBRE_CSS = `https://unpkg.com/maplibre-gl@${MAPLIBRE}/dist/maplibre-gl.css`;
const MAPLIBRE_CSS_SRI = 'sha384-uTttxo/aOKbdE5RlD/SPzSDoDmNvGlUYPjONi2MN/b7c9HPSvW07OIuyP7uL6jxK';

export type MapLayer = { key: number; hue: number; visible: boolean };
export type MapPin = { id: string; lng: number; lat: number; label: string };
export type MapTap = { lng: number; lat: number; zoom: number; hits: { key: number; total: number }[] };

/** Capa personal: puntos [lng, lat] de los avistamientos y celdas [oeste, sur, este, norte] sin explorar. */
export type HeatData = { visible: boolean; points: [number, number][]; cells: [number, number, number, number][] };
export type Tile = { z: number; x: number; y: number };
export type WarmProgress = { done: number; total: number; failed: number; finished?: boolean; error?: boolean };

export type MapCanvasHandle = {
  /** Pide en segundo plano estas teselas (y estilo, iconos y rótulos) para tenerlas en caché. */
  warmTiles: (tiles: Tile[]) => void;
  cancelWarm: () => void;
  flyTo: (lng: number, lat: number, zoom: number) => void;
  fitWorld: () => void;
  /**
   * Encuadra la distribución de una especie (clave de GBIF) ya pintada como
   * capa: vuela al mundo, espera a que carguen sus hexágonos y ajusta el zoom a
   * donde se concentran sus observaciones, sin que un avistamiento suelto en
   * otro continente lo estire. Si es cosmopolita, se queda en el mundo.
   */
  fitToSpecies: (key: number) => void;
};

type Props = {
  dark: boolean;
  layers: MapLayer[];
  pins: MapPin[];
  onTap?: (tap: MapTap) => void;
  /** El mapa terminó de cargar: ya acepta capas y órdenes de encuadre. */
  onReady?: () => void;
  /** Capa «Mis avistamientos»; `null` o `visible: false` la oculta. */
  heat?: HeatData | null;
  /** Avance de `warmTiles`. */
  onWarm?: (p: WarmProgress) => void;
  initial?: { lng: number; lat: number; zoom: number };
};

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

function html(nonce: string, dark: boolean, initial: { lng: number; lat: number; zoom: number }): string {
  const style = dark ? 'https://tiles.openfreemap.org/styles/dark' : 'https://tiles.openfreemap.org/styles/liberty';
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' https://unpkg.com; style-src 'unsafe-inline' https://unpkg.com; img-src data: blob: https://*.openfreemap.org https://s3.amazonaws.com https://api.gbif.org; connect-src https://tiles.openfreemap.org https://*.openfreemap.org https://s3.amazonaws.com https://api.gbif.org; font-src https://tiles.openfreemap.org; worker-src blob:; child-src blob:">
<link rel="stylesheet" href="${MAPLIBRE_CSS}" integrity="${MAPLIBRE_CSS_SRI}" crossorigin="anonymous">
<style>html,body,#map{margin:0;height:100%;background:${dark ? palette.strongDeep : palette.surfaceAlt}}.maplibregl-ctrl-attrib{font:11px sans-serif}</style>
<script nonce="${nonce}" src="${MAPLIBRE_JS}" integrity="${MAPLIBRE_JS_SRI}" crossorigin="anonymous"></script>
</head><body><div id="map"></div>
<script nonce="${nonce}">
(function(){
  var post = function(m){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
  if (!window.maplibregl) { post({type:'error', message:'maplibre'}); return; }
  var map = new maplibregl.Map({ container:'map', style:${JSON.stringify(style)}, center:[${initial.lng},${initial.lat}], zoom:${initial.zoom}, attributionControl:{compact:true}, dragRotate:false, pitchWithRotate:false });
  map.touchZoomRotate.disableRotation();
  var layers = {}; var fitToken = 0;
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
  var warmToken = 0;
  function ensureHeat(){
    if (map.getSource('mine')) return;
    map.addSource('mine', { type:'geojson', data:{ type:'FeatureCollection', features:[] } });
    map.addSource('unexplored', { type:'geojson', data:{ type:'FeatureCollection', features:[] } });
    map.addLayer({ id:'unexplored-fill', type:'fill', source:'unexplored', paint:{ 'fill-color':'${palette.sky}', 'fill-opacity':0.12 } }, 'pins');
    map.addLayer({ id:'unexplored-line', type:'line', source:'unexplored', paint:{ 'line-color':'${palette.sky}', 'line-width':1.6, 'line-dasharray':[2,2] } }, 'pins');
    map.addLayer({ id:'mine-heat', type:'heatmap', source:'mine', paint:{
      'heatmap-weight':1,
      'heatmap-intensity':['interpolate',['linear'],['zoom'],0,0.6,12,1.6],
      'heatmap-radius':['interpolate',['linear'],['zoom'],0,6,8,22,13,46],
      'heatmap-opacity':0.9,
      'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'${rgba(palette.brand, 0)}',0.2,'${rgba(palette.sun, 0.6)}',0.5,'${rgba(palette.brand, 0.85)}',0.8,'${rgba(palette.red, 0.92)}',1,'${palette.brandInk}']
    } }, 'pins');
  }
  window.zarpa = {
    setHeat: function(d){
      ensureHeat();
      var vis = d && d.visible ? 'visible' : 'none';
      ['mine-heat','unexplored-fill','unexplored-line'].forEach(function(id){ map.setLayoutProperty(id,'visibility',vis); });
      if (!d || !d.visible) return;
      map.getSource('mine').setData({ type:'FeatureCollection', features:(d.points||[]).map(function(p){ return { type:'Feature', properties:{}, geometry:{ type:'Point', coordinates:[Number(p[0]),Number(p[1])] } }; }) });
      map.getSource('unexplored').setData({ type:'FeatureCollection', features:(d.cells||[]).map(function(c){ var w=Number(c[0]),s=Number(c[1]),e=Number(c[2]),n=Number(c[3]); return { type:'Feature', properties:{}, geometry:{ type:'Polygon', coordinates:[[[w,s],[e,s],[e,n],[w,n],[w,s]]] } }; }) });
    },
    cancelWarm: function(){ warmToken++; },
    warmTiles: function(tiles){
      var token = ++warmToken, done = 0, failed = 0, next = 0, urls = [];
      var ORIGIN = 'https://tiles.openfreemap.org/';
      fetch(ORIGIN + 'planet').then(function(r){ return r.json(); }).then(function(tj){
        var tpl = tj && tj.tiles && tj.tiles[0];
        if (typeof tpl !== 'string' || tpl.indexOf(ORIGIN) !== 0) throw new Error('tilejson');
        var st = map.getStyle() || {};
        if (typeof st.sprite === 'string' && st.sprite.indexOf(ORIGIN) === 0) ['.json','.png','@2x.json','@2x.png'].forEach(function(x){ urls.push(st.sprite + x); });
        var fonts = {};
        (st.layers||[]).forEach(function(l){ var tf = l.layout && l.layout['text-font']; if (tf) fonts[tf.join(',')] = tf.join(','); });
        if (typeof st.glyphs === 'string' && st.glyphs.indexOf(ORIGIN) === 0) Object.keys(fonts).forEach(function(f){ ['0-255','256-511'].forEach(function(r){ urls.push(st.glyphs.replace('{fontstack}', encodeURIComponent(f)).replace('{range}', r)); }); });
        tiles.forEach(function(t){ urls.push(tpl.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y)); });
        var total = urls.length;
        function worker(){
          if (token !== warmToken || next >= total) return Promise.resolve();
          var u = urls[next++];
          return fetch(u).then(function(r){ if (!r.ok) failed++; return r.arrayBuffer(); }).catch(function(){ failed++; }).then(function(){
            done++;
            if (token === warmToken && (done % 4 === 0 || done === total)) post({ type:'warm', done:done, total:total, failed:failed });
            return worker();
          });
        }
        return Promise.all([worker(), worker(), worker(), worker()]).then(function(){
          if (token === warmToken) post({ type:'warm', done:done, total:total, failed:failed, finished:true });
        });
      }).catch(function(){ post({ type:'warm', done:done, total:urls.length, failed:failed, error:true }); });
    },
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
    fitWorld: function(){ map.flyTo({ center:[10,25], zoom:1.3, duration:900 }); },
    fitToSpecies: function(key){
      var token = ++fitToken, tries = 0, sid = 'sp'+key+'h';
      map.easeTo({ center:[10,25], zoom:1.3, duration:600 });
      function quantile(items, q){
        var tot = 0; items.forEach(function(i){ tot += i.w; });
        var acc = 0;
        for (var i=0;i<items.length;i++){ acc += items[i].w; if (acc >= tot*q) return items[i].v; }
        return items[items.length-1].v;
      }
      function attempt(){
        if (token !== fitToken) return;
        if (!map.getSource(sid) || !map.isSourceLoaded(sid)) { if (++tries < 40) setTimeout(attempt, 300); return; }
        var feats = map.querySourceFeatures(sid, { sourceLayer:'occurrence' });
        var xs = [], ys = [];
        feats.forEach(function(f){
          var g = f.geometry; if (!g || !g.coordinates) return;
          var ring = g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates[0][0] : null;
          if (!ring || !ring.length) return;
          var cx = 0, cy = 0; ring.forEach(function(c){ cx += c[0]; cy += c[1]; });
          var w = Math.max(1, Number(f.properties && f.properties.total) || 1);
          xs.push({ v:cx/ring.length, w:w }); ys.push({ v:cy/ring.length, w:w });
        });
        if (!xs.length) { if (++tries < 40) setTimeout(attempt, 300); return; }
        xs.sort(function(a,b){ return a.v-b.v; }); ys.sort(function(a,b){ return a.v-b.v; });
        var w0 = quantile(xs, 0.015), w1 = quantile(xs, 0.985), s0 = quantile(ys, 0.015), s1 = quantile(ys, 0.985);
        if (w1 - w0 > 300) return;
        var padLng = Math.max(1, (w1-w0)*0.06), padLat = Math.max(1, (s1-s0)*0.06);
        map.fitBounds([[w0-padLng, Math.max(-85, s0-padLat)],[w1+padLng, Math.min(85, s1+padLat)]], { padding:{ top:250, bottom:190, left:36, right:36 }, maxZoom:7, duration:1100 });
      }
      setTimeout(attempt, 700);
    }
  };
  map.on('load', function(){
    map.addSource('terrain', { type:'raster-dem', tiles:['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding:'terrarium', tileSize:256, maxzoom:14, attribution:'Relieve: Mapzen Terrain Tiles (AWS Open Data)' });
    map.addLayer({ id:'relief', type:'hillshade', source:'terrain', paint:{ 'hillshade-exaggeration':0.35, 'hillshade-shadow-color':${dark ? "'#000000'" : `'${palette.inkSoft}'`}, 'hillshade-highlight-color':${dark ? "'#2A3A30'" : "'#FFFFFF'"} } }, firstSymbol());
    map.addSource('pins', { type:'geojson', data:{ type:'FeatureCollection', features:[] } });
    map.addLayer({ id:'pins', type:'circle', source:'pins', paint:{ 'circle-radius':7, 'circle-color':'${palette.brand}', 'circle-stroke-color':'${palette.ink}', 'circle-stroke-width':2 } });
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

export const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas({ dark, layers, pins, onTap, onReady, initial, heat, onWarm }, ref) {
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
    warmTiles: (tiles) => call('warmTiles', tiles.map((t) => ({ z: Math.trunc(t.z), x: Math.trunc(t.x), y: Math.trunc(t.y) }))),
    cancelWarm: () => call('cancelWarm'),
    flyTo: (lng, lat, zoom) => call('flyTo', lng, lat, zoom),
    fitWorld: () => call('fitWorld'),
    fitToSpecies: (key) => call('fitToSpecies', Math.trunc(key)),
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

  useEffect(() => {
    if (!ready) return;
    call(
      'setHeat',
      heat
        ? {
            visible: !!heat.visible,
            points: heat.points.map(([lng, lat]) => [Number(lng), Number(lat)]),
            cells: heat.cells.map((c) => c.map(Number)),
          }
        : null,
    );
  }, [ready, heat]);

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: { type?: string } & Partial<MapTap> & Partial<WarmProgress>;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'ready') {
      setReady(true);
      onReady?.();
    }
    if (msg.type === 'warm' && onWarm) {
      onWarm({
        done: Number(msg.done) || 0,
        total: Number(msg.total) || 0,
        failed: Number(msg.failed) || 0,
        finished: !!msg.finished,
        error: !!msg.error,
      });
    }
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
