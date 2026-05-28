// ==================== CONFIGURACIÓN DE FIREBASE ====================
const firebaseConfig = {
  apiKey: "AIzaSyAoFFuOKVMKXXrohDGz_SO0HY6lfG6F9k4",
  authDomain: "proyecto-vial-59296.firebaseapp.com",
  databaseURL: "https://proyecto-vial-59296-default-rtdb.firebaseio.com",
  projectId: "proyecto-vial-59296",
  storageBucket: "proyecto-vial-59296.firebasestorage.app",
  messagingSenderId: "22263521330",
  appId: "1:22263521330:web:21f8cc364bcf1b0e9c1c2b",
  measurementId: "G-C6JYR5L9PX"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// ==================== VARIABLES GLOBALES ====================
let map;
let userMarker;
let vehicleMarker;
let roadMarkers = [];
let userLocation = null;
let watchID = null;
let dataUpdateInterval;
let lastAlertTime = {};
const ALERT_COOLDOWN = 5000; // 5 segundos entre alertas del mismo tipo

// ==================== INICIALIZACIÓN ====================
document.addEventListener('DOMContentLoaded', () => {
    const loadingScreen = document.getElementById('loadingScreen');
    const mainContainer = document.getElementById('mainContainer');
    const enableGPSBtn = document.getElementById('enableGPS');
    
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                initializeApp();
                loadingScreen.style.display = 'none';
                mainContainer.style.display = 'flex';
            },
            (error) => {
                console.error("Error de geolocalización:", error);
                enableGPSBtn.style.display = 'block';
                document.querySelector('.spinner').style.display = 'none';
                
                enableGPSBtn.addEventListener('click', () => {
                    navigator.geolocation.getCurrentPosition(
                        (position) => {
                            userLocation = {
                                lat: position.coords.latitude,
                                lng: position.coords.longitude
                            };
                            initializeApp();
                            loadingScreen.style.display = 'none';
                            mainContainer.style.display = 'flex';
                        },
                        (err) => {
                            alert('Es necesario activar el GPS para usar esta aplicación.');
                        }
                    );
                });
            }
        );
    } else {
        alert("Tu navegador no soporta geolocalización.");
    }
    
    // Toggle panel lateral
    document.getElementById('togglePanel').addEventListener('click', () => {
        const panel = document.getElementById('sidePanel');
        const icon = document.querySelector('#togglePanel i');
        panel.classList.toggle('collapsed');
        icon.className = panel.classList.contains('collapsed') ? 
            'fas fa-chevron-left' : 'fas fa-chevron-right';
    });
});

// ==================== INICIALIZAR MAPA ====================
function initializeApp() {
    const mapContainer = document.getElementById('map');
    mapContainer.style.width = '100%';
    mapContainer.style.height = '100%';
    
    map = L.map('map', {
        center: [userLocation.lat, userLocation.lng],
        zoom: 16,
        zoomControl: true,
        trackResize: true
    });
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);
    
    // Ícono del usuario
    const userIcon = L.divIcon({
        html: '<div style="background-color: #4A90E2; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(74,144,226,0.8);"></div>',
        iconSize: [20, 20],
        className: 'user-marker'
    });
    
    userMarker = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
        .addTo(map)
        .bindPopup('📍 <b>Tu ubicación actual</b>')
        .openPopup();
    
    // Forzar redibujado
    setTimeout(() => map.invalidateSize(), 500);
    window.addEventListener('resize', () => map.invalidateSize());
    
    // Iniciar todo
    startLocationTracking();
    listenToFirebaseData();
    dataUpdateInterval = setInterval(updatePeriodicData, 2000);
    updateConnectionStatus(true);
    
    console.log('✅ Mapa inicializado');
}

// ==================== SEGUIMIENTO GPS DEL USUARIO ====================
function startLocationTracking() {
    if ("geolocation" in navigator) {
        watchID = navigator.geolocation.watchPosition(
            (position) => {
                userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                userMarker.setLatLng([userLocation.lat, userLocation.lng]);
                map.panTo([userLocation.lat, userLocation.lng], { animate: true, duration: 0.5 });
                document.getElementById('gpsStatus').innerHTML = 
                    '<i class="fas fa-satellite"></i> GPS: Activo';
            },
            (error) => {
                document.getElementById('gpsStatus').innerHTML = 
                    '<i class="fas fa-satellite"></i> GPS: Error';
            },
            { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
        );
    }
}

// ==================== ESCUCHAR DATOS DE FIREBASE ====================
function listenToFirebaseData() {
    // Escuchar ubicación actual del vehículo
    database.ref('ubicacion_actual').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data && data.lat && data.lng) {
            updateVehicleOnMap(data);
            updateUIFromUbicacion(data);
        }
    });
    
    // Escuchar datos viales históricos
    database.ref('datos_viales').limitToLast(100).on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            updateRoadMarkers(data);
            // Obtener el último dato para actualizar UI
            const keys = Object.keys(data);
            if (keys.length > 0) {
                const lastKey = keys[keys.length - 1];
                const lastData = data[lastKey];
                updateUIFromViales(lastData);
            }
        }
    });
    
    // Estado de conexión
    database.ref('.info/connected').on('value', (snapshot) => {
        updateConnectionStatus(snapshot.val());
    });
    
    console.log('👂 Escuchando Firebase...');
}

// ==================== ACTUALIZAR VEHÍCULO EN MAPA ====================
function updateVehicleOnMap(data) {
    const estado = data.estado || data.estado_carretera || 'normal';
    const color = getVehicleColor(estado);
    
    const vehicleIcon = L.divIcon({
        html: `<i class="fas fa-car" style="font-size: 28px; color: ${color}; filter: drop-shadow(0 0 5px rgba(0,0,0,0.5));"></i>`,
        iconSize: [28, 28],
        className: 'vehicle-marker'
    });
    
    if (!vehicleMarker) {
        vehicleMarker = L.marker([data.lat, data.lng], { icon: vehicleIcon })
            .addTo(map)
            .bindPopup(createVehiclePopup(data));
    } else {
        vehicleMarker.setLatLng([data.lat, data.lng]);
        vehicleMarker.setIcon(vehicleIcon);
        vehicleMarker.setPopupContent(createVehiclePopup(data));
    }
}

function createVehiclePopup(data) {
    const estado = data.estado || 'normal';
    const velocidad = data.velocidad ? Math.round(data.velocidad) : 0;
    const segundos = data.segundos_restantes || 0;
    
    let estadoTexto = formatEstado(estado);
    let infoExtra = '';
    
    if (estado !== 'normal' && segundos > 0) {
        infoExtra = `<br>⏱️ Vuelve a normal en: ${segundos}s`;
    }
    
    return `
        <b>🚗 Vehículo ESP32</b><br>
        Velocidad: ${velocidad} km/h<br>
        Estado: ${estadoTexto}${infoExtra}
    `;
}

// ==================== ACTUALIZAR MARCADORES DE CARRETERA ====================
function updateRoadMarkers(data) {
    // Limpiar marcadores antiguos
    roadMarkers.forEach(marker => map.removeLayer(marker));
    roadMarkers = [];
    
    Object.values(data).forEach(reading => {
        if (reading.latitud && reading.longitud && reading.estado_carretera && reading.estado_carretera !== 'normal') {
            const marker = createRoadMarker(reading);
            if (marker) {
                marker.addTo(map);
                roadMarkers.push(marker);
            }
        }
    });
    
    console.log(`🛣️ ${roadMarkers.length} alertas en el mapa`);
}

function createRoadMarker(reading) {
    const color = getMarkerColor(reading.estado_carretera);
    const icon = getMarkerIcon(reading.estado_carretera);
    
    const customIcon = L.divIcon({
        html: `<div style="
            background: ${color};
            width: 30px;
            height: 30px;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 0 10px rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
        ">${icon}</div>`,
        iconSize: [30, 30],
        className: 'road-marker'
    });
    
    const velocidadRec = reading.velocidad_recomendada ? Math.round(reading.velocidad_recomendada) : 'N/A';
    
    return L.marker([reading.latitud, reading.longitud], { icon: customIcon })
        .bindPopup(`
            <b>⚠️ Alerta Vial</b><br>
            <hr>
            <b>Estado:</b> ${formatEstado(reading.estado_carretera)}<br>
            <b>Velocidad recomendada:</b> ${velocidadRec} km/h<br>
            <b>Velocidad registrada:</b> ${Math.round(reading.velocidad || 0)} km/h<br>
            <small>${new Date().toLocaleTimeString()}</small>
        `);
}

// ==================== ACTUALIZAR UI PRINCIPAL ====================
function updateUIFromUbicacion(data) {
    // Actualizar velocidad
    if (data.velocidad !== undefined) {
        document.getElementById('currentSpeed').textContent = Math.round(data.velocidad);
    }
    
    // Actualizar estado de carretera
    const estado = data.estado || 'normal';
    const segundos = data.segundos_restantes || 0;
    updateRoadConditionDisplay(estado, segundos);
    
    // Actualizar recomendación de velocidad
    updateSpeedRecommendation(estado, data.velocidad);
    
    // Agregar alerta si es necesario
    if (estado !== 'normal') {
        addAlertIfNew(estado, data.velocidad, segundos);
    }
}

function updateUIFromViales(data) {
    if (!data) return;
    
    // Actualizar datos ambientales
    if (data.temperatura !== undefined) {
        document.getElementById('temperature').textContent = `${data.temperatura.toFixed(1)}°C`;
    }
    if (data.presion !== undefined) {
        document.getElementById('pressure').textContent = `${data.presion.toFixed(1)} hPa`;
    }
    const altitud = data.altitud_barometrica || data.altitud_gps;
    if (altitud !== undefined) {
        document.getElementById('altitude').textContent = `${altitud.toFixed(0)} m`;
    }
    
    // Actualizar estado
    const estado = data.estado_carretera || 'normal';
    const segundos = data.segundos_restantes_peligro || 0;
    updateRoadConditionDisplay(estado, segundos);
    
    // Actualizar velocidad recomendada
    if (data.velocidad_recomendada !== undefined) {
        document.getElementById('speedRecommendation').innerHTML = 
            `<i class="fas fa-shield-alt"></i> Velocidad recomendada: ${Math.round(data.velocidad_recomendada)} km/h`;
    }
}

function updateRoadConditionDisplay(estado, segundosRestantes = 0) {
    const conditionDiv = document.getElementById('roadCondition');
    const conditionText = document.querySelector('.condition-text');
    const conditionIcon = document.querySelector('.condition-icon i');
    
    // Resetear clases
    conditionDiv.className = 'condition-display';
    
    let textoEstado = '';
    let iconoClase = '';
    
    switch(estado) {
        case 'normal':
            conditionDiv.classList.add('normal');
            textoEstado = 'Normal';
            iconoClase = 'fas fa-check-circle';
            break;
        case 'mal_estado':
            conditionDiv.classList.add('mal_estado');
            textoEstado = segundosRestantes > 0 ? 
                `Precaución - Vibraciones (${segundosRestantes}s)` : 'Precaución - Vibraciones';
            iconoClase = 'fas fa-exclamation-circle';
            break;
        case 'bache':
            conditionDiv.classList.add('bache');
            textoEstado = segundosRestantes > 0 ? 
                `¡BACHE! - Peligro (${segundosRestantes}s)` : '¡BACHE! - Peligro';
            iconoClase = 'fas fa-exclamation-triangle';
            break;
        case 'peligro_frenado':
            conditionDiv.classList.add('peligro_frenado');
            textoEstado = segundosRestantes > 0 ? 
                `Frenado Brusco (${segundosRestantes}s)` : 'Frenado Brusco';
            iconoClase = 'fas fa-hand-paper';
            break;
        case 'giro_brusco':
            conditionDiv.classList.add('peligro_frenado');
            textoEstado = segundosRestantes > 0 ? 
                `Giro Brusco (${segundosRestantes}s)` : 'Giro Brusco';
            iconoClase = 'fas fa-undo';
            break;
        default:
            conditionDiv.classList.add('normal');
            textoEstado = 'Normal';
            iconoClase = 'fas fa-check-circle';
    }
    
    conditionText.textContent = textoEstado;
    conditionIcon.className = iconoClase;
}

function updateSpeedRecommendation(estado, velocidad) {
    const speedDiv = document.getElementById('speedRecommendation');
    
    switch(estado) {
        case 'bache':
            speedDiv.innerHTML = `<i class="fas fa-shield-alt"></i> ⚠️ ¡Reduzca velocidad! Máx: ${Math.round(velocidad * 0.4)} km/h`;
            break;
        case 'peligro_frenado':
            speedDiv.innerHTML = `<i class="fas fa-shield-alt"></i> ⚠️ ¡Frenado brusco! Máx: ${Math.round(velocidad * 0.5)} km/h`;
            break;
        case 'mal_estado':
            speedDiv.innerHTML = `<i class="fas fa-shield-alt"></i> Precaución: ${Math.round(velocidad * 0.7)} km/h`;
            break;
        default:
            speedDiv.innerHTML = `<i class="fas fa-shield-alt"></i> Velocidad normal: hasta 120 km/h`;
    }
}

// ==================== SISTEMA DE ALERTAS ====================
function addAlertIfNew(estado, velocidad, segundos) {
    // Evitar alertas duplicadas en poco tiempo
    const now = Date.now();
    if (lastAlertTime[estado] && (now - lastAlertTime[estado] < ALERT_COOLDOWN)) {
        return; // Ya se mostró una alerta similar recientemente
    }
    lastAlertTime[estado] = now;
    
    const alertsList = document.getElementById('alertsList');
    const noAlerts = document.querySelector('.no-alerts');
    if (noAlerts) noAlerts.remove();
    
    const config = getAlertConfig(estado);
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert-item ${estado}`;
    alertDiv.innerHTML = `
        <span class="alert-icon">${config.icon}</span>
        <div class="alert-content">
            <strong>${config.title}</strong>
            <p>${config.message} ${segundos > 0 ? `(Normal en ${segundos}s)` : ''}</p>
            <small>Velocidad: ${Math.round(velocidad || 0)} km/h | ${new Date().toLocaleTimeString()}</small>
        </div>
    `;
    
    alertsList.insertBefore(alertDiv, alertsList.firstChild);
    
    // Limitar a 10 alertas
    while (alertsList.children.length > 10) {
        alertsList.removeChild(alertsList.lastChild);
    }
}

function getAlertConfig(estado) {
    const configs = {
        'bache': {
            icon: '🕳️',
            title: '¡BACHE DETECTADO!',
            message: 'Reduzca la velocidad inmediatamente. Peligro de daños.'
        },
        'peligro_frenado': {
            icon: '🛑',
            title: '¡FRENADO BRUSCO!',
            message: 'Zona de frenado repentino. Mantenga distancia.'
        },
        'mal_estado': {
            icon: '📳',
            title: 'Vibraciones Anormales',
            message: 'Carretera en mal estado. Conduzca con precaución.'
        },
        'giro_brusco': {
            icon: '↩️',
            title: 'Giro Brusco',
            message: 'Curva peligrosa detectada. Reduzca velocidad.'
        }
    };
    
    return configs[estado] || {
        icon: '⚠️',
        title: 'Alerta Vial',
        message: 'Condición irregular detectada.'
    };
}

// ==================== UTILIDADES ====================
function updateConnectionStatus(connected) {
    const statusBadge = document.getElementById('connectionStatus');
    if (connected) {
        statusBadge.innerHTML = '<span class="dot" style="background: #4CAF50;"></span><span>Conectado</span>';
    } else {
        statusBadge.innerHTML = '<span class="dot" style="background: #f44336;"></span><span>Desconectado</span>';
    }
}

function updatePeriodicData() {
    // Actualizar desde ubicacion_actual
    database.ref('ubicacion_actual').once('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            updateUIFromUbicacion(data);
        }
    });
    
    // Actualizar desde último dato vial
    database.ref('datos_viales').limitToLast(1).once('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const lastData = Object.values(data)[0];
            updateUIFromViales(lastData);
        }
    });
}

function getVehicleColor(estado) {
    const colors = {
        'normal': '#4CAF50',        // Verde
        'mal_estado': '#FFC107',    // Amarillo
        'bache': '#f44336',         // Rojo
        'peligro_frenado': '#FF5722', // Naranja oscuro
        'giro_brusco': '#9C27B0'    // Púrpura
    };
    return colors[estado] || '#4CAF50';
}

function getMarkerColor(estado) {
    const colors = {
        'bache': '#f44336',
        'peligro_frenado': '#FF5722',
        'mal_estado': '#FFC107',
        'giro_brusco': '#9C27B0'
    };
    return colors[estado] || '#9E9E9E';
}

function getMarkerIcon(estado) {
    const icons = {
        'bache': '🕳️',
        'peligro_frenado': '🛑',
        'mal_estado': '⚠️',
        'giro_brusco': '↩️'
    };
    return icons[estado] || '•';
}

function formatEstado(estado) {
    const formatos = {
        'normal': '✅ Normal',
        'mal_estado': '⚠️ Mal Estado',
        'bache': '🕳️ Bache',
        'peligro_frenado': '🛑 Frenado Brusco',
        'giro_brusco': '↩️ Giro Brusco'
    };
    return formatos[estado] || estado;
}

// ==================== LIMPIEZA ====================
window.addEventListener('beforeunload', () => {
    if (watchID) navigator.geolocation.clearWatch(watchID);
    if (dataUpdateInterval) clearInterval(dataUpdateInterval);
    database.ref('ubicacion_actual').off();
    database.ref('datos_viales').off();
    database.ref('.info/connected').off();
    console.log('👋 Recursos liberados');
});

console.log('📄 Script cargado y listo');